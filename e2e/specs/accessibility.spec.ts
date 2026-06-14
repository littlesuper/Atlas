import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { clickTab, openCreateActivityDrawer, waitForTableLoad } from '../helpers/arco';

async function expectNoSeriousA11yIssues(page: Page, label: string) {
  await page.waitForLoadState('networkidle').catch(() => {});

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('table')
    .exclude('.arco-tabs')
    .analyze();

  const serious = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );

  if (serious.length > 0) {
    console.log(`${label} Critical/Serious a11y violations:`);
    serious.forEach((violation) => {
      console.log(`  [${violation.impact}] ${violation.id}: ${violation.description}`);
      console.log(`    Help: ${violation.helpUrl}`);
      violation.nodes.forEach((node) => console.log(`    Target: ${node.target}`));
    });
  }

  expect(serious.length).toBe(0);
}

async function getFirstProjectId(page: Page) {
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

test.describe('无障碍 (Accessibility) 审计 @a11y @p1', () => {
  test.use({ storageState: 'e2e/.auth/state.json' });

  test('项目列表页无严重无障碍问题', async ({ page }) => {
    await page.goto('/projects');
    await expectNoSeriousA11yIssues(page, 'Projects page');
  });

  test('登录页无严重无障碍问题', async ({ page }) => {
    await page.goto('/login');
    await expectNoSeriousA11yIssues(page, 'Login page');
  });

  test('管理员页面无严重无障碍问题', async ({ page }) => {
    await page.goto('/admin');
    await expectNoSeriousA11yIssues(page, 'Admin page');
  });

  test('项目详情页无严重无障碍问题', async ({ page }) => {
    await page.goto('/projects');
    await page.locator('[data-slot="table-container"] table tbody tr a').first().click();
    await page.waitForURL('**/projects/**', { timeout: 10_000 });
    await expectNoSeriousA11yIssues(page, 'Project detail page');
  });

  test('产品列表页无严重无障碍问题', async ({ page }) => {
    await page.goto('/products');
    await expectNoSeriousA11yIssues(page, 'Products page');
  });

  test('周报汇总页无严重无障碍问题', async ({ page }) => {
    await page.goto('/weekly-reports');
    await expectNoSeriousA11yIssues(page, 'Weekly reports page');
  });

  test('风险看板页无严重无障碍问题', async ({ page }) => {
    await page.goto('/risk-dashboard');
    await expectNoSeriousA11yIssues(page, 'Risk dashboard page');
  });

  test('资源负载页无严重无障碍问题', async ({ page }) => {
    await page.goto('/workload');
    await expectNoSeriousA11yIssues(page, 'Workload page');
  });

  test('模板管理页无严重无障碍问题', async ({ page }) => {
    await page.goto('/templates');
    await expectNoSeriousA11yIssues(page, 'Templates page');
  });

  test('账号管理页无严重无障碍问题', async ({ page }) => {
    await page.goto('/admin?tab=account');
    await expectNoSeriousA11yIssues(page, 'Account management page');
  });

  test('企微配置页无严重无障碍问题', async ({ page }) => {
    await page.goto('/admin?tab=account');
    await page.getByRole('tab', { name: '企微配置' }).click();
    await expectNoSeriousA11yIssues(page, 'WeCom config page');
  });

  test('节假日管理页无严重无障碍问题', async ({ page }) => {
    await page.goto('/admin?tab=holidays');
    await expectNoSeriousA11yIssues(page, 'Holiday management page');
  });

  test('操作日志页无严重无障碍问题', async ({ page }) => {
    await page.goto('/admin?tab=audit');
    await expectNoSeriousA11yIssues(page, 'Audit log page');
  });

  test('活动创建抽屉无严重无障碍问题', async ({ page }) => {
    await page.goto('/projects');
    await page.locator('[data-slot="table-container"] table tbody tr a').first().click();
    await page.waitForURL('**/projects/**', { timeout: 10_000 });
    await openCreateActivityDrawer(page);
    await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible({ timeout: 5_000 });
    await expectNoSeriousA11yIssues(page, 'Activity create drawer');
  });

  test('产品创建抽屉无严重无障碍问题', async ({ page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);
    await page.getByRole('button', { name: '新建产品' }).click();
    await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible({ timeout: 5_000 });
    await expectNoSeriousA11yIssues(page, 'Product create drawer');
  });

  test('产品详情抽屉无严重无障碍问题', async ({ page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    const productRow = page.locator('tbody tr').filter({ has: page.locator('button') }).first();
    await expect(productRow).toBeVisible({ timeout: 5_000 });
    await productRow.locator('button').first().click();

    await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible({ timeout: 5_000 });
    await expectNoSeriousA11yIssues(page, 'Product detail drawer');
  });

  test('产品对比抽屉无严重无障碍问题', async ({ page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    const productRows = page.locator('tbody tr').filter({ has: page.locator('button') });
    await expect(productRows.nth(1)).toBeVisible({ timeout: 5_000 });
    await productRows.first().locator('td, [role="cell"]').first().click();
    await productRows.nth(1).locator('td, [role="cell"]').first().click();

    await page.getByRole('button', { name: /对比/ }).click();
    await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible({ timeout: 5_000 });
    await expectNoSeriousA11yIssues(page, 'Product compare drawer');
  });

  test('风险项新建弹窗无严重无障碍问题', async ({ page }) => {
    const { projectId } = await getFirstProjectId(page);
    await gotoProjectRiskTab(page, projectId);

    await page.getByRole('button', { name: '新建' }).click();
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible({ timeout: 5_000 });
    await expectNoSeriousA11yIssues(page, 'Risk item create modal');
  });

  test('风险项详情抽屉无严重无障碍问题', async ({ page }) => {
    const { projectId, token } = await getFirstProjectId(page);
    const title = `A11Y风险项-${Date.now()}`;

    const createResponse = await page.request.post('/api/risk-items', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        projectId,
        title,
        severity: 'HIGH',
        description: '用于无障碍详情抽屉覆盖的临时风险项',
      },
    });
    expect(createResponse.status()).toBeLessThan(400);
    const created = await createResponse.json();

    try {
      await gotoProjectRiskTab(page, projectId);
      await page.getByText(title).click();
      await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible({ timeout: 5_000 });
      await expectNoSeriousA11yIssues(page, 'Risk item detail drawer');
    } finally {
      await page.request.delete(`/api/risk-items/${created.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});
