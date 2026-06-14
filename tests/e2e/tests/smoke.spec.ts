import { test, expect } from "@playwright/test";

test.describe("Anonymous user", () => {
  test("landing page shows sign-in buttons", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "SAP Assistant" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Sign in with Microsoft/i })
    ).toBeVisible();
  });

  test("hitting /api/me without a cookie returns 401", async ({ request }) => {
    const r = await request.get("/api/me");
    expect(r.status()).toBe(401);
  });
});
