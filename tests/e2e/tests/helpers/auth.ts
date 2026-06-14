import type { BrowserContext } from "@playwright/test";

/**
 * Issues an auth cookie via the test-only /api/test/signin endpoint
 * (registered only when Auth:Disable=true). After this, navigating to
 * any RequireAuth page in `context` will succeed.
 */
export async function signIn(
  context: BrowserContext,
  baseURL: string,
  user: { email?: string; name?: string } = {}
): Promise<void> {
  const resp = await context.request.post(`${baseURL}/api/test/signin`, {
    data: {
      email: user.email ?? "test.user@example.com",
      name: user.name ?? "Test User",
    },
  });
  if (!resp.ok()) {
    throw new Error(
      `Test sign-in failed: ${resp.status()} ${await resp.text()}. ` +
        "Is the API running with Auth:Disable=true?"
    );
  }
}
