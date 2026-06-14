import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

test.describe("Signed-in user — contest", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL!);
  });

  test("clicking 'Enter the Contest' records an entry and shows the modal", async ({ page }) => {
    await page.goto("/contest");
    await expect(
      page.getByRole("heading", { name: "The Contest" })
    ).toBeVisible();

    const button = page.getByRole("button", { name: /Click to Enter the Contest/i });
    await expect(button).toBeEnabled();
    await button.click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(/recorded at/i);

    await modal.getByRole("button", { name: /Got it/i }).click();
    await expect(modal).not.toBeVisible();
  });
});
