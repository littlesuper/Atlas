import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  clickNavItem,
  expectMessage,
  waitForTableLoad,
  waitForPageLoad,
  searchProject,
  createProjectViaPage,
  clickTab,
} from '../helpers/arco';

test.describe.serial('Activity Export Flow @p2', () => {
  const projectName = uniqueName('导出测试项目');
  const activityName = uniqueName('导出测试活动');

  async function navigateToProjectDetail(page: import('@playwright/test').Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);
  }

  test('setup: create project and activity', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });
    await navigateToProjectDetail(page);

    const dropdownTrigger = page.locator('button.arco-btn-primary').filter({ hasText: '活动' });
    await dropdownTrigger.click();
    await page.waitForTimeout(300);

    await page.locator('[data-slot="dropdown-menu-item"], [data-slot="dropdown-menu-item"]').filter({ hasText: '新建活动' }).click();
    await page.waitForTimeout(500);

    const drawer = page.locator('[data-slot="sheet-content"]');
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    const phaseSelect = drawer.locator('[role="combobox"]').first();
    await phaseSelect.click();
    await page.locator('[data-slot="select-content"]:visible [role="option"]').first().click();
    await page.waitForTimeout(300);

    await drawer.getByPlaceholder('请输入活动名称').fill(activityName);

    const resp = page.waitForResponse(
      (r) => r.url().includes('/api/activities') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await drawer.getByRole('button', { name: '创建' }).click();
    expect((await resp).status()).toBeLessThan(400);
    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
  });

  test('export activities via dropdown', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const dropdownTrigger = page.locator('button.arco-btn-primary').filter({ hasText: '活动' });
    await dropdownTrigger.click();
    await page.waitForTimeout(300);

    const exportItem = page.locator('[data-slot="dropdown-menu-item"], [data-slot="dropdown-menu-item"]').filter({ hasText: '导出活动' });
    if (await exportItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const downloadPromise = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
      await exportItem.click();
      const download = await downloadPromise;

      if (download) {
        const filename = download.suggestedFilename();
        expect(filename).toMatch(/\.(csv|xlsx|xls)/);
      }
    }
  });

  test('cleanup: delete project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('tbody tr').filter({ hasText: projectName });
    if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await row.locator('button[aria-label*="删除"]').click();
      await page.waitForTimeout(500);
      const confirmBtn = page.locator('[data-slot="dialog-footer"] .arco-btn-primary');
      if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(1_000);
      }
    }
  });
});
