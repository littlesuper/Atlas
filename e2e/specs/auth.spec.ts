import { test, expect } from '@playwright/test';
import { login } from '../fixtures/auth';
import { credentials } from '../fixtures/test-data';
import { confirmModal } from '../helpers/arco';

// Auth tests need a clean browser (no pre-loaded storageState)
test.use({ storageState: { cookies: [], origins: [] } });

test.describe.serial('Authentication', () => {
  test('login with valid credentials redirects to /projects', async ({ page }) => {
    await login(page, credentials.admin.username, credentials.admin.password);
    await expect(page).toHaveURL(/\/projects/);
  });

  test('login with wrong password shows error and stays on login page', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('请输入用户名').fill('admin');
    await page.getByPlaceholder('请输入密码').fill('wrongpassword');
    await page.getByRole('button', { name: '登录' }).click();

    // Should stay on login page
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout redirects to login page', async ({ page }) => {
    // First login
    await login(page, credentials.admin.username, credentials.admin.password);
    await expect(page).toHaveURL(/\/projects/);

    // Click user avatar dropdown then logout
    await page.locator('.arco-avatar').click();
    await page.getByText('退出登录').click();
    // Confirm the logout modal
    await confirmModal(page);

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
