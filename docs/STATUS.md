# Procurement Copilot — Project Status

> Snapshot for resuming work in a fresh session. Update this file whenever
> you cut a release or finish a phase. Authoritative complement to
> [README.md](../README.md) and [CHANGELOG.md](../CHANGELOG.md).

_Last updated: 2026-06-15 (commit pinned by the latest entry below)._

---

## Live deployment

| Item             | Value                                                                              |
| ---------------- | ---------------------------------------------------------------------------------- |
| Public URL       | <https://sapassistant-app.victoriousplant-c4f6558d.eastus2.azurecontainerapps.io>  |
| Health endpoint  | `/api/health` → `{"status":"ok"}`                                                  |
| Latest tag       | **v3.2** (full env-var + secrets codification in Bicep, sticky-sidebar fix, repaired Copilot Setup Steps workflow) |
| Default branch   | `main`                                                                             |
| Latest revision  | `sapassistant-app--0000039` (Healthy, traffic 100%)                                |

All four GitHub Actions workflows on `main` are green:
`build-test`, `deploy`, `infra`, `Copilot Setup Steps`.

## Azure resources (Resource Group: `sap-assistant-rg`)

| Resource                | Name                                                  | Region          |
| ----------------------- | ----------------------------------------------------- | --------------- |
| Container App           | `sapassistant-app`                                    | `eastus2`       |
| Container App Env       | `sapassistant-env`                                    | `eastus2`       |
| Container image source  | `ghcr.io/naikaakash/procurement-copilot`              | (GHCR)          |
| Key Vault               | `sapassistantkv01`                                    | `eastus2`       |
| User-Assigned MI        | `sapassistant-uami` (Key Vault Secrets User)          | `eastus2`       |
| Azure SQL server        | `sapassistant-sql-2606142214`                         | `canadacentral` |
| Azure SQL database      | `procurement` (GP_S_Gen5 serverless, auto-pause 60m)  | `canadacentral` |
| Azure OpenAI            | `sapassistant-aoai` (deployment `gpt-4.1-nano`)       | `eastus2`       |
| App Insights            | `sapassistant-appi` (workspace `sapassistant-law`)    | `eastus2`       |

Cross-region SQL latency: ~25–30 ms. Acceptable for now.
SQL cost when idle: **$0** (serverless auto-pause).

## Key Vault inventory

| Secret name                       | Purpose                          | Last rotated |
| --------------------------------- | -------------------------------- | ------------ |
| `AUTH-SECRET`                     | Auth.js session signing          | 2026-06 (v3.0 era) |
| `OAuth-Microsoft-ClientId`        | Entra app (public client)        | 2026-06 (v3.0 era) |
| `OAuth-Microsoft-ClientSecret`    | (legacy — not used by public client; kept for reference) | — |
| `AOAI-Key`                        | Azure OpenAI API key             | **v3.1**           |
| `SQL-ConnectionString`            | SQL admin conn string (incl. password) | **v3.1** (password rotated)   |

All five are referenced from `infra/main.bicep` via `keyVaultUrl`. The
Container App uses the UAMI to pull them at startup.

## Architecture in one paragraph

Next.js 16 (TypeScript) single-page workbench. Reads procurement data from
Azure SQL when `DATA_SOURCE=sql` (default in prod) or from CSVs under
`data/` when `csv`. App-state mutations (actions, recommendations,
supplier comms) are kept in JSON files for sync-API convenience and
fire-and-forget mirrored to SQL `app_*` tables. `instrumentation.ts` runs
once per server start and pulls SQL → JSON before any request, so app
state survives container restarts. AI endpoints try Gemini → Azure OpenAI
→ rule-based fallback in that order.

## How to resume tomorrow

```powershell
cd C:\personal\src\sap-assistant
git pull
npm ci      # only if package-lock.json changed
```

Then skim, in order:

1. [CHANGELOG.md](../CHANGELOG.md) `[Unreleased]` section — anything in flight.
2. This file's **Open work** section below.
3. [README.md](../README.md) ops runbook if you're touching infra / secrets.

For browser verification: hard-refresh the live URL (Ctrl+Shift+R) — the
sidebar must stay pinned while the main panel scrolls.

## Open work (next sessions, in priority order)

1. **Phase 4 — File uploads.** Bicep storage account + UAMI role grant,
   `IFileStore` abstraction (Blob impl + InMemory impl), `/api/files`
   endpoints (upload/list/delete/download), `/files` page with drop-zone
   + list, tests. Blocks Phases 6 + 7.
2. **Phase 6 — Excel parse.** Server-side parse of uploaded `.xlsx`
   (ClosedXML or `xlsx` npm), `/api/files/:id/preview` returning rows.
3. **Phase 7 — Chat over Excel.** Wire the preview rows into the existing
   AI chat surface so users can ask questions over the uploaded sheet.
4. **Phase 3d — Schema refinement** (optional cleanup). All SQL columns
   are currently `NVARCHAR`. Replace with proper `DATE`/`DECIMAL`/`INT`
   types + FK constraints in `scripts/seed-sql.js`.
5. **Phase 9 — Customer-demo polish.** Empty states, copy review,
   onboarding flow. Lighter touch; good for short sessions.
6. **Phase 10 — Post-MVP backlog.** Multi-tenant, telemetry dashboards,
   role-based access on procurement actions, audit log surface.

## Gotchas worth re-reading before any infra work

- **Bicep is declarative.** Anything not in `infra/main.bicep` gets wiped
  on the next CI deploy. This bit us twice (AOAI key + SQL conn). Always
  add new env vars / secrets to Bicep first.
- **Repo is PUBLIC** (`github.com/naikaakash/procurement-copilot`). Never
  commit secret values. Bots scrape new public repos for credentials
  within minutes and git history makes leaks permanent.
- **SQL admin password is only in KV** `SQL-ConnectionString` (rotated in
  v3.1; the value at provisioning time is gone). To rotate, do it in a
  single chained `az sql server update --admin-password ... && az keyvault
  secret set ...` so you capture the new value before losing the shell.
- **AOAI key is only in KV** `AOAI-Key`. The Container App pulls via
  `keyVaultUrl` + UAMI.
- **Don't `az containerapp update --set-env-vars` ever again.** Use the
  Bicep param + `az deployment group create`, or edit `infra/main.bicep`
  and push to trigger the CI deploy.
- **`infra.yml` must always pass `containerImage`.** The Bicep default is
  the k8se quickstart placeholder; deploying without an override wipes
  prod. The workflow now reads the current image off the live Container
  App and passes it through automatically, but if you ever invoke `az
  deployment group create` by hand, always include `--parameters
  containerImage=ghcr.io/.../<tag>`.

## Useful commands

```powershell
# Local dev
npm run dev                              # http://localhost:3000

# Build (also typechecks + lints)
npm run build

# Run E2E (Playwright)
npm run test:e2e

# Seed SQL from CSVs (idempotent)
$env:SQL_CONNECTION_STRING = (az keyvault secret show --vault-name sapassistantkv01 --name SQL-ConnectionString --query value -o tsv)
npm run seed:sql

# Flip data source live (prefer: change the Bicep param + redeploy)
az containerapp update -n sapassistant-app -g sap-assistant-rg --set-env-vars DATA_SOURCE=csv

# Tail logs
az containerapp logs show -n sapassistant-app -g sap-assistant-rg --follow

# Force a redeploy on the current image
az containerapp revision restart -n sapassistant-app -g sap-assistant-rg --revision $(az containerapp revision list -n sapassistant-app -g sap-assistant-rg --query "[?properties.active].name | [0]" -o tsv)
```
