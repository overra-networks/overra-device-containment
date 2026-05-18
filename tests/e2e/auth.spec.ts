import { test, expect } from "@playwright/test";
import { E2E_TEST_USER } from "./global-setup";

test.describe("authentication", () => {
  test("login form rejects invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("operator@domain.com").fill(E2E_TEST_USER.email);
    await page.getByPlaceholder(/•/).fill("wrong-password");
    await page.getByRole("button", { name: /authenticate/i }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/Authentication failed/i).first()).toBeVisible();
  });

  test("valid credentials redirect to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("operator@domain.com").fill(E2E_TEST_USER.email);
    await page.getByPlaceholder(/•/).fill(E2E_TEST_USER.password);
    await page.getByRole("button", { name: /authenticate/i }).click();

    await page.waitForURL(/\/dashboard|\/overview|\/devices/, { timeout: 15_000 });
    await expect(page.locator("aside")).toBeVisible();
  });

  test("dashboard layout redirects unauthenticated users to /login", async ({ page }) => {
    await page.goto("/devices");
    await expect(page).toHaveURL(/\/login/);
  });
});
