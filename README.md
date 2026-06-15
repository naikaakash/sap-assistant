# Procurement Copilot

Enterprise supply-chain control tower for buyers and planners — monitor and
expedite overdue purchase-order lines, manage supplier delay exposure, mitigate
inventory stock risk, and use an AI assistant to draft messages, diagnose root
causes, and generate executive briefings.

- **Production URL:** <https://sapassistant-app.victoriousplant-c4f6558d.eastus2.azurecontainerapps.io>
- **Repo:** <https://github.com/naikaakash/procurement-copilot>
- **Container registry:** `ghcr.io/naikaakash/procurement-copilot`
- **Latest release:** see [CHANGELOG.md](CHANGELOG.md)

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), React 19, TypeScript 5 |
| Auth | Auth.js v5 + Microsoft Entra ID (multi-tenant + MSA, PKCE, public client) |
| AI | Azure OpenAI — `gpt-4.1-nano` (GlobalStandard, 250K TPM) |
| Data | Azure SQL Serverless (`GP_S_Gen5`, auto-pause 60 min) with CSV fallback |
| Host | Azure Container Apps (Consumption, scale 1 → 3) |
| CI/CD | GitHub Actions + OIDC federation, single `main` branch |

> The Azure resource names (`sap-assistant-rg`, `sapassistant-app`,
> `sapassistantkv01`, `sapassistant-uami`) carry the original project codename.
> Renaming them in place is destructive — they stay as-is. The GitHub repo,
> container image, and product name are all `procurement-copilot`.

---

## Architecture

```
                ┌──────────────────────────────────────────────────────┐
                │  Browser (Entra ID OAuth + PKCE)                      │
                └─────────────────────────┬────────────────────────────┘
                                          │ HTTPS
                ┌─────────────────────────▼────────────────────────────┐
                │  Azure Container Apps  (sapassistant-app)             │
                │    Next.js 16 standalone server (port 8080)           │
                │    UAMI: sapassistant-uami                            │
                └──┬──────────┬───────────┬────────────────────────────┘
                   │          │           │
                   ▼          ▼           ▼
        ┌─────────────┐  ┌──────────┐  ┌────────────────────────┐
        │ Azure SQL    │  │ AOAI     │  │ Key Vault              │
        │ Serverless   │  │ gpt-4.1- │  │ sapassistantkv01       │
        │ procurement  │  │ nano     │  │ (5 secrets via UAMI)   │
        │ (or CSV      │  │          │  │                        │
        │ fallback)    │  │          │  │                        │
        └─────────────┘  └──────────┘  └────────────────────────┘

         All telemetry → Log Analytics → App Insights (sapassistant-appi)
```

---

## Azure resources

All in resource group `sap-assistant-rg`.

| Resource | Type | Notes |
|---|---|---|
| `sapassistant-app` | Container App | Public ingress, port 8080, scale 1→3 |
| `sapassistant-env` | Container Apps Environment | Consumption workload profile |
| `sapassistant-uami` | User-Assigned Managed Identity | Used for KV + (future) SQL passwordless |
| `sapassistantkv01` | Key Vault (RBAC) | UAMI has `Key Vault Secrets User` |
| `sapassistant-law` | Log Analytics | 5 GB/day cap, 30-day retention |
| `sapassistant-appi` | App Insights | Workspace-based on `sapassistant-law` |
| `sapassistant-aoai` | Cognitive Services (OpenAI) | eastus2, S0, custom domain |
| `sapassistant-sql-2606142214` | Azure SQL Server | canadacentral (eastus2/eastus had no SQL capacity at provisioning time) |
| `procurement` | Azure SQL Database | `GP_S_Gen5` 1 vCore Serverless, auto-pause 60 min |

---

## Environment variables

**Every** runtime env var is declared in [`infra/main.bicep`](infra/main.bicep)
under `template.containers[0].env`. The CI deploy applies the Bicep
declaratively, so any env var added via `az containerapp update --set-env-vars`
**will be wiped on the next deploy**. Add new env vars to Bicep, not via the
CLI.

| Var | Source | Purpose |
|---|---|---|
| `NODE_ENV` | hardcoded `production` | |
| `PORT` / `HOSTNAME` | hardcoded `8080` / `0.0.0.0` | Container ingress |
| `AUTH_TRUST_HOST` | hardcoded `true` | Auth.js behind Container Apps proxy |
| `AUTH_URL` | derived from Container App FQDN | Auth.js absolute URL |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | derived (`entraTenantId` param, default `common`) | OIDC issuer |
| `AUTH_SECRET` | KV `AUTH-SECRET` (secretRef) | Cookie encryption |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | KV `OAuth-Microsoft-ClientId` (secretRef) | Entra app client id |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | KV `OAuth-Microsoft-ClientSecret` (secretRef) | (Public client, kept for completeness) |
| `AUTH_ALLOWED_EMAILS` | Bicep param `authAllowedEmails` | Comma-separated allowlist of UPNs; empty = open |
| `AZURE_CLIENT_ID` | UAMI client id (derived) | For DefaultAzureCredential / SDK auth |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | derived from `sapassistant-appi` | Telemetry |
| `NEXT_TELEMETRY_DISABLED` | hardcoded `1` | Suppress Next.js phone-home |
| `DATA_SOURCE` | Bicep param `dataSource` (default `sql`) | `sql` = Azure SQL DB, `csv` = bundled CSVs |
| `SQL_SERVER` | derived from `sqlServerName` param | `<server>.database.windows.net` |
| `SQL_DATABASE` | Bicep param `sqlDatabaseName` (default `procurement`) | |
| `SQL_CONNECTION_STRING` | KV `SQL-ConnectionString` (secretRef) | Full ADO.NET conn string with password |
| `AZURE_OPENAI_RESOURCE` | Bicep param `aoaiResource` (default `sapassistant-aoai`) | AOAI subdomain |
| `AZURE_OPENAI_DEPLOYMENT` | Bicep param `aoaiDeployment` (default `gpt-41-nano`) | AOAI deployment name |
| `AZURE_OPENAI_KEY` | KV `AOAI-Key` (secretRef) | AOAI primary key |

### Secrets in Key Vault (`sapassistantkv01`)

| Secret | Used as | Rotation |
|---|---|---|
| `AUTH-SECRET` | `AUTH_SECRET` env var | Regenerate any 32-byte random; bump secret version in KV; restart revision |
| `OAuth-Microsoft-ClientId` | `AUTH_MICROSOFT_ENTRA_ID_ID` | Tied to Entra app registration |
| `OAuth-Microsoft-ClientSecret` | `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Tied to Entra app registration |
| `AOAI-Key` | `AZURE_OPENAI_KEY` | `az cognitiveservices account keys regenerate -g sap-assistant-rg -n sapassistant-aoai --key-name Key1` then upload new value |
| `SQL-ConnectionString` | `SQL_CONNECTION_STRING` | See [Rotating the SQL admin password](#rotating-the-sql-admin-password) |

> 🔒 **Never put secret VALUES in Bicep or commit them to git.** The repo is
> public — secrets in git history are leaked forever even after rotation.
> All secrets must live in Key Vault and be referenced via `keyVaultUrl`.

---

## Data layer (Phase 3)

The app has two interchangeable read/write backends, controlled by the
`DATA_SOURCE` env var:

| Mode | Reads | Writes |
|---|---|---|
| `DATA_SOURCE=sql` *(default in prod)* | Azure SQL `procurement` DB | SQL + local JSON mirror |
| `DATA_SOURCE=csv` | `procurement_data_sample/*.csv` (26 files) | `data/*.json` (5 files, ephemeral per container restart) |

### How SQL mode works

- **Reads:** `src/services/data/csvDataService.ts → readCsv(filename)` dispatches
  to `loadTableRows()` (SQL) when `DATA_SOURCE=sql`. The seeder stores every
  column as `NVARCHAR`, so SQL rows have the exact same shape as CSV rows — no
  downstream code changes.
- **Writes:** The 4 mock JSON stores
  (`mockActionStore`, `mockRecommendationStore`,
  `mockSupplierCommunicationStore` for both reminders and responses) mirror
  every `persistToFile()` to their `app_*` SQL table as a fire-and-forget
  `DELETE` + `BULK INSERT` transaction. The sync caller API is unchanged.
- **Boot priming:** [`instrumentation.ts`](instrumentation.ts) pulls all 4
  store record sets from SQL and writes them to local JSON files **before**
  any request handler can call `init()`. This is how app state survives
  container restarts.

### Schema

The `procurement` DB contains:

- **26 reference tables** (one per CSV in `procurement_data_sample/`). All
  columns are `NVARCHAR(4000)` (PKs `NVARCHAR(128)`). Schema is auto-derived
  from CSV headers by [`scripts/seed-sql.js`](scripts/seed-sql.js).
- **5 app-state tables** with JSON-blob shape:

  ```sql
  CREATE TABLE app_<name> (
    id         NVARCHAR(128) PRIMARY KEY,
    data       NVARCHAR(MAX) NOT NULL,
    created_at DATETIME2(3) DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2(3) DEFAULT SYSUTCDATETIME()
  );
  ```

  Tables: `app_actions`, `app_recommendations`, `app_supplier_reminders`,
  `app_supplier_responses`, `app_po_mutations`.

### Seeding the SQL DB

```powershell
# From the repo root, with the SQL connection string in env:
$env:SQL_CONNECTION_STRING = az containerapp secret show `
  -g sap-assistant-rg -n sapassistant-app `
  --secret-name sql-conn --query value -o tsv
npm run seed:sql
```

The script drops + recreates every reference table, bulk-inserts each CSV,
and ensures (without dropping) the 5 app-state tables. Safe to re-run.

---

## CI/CD

Push to `main` → [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):

1. Build Docker image, push to GHCR with `:latest` and `:<sha7>` tags
2. `azure/login@v2` via OIDC federation (no stored secrets)
3. `az deployment group create` rolls **infra + image atomically** —
   `infra/main.bicep` declares everything (env vars, secrets, scale rules)
4. Poll for new revision to reach `Healthy`
5. Smoke-test `/api/health`

Concurrency-guarded so two pushes to `main` can't race. Path-filtered to
ignore docs-only commits.

A second workflow [`.github/workflows/build-test.yml`](.github/workflows/build-test.yml)
runs on every push and PR to type-check + build.

---

## Local development

```bash
npm install
npm run dev
# open http://localhost:3000
```

For local OAuth, register `http://localhost:3000/api/auth/callback/microsoft-entra-id`
under the Entra app's `publicClient.redirectUris` (already done) and supply
`AUTH_*` env vars via `.env.local`.

To run locally against the live SQL DB:

```bash
# Add to .env.local
DATA_SOURCE=sql
SQL_CONNECTION_STRING="<pull from KV or Container App secret>"
AZURE_OPENAI_KEY="<pull from KV>"
AZURE_OPENAI_RESOURCE=sapassistant-aoai
AZURE_OPENAI_DEPLOYMENT=gpt-41-nano
```

To stay CSV-only locally:

```bash
# No DATA_SOURCE set, or DATA_SOURCE=csv — reads from procurement_data_sample/,
# writes to data/. No Azure dependency.
```

---

## Operations

### Rotating the SQL admin password

```powershell
$pw = "P!" + [Convert]::ToBase64String((1..30 | ForEach-Object { Get-Random -Maximum 256 })) + "Aa1"
az sql server update -g sap-assistant-rg -n sapassistant-sql-2606142214 --admin-password "$pw"

$conn = "Server=tcp:sapassistant-sql-2606142214.database.windows.net,1433;Initial Catalog=procurement;Persist Security Info=False;User ID=sqladmin;Password=$pw;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"
az keyvault secret set --vault-name sapassistantkv01 --name SQL-ConnectionString --value "$conn"

# Force the Container App to pick up the new KV version
az containerapp revision restart -g sap-assistant-rg -n sapassistant-app `
  --revision $(az containerapp show -g sap-assistant-rg -n sapassistant-app --query "properties.latestRevisionName" -o tsv)
```

### Rotating the AOAI key

```powershell
$key = az cognitiveservices account keys regenerate -g sap-assistant-rg -n sapassistant-aoai --key-name Key1 --query key1 -o tsv
az keyvault secret set --vault-name sapassistantkv01 --name AOAI-Key --value "$key"
az containerapp revision restart -g sap-assistant-rg -n sapassistant-app `
  --revision $(az containerapp show -g sap-assistant-rg -n sapassistant-app --query "properties.latestRevisionName" -o tsv)
```

### Switching between SQL and CSV modes in prod

Pass the parameter on the next deploy:

```powershell
az deployment group create -g sap-assistant-rg `
  --template-file infra/main.bicep `
  --parameters containerImage="ghcr.io/naikaakash/procurement-copilot:latest" dataSource=csv
```

This rolls a new revision with `DATA_SOURCE=csv`. SQL stays online but the app
ignores it.

### Checking live logs

```powershell
$rev = az containerapp show -g sap-assistant-rg -n sapassistant-app --query "properties.latestRevisionName" -o tsv
az containerapp logs show -g sap-assistant-rg -n sapassistant-app --revision $rev --tail 50
```

Look for:

- `[sqlClient] Connected to ...` — SQL pool opened OK
- `[instrumentation] SQL boot complete — actions=N recommendations=N ...` —
  app-state tables pulled into local JSON
- `[mockActionStore] SQL mirror push failed: ...` — SQL writes are failing
  (but app keeps working via local JSON)

---

## API surface

The full route inventory is in `app/api/`. Highlights:

| Route | Purpose |
|---|---|
| `GET /api/health` | Liveness probe (used by CI smoke test) |
| `GET /api/overview/summary` | Top dashboard cards |
| `GET /api/po-overdue/{summary,worklist,detail}` | Overdue PO workbench |
| `GET /api/po-acknowledgement/{summary,worklist}` | Supplier ack tracker |
| `GET /api/part-availability/{summary,worklist,mrp}` | Material/MRP view |
| `GET /api/supplier-performance/{list,detail}` | Supplier analytics |
| `POST /api/copilot/chat` | AI Sourcing Copilot (Gemini → AOAI → fallback) |
| `POST /api/executive-briefing` | AI-drafted exec summary (structured JSON) |
| `POST /api/root-cause` | AI root-cause analysis for an exception |
| `POST /api/supplier-intelligence` | AI supplier risk summary |
| `*/api/recommendations/*` | Recommendation CRUD + lifecycle |
| `*/api/supplier-communications/*` | Reminders + responses workflow |

---

## Governance

- `dev_agents/project_manager.md` — scope guardrails
- `dev_agents/business_analyst.md` — calculation/formula validation
- `dev_agents/ui_ux_reviewer.md` — visual + interaction standards
- `dev_agents/tester_qa.md` — user stories + manual test cases
- [`docs/project-governance-feature-freeze.md`](docs/project-governance-feature-freeze.md)
  — feature freeze + out-of-scope items
