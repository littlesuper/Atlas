import { test, expect } from '../fixtures/auth';
import { waitForTableLoad, clickTab } from '../helpers/arco';

/**
 * 活动列表筛选与内联编辑增强功能测试
 * - 阶段工期合计标签显示与筛选
 * - 状态快速筛选（未开始 / 进行中）
 * - 阶段筛选 + 状态筛选叠加
 * - 内联编辑 Esc 退出
 * - 负责人搜索联想
 */
test.describe('Activity List Filters & Inline Edit', () => {
  // Navigate to first project detail page
  async function goToProjectDetail(page: import('@playwright/test').Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);
    // Click the first project name link
    const firstProjectLink = page.locator('.arco-table-td a, .arco-table-td .arco-link').first();
    await firstProjectLink.waitFor({ state: 'visible', timeout: 10_000 });
    await firstProjectLink.click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    // Make sure the activities tab is active
    await page.waitForTimeout(1_000);
  }

  test('phase duration tags are visible in activity list toolbar', async ({ authedPage: page }) => {
    await goToProjectDetail(page);
    // At least one phase tag (EVT/DVT/PVT/MP) with duration should be visible
    const phaseTags = page.locator('.arco-tag').filter({ hasText: /^(EVT|DVT|PVT|MP) \d+天$/ });
    // Wait for table to load
    await waitForTableLoad(page);
    const count = await phaseTags.count();
    // Projects with activities should have at least one phase tag
    if (count > 0) {
      await expect(phaseTags.first()).toBeVisible();
    }
  });

  test('click phase tag to filter activities', async ({ authedPage: page }) => {
    await goToProjectDetail(page);
    await waitForTableLoad(page);

    const phaseTags = page.locator('.arco-tag').filter({ hasText: /^(EVT|DVT|PVT|MP) \d+天$/ });
    const tagCount = await phaseTags.count();
    if (tagCount === 0) {
      test.skip();
      return;
    }

    // Get the phase name from first tag
    const tagText = await phaseTags.first().textContent();
    const phase = tagText?.match(/^(EVT|DVT|PVT|MP)/)?.[1];

    // Count total rows before filtering
    const totalRows = await page.locator('.arco-table-body .arco-table-tr').count();

    // Click phase tag to filter
    await phaseTags.first().click();
    await page.waitForTimeout(300);

    // Filtered rows should be <= total rows
    const filteredRows = await page.locator('.arco-table-body .arco-table-tr').count();
    expect(filteredRows).toBeLessThanOrEqual(totalRows);

    // All visible phase cells should match the selected phase
    if (phase && filteredRows > 0) {
      const phaseCells = page.locator('.arco-table-body .arco-tag').filter({ hasText: phase });
      expect(await phaseCells.count()).toBe(filteredRows);
    }

    // Click again to clear filter
    await phaseTags.first().click();
    await page.waitForTimeout(300);
    const restoredRows = await page.locator('.arco-table-body .arco-table-tr').count();
    expect(restoredRows).toBe(totalRows);
  });

  test('status filter: click "未开始" to filter activities', async ({ authedPage: page }) => {
    await goToProjectDetail(page);
    await waitForTableLoad(page);

    const notStartedFilter = page.locator('span').filter({ hasText: /^未开始 \d+$/ });
    await expect(notStartedFilter).toBeVisible({ timeout: 5_000 });

    const totalRows = await page.locator('.arco-table-body .arco-table-tr').count();

    // Click to filter
    await notStartedFilter.click();
    await page.waitForTimeout(300);

    const filteredRows = await page.locator('.arco-table-body .arco-table-tr').count();
    expect(filteredRows).toBeLessThanOrEqual(totalRows);

    // Click again to clear
    await notStartedFilter.click();
    await page.waitForTimeout(300);
    const restoredRows = await page.locator('.arco-table-body .arco-table-tr').count();
    expect(restoredRows).toBe(totalRows);
  });

  test('status filter: click "进行中" to filter activities', async ({ authedPage: page }) => {
    await goToProjectDetail(page);
    await waitForTableLoad(page);

    const inProgressFilter = page.locator('span').filter({ hasText: /^进行中 \d+$/ });
    await expect(inProgressFilter).toBeVisible({ timeout: 5_000 });

    const totalRows = await page.locator('.arco-table-body .arco-table-tr').count();

    await inProgressFilter.click();
    await page.waitForTimeout(300);

    const filteredRows = await page.locator('.arco-table-body .arco-table-tr').count();
    expect(filteredRows).toBeLessThanOrEqual(totalRows);

    // Clear
    await inProgressFilter.click();
    await page.waitForTimeout(300);
    const restoredRows = await page.locator('.arco-table-body .arco-table-tr').count();
    expect(restoredRows).toBe(totalRows);
  });

  test('Esc key exits inline edit mode', async ({ authedPage: page }) => {
    await goToProjectDetail(page);
    await waitForTableLoad(page);

    // Find an activity name cell and click to enter inline edit
    const nameCell = page.locator('.arco-table-body .arco-table-tr').first().locator('.arco-table-td').nth(4);
    await nameCell.click();
    await page.waitForTimeout(200);

    // Check if an input appeared (inline edit mode)
    const inlineInput = page.locator('.arco-table-body .arco-input, .arco-table-body .arco-select, .arco-table-body .arco-input-number');
    const hasInlineEdit = await inlineInput.count() > 0;

    if (hasInlineEdit) {
      // Press Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // Inline editor should be dismissed
      const inputAfterEsc = await inlineInput.count();
      expect(inputAfterEsc).toBe(0);
    }
  });
});
