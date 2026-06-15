# Changelog

All notable changes are documented here. Versions follow [Semantic
Versioning](https://semver.org/) loosely — major bumps for substantial
rewrites, minor for new capabilities, patch for fixes. Each release is also
git-tagged (`vX.Y[.Z]`) and published as a GitHub release.

The format roughly follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Fixed
- **`infra.yml` workflow was wiping production on every Bicep-only push.**
  The Bicep template defaults `containerImage` to the `k8se/quickstart`
  placeholder, and the `infra` workflow was running `az deployment group
  create` with `main.parameters.json` only — no `containerImage`
  override — so every infra-only deploy reverted the live Container App
  to the quickstart placeholder. The `deploy` workflow always passed
  `--parameters containerImage=...` so the regression only showed up on
  pushes that touched `infra/**` but not `app/**`/`src/**`/etc. Fix:
  `infra.yml` now reads the current image off the live Container App
  before deploying, passes it through to Bicep, refuses to deploy if
  the current image is the quickstart placeholder (i.e. already broken),
  and verifies the image is preserved post-deploy.

### Changed
- Auth allowlist now includes `naikaalok@gmail.com` in addition to
  `aakash_a_naik@yahoo.com`. Set via `authAllowedEmails` Bicep param.

---

## [3.2] — 2026-06-15

Polish + housekeeping release. No new product capability — closes out
two follow-ups from v3.1 and adds a "where to resume" doc so the repo is
fully self-explanatory across sessions.

### Added
- **`docs/STATUS.md`** — single-page snapshot of live deployment state,
  Azure resource inventory, Key Vault inventory, open work for next
  sessions, and gotchas. Resume-here doc; linked from README.

### Fixed
- **Sidebar still scrolled with the page** even after the v3.1 fix because
  the layout had two competing scroll surfaces (`body` AND
  `.main-content` both had `overflow-y: auto`). Switched to the standard
  app-shell pattern: `html`/`body` are exactly viewport-sized with
  `overflow: hidden`, `.app-container` is exactly `100vh` with `overflow:
  hidden`, and `.main-content` is the only scroll surface. The sidebar
  is now naturally pinned because the page itself can no longer scroll.
  No more `position: sticky` band-aid.
- **`copilot-setup-steps.yml` failed on every run** because it was
  installing .NET 9 and `dotnet restore`-ing a `SapAssistant.sln` that no
  longer exists. Rewrote it for the actual stack: Node 20 + `npm ci` +
  `npm run build` + Playwright Chromium. Cloud-agent envs now warm up
  cleanly in ~2 min instead of failing at step 5.

---

## [3.1] — 2026-06-14

Big infra + data-layer pass: **Azure SQL is now the primary data store**, env
vars + secrets are fully codified in Bicep (so the CI deploy stops wiping
them), and a long-standing sidebar scroll bug is fixed.

### Added

- **Azure SQL Serverless** as the procurement DB
  (`sapassistant-sql-2606142214` / `procurement`, `GP_S_Gen5`, auto-pause 60
  min, canadacentral).
- **CSV → SQL seeder** (`scripts/seed-sql.js`, `npm run seed:sql`) —
  idempotent, auto-derives schema from CSV headers, bulk-inserts via the
  `mssql` package. Seeds 26 reference tables (424 rows) plus 5 app-state
  tables (`app_actions`, `app_recommendations`, `app_supplier_reminders`,
  `app_supplier_responses`, `app_po_mutations`).
- **SQL-backed reads** — `src/services/data/csvDataService.ts → readCsv()`
  dispatches to `loadTableRows()` (SQL) when `DATA_SOURCE=sql`. Same
  string-shaped rows as csvtojson, so no downstream code changes.
- **SQL-backed writes** — the 4 mock JSON stores now mirror every
  `persistToFile()` to the corresponding `app_*` table as fire-and-forget
  `DELETE`+`BULK INSERT`. Sync caller API unchanged.
- **Boot-time SQL priming** — new
  [`instrumentation.ts`](instrumentation.ts) pulls all 4 stores from SQL
  into local JSON files before any request handler runs. This is how app
  state survives container restarts.
- **`DATA_SOURCE` env flag** — `sql` (default in prod) or `csv` (fallback).
  Toggle in seconds via Bicep param.
- **Azure OpenAI** wired into production (`sapassistant-aoai`,
  `gpt-4.1-nano` GlobalStandard 250K TPM) and connected to all 4 AI
  endpoints (`/api/copilot/chat`, `/api/executive-briefing`, `/api/root-cause`,
  `/api/supplier-intelligence`).
- **Comprehensive [README.md](README.md)** covering architecture, every env
  var and secret, seed/rotate/switch ops, and the full API surface.
- **CHANGELOG.md** (this file).

### Changed

- **Bicep now declares ALL env vars and secrets** — `DATA_SOURCE`,
  `SQL_*`, `AZURE_OPENAI_*` and the two new Key Vault-backed secrets
  (`AOAI-Key`, `SQL-ConnectionString`). Previously the CI deploy was
  silently wiping anything set manually via `az containerapp update`,
  which is why the AI Copilot and SQL backend kept reverting to
  fallback behavior after every push.
- Bumped Azure OpenAI api-version on `/api/copilot/chat` to `2024-10-21`
  for JSON-mode + tool-call support.
- `mssql` and `csvtojson` are now real `dependencies` (not just devDeps),
  since the runtime now imports them.

### Fixed

- **Sidebar scrolled with the page instead of staying fixed.** The
  `.sidebar` had `position: sticky; height: 100vh` but its flex parent's
  default `align-items: stretch` was overriding the height. Added
  `align-self: flex-start` so sticky has a viewport-sized target. The rail
  now stays glued to the viewport while page content scrolls under it.
- AI endpoints occasionally failed with `Failed to parse Azure OpenAI JSON
  response` when the model wrapped output in markdown fences. The 3
  structured-JSON endpoints now use `response_format: { type: 'json_object' }`
  on the newer api-version and have a more tolerant cleanup regex
  (strip fences → extract first `{…}` block). Errors now include the
  first 200 chars of raw output for diagnosis.

### Operations / infra

- Migrated `aoai-key` and `sql-conn` from Container App plain-value
  secrets to Key Vault (`AOAI-Key`, `SQL-ConnectionString`). They are now
  referenced from Bicep via `keyVaultUrl` + UAMI, so the CI deploy
  preserves them automatically.
- Rotated the SQL admin password as part of the KV migration.

---

## [3.0] — 2026-06-14

First production-feeling release: live AI integration, full UI rebrand, and
proper authentication.

### Added

- **AI integration end-to-end** — 4 endpoints (`/api/copilot/chat`,
  `/api/executive-briefing`, `/api/root-cause`,
  `/api/supplier-intelligence`) wired with a 3-branch chain: Gemini →
  Azure OpenAI → rule-based fallback. Structured JSON mode for the
  non-chat endpoints.
- **Microsoft Entra ID auth** via Auth.js v5 (PKCE, public/native
  client, multi-tenant + MSA support). Email/UPN allowlist via
  `AUTH_ALLOWED_EMAILS`.
- **Sidebar collapse mode** — Azure DevOps-style rail; full sidebar
  appears on hover. Diagnostics gear collapses cleanly.
- **System Diagnostics modal** in the sidebar.

### Changed

- Renamed product from `sap-assistant` (Aalok-Sidekick brand era) to
  **Procurement Copilot**. Docker image tag changed to
  `ghcr.io/naikaakash/procurement-copilot`. (Azure resource names stayed
  as `sap-assistant-*` to avoid destructive rename.)
- Adopted Aalok's polished Next.js stack as the front-end baseline
  (Tailwind-free, single-page workbench, ~10k-line `app/page.tsx`).

### Fixed

- OAuth `ERR_UNSAFE_REDIRECT` (Auth.js v5 + Container Apps proxy +
  Entra app type mismatch). Resolved by switching the Entra app to
  `publicClient.redirectUris` (Native platform) and removing the
  client_secret from the token request.
- OAuth callback host mismatch — set `AUTH_TRUST_HOST=true` and
  `AUTH_URL` to the Container App FQDN so Auth.js generates the right
  absolute callback URL.

---

## [2.x] — early prototyping

Scaffolding-era work, not separately tagged. Notable milestones in the
session checkpoints:

- Scaffolded `sap-assistant` (Phase 1) — Next.js 16 + Auth.js + a small
  upload-and-chat page.
- Bootstrapped Azure (RG, KV, Container Apps env, UAMI, Bicep, GitHub
  OIDC federation).
- Stood up the deploy pipeline; first live `/api/health` 200.
- Multi-day OAuth debugging (Phases 3-8). Several blind alleys; finally
  fixed in [3.0].

---

## Conventions for this changelog

- **Add changes to `[Unreleased]` as they merge to `main`.**
- When tagging a release, rename `[Unreleased]` to `[X.Y]` with today's
  date, then add a fresh empty `[Unreleased]` at the top.
- Categorize entries under **Added / Changed / Fixed / Removed /
  Security / Operations** as appropriate.
- Prefer "user-visible" wording — what the user can now do, see, or stop
  worrying about. Implementation details can go in commit messages.
- Cross-reference commits sparingly; the git log is right there.
