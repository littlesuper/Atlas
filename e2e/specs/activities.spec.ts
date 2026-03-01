import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import { expectMessage, confirmModal, waitForTableLoad, clickDrawerSubmit, pickDateRange, openCreateActivityDrawer, searchProject } from '../helpers/arco';

test.describe.serial('Activity Management', () => {
  const projectName = uniqueName('活动测试项目');
  const activityName = uniqueName(text.activityName);

  test('create project and add activity, then delete activity', async ({ authedPage: page }) => {
    // ── Step 1: Create project ──
    await page.getByRole('button', { name: '新建项目' }).click();
    await page.getByPlaceholder('请输入项目名称').fill(projectName);
    await pickDateRange(page);

    const managerSelect = page.locator('.arco-drawer .arco-select').filter({ has: page.locator('[placeholder="项目经理"]') });
    await managerSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
    await page.waitForTimeout(200);

    const projResp = page.waitForResponse(
      (resp) => resp.url().includes('/api/projects') && resp.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await projResp).status()).toBeLessThan(400);

    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    // ── Step 2: Navigate to project detail ──
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // ── Step 3: Add activity ──
    await openCreateActivityDrawer(page);

    const phaseSelect = page.locator('.arco-drawer .arco-select').first();
    await phaseSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();

    await page.getByPlaceholder('请输入活动名称').fill(activityName);
    await page.getByPlaceholder('请输入描述').fill(text.activityDesc);

    const createResp = page.waitForResponse(
      (resp) => resp.url().includes('/api/activities') && resp.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    const resp = await createResp;
    expect(resp.status()).toBeLessThan(400);

    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(2_000);

    // If activity not visible, try reload
    if (await page.getByText(activityName).isVisible({ timeout: 5_000 }).catch(() => false) === false) {
      await page.reload();
      await waitForTableLoad(page);
    }
    await expect(page.getByText(activityName)).toBeVisible({ timeout: 10_000 });

    // ── Step 4: Delete activity ──
    const row = page.locator('.arco-table-tr').filter({ hasText: activityName });
    await row.locator('button[class*="danger"]').click();

    await confirmModal(page);
    await expectMessage(page, '已删除活动');
  });

  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    await row.locator('button[class*="danger"]').click();
    await confirmModal(page);
    await expectMessage(page, '项目删除成功');
  });
});
