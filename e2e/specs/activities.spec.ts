import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import { expectMessage, confirmModal, waitForTableLoad, clickDrawerSubmit, pickDateRange } from '../helpers/arco';

test.describe.serial('Activity Management', () => {
  const projectName = uniqueName('活动测试项目');
  const activityName = uniqueName(text.activityName);

  test('setup: create project for activity tests', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '新建项目' }).click();
    await page.getByPlaceholder('请输入项目名称').fill(projectName);

    // Pick date range via calendar
    await pickDateRange(page);

    // Project manager
    const managerSelect = page.locator('.arco-drawer .arco-select').filter({ has: page.locator('[placeholder="项目经理"]') });
    await managerSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
    await page.waitForTimeout(200);

    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/projects') && resp.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  });

  test('add activity to project', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await page.getByRole('button', { name: '新建活动' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible();

    // Select phase
    const phaseSelect = page.locator('.arco-drawer .arco-select').first();
    await phaseSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();

    await page.getByPlaceholder('请输入活动名称').fill(activityName);
    await page.getByPlaceholder('请输入描述').fill(text.activityDesc);

    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/activities') && resp.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(activityName)).toBeVisible({ timeout: 10_000 });
  });

  test('delete activity', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);

    await expect(page.getByText(activityName)).toBeVisible({ timeout: 10_000 });

    const row = page.locator('.arco-table-tr').filter({ hasText: activityName });
    await row.locator('button[class*="danger"]').click();

    await confirmModal(page);
    await expectMessage(page, '活动删除成功');
  });

  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    await row.locator('button[class*="danger"]').click();
    await confirmModal(page);
    await expectMessage(page, '项目删除成功');
  });
});
