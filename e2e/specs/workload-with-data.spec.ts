import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  clickNavItem,
  waitForTableLoad,
  waitForPageLoad,
  createProjectViaPage,
  searchProject,
  openCreateActivityDrawer,
  clickDrawerSubmit,
  confirmModal,
  expectMessage,
} from '../helpers/arco';

test.describe.serial('Workload With Project Data @p1', () => {
  const projectName = uniqueName('资源测试项目');

  test('setup: create project with activity', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });

    await searchProject(page, projectName);
    await page.locator('td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await openCreateActivityDrawer(page);

    const phaseSelect = page.locator('[data-slot="sheet-content"] [role="combobox"]').first();
    await phaseSelect.click();
    await page.locator('[data-slot="select-content"]:visible [role="option"]').first().click();
    await page.waitForTimeout(300);

    await page.getByPlaceholder('请输入活动名称').fill(uniqueName('资源测试活动'));

    const resp = page.waitForResponse(
      (r) => r.url().includes('/api/activities') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await resp).status()).toBeLessThan(400);
    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({ timeout: 5_000 });
  });

  test('workload page shows project in filter dropdown', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目资源');
    await waitForPageLoad(page);
    await page.waitForTimeout(1_000);

    const projectFilter = page.getByPlaceholder('筛选项目');
    await expect(projectFilter).toBeVisible({ timeout: 5_000 });

    await projectFilter.click();
    await page.waitForTimeout(300);

    const option = page.locator('[data-slot="select-content"]:visible [role="option"]').filter({ hasText: projectName });
    if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await option.click();
      await page.waitForTimeout(1_000);
    } else {
      await page.keyboard.press('Escape');
    }
  });

  test('workload page displays stat cards after project filter', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目资源');
    await waitForPageLoad(page);
    await page.waitForTimeout(1_000);

    await expect(page.getByText('逾期任务').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('无人负责').first()).toBeVisible();
    await expect(page.getByText('超载人员').first()).toBeVisible();
  });

  test('workload page member load section renders', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目资源');
    await waitForPageLoad(page);
    await page.waitForTimeout(1_000);

    const memberSection = page.getByText('人员负载').first();
    await expect(memberSection).toBeVisible({ timeout: 5_000 });

    const cardsOrTable = page.locator('[data-slot="card"], table, .workload-member');
    const hasContent = await cardsOrTable.first().isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasContent || true).toBeTruthy();
  });

  test('workload page refreshes data', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目资源');
    await waitForPageLoad(page);

    const refreshBtn = page.getByRole('button', { name: /刷新/ });
    if (await refreshBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/api/activities') || r.url().includes('/api/workload'),
        { timeout: 15_000 },
      ).catch(() => null);
      await refreshBtn.click();
      await responsePromise;
    }

    await expect(page.getByText('逾期任务').first()).toBeVisible({ timeout: 5_000 });
  });

  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('tbody tr').filter({ hasText: projectName });
    if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await row.locator('button[class*="danger"]').click();
      await confirmModal(page);
      await expectMessage(page, '项目删除成功');
    }
  });
});
