import { test, expect } from '../fixtures/auth';
import { clickNavItem, clickTab, waitForTableLoad, waitForPageLoad } from '../helpers/arco';

test.describe.serial('System Admin', () => {
  test('AI management tab: view config', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);

    await clickTab(page, 'AI管理');
    await expect(page.getByText('API 配置')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Token 使用统计')).toBeVisible();
  });

  test('users tab: view user list', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);

    await clickTab(page, '账号管理');
    await page.waitForTimeout(500);
    await clickTab(page, '用户管理');

    await waitForTableLoad(page);
    await expect(page.locator('.arco-table').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('用户管理').first()).toBeVisible();
  });

  test('roles tab: view roles list', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);

    await clickTab(page, '账号管理');
    await page.waitForTimeout(500);
    await clickTab(page, '角色管理');

    await waitForTableLoad(page);
    await expect(page.locator('.arco-table').first()).toBeVisible({ timeout: 5_000 });
  });

  test('audit log tab: view logs', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);

    await clickTab(page, '操作日志');
    await waitForTableLoad(page);
    await expect(page.locator('.arco-table').first()).toBeVisible({ timeout: 5_000 });
  });
});
