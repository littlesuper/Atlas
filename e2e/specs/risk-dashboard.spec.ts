import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  clickDrawerSubmit,
  createProjectViaPage,
  waitForPageLoad,
  openCreateActivityDrawer,
  searchProject,
  clickTab,
} from '../helpers/arco';

test.describe.serial('Risk Dashboard', () => {
  const projectName = uniqueName('风险仪表盘测试');

  test('setup: create project with activity and trigger assessment', async ({ authedPage: page }) => {
    test.setTimeout(60_000);
    await createProjectViaPage(page, { name: projectName });
    await searchProject(page, projectName);

    // Navigate to project and add activity
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await openCreateActivityDrawer(page);
    const phaseSelect = page.locator('.arco-drawer .arco-select').first();
    await phaseSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
    await page.getByPlaceholder('请输入活动名称').fill(uniqueName(text.activityName));

    const actResp = page.waitForResponse(
      (resp) => resp.url().includes('/api/activities') && resp.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await actResp).status()).toBeLessThan(400);
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });

    // Navigate to risk tab and trigger assessment
    await clickTab(page, '风险评估');
    await page.waitForTimeout(1_000);

    const assessBtn = page.getByRole('button', { name: /发起评估/ });
    if (await assessBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const assessResp = page.waitForResponse(
        (resp) => resp.url().includes('/assess') && resp.request().method() === 'POST',
        { timeout: 45_000 },
      );
      await assessBtn.click();
      const resp = await assessResp;
      expect(resp.status()).toBeLessThan(400);
    }
  });

  test('navigate to risk dashboard page', async ({ authedPage: page }) => {
    await page.goto('/risk-dashboard');
    await waitForPageLoad(page);

    // Page should load with the heading
    await expect(page.getByRole('heading', { name: '风险总览' })).toBeVisible({ timeout: 5_000 });
  });

  test('risk distribution stat cards are visible', async ({ authedPage: page }) => {
    await page.goto('/risk-dashboard');
    await waitForPageLoad(page);

    // Check for stat card labels
    const labels = ['低风险', '中风险', '高风险', '严重风险'];
    for (const label of labels) {
      await expect(page.getByText(label).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('project risk matrix table renders', async ({ authedPage: page }) => {
    await page.goto('/risk-dashboard');
    await waitForPageLoad(page);

    // Table should exist with expected headers
    const table = page.locator('.arco-table');
    await expect(table).toBeVisible({ timeout: 5_000 });

    await expect(page.getByText('项目风险矩阵')).toBeVisible();
  });

  test('click project row navigates to risk tab', async ({ authedPage: page }) => {
    await page.goto('/risk-dashboard');
    await waitForPageLoad(page);

    // If there are rows, clicking one should navigate
    const firstRow = page.locator('.arco-table-tr').filter({ hasText: projectName }).first();
    if (await firstRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstRow.click();
      await expect(page).toHaveURL(/\/projects\/.+\?tab=risk/);
    }
  });

  test('risk dashboard accessible from navigation menu', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForPageLoad(page);

    // Click the "风险总览" nav item
    const navItem = page.locator('.nav-item').filter({ hasText: '风险总览' });
    if (await navItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await navItem.click();
      await expect(page).toHaveURL(/\/risk-dashboard/);
    }
  });

  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await row.locator('button[class*="danger"]').click();
      await confirmModal(page);
      await expectMessage(page, '项目删除成功');
    }
  });
});
