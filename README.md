# SAP Assistant — Buyer/Planner Action Workbench

> [!IMPORTANT]
> **Feature freeze is active.** Before implementing any new feature, read [/docs/project-governance-feature-freeze.md](docs/project-governance-feature-freeze.md).

An enterprise-grade supply chain control tower workbench. Designed for buyers and planners to immediately monitor and expedite overdue purchase order lines, manage supplier delay exposure, and mitigate inventory stock risks across all manufacturing plants.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5 · Auth.js v5 (Microsoft Entra ID) · deployed on Azure Container Apps via GitHub Actions + OIDC federation.

## Deployment

- **Production URL:** https://sapassistant-app.victoriousplant-c4f6558d.eastus2.azurecontainerapps.io
- **Auth:** Microsoft Entra ID (multi-tenant + MSA). Callback: `/api/auth/callback/microsoft-entra-id`.
- **Secrets:** Stored in Azure Key Vault `sapassistantkv01`, mounted into the Container App as env vars via the user-assigned managed identity `sapassistant-uami`.
- **CI/CD:** Push to `main` triggers `.github/workflows/deploy.yml` → builds the image to GHCR → `az deployment group create` rolls infra + image atomically → smoke-tests `/api/health`.
- **Infra:** Single Bicep file at `infra/main.bicep` provisions UAMI, Log Analytics, App Insights, Container Apps Environment, and the Container App itself.

Required env vars (all sourced from KV at runtime):

| Env var | KV secret |
|---|---|
| `AUTH_SECRET` | `AUTH-SECRET` |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | `OAuth-Microsoft-ClientId` |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | `OAuth-Microsoft-ClientSecret` |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | _hardcoded_ `https://login.microsoftonline.com/common/v2.0` |
| `AUTH_URL` | _derived from Container App FQDN_ |
| `AUTH_ALLOWED_EMAILS` | _Bicep param `authAllowedEmails`_ — comma-separated email/UPN allowlist. Empty = open. Default seeds the owner's account. Add teammates by re-running the deploy with `--parameters authAllowedEmails="a@x,b@y"`. |

### Entra app registration

The Entra app (`baacc761-0b8e-4881-832c-630c2365f532`, `signInAudience=AzureADandPersonalMicrosoftAccount`) is configured as a **Native** ("Mobile and desktop") platform — the callback URI is registered under `publicClient.redirectUris` (NOT `web` and NOT `spa`). Auth.js then uses PKCE without a client_secret (`client.token_endpoint_auth_method: "none"`). This is the only combination that works for MSA users on a converged app from a server-rendered Next.js app: SPA fails the token request with AADSTS90023 because Node's fetch can't supply a CORS `Origin` header.

## Local development

### 1. Install Dependencies
Ensure you have [Node.js](https://nodejs.org/) installed, then run:
```bash
npm install
```

### 2. Run the Development Server
Launch the local control tower server:
```bash
npm run dev
```

### 3. Access the Control Tower
Open your browser and navigate to:
👉 [http://localhost:3000](http://localhost:3000)

---

## 🛠️ Architecture & Data Sourcing

### Phase 1A Data Model (decoupled from storage)
To keep the application highly modular and prevent UI code rewrites during Phase 1B (PostgreSQL migration), we decoupled the data layer:
* **Source of Truth**: Sourced directly from 26 local relational CSV files under `/procurement_data_sample`.
* **API Service Layer**: `/src/services/data/csvDataService.ts` reads, joins, and aggregates relational CSV records (Exceptions, Purchase Order Headers, PO Items, Schedule Lines, Suppliers, Plants, Acknowledgment Status, and ASN Shipment Schedules).
* **API Endpoints**:
  * `GET /api/po-overdue/summary` — Returns real-time aggregated metrics for the top dashboard cards.
  * `GET /api/po-overdue/worklist` — Serves the main workbench table, supporting searches and filters (Plant, Supplier, Purchasing Groups, Material Groups, Date Ranges, and Delay ranges).
  * `GET /api/po-overdue/detail` — Sourced by matching PO Number + Item Number + Schedule Line, returning the full timeline, supplier profile, safety stock parameters, and recent communication logs.
  * `GET /api/filters` — Provides lists of plants, suppliers, and purchasing groups to dynamic frontend filter dropdowns.

In Phase 1B, when migrating to local/Azure PostgreSQL, only `csvDataService.ts` needs to be updated (e.g. using Prisma or SQL queries). The frontend components remain entirely untouched.

---

## 🛡️ Development & Validation Framework

This MVP is governed by isolated development support agent guidelines located in the `/dev_agents` folder:
* **[project_manager.md](file:///c:/Users/Aalok/Desktop/AI%20Projects/Procurement%203%20Agent%20project/dev_agents/project_manager.md)**: Confirms Phase 1A constraints and checks for out-of-scope leakages (no LLMs, chatbots, or PostgreSQL additions).
* **[business_analyst.md](file:///c:/Users/Aalok/Desktop/AI%20Projects/Procurement%203%20Agent%20project/dev_agents/business_analyst.md)**: Validates calculation formulas (days overdue, open value, open qty) and PO flow.
* **[ui_ux_reviewer.md](file:///c:/Users/Aalok/Desktop/AI%20Projects/Procurement%203%20Agent%20project/dev_agents/ui_ux_reviewer.md)**: Enforces readable slates, glassmorphism, side-panel drawer dimensions, and hover states.
* **[tester_qa.md](file:///c:/Users/Aalok/Desktop/AI%20Projects/Procurement%203%20Agent%20project/dev_agents/tester_qa.md)**: Documents user stories and 13 minimum manual test cases.

The final reviews and Phase 1B Go/No-Go checklist are filled in **[phase_1A_validation.md](file:///c:/Users/Aalok/Desktop/AI%20Projects/Procurement%203%20Agent%20project/dev_agents/phase_1A_validation.md)** before concluding this phase.

---

## 🔒 Out-of-Scope (Locked for Phase 1B)
* Active automated rescheduling inside ERP/SAP.
* Custom AI-driven email draft generation.
* Interactive supplier-agent LLM chatbot.
* Cloud PostgreSQL deployment.

---

## 🚦 Feature Freeze & Governance
The application is currently in **single-user MVP validation mode** and under a strict **Feature Freeze**. No new feature development is permitted without explicit risk-acceptance. 

Please review the complete guidelines, allowed tasks, and blocked scopes in [project-governance-feature-freeze.md](file:///c:/Users/Aalok/Desktop/AI%20Projects/Procurement%203%20Agent%20project/buyer-planner-action-workbench/docs/project-governance-feature-freeze.md).
