import { expect, test } from '@playwright/test';

const screenshotOptions = {
  animations: 'disabled',
  caret: 'hide',
  fullPage: true,
  maxDiffPixelRatio: 0.01,
} as const;

test.describe('Visual regression @visual', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Visual baselines are maintained for Chromium CI only.');

  test.use({ viewport: { width: 1365, height: 768 } });

  test('login page matches baseline', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible();

    await expect(page).toHaveScreenshot('login-page.png', screenshotOptions);
  });

  test.describe('authenticated pages', () => {
    test.use({ storageState: 'e2e/.auth/state.json' });

    test('projects page matches baseline', async ({ page }) => {
      await page.goto('/projects');
      await expect(page.getByRole('button', { name: '新建项目' })).toBeVisible();

      await expect(page).toHaveScreenshot('projects-page.png', screenshotOptions);
    });

    test('admin page matches baseline', async ({ page }) => {
      await page.goto('/admin');
      await expect(page.getByText('用户管理')).toBeVisible();

      await expect(page).toHaveScreenshot('admin-page.png', screenshotOptions);
    });
  });
});
