import { defineConfig, devices } from "@playwright/test";

const PORT = 5050;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Starts the .NET API on PORT with auth bypassed. The API serves the SPA
  // from wwwroot/, which must be populated first via `npm run prepare:all`.
  webServer: {
    command: `dotnet run --project ../../src/SapAssistant.Api --no-launch-profile -c Release --urls ${BASE_URL}`,
    url: `${BASE_URL}/api/hello`,
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ASPNETCORE_ENVIRONMENT: "Production",
      // Double-underscore is .NET config syntax for the colon separator.
      Auth__Disable: "true",
      FrontendBaseUrl: "/",
    },
  },
});
