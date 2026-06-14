import { test, expect } from '../fixtures/auth';
import { clickNavItem, clickTab, waitForPageLoad } from '../helpers/arco';

test.describe.serial('Navigation @p1', () => {
  test('sidebar navigation to major sections', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目管理');
    await expect(page).toHaveURL(/\/projects/);

    await clickNavItem(page, '项目周报');
    await expect(page).toHaveURL(/\/weekly-reports/);

    await clickNavItem(page, '产品管理');
    await expect(page).toHaveURL(/\/products/);

    await clickNavItem(page, 'AI管理');
    await expect(page).toHaveURL(/\/admin/);
  });

  test('tab navigation within system admin', async ({ authedPage: page }) => {
    await clickNavItem(page, 'AI管理');
    await expect(page).toHaveURL(/\/admin/);
    await waitForPageLoad(page);
    await expect(page.getByText('API 配置')).toBeVisible({ timeout: 5_000 });

    // Navigate to 账号管理 section
    await clickNavItem(page, '账号管理');
    await page.waitForTimeout(500);

    // Within 账号管理, click sub-tabs
    await clickTab(page, '用户管理');
    await expect(page.locator('table').first()).toBeVisible({ timeout: 5_000 });

    await clickTab(page, '角色管理');
    await expect(page.locator('table').first()).toBeVisible({ timeout: 5_000 });

    // Navigate to 操作日志 section
    await clickNavItem(page, '操作日志');
    await expect(page.locator('table').first()).toBeVisible({ timeout: 10_000 });
  });
});
