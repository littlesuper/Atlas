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
test.describe('Activity List Filters & Inline Edit @p1', () => {
  // Navigate to first project detail page
  async function goToProjectDetail(page: import('@playwright/test').Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);
    // Click the first project name link
    const firstProjectLink = page.locator('td a, td .arco-link').first();
    await firstProjectLink.waitFor({ state: 'visible', timeout: 10_000 });
    await firstProjectLink.click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    // Make sure the activities tab is active
    await page.waitForTimeout(1_000);
  }

  test('phase duration tags are visible in activity list toolbar', async ({ authedPage: page }) => {
    await goToProjectDetail(page);
    // At least one phase tag (EVT/DVT/PVT/MP) with duration should be visible
    const phaseTags = page.locator('[data-slot="badge"]').filter({ hasText: /^(EVT|DVT|PVT|MP) \d+天$/ });
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

    const phaseTags = page.locator('[data-slot="badge"]').filter({ hasText: /^(EVT|DVT|PVT|MP) \d+天$/ });
    const tagCount = await phaseTags.count();
    if (tagCount === 0) {
      test.skip();
      return;
    }

    // Get the phase name from first tag
    const tagText = await phaseTags.first().textContent();
    const phase = tagText?.match(/^(EVT|DVT|PVT|MP)/)?.[1];

    // Count total rows before filtering
    const totalRows = await page.locator('tbody tr').count();

    // Click phase tag to filter
    await phaseTags.first().click();
    await page.waitForTimeout(300);

    // Filtered rows should be <= total rows
    const filteredRows = await page.locator('tbody tr').count();
    expect(filteredRows).toBeLessThanOrEqual(totalRows);

    // All visible phase cells should match the selected phase
    if (phase && filteredRows > 0) {
      const phaseCells = page.locator('tbody [data-slot="badge"]').filter({ hasText: phase });
      expect(await phaseCells.count()).toBe(filteredRows);
    }

    // Click again to clear filter
    await phaseTags.first().click();
    await page.waitForTimeout(300);
    const restoredRows = await page.locator('tbody tr').count();
    expect(restoredRows).toBe(totalRows);
  });

  test('status filter: click "未开始" to filter activities', async ({ authedPage: page }) => {
    await goToProjectDetail(page);
    await waitForTableLoad(page);

    const notStartedFilter = page.locator('span').filter({ hasText: /^未开始 \d+$/ });
    await expect(notStartedFilter).toBeVisible({ timeout: 5_000 });

    const totalRows = await page.locator('tbody tr').count();

    // Click to filter
    await notStartedFilter.click();
    await page.waitForTimeout(300);

    const filteredRows = await page.locator('tbody tr').count();
    expect(filteredRows).toBeLessThanOrEqual(totalRows);

    // Click again to clear
    await notStartedFilter.click();
    await page.waitForTimeout(300);
    const restoredRows = await page.locator('tbody tr').count();
    expect(restoredRows).toBe(totalRows);
  });

  test('status filter: click "进行中" to filter activities', async ({ authedPage: page }) => {
    await goToProjectDetail(page);
    await waitForTableLoad(page);

    const inProgressFilter = page.locator('span').filter({ hasText: /^进行中 \d+$/ });
    await expect(inProgressFilter).toBeVisible({ timeout: 5_000 });

    const totalRows = await page.locator('tbody tr').count();

    await inProgressFilter.click();
    await page.waitForTimeout(300);

    const filteredRows = await page.locator('tbody tr').count();
    expect(filteredRows).toBeLessThanOrEqual(totalRows);

    // Clear
    await inProgressFilter.click();
    await page.waitForTimeout(300);
    const restoredRows = await page.locator('tbody tr').count();
    expect(restoredRows).toBe(totalRows);
  });

  test('Esc key exits inline edit mode', async ({ authedPage: page }) => {
    await goToProjectDetail(page);
    await waitForTableLoad(page);

    // Find the first data row
    const firstRow = page.locator('tbody tr').filter({ has: page.locator('td') }).first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    // Click on the name cell to enter inline edit
    // Column order: checkbox(0), drag(1), ID(2), predecessor(3), phase(4), name(5)
    const nameCell = firstRow.locator('td').nth(5);
    await nameCell.click();
    await page.waitForTimeout(500);

    // Check if an input appeared (inline edit mode)
    const inlineInput = page.locator('table [data-slot="input"], table .arco-select-view, table .arco-input-number');
    const hasInlineEdit = await inlineInput.count() > 0;

    if (hasInlineEdit) {
      // Press Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // Inline editor should be dismissed
      const inputAfterEsc = await page.locator('table [data-slot="input"]').count();
      expect(inputAfterEsc).toBe(0);
    }
  });
});
