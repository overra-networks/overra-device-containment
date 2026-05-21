import { test, expect, Page } from "@playwright/test";
import { E2E_DELETE_OWNER, E2E_OWNER_DEVICE_ID } from "./global-setup";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("operator@domain.com").fill(E2E_DELETE_OWNER.email);
  await page.getByPlaceholder(/•/).fill(E2E_DELETE_OWNER.password);
  await page.getByRole("button", { name: /authenticate/i }).click();
  await page.waitForURL(/\/dashboard|\/overview|\/devices/, {
    timeout: 15_000,
  });
}

test.describe("owner device delete", () => {
  test("owner can soft-delete their own device via the danger zone", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/devices/${E2E_OWNER_DEVICE_ID}`);

    // hostname seeded in global-setup is "owner-delete-host".
    await page.getByRole("button", { name: /^Delete device…/ }).click();
    await page
      .getByPlaceholder("owner-delete-host")
      .fill("owner-delete-host");
    await page.getByRole("button", { name: /^Delete device$/ }).click();

    await page.waitForURL(/\/devices$/, { timeout: 10_000 });

    // The device is gone from the user's own device list.
    await expect(
      page.getByText("owner-delete-host").first()
    ).toBeHidden({ timeout: 5_000 });

    // Direct navigation back to the URL now 404s (treated as gone).
    const res = await page.request.get(`/api/devices/${E2E_OWNER_DEVICE_ID}`);
    expect(res.status()).toBe(404);
  });
});
