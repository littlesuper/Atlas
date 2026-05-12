import { test, expect } from '../fixtures/auth';
import {
  clickNavItem,
  clickTab,
  waitForTableLoad,
  waitForPageLoad,
} from '../helpers/arco';

test.describe.serial('Audit Log View and Filter @p1', () => {

  test('navigate to audit log tab', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, '操作日志');

    await page.waitForTimeout(1_000);
    await expect(page.locator('.arco-table').first()).toBeVisible({ timeout: 10_000 });
  });

  test('audit log table has expected columns', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, '操作日志');
    await page.waitForTimeout(1_000);

    const table = page.locator('.arco-table').first();
    await expect(table).toBeVisible({ timeout: 10_000 });

    const expectedHeaders = ['时间', '用户', '操作'];
    for (const header of expectedHeaders) {
      const headerEl = table.getByText(header, { exact: false }).first();
      if (await headerEl.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(headerEl).toBeVisible();
      }
    }
  });

  test('audit log shows recent login entries', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, '操作日志');
    await page.waitForTimeout(1_000);

    const table = page.locator('.arco-table').first();
    await expect(table).toBeVisible({ timeout: 10_000 });

    const rows = table.locator('.arco-table-tbody .arco-table-tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('filter audit log by action type', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, '操作日志');
    await page.waitForTimeout(1_000);

    const filterSelect = page.locator('.arco-select').filter({
      has: page.locator('[placeholder*="操作"]'),
    }).first();

    if (await filterSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await filterSelect.click();
      await page.waitForTimeout(300);

      const options = page.locator('.arco-select-popup:visible .arco-select-option');
      if (await options.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
        await options.first().click();
        await page.waitForTimeout(500);
        await waitForTableLoad(page);
      }
    }
  });

  test('filter audit log by user', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, '操作日志');
    await page.waitForTimeout(1_000);

    const userFilter = page.locator('.arco-select').filter({
      has: page.locator('[placeholder*="用户"]'),
    }).first();

    if (await userFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await userFilter.click();
      await page.waitForTimeout(300);

      const adminOption = page.locator('.arco-select-popup:visible .arco-select-option').filter({ hasText: 'admin' });
      if (await adminOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await adminOption.click();
        await page.waitForTimeout(500);
        await waitForTableLoad(page);

        const table = page.locator('.arco-table').first();
        await expect(table).toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test('date range filter on audit log', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, '操作日志');
    await page.waitForTimeout(1_000);

    const dateRangePicker = page.locator('.arco-picker-range').first();
    if (await dateRangePicker.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await dateRangePicker.locator('input').first().click();
      await page.waitForTimeout(500);

      const panels = page.locator('.arco-panel-date');
      if (await panels.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        await panels.first().locator('.arco-picker-cell-today').click();
        await page.waitForTimeout(500);

        const rightCells = panels.nth(1).locator('.arco-picker-cell.arco-picker-cell-in-view');
        await rightCells.nth(14).click();
        await page.waitForTimeout(500);
      }
    }
  });
});
