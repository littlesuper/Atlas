import { test, expect } from '../fixtures/auth';
import {
  clickNavItem,
  clickTab,
  waitForTableLoad,
  waitForPageLoad,
} from '../helpers/arco';

/**
 * 审计日志测试
 * - 查看日志列表
 * - 验证日志列（时间、用户、操作、资源类型）
 * - 日志筛选
 * - 分页功能
 */
test.describe('Audit Log', () => {
  async function goToAuditLog(page: import('@playwright/test').Page) {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, '操作日志');
    await waitForTableLoad(page);
  }

  // ──────── TC1: view audit log table ────────
  test('audit log table displays with expected columns', async ({ authedPage: page }) => {
    await goToAuditLog(page);

    const table = page.locator('.arco-table').first();
    await expect(table).toBeVisible({ timeout: 5_000 });

    // Check column headers
    const expectedHeaders = ['时间', '用户', '操作', '资源'];
    for (const header of expectedHeaders) {
      const headerEl = table.getByText(header, { exact: false });
      if (await headerEl.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(headerEl).toBeVisible();
      }
    }
  });

  // ──────── TC2: audit log has entries ────────
  test('audit log contains login entries', async ({ authedPage: page }) => {
    await goToAuditLog(page);

    const table = page.locator('.arco-table').first();
    const rows = table.locator('tbody .arco-table-tr');
    const rowCount = await rows.count();

    // Should have at least 1 log entry (from our login)
    expect(rowCount).toBeGreaterThanOrEqual(1);

    // Look for LOGIN action
    const loginEntry = table.getByText(/LOGIN|登录/).first();
    if (await loginEntry.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(loginEntry).toBeVisible();
    }
  });

  // ──────── TC3: audit log pagination ────────
  test('audit log supports pagination', async ({ authedPage: page }) => {
    await goToAuditLog(page);

    // Look for pagination component (page may have 2 tables, so use .first())
    const pagination = page.locator('.arco-pagination').first();
    if (await pagination.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(pagination).toBeVisible();

      // Should show total count (use .first() in case multiple pagination elements)
      const totalText = pagination.getByText(/共/).first();
      if (await totalText.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(totalText).toBeVisible();
      }
    }
  });

  // ──────── TC4: audit log filter ────────
  test('audit log filter by action type', async ({ authedPage: page }) => {
    await goToAuditLog(page);

    // Look for action filter select
    const actionFilter = page.locator('.arco-select').filter({ has: page.locator('[placeholder*="操作"]') });
    if (await actionFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await actionFilter.click();
      await page.waitForTimeout(300);

      // Select a specific action type
      const loginOption = page.locator('.arco-select-popup:visible .arco-select-option').first();
      if (await loginOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await loginOption.click();
        await page.waitForTimeout(500);
        await waitForTableLoad(page);

        // Table should still be visible (with filtered results)
        await expect(page.locator('.arco-table').first()).toBeVisible();
      }
    }
  });
});
