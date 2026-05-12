import { test, expect, type Page } from '@playwright/test';
import { clickTab, openCreateActivityDrawer, waitForPageLoad, waitForTableLoad } from '../helpers/arco';

test.describe('Visual Regression @visual @p2', () => {
  test.use({
    storageState: 'e2e/.auth/state.json',
    viewport: { width: 1366, height: 900 },
    deviceScaleFactor: 1,
  });

  async function stabilizeVisualPage(page: Page) {
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          caret-color: transparent !important;
        }
      `,
    });
  }

  async function getFirstProjectContext(page: Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);

    const token = await page.evaluate(() => localStorage.getItem('accessToken') || '');
    const response = await page.request.get('/api/projects?pageSize=1', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBeLessThan(400);

    const body = await response.json();
    const projectId = body.data?.[0]?.id;
    expect(projectId).toBeTruthy();
    return { projectId: String(projectId), token };
  }

  async function gotoProjectRiskTab(page: Page, projectId: string) {
    await page.goto(`/projects/${projectId}`);
    await clickTab(page, '风险评估');
    await expect(page.getByText('风险项管理')).toBeVisible({ timeout: 10_000 });
  }

  async function deleteRiskItemsByTitle(page: Page, token: string, projectId: string, title: string) {
    const response = await page.request.get(`/api/risk-items?projectId=${projectId}&pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBeLessThan(400);

    const body = await response.json();
    const items = Array.isArray(body.data) ? body.data : [];
    for (const item of items.filter((riskItem) => riskItem.title === title)) {
      await page.request.delete(`/api/risk-items/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }

  test('login page baseline', async ({ page }) => {
    await page.goto('/login');
    await stabilizeVisualPage(page);
    await expect(page).toHaveScreenshot('login-page.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });

  test('projects page baseline', async ({ page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await stabilizeVisualPage(page);
    await expect(page).toHaveScreenshot('projects-page.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });

  test('products page baseline', async ({ page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);
    await stabilizeVisualPage(page);
    await expect(page).toHaveScreenshot('products-page.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });

  test('risk dashboard baseline', async ({ page }) => {
    await page.goto('/risk-dashboard');
    await waitForPageLoad(page);
    await stabilizeVisualPage(page);
    await expect(page).toHaveScreenshot('risk-dashboard-page.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });

  test('activity create drawer baseline', async ({ page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await page.locator('.arco-table-container table tbody tr a').first().click();
    await page.waitForURL('**/projects/**', { timeout: 10_000 });
    await openCreateActivityDrawer(page);
    await stabilizeVisualPage(page);
    await expect(page.locator('.arco-drawer')).toHaveScreenshot('activity-create-drawer.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });

  test('product create drawer baseline', async ({ page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);
    await page.getByRole('button', { name: '新建产品' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible({ timeout: 5_000 });
    await stabilizeVisualPage(page);
    await expect(page.locator('.arco-drawer')).toHaveScreenshot('product-create-drawer.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });

  test('product detail drawer baseline', async ({ page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    const productRow = page.locator('.arco-table-tr').filter({ has: page.locator('button') }).first();
    await expect(productRow).toBeVisible({ timeout: 5_000 });
    await productRow.locator('button').first().click();
    await expect(page.locator('.arco-drawer')).toBeVisible({ timeout: 5_000 });

    await stabilizeVisualPage(page);
    await expect(page.locator('.arco-drawer')).toHaveScreenshot('product-detail-drawer.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });

  test('mobile projects page baseline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/projects');
    await waitForTableLoad(page);
    await stabilizeVisualPage(page);
    await expect(page).toHaveScreenshot('projects-page-mobile.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });

  test('risk item create modal baseline', async ({ page }) => {
    const { projectId } = await getFirstProjectContext(page);
    await gotoProjectRiskTab(page, projectId);

    await page.getByRole('button', { name: '新建' }).click();
    await expect(page.locator('.arco-modal')).toBeVisible({ timeout: 5_000 });
    await stabilizeVisualPage(page);
    await expect(page.locator('.arco-modal')).toHaveScreenshot('risk-item-create-modal.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });

  test('risk item detail drawer baseline', async ({ page }) => {
    const { projectId, token } = await getFirstProjectContext(page);
    const title = '视觉回归风险项详情';

    await deleteRiskItemsByTitle(page, token, projectId, title);
    const createResponse = await page.request.post('/api/risk-items', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        projectId,
        title,
        severity: 'HIGH',
        description: '用于视觉详情抽屉覆盖的临时风险项',
      },
    });
    expect(createResponse.status()).toBeLessThan(400);

    try {
      await gotoProjectRiskTab(page, projectId);
      await page.getByText(title).click();
      const drawer = page.locator('.arco-drawer');
      await expect(drawer).toBeVisible({ timeout: 5_000 });
      await stabilizeVisualPage(page);

      await expect(drawer).toHaveScreenshot('risk-item-detail-drawer.png', {
        animations: 'disabled',
        maxDiffPixelRatio: 0.01,
        mask: [
          drawer.getByText(/创建时间:/).locator('xpath=..'),
          drawer.locator('.arco-timeline'),
        ],
      });
    } finally {
      await deleteRiskItemsByTitle(page, token, projectId, title);
    }
  });

  test('weekly report form baseline', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-05-05T02:00:00+08:00'));
    await page.addInitScript(() => {
      localStorage.removeItem('weekly-report-draft-new');
    });

    await page.goto('/weekly-reports/new');
    await expect(page.getByRole('heading', { name: '创建周报' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.w-e-text-container').first()).toBeVisible({ timeout: 10_000 });
    await stabilizeVisualPage(page);
    await expect(page).toHaveScreenshot('weekly-report-form.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });

  test('mobile products page baseline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/products');
    await waitForTableLoad(page);
    await stabilizeVisualPage(page);
    await expect(page).toHaveScreenshot('products-page-mobile.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });
});
