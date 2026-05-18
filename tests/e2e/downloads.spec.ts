import { test, expect } from "@playwright/test";
import { E2E_TEST_USER } from "./global-setup";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByPlaceholder("operator@domain.com").fill(E2E_TEST_USER.email);
  await page.getByPlaceholder(/•/).fill(E2E_TEST_USER.password);
  await page.getByRole("button", { name: /authenticate/i }).click();
  await page.waitForURL(/\/dashboard|\/overview|\/devices/, { timeout: 15_000 });
}

test.describe("downloads page", () => {
  test("sidebar has Downloads link", async ({ page }) => {
    await login(page);
    const downloadsLink = page.locator("aside").getByRole("link", { name: /downloads/i });
    await expect(downloadsLink).toBeVisible();
  });

  test("navigates to /downloads via sidebar", async ({ page }) => {
    await login(page);
    await page.locator("aside").getByRole("link", { name: /downloads/i }).click();
    await expect(page).toHaveURL(/\/downloads/);
    await expect(page.getByRole("heading", { name: /^Downloads$/ })).toBeVisible();
  });

  test("generating a Linux installer creates a new row", async ({ page }) => {
    await login(page);
    await page.goto("/downloads");

    const generateLinux = page.getByRole("button", { name: /Generate \.sh/i }).last();
    await generateLinux.click();

    const table = page.locator("table");
    await expect(table).toBeVisible({ timeout: 10_000 });
    await expect(table.locator("tbody tr")).toHaveCount(1);
    await expect(table.getByText(/linux/i)).toBeVisible();
    await expect(table.getByText(/Pending/i)).toBeVisible();
  });
});
