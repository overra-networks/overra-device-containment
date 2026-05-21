import { test, expect } from "@playwright/test";
import { E2E_TEST_USER, E2E_PASSWORD_CHANGE_USER } from "./global-setup";

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

  test("user can change password from settings and sign in with the new one", async ({ page }) => {
    // 1. Sign in with original password
    await page.goto("/login");
    await page.getByPlaceholder("operator@domain.com").fill(E2E_PASSWORD_CHANGE_USER.email);
    await page.getByPlaceholder(/•/).fill(E2E_PASSWORD_CHANGE_USER.password);
    await page.getByRole("button", { name: /authenticate/i }).click();
    await page.waitForURL(/\/dashboard|\/overview|\/devices/, { timeout: 15_000 });

    // 2. Change password in /settings
    await page.goto("/settings");
    await page.getByLabel("Current password").fill(E2E_PASSWORD_CHANGE_USER.password);
    await page.getByLabel("New password").fill(E2E_PASSWORD_CHANGE_USER.newPassword);
    await page.getByLabel("Confirm new password").fill(E2E_PASSWORD_CHANGE_USER.newPassword);
    await page.getByRole("button", { name: /update password/i }).click();

    // 3. Server signs us out — should land on /login
    await page.waitForURL(/\/login/, { timeout: 15_000 });

    // 4. Old password no longer works
    await page.getByPlaceholder("operator@domain.com").fill(E2E_PASSWORD_CHANGE_USER.email);
    await page.getByPlaceholder(/•/).fill(E2E_PASSWORD_CHANGE_USER.password);
    await page.getByRole("button", { name: /authenticate/i }).click();
    await expect(page.getByText(/Authentication failed/i).first()).toBeVisible();

    // 5. New password works
    await page.getByPlaceholder("operator@domain.com").fill(E2E_PASSWORD_CHANGE_USER.email);
    await page.getByPlaceholder(/•/).fill(E2E_PASSWORD_CHANGE_USER.newPassword);
    await page.getByRole("button", { name: /authenticate/i }).click();
    await page.waitForURL(/\/dashboard|\/overview|\/devices/, { timeout: 15_000 });
    await expect(page.locator("aside")).toBeVisible();
  });

  test("change password rejects wrong current password", async ({ page }) => {
    // Reuses E2E_TEST_USER — read-only flow, no mutation, safe to share.
    await page.goto("/login");
    await page.getByPlaceholder("operator@domain.com").fill(E2E_TEST_USER.email);
    await page.getByPlaceholder(/•/).fill(E2E_TEST_USER.password);
    await page.getByRole("button", { name: /authenticate/i }).click();
    await page.waitForURL(/\/dashboard|\/overview|\/devices/, { timeout: 15_000 });

    await page.goto("/settings");
    await page.getByLabel("Current password").fill("definitely-not-the-password");
    await page.getByLabel("New password").fill("brand-new-password");
    await page.getByLabel("Confirm new password").fill("brand-new-password");
    await page.getByRole("button", { name: /update password/i }).click();

    await expect(page.getByText(/Current password is incorrect/i).first()).toBeVisible({
      timeout: 5_000,
    });
    // Still on /settings, not signed out
    await expect(page).toHaveURL(/\/settings/);
  });
});
