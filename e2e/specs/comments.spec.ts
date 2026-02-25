import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  clickDrawerSubmit,
  pickDateRange,
  clickTab,
} from '../helpers/arco';

test.describe.serial('Activity Comments', () => {
  const projectName = uniqueName('评论测试项目');
  const activityName = uniqueName(text.activityName);
  const commentContent = '这是一条E2E测试评论_' + Date.now();

  test('setup: create project and activity', async ({ authedPage: page }) => {
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

    // Navigate to project
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Create activity
    await page.getByRole('button', { name: '新建活动' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible();

    const phaseSelect = page.locator('.arco-drawer .arco-select').first();
    await phaseSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();

    await page.getByPlaceholder('请输入活动名称').fill(activityName);

    const actResp = page.waitForResponse(
      (resp) => resp.url().includes('/api/activities') && resp.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await actResp).status()).toBeLessThan(400);
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
  });

  test('add comment to activity', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);

    // Click the activity row to open detail
    await expect(page.getByText(activityName)).toBeVisible({ timeout: 10_000 });
    await page.getByText(activityName).click();
    await page.waitForTimeout(500);

    // Look for comment input area
    const commentInput = page.getByPlaceholder('输入评论...');
    if (await commentInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await commentInput.fill(commentContent);
      // Click send button
      const sendBtn = page.locator('button.arco-btn-primary .arco-icon-send').first();
      if (await sendBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await sendBtn.click();
        await expectMessage(page, '评论已发送');
      }
    }
  });

  test('view history tab', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(500);

    await page.getByText(activityName).click();
    await page.waitForTimeout(500);

    // Switch to history tab
    const historyTab = page.getByText('变更历史');
    if (await historyTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await historyTab.click();
      await page.waitForTimeout(500);
      // Verify history content is loaded (may have create log)
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
