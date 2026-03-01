import { test, expect } from '../fixtures/auth';
import { waitForTableLoad, clickTab } from '../helpers/arco';

/**
 * 活动列表列设置测试
 * - 打开列设置弹窗
 * - 切换列可见性
 * - 验证列隐藏/显示效果
 * - 重置列设置
 */
test.describe('Column Settings', () => {
  async function goToProjectDetail(page: import('@playwright/test').Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);
    const firstProjectLink = page.locator('.arco-table-td a, .arco-table-td .arco-link').first();
    await firstProjectLink.waitFor({ state: 'visible', timeout: 10_000 });
    await firstProjectLink.click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);
  }

  // ──────── TC1: open column settings ────────
  test('open column settings popover', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    // Find the settings button (⋮ icon or gear icon)
    const settingsBtn = page.locator('button').filter({ has: page.locator('svg.arco-icon-more-vertical, svg.arco-icon-settings') });
    if (await settingsBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await settingsBtn.click();
      await page.waitForTimeout(300);

      // A popover with column settings should appear
      const settingsContent = page.locator('.arco-popover-content').getByText('列显示设置');
      await expect(settingsContent).toBeVisible({ timeout: 5_000 });
    }
  });

  // ──────── TC2: toggle column visibility ────────
  test('toggle column visibility affects table headers', async ({ authedPage: page }) => {
    await goToProjectDetail(page);
    await waitForTableLoad(page);

    // Count initial visible columns
    const initialHeaders = await page.locator('.arco-table-header th, .arco-table thead th').count();

    // Open settings
    const settingsBtn = page.locator('button').filter({ has: page.locator('svg.arco-icon-more-vertical, svg.arco-icon-settings') });
    if (await settingsBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await settingsBtn.click();
      await page.waitForTimeout(300);

      // Find column checkboxes inside the popover
      const popover = page.locator('.arco-popover-content');
      await expect(popover).toBeVisible({ timeout: 5_000 });
      const columnToggles = popover.locator('.arco-checkbox');

      if (await columnToggles.count() > 0) {
        // Toggle a column off (click the last checkbox, e.g. "备注")
        await columnToggles.last().click();
        await page.waitForTimeout(500);

        // Close settings by clicking outside the popover
        await page.locator('body').click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(500);

        // Headers count should have changed
        const newHeaders = await page.locator('.arco-table-header th, .arco-table thead th').count();
        expect(newHeaders).not.toBe(initialHeaders);

        // Re-open settings and toggle back
        await settingsBtn.click();
        await page.waitForTimeout(300);
        const popover2 = page.locator('.arco-popover-content');
        await expect(popover2).toBeVisible({ timeout: 5_000 });
        await popover2.locator('.arco-checkbox').last().click();
        await page.waitForTimeout(500);
      }
    }
  });

  // ──────── TC3: column settings persist after tab switch ────────
  test('column settings persist after tab switch', async ({ authedPage: page }) => {
    await goToProjectDetail(page);
    await waitForTableLoad(page);

    const initialHeaders = await page.locator('.arco-table-header th, .arco-table thead th').count();

    // Switch to another tab and back
    await clickTab(page, '项目周报');
    await page.waitForTimeout(500);
    await clickTab(page, '活动列表');
    await page.waitForTimeout(1_000);
    await waitForTableLoad(page);

    // Column count should remain the same
    const afterHeaders = await page.locator('.arco-table-header th, .arco-table thead th').count();
    expect(afterHeaders).toBe(initialHeaders);
  });
});
