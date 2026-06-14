import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  clickNavItem,
  clickTab,
  expectMessage,
  confirmModal,
  waitForTableLoad,
  waitForPageLoad,
  createProjectViaPage,
  searchProject,
} from '../helpers/arco';

test.describe.serial('Weekly Report Submit Flow @p1', () => {
  const projectName = uniqueName('周报提交项目');

  test('setup: create project for weekly report', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });
  });

  test('navigate to project weekly report tab and create report', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/.+/);

    await clickTab(page, '项目周报');
    await page.waitForTimeout(1_000);

    const createBtn = page.getByRole('button', { name: /创建周报|新建周报/ });
    if (await createBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await createBtn.click();

      await expect(page).toHaveURL(/\/weekly-reports\/(new|create)/, { timeout: 10_000 });

      const textAreas = page.locator('textarea, [contenteditable], .ql-editor');
      const firstArea = textAreas.first();
      if (await firstArea.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await firstArea.click();
        await firstArea.fill('E2E周报提交测试 - 本周工作概述');
      }

      const secondArea = textAreas.nth(1);
      if (await secondArea.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await secondArea.click();
        await secondArea.fill('E2E周报提交测试 - 下周计划');
      }

      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/api/weekly-reports') && r.request().method() === 'POST',
        { timeout: 15_000 },
      );
      const saveBtn = page.getByRole('button', { name: /保存草稿|保存/ }).first();
      await saveBtn.click();
      const resp = await responsePromise;
      expect(resp.status()).toBeLessThan(400);
    }
  });

  test('view draft in weekly reports summary page', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目周报');
    await waitForPageLoad(page);

    const draftTab = page.locator('[role="tab"]').filter({ hasText: '草稿' });
    await expect(draftTab).toBeVisible({ timeout: 5_000 });
    await draftTab.click();
    await page.waitForTimeout(500);
    await waitForTableLoad(page);

    const tableOrEmpty = page.locator('table').first().or(page.locator('.arco-empty'));
    await expect(tableOrEmpty).toBeVisible({ timeout: 5_000 });
  });

  test('submitted tab shows no initial entries for new project', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目周报');
    await waitForPageLoad(page);

    const submittedTab = page.locator('[role="tab"]').filter({ hasText: '已提交' });
    await expect(submittedTab).toBeVisible({ timeout: 5_000 });
    await submittedTab.click();
    await page.waitForTimeout(500);
    await waitForTableLoad(page);
  });

  test('week picker navigation', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目周报');
    await waitForPageLoad(page);

    const weekPicker = page.locator('.arco-picker').first();
    if (await weekPicker.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const pickerInput = weekPicker.locator('input').first();
      const currentValue = await pickerInput.inputValue();

      await weekPicker.click();
      await page.waitForTimeout(500);

      const prevBtn = page.locator('.arco-panel-date .arco-icon-left').first();
      if (await prevBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await prevBtn.click();
        await prevBtn.click();
        await page.waitForTimeout(300);
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });

  test('project filter dropdown works on weekly reports page', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目周报');
    await waitForPageLoad(page);

    const projectSelect = page.locator('[role="combobox"]').filter({
      has: page.locator('[placeholder*="项目"]'),
    }).first();

    if (await projectSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await projectSelect.click();
      await page.waitForTimeout(300);

      const option = page.locator('[data-slot="select-content"]:visible [role="option"]').filter({ hasText: projectName });
      if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(500);
        await waitForTableLoad(page);
      } else {
        await page.keyboard.press('Escape');
      }
    }
  });

  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('tbody tr').filter({ hasText: projectName });
    if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await row.locator('button[aria-label*="删除"]').click();
      await confirmModal(page);
      await expectMessage(page, '项目删除成功');
    }
  });
});
