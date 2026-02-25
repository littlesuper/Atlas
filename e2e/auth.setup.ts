import { test as setup } from '@playwright/test';
import { credentials } from './fixtures/test-data';

const AUTH_STATE_PATH = 'e2e/.auth/state.json';

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('请输入用户名').fill(credentials.admin.username);
  await page.getByPlaceholder('请输入密码').fill(credentials.admin.password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/projects**', { timeout: 15_000 });

  // Save signed-in state so other tests can reuse it
  await page.context().storageState({ path: AUTH_STATE_PATH });
});
