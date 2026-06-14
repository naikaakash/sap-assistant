import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

test.describe("Signed-in user — chat widget", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL!);
  });

  test("opens, accepts a message, renders a stubbed reply", async ({ page }) => {
    await page.goto("/contest");

    await page.getByRole("button", { name: /Open chat/i }).click();

    const input = page.getByPlaceholder("Type a message");
    await expect(input).toBeVisible();
    await input.fill("hello there");
    await page.getByRole("button", { name: "Send", exact: true }).click();

    // User bubble appears immediately, assistant follows.
    await expect(page.getByText("hello there")).toBeVisible();
    // StubChatService replies with a "sap-assistant stub" greeting on hello/hi messages.
    await expect(page.getByText(/sap-assistant stub/i)).toBeVisible({ timeout: 5_000 });
  });
});
