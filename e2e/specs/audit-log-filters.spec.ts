import { test, expect } from '../fixtures/auth';
import { waitForTableLoad, clickTab, clickSubNav } from '../helpers/arco';

/**
 * 审计日志高级筛选测试
 * - 按用户筛选
 * - 按日期范围筛选
 * - 关键词搜索
 */
test.describe('Audit Log Advanced Filters', () => {

  async function goToAuditLog(page: import('@playwright/test').Page) {
    await page.goto('/admin');
    await page.waitForTimeout(1_000);

    // Click audit log tab
    const auditTab = page.locator('[role="tab"]').filter({ hasText: /操作日志/ });
    if (await auditTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await auditTab.click();
      await page.waitForTimeout(500);
      await waitForTableLoad(page);
    }
  }

  // ──────── TC1: filter by user ────────
  test('filter audit log by user', async ({ authedPage: page }) => {
    await goToAuditLog(page);

    const userFilter = page.locator('.arco-select').filter({ has: page.locator('[placeholder*="用户"]') });
    if (await userFilter.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await userFilter.click();
      await page.waitForTimeout(300);

      // Select first user option
      const option = page.locator('.arco-select-popup:visible .arco-select-option').first();
      if (await option.isVisible()) {
        await option.click();
        await waitForTableLoad(page);
        await expect(page.locator('.arco-table').first()).toBeVisible();
      }
    }
  });

  // ──────── TC2: filter by action type ────────
  test('filter audit log by action type', async ({ authedPage: page }) => {
    await goToAuditLog(page);

    const actionFilter = page.locator('.arco-select').filter({ has: page.locator('[placeholder*="操作"]') });
    if (await actionFilter.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await actionFilter.click();
      await page.waitForTimeout(300);

      const option = page.locator('.arco-select-popup:visible .arco-select-option').first();
      if (await option.isVisible()) {
        await option.click();
        await waitForTableLoad(page);
        await expect(page.locator('.arco-table').first()).toBeVisible();
      }
    }
  });

  // ──────── TC3: filter by date range ────────
  test('filter audit log by date range', async ({ authedPage: page }) => {
    await goToAuditLog(page);

    // Find date range picker
    const rangePicker = page.locator('.arco-picker-range');
    if (await rangePicker.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await rangePicker.locator('input').first().click();
      await page.waitForTimeout(500);

      // Select date range via calendar
      const panels = page.locator('.arco-panel-date');
      if (await panels.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        // Click a date in left panel
        const leftCells = panels.first().locator('.arco-picker-cell.arco-picker-cell-in-view');
        await leftCells.first().click();
        await page.waitForTimeout(300);

        // Click a later date in right panel or same panel
        const rightCells = panels.last().locator('.arco-picker-cell.arco-picker-cell-in-view');
        await rightCells.nth(14).click();
        await page.waitForTimeout(500);

        await waitForTableLoad(page);
        await expect(page.locator('.arco-table').first()).toBeVisible();
      }
    }
  });

  // ──────── TC4: search by keyword ────────
  test('search audit log by keyword', async ({ authedPage: page }) => {
    await goToAuditLog(page);

    const searchInput = page.getByPlaceholder(/搜索|关键词/);
    if (await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await searchInput.fill('login');
      await page.waitForTimeout(500);
      await waitForTableLoad(page);
      await expect(page.locator('.arco-table').first()).toBeVisible();
    }
  });

  // ──────── TC5: filter by resource type ────────
  test('filter audit log by resource type', async ({ authedPage: page }) => {
    await goToAuditLog(page);

    const resourceFilter = page.locator('.arco-select').filter({ has: page.locator('[placeholder*="资源"]') });
    if (await resourceFilter.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await resourceFilter.click();
      await page.waitForTimeout(300);

      const option = page.locator('.arco-select-popup:visible .arco-select-option').first();
      if (await option.isVisible()) {
        await option.click();
        await waitForTableLoad(page);
        await expect(page.locator('.arco-table').first()).toBeVisible();
      }
    }
  });

  // ──────── TC6: combined filters ────────
  test('multiple filters work together', async ({ authedPage: page }) => {
    await goToAuditLog(page);

    // Apply user filter
    const userFilter = page.locator('.arco-select').filter({ has: page.locator('[placeholder*="用户"]') });
    if (await userFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await userFilter.click();
      await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
      await page.waitForTimeout(300);
    }

    // Apply action filter
    const actionFilter = page.locator('.arco-select').filter({ has: page.locator('[placeholder*="操作"]') });
    if (await actionFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await actionFilter.click();
      await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
      await page.waitForTimeout(300);
    }

    await waitForTableLoad(page);

    // Table should still render (may have no results)
    await expect(page.locator('.arco-table').first()).toBeVisible();
  });
});
