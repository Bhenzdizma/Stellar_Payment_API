import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  prepareVisualSnapshot,
  seedMerchantSession,
} from "./helpers/fixtures";

test.describe("Create Payment Visual Regression", () => {
  test.beforeEach(async ({ page }) => {
    await seedMerchantSession(page);
    await page.goto("/dashboard/create");
    await prepareVisualSnapshot(page);
  });

  test("create payment form remains visually stable", async ({ page }) => {
    const formShell = page.locator("main");
    await expect(formShell).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create Payment Link" })).toBeVisible();
    await expect(page.locator("select#trusted-address")).toBeVisible();

    const noOverflow = await expectNoHorizontalOverflow(page);
    expect(noOverflow).toBeTruthy();

    await expect(formShell).toHaveScreenshot("create-payment-form.png");
  });
});
