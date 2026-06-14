# E2E tests

Playwright suite that drives the full app like a real user. Authentication is
bypassed via the test-only `/api/test/signin` endpoint, which is **only**
registered when the API starts with `Auth:Disable=true` (so it never exists in
production).

## Local

One-time:

```pwsh
cd tests/e2e
npm install
npm run install:browsers
```

Every run:

```pwsh
npm run prepare:all   # build SPA + copy into API wwwroot
npm test              # Playwright starts the API on :5050 and runs the suite
```

Useful variants:

```pwsh
npm run test:headed   # open a real browser window
npm run test:ui       # interactive Playwright UI
```

## CI

The `e2e` job in `.github/workflows/build-test.yml` runs the same flow on every
PR. Failure blocks the deploy workflow because `deploy` depends on `build-test`.

## How it works

1. `playwright.config.ts` configures a `webServer` that runs `dotnet run` on the
   API project with `Auth:Disable=true` and `ASPNETCORE_ENVIRONMENT=Production`.
2. The API serves the SPA from `src/SapAssistant.Api/wwwroot/`, which is
   populated by `prepare:wwwroot` from the Vite build output.
3. Tests use `helpers/auth.ts::signIn(context)` to POST `/api/test/signin`,
   which sets the same `sap-assistant-auth` cookie that real OIDC sign-in does.
4. Subsequent page navigations within that browser context are authenticated.
