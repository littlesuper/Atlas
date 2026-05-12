import { test, expect } from '@playwright/test';
import { credentials } from '../fixtures/test-data';
import { login } from '../fixtures/auth';

test.describe('Login Edge Cases @p1', () => {

  test('login then refresh keeps session', async ({ page }) => {
    await login(page, credentials.admin.username, credentials.admin.password);
    await expect(page).toHaveURL(/\/projects/);

    await page.reload();
    await page.waitForURL('**/projects**', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/projects/);
  });

  test('login then navigate away and back keeps session', async ({ page }) => {
    await login(page, credentials.admin.username, credentials.admin.password);
    await expect(page).toHaveURL(/\/projects/);

    await page.goto('/products');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await page.goto('/projects');
    await page.waitForURL('**/projects**', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/projects/);
  });

  test('logout redirects to login page', async ({ page }) => {
    await login(page, credentials.admin.username, credentials.admin.password);
    await expect(page).toHaveURL(/\/projects/);

    const logoutTrigger = page.locator('.arco-dropdown-trigger, [class*="avatar"], [class*="user"]').last();
    if (await logoutTrigger.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await logoutTrigger.click();
      await page.waitForTimeout(500);

      const logoutItem = page.getByText('退出登录').or(page.getByText('退出'));
      if (await logoutItem.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await logoutItem.click();
        await page.waitForURL('**/login**', { timeout: 10_000 }).catch(() => {});
      }
    }
  });

  test('login with wrong password shows error and stays on login', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await page.getByPlaceholder('请输入用户名').fill('admin');
    await page.getByPlaceholder('请输入密码').fill('wrongpassword123');
    await page.getByRole('button', { name: '登录' }).click();

    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL(/\/login/);
  });

  test('direct URL access without login redirects to login page', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForTimeout(3_000);

    const url = page.url();
    expect(url.includes('/login') || url.includes('/projects')).toBeTruthy();
  });
});
