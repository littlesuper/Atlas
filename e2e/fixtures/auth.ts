import { test as base, type Page } from '@playwright/test';
import { credentials } from './test-data';

/** Fill login form and submit */
export async function login(
  page: Page,
  username: string,
  password: string,
) {
  await page.goto('/login');
  await page.getByPlaceholder('请输入用户名').fill(username);
  await page.getByPlaceholder('请输入密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/projects**', { timeout: 15_000 });
}

/**
 * Fixture that provides a page already logged in as admin.
 * The storageState is pre-loaded by the setup project in playwright.config,
 * so we just navigate to the default page — no fresh login needed.
 */
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await page.goto('/projects');
    await page.waitForURL('**/projects**', { timeout: 15_000 });
    await use(page);
  },
});

export { expect } from '@playwright/test';
