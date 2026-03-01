import { test, expect } from '../fixtures/auth';
import { waitForTableLoad, clickTab, waitForPageLoad } from '../helpers/arco';

/**
 * 项目详情页多 Tab 切换测试
 * - 活动列表 Tab
 * - 项目周报 Tab
 * - 产品 Tab
 * - 风险评估 Tab
 * - 排期工具 Tab
 * - 甘特图 Tab
 * - 各 Tab 之间切换不丢失数据
 */
test.describe('Project Detail Tabs', () => {
  async function goToProjectDetail(page: import('@playwright/test').Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);
    const firstProjectLink = page.locator('.arco-table-td a, .arco-table-td .arco-link').first();
    await firstProjectLink.waitFor({ state: 'visible', timeout: 10_000 });
    await firstProjectLink.click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);
  }

  // ──────── TC1: default tab is activities ────────
  test('default tab shows activity list', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    // Activity table should be visible by default
    await expect(page.locator('.arco-table').first()).toBeVisible({ timeout: 10_000 });

    // "活动" dropdown button should be visible (it's a dropdown, not a "新建活动" button)
    await expect(
      page.locator('button.arco-btn-primary').filter({ hasText: '活动' }),
    ).toBeVisible();
  });

  // ──────── TC2: switch to weekly reports tab ────────
  test('switch to weekly reports tab', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    await clickTab(page, '项目周报');
    await page.waitForTimeout(1_000);

    // Should show weekly report content
    await expect(
      page.getByText('份周报').or(page.getByText('暂无周报')).or(page.getByRole('button', { name: /新建周报/ })),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC3: switch to products tab ────────
  test('switch to products tab', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    const productsTab = page.locator('[role="tab"]').filter({ hasText: '产品列表' });
    if (await productsTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await productsTab.click();
      await page.waitForTimeout(1_000);

      // Should show product content
      await expect(
        page.locator('.arco-table').first().or(page.locator('.arco-empty').first()),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  // ──────── TC4: switch to risk assessment tab ────────
  test('switch to risk assessment tab', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    await clickTab(page, 'AI风险评估');
    await page.waitForTimeout(1_000);

    // Should show risk content area - check for the "发起评估" button specifically
    await expect(
      page.getByRole('button', { name: '发起评估' }),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC5: switch to scheduling tools tab ────────
  test('switch to scheduling tools tab', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    await clickTab(page, '排期工具');
    await page.waitForTimeout(1_000);

    // Should show scheduling tools content
    await expect(page.getByText('资源冲突检测').first()).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC6: switch to Gantt chart tab ────────
  test('switch to Gantt chart tab', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    await clickTab(page, '甘特图');
    await page.waitForTimeout(2_000);

    // Gantt chart container should be visible
    const ganttContent = page.locator('[class*="gantt"], [class*="Gantt"], canvas, svg').first();
    await expect(ganttContent).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC7: switch back to activities tab preserves data ────────
  test('switching back to activities tab preserves table data', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    // Count initial rows
    await waitForTableLoad(page);
    const initialRows = await page.locator('.arco-table-body .arco-table-tr').count();

    // Switch away and back
    await clickTab(page, '项目周报');
    await page.waitForTimeout(500);
    await clickTab(page, '活动列表');
    await page.waitForTimeout(1_000);
    await waitForTableLoad(page);

    // Row count should match
    const afterRows = await page.locator('.arco-table-body .arco-table-tr').count();
    expect(afterRows).toBe(initialRows);
  });

  // ──────── TC8: rapid tab switching doesn't crash ────────
  test('rapid tab switching remains stable', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    const tabs = ['项目周报', 'AI风险评估', '排期工具', '甘特图', '活动列表'];
    for (const tabName of tabs) {
      const tab = page.locator('[role="tab"]').filter({ hasText: tabName });
      if (await tab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(200);
      }
    }

    // After rapid switching, page should still be functional
    await page.waitForTimeout(1_000);
    await expect(page.locator('.arco-table, [class*="gantt"], canvas').first()).toBeVisible({ timeout: 10_000 });
  });
});
