import { test, expect } from '../fixtures/auth';
import { clickNavItem, clickTab, waitForPageLoad } from '../helpers/arco';

test.describe.serial('Navigation', () => {
  test('sidebar navigation to major sections', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目管理');
    await expect(page).toHaveURL(/\/projects/);

    await clickNavItem(page, '项目周报');
    await expect(page).toHaveURL(/\/weekly-reports/);

    await clickNavItem(page, '产品管理');
    await expect(page).toHaveURL(/\/products/);

    await clickNavItem(page, '系统管理');
    await expect(page).toHaveURL(/\/admin/);
  });

  test('tab navigation within system admin', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await expect(page).toHaveURL(/\/admin/);
    await waitForPageLoad(page);

    // Click AI管理 tab
    await clickTab(page, 'AI管理');
    await expect(page.getByText('API 配置')).toBeVisible({ timeout: 5_000 });

    // Click 账号管理 tab
    await clickTab(page, '账号管理');
    await page.waitForTimeout(500);

    // Within 账号管理, click sub-tabs
    await clickTab(page, '用户管理');
    await expect(page.locator('.arco-table').first()).toBeVisible({ timeout: 5_000 });

    await clickTab(page, '角色管理');
    await expect(page.locator('.arco-table').first()).toBeVisible({ timeout: 5_000 });

    // Click 操作日志 tab
    await clickTab(page, '操作日志');
    await expect(page.locator('.arco-table').first()).toBeVisible({ timeout: 10_000 });
  });
});
