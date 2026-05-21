import { test, expect, Page } from "@playwright/test";
import {
  E2E_TEST_USER,
  E2E_ADMIN_USER,
  E2E_DEVICE_OWNER,
  E2E_ADMIN_TARGET_DEVICE_ID,
  E2E_LOCK_TARGET_USER,
} from "./global-setup";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByPlaceholder("operator@domain.com").fill(email);
  await page.getByPlaceholder(/•/).fill(password);
  await page.getByRole("button", { name: /authenticate/i }).click();
  await page.waitForURL(/\/dashboard|\/overview|\/devices/, {
    timeout: 15_000,
  });
}

test.describe("admin panel access control", () => {
  test("a normal user is redirected away from /admin", async ({ page }) => {
    await login(page, E2E_DEVICE_OWNER.email, E2E_DEVICE_OWNER.password);
    await page.goto("/admin/users");
    // Layout role gate must bounce non-admins off the admin surface.
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test("a normal user gets 403 from an admin API route", async ({ page }) => {
    await login(page, E2E_DEVICE_OWNER.email, E2E_DEVICE_OWNER.password);
    const res = await page.request.get("/api/admin/users");
    expect(res.status()).toBe(403);
  });

  test("unauthenticated request to /admin redirects to login", async ({
    page,
  }) => {
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("admin panel operations", () => {
  test("admin can list all users", async ({ page }) => {
    await login(page, E2E_ADMIN_USER.email, E2E_ADMIN_USER.password);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(
      page.getByText(E2E_TEST_USER.email).first()
    ).toBeVisible();
  });

  test("admin can contain another user's device", async ({ page }) => {
    await login(page, E2E_ADMIN_USER.email, E2E_ADMIN_USER.password);
    await page.goto(`/admin/devices/${E2E_ADMIN_TARGET_DEVICE_ID}`);

    await page.getByPlaceholder("CONTAIN").fill("CONTAIN");
    await page.getByRole("button", { name: /enter containment/i }).click();

    // device-control calls router.refresh(); status flips to contained.
    await expect(page.getByText(/contained/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // And the privileged action is recorded in the admin trail.
    await page.goto("/admin/audit-logs");
    await expect(
      page.getByText("admin.containment.enter").first()
    ).toBeVisible();
  });

  test("admin can delete another user's device (soft-delete)", async ({ page }) => {
    await login(page, E2E_ADMIN_USER.email, E2E_ADMIN_USER.password);
    await page.goto(`/admin/devices/${E2E_ADMIN_TARGET_DEVICE_ID}`);

    // The hostname seeded in global-setup for this device is "e2e-host".
    await page.getByRole("button", { name: /^Delete device…/ }).click();
    await page.getByPlaceholder("e2e-host").fill("e2e-host");
    await page.getByRole("button", { name: /^Delete device$/ }).click();

    await page.waitForURL(/\/admin\/devices$/, { timeout: 10_000 });

    // The deleted device should not appear in the admin devices list.
    await expect(page.getByText("e2e-host").first()).toBeHidden({
      timeout: 5_000,
    });

    // And the action is audited.
    await page.goto("/admin/audit-logs");
    await expect(
      page.getByText("admin.device.delete").first()
    ).toBeVisible();
  });

  test("admin can lock a user account and that user cannot log in", async ({
    browser,
    page,
  }) => {
    await login(page, E2E_ADMIN_USER.email, E2E_ADMIN_USER.password);

    // Find the lock target via the users list (cross-tenant view).
    await page.goto("/admin/users");
    const row = page
      .locator("tr")
      .filter({ hasText: E2E_LOCK_TARGET_USER.email });
    await row.getByRole("link", { name: /Manage/ }).click();
    await page.waitForURL(/\/admin\/users\/[^/]+$/, { timeout: 10_000 });

    await page.getByRole("button", { name: /^Lock account…/ }).click();
    await page
      .getByPlaceholder(E2E_LOCK_TARGET_USER.email)
      .fill(E2E_LOCK_TARGET_USER.email);
    await page.getByRole("button", { name: /^Lock account$/ }).click();

    // The card flips to the unlock state — proves the PATCH succeeded.
    await expect(
      page.getByRole("button", { name: /Unlock account/ })
    ).toBeVisible({ timeout: 10_000 });

    // Try to log in as the locked user from a clean context. authorize()
    // must reject with the SAME generic message as bad credentials
    // (no enumeration). User stays on /login.
    const locked = await browser.newContext();
    const lockedPage = await locked.newPage();
    await lockedPage.goto("/login");
    await lockedPage
      .getByPlaceholder("operator@domain.com")
      .fill(E2E_LOCK_TARGET_USER.email);
    await lockedPage
      .getByPlaceholder(/•/)
      .fill(E2E_LOCK_TARGET_USER.password);
    await lockedPage.getByRole("button", { name: /authenticate/i }).click();
    // Give the login a moment to either redirect or fail.
    await lockedPage.waitForTimeout(1500);
    await expect(lockedPage).toHaveURL(/\/login/);
    await locked.close();
  });
});
