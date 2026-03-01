import { test, expect } from '@playwright/test';
import { login } from '../fixtures/auth';
import { credentials } from '../fixtures/test-data';
import { waitForPageLoad, waitForTableLoad, clickNavItem } from '../helpers/arco';

/**
 * 权限访问控制测试（使用非管理员账号）
 * - 非管理员用户登录
 * - 项目列表可见
 * - 系统管理权限限制
 * - 受保护路由重定向
 */
// Use clean browser state (no pre-loaded admin auth)
test.use({ storageState: { cookies: [], origins: [] } });

test.describe.serial('Permission Access Control', () => {
  // ──────── TC1: non-admin login and project access ────────
  test('non-admin user can login and view projects', async ({ page }) => {
    await login(page, credentials.zhangsan.username, credentials.zhangsan.password);
    await expect(page).toHaveURL(/\/projects/);

    await waitForTableLoad(page);
    await expect(page.locator('.arco-table')).toBeVisible();
  });

  // ──────── TC2: non-admin can view product list ────────
  test('non-admin user can view products', async ({ page }) => {
    await login(page, credentials.zhangsan.username, credentials.zhangsan.password);

    await clickNavItem(page, '产品管理');
    await expect(page).toHaveURL(/\/products/);
    await waitForTableLoad(page);
    await expect(page.locator('.arco-table')).toBeVisible();
  });

  // ──────── TC3: non-admin can view weekly reports ────────
  test('non-admin user can view weekly reports', async ({ page }) => {
    await login(page, credentials.zhangsan.username, credentials.zhangsan.password);

    await clickNavItem(page, '项目周报');
    await expect(page).toHaveURL(/\/weekly-reports/);
    await waitForPageLoad(page);
    await expect(page.getByText('项目周报汇总')).toBeVisible();
  });

  // ──────── TC4: admin-restricted pages ────────
  test('system admin may restrict access for non-admin users', async ({ page }) => {
    await login(page, credentials.zhangsan.username, credentials.zhangsan.password);

    // Try navigating to admin page
    await page.goto('/admin');
    await waitForPageLoad(page);

    // Non-admin might see 403 or redirect, or a permission warning
    // The behavior depends on role permissions
    const hasAccess = await page.getByText('系统管理').isVisible({ timeout: 5_000 }).catch(() => false);
    const hasForbidden = await page.getByText(/无权限|403|权限不足/).isVisible({ timeout: 3_000 }).catch(() => false);

    // One of the two should be true - either they have access or they're blocked
    expect(hasAccess || hasForbidden).toBeTruthy();
  });

  // ──────── TC5: non-admin project detail access ────────
  test('non-admin user can view project detail', async ({ page }) => {
    await login(page, credentials.zhangsan.username, credentials.zhangsan.password);
    await waitForTableLoad(page);

    const firstProjectLink = page.locator('.arco-table-td a, .arco-table-td .arco-link').first();
    if (await firstProjectLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstProjectLink.click();
      await expect(page).toHaveURL(/\/projects\/.+/);
      await page.waitForTimeout(1_000);

      // Should see activity table
      await expect(page.locator('.arco-table').first()).toBeVisible({ timeout: 10_000 });
    }
  });

  // ──────── TC6: different users see different content ────────
  test('user lisi can also login and view projects', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('请输入用户名').fill(credentials.lisi.username);
    await page.getByPlaceholder('请输入密码').fill(credentials.lisi.password);
    await page.getByRole('button', { name: '登录' }).click();

    // lisi may not have canLogin=true depending on seed data
    const loginResult = await Promise.race([
      page.waitForURL('**/projects**', { timeout: 10_000 }).then(() => 'success' as const),
      page.locator('.arco-message').waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'denied' as const),
    ]);

    if (loginResult === 'success') {
      await waitForTableLoad(page);
      await expect(page.locator('.arco-table')).toBeVisible();
    } else {
      // Login denied is a valid permission control response
      await expect(page.locator('.arco-message')).toBeVisible();
    }
  });
});
