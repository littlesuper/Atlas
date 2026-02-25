import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  clickDrawerSubmit,
  pickDateRange,
  waitForPageLoad,
} from '../helpers/arco';

test.describe.serial('Risk Assessment', () => {
  const projectName = uniqueName('风险测试项目');

  test('setup: create project with activity for risk assessment', async ({ authedPage: page }) => {
    // Create project
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

    // Navigate to project and add activity
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await page.getByRole('button', { name: '新建活动' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible();

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
  });

  test('trigger risk assessment', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Look for risk assessment button/tab
    const riskBtn = page.getByText('风险评估').first();
    if (await riskBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await riskBtn.click();
      await page.waitForTimeout(1_000);

      // Trigger assessment if button exists
      const assessBtn = page.getByRole('button', { name: /评估|分析/ }).first();
      if (await assessBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await assessBtn.click();
        await page.waitForTimeout(2_000);
      }
    }
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
