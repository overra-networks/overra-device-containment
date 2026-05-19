import { test, expect, Page } from "@playwright/test";
import {
  E2E_TEST_USER,
  E2E_ADMIN_USER,
  E2E_DEVICE_OWNER,
  E2E_ADMIN_TARGET_DEVICE_ID,
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
});
