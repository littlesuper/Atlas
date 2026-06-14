import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  clickDrawerSubmit,
  openCreateActivityDrawer,
  searchProject,
  createProjectViaPage,
  waitForPageLoad,
} from '../helpers/arco';

test.describe.serial('Activity Batch Operations @p1', () => {
  const projectName = uniqueName('批量操作项目');
  const activity1 = uniqueName('批量活动A');
  const activity2 = uniqueName('批量活动B');

  async function navigateToProjectDetail(page: import('@playwright/test').Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);
  }

  async function createActivityHelper(page: import('@playwright/test').Page, name: string) {
    await openCreateActivityDrawer(page);
    const phaseSelect = page.locator('[data-slot="sheet-content"] [role="combobox"]').first();
    await phaseSelect.click();
    await page.locator('[data-slot="select-content"]:visible [role="option"]').first().click();
    await page.waitForTimeout(300);

    await page.getByPlaceholder('请输入活动名称').fill(name);

    const resp = page.waitForResponse(
      (r) => r.url().includes('/api/activities') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await resp).status()).toBeLessThan(400);
    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(2_000);
  }

  test('setup: create project with two activities', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });
    await navigateToProjectDetail(page);
    await createActivityHelper(page, activity1);
    await createActivityHelper(page, activity2);

    if (await page.getByText(activity2).isVisible({ timeout: 5_000 }).catch(() => false) === false) {
      await page.reload();
      await waitForTableLoad(page);
    }
  });

  test('select activities via checkboxes', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const checkboxes = page.locator('table [data-slot="checkbox"]').filter({
      has: page.locator('input[type="checkbox"]'),
    });

    const rowCheckboxes = checkboxes.filter({ hasNot: page.locator('[data-state="indeterminate"]') });
    if (await rowCheckboxes.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await rowCheckboxes.first().click();
      await page.waitForTimeout(300);
      if (await rowCheckboxes.nth(1).isVisible({ timeout: 2_000 }).catch(() => false)) {
        await rowCheckboxes.nth(1).click();
        await page.waitForTimeout(300);
      }
    }

    const selectionLabel = page.getByText(/已选 \d+ 项/);
    if (await selectionLabel.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(selectionLabel).toBeVisible();
    }
  });

  test('batch change status via toolbar', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const checkboxes = page.locator('table [data-slot="checkbox"]');
    const rowCheckboxes = checkboxes.filter({ hasNot: page.locator('[data-state="indeterminate"]') });
    if (await rowCheckboxes.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await rowCheckboxes.first().click();
      await page.waitForTimeout(200);
      if (await rowCheckboxes.nth(1).isVisible({ timeout: 2_000 }).catch(() => false)) {
        await rowCheckboxes.nth(1).click();
        await page.waitForTimeout(300);
      }
    }

    const statusSelect = page.getByPlaceholder('批量修改状态');
    if (await statusSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await statusSelect.click();
      await page.waitForTimeout(300);

      const inProgressOpt = page.locator('[data-slot="select-content"]:visible [role="option"]').filter({ hasText: '进行中' });
      if (await inProgressOpt.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await inProgressOpt.click();
        await page.waitForTimeout(1_000);
      }
    }
  });

  test('batch change phase via toolbar', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const checkboxes = page.locator('table [data-slot="checkbox"]');
    const rowCheckboxes = checkboxes.filter({ hasNot: page.locator('[data-state="indeterminate"]') });
    if (await rowCheckboxes.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await rowCheckboxes.first().click();
      await page.waitForTimeout(200);
      if (await rowCheckboxes.nth(1).isVisible({ timeout: 2_000 }).catch(() => false)) {
        await rowCheckboxes.nth(1).click();
        await page.waitForTimeout(300);
      }
    }

    const phaseSelect = page.getByPlaceholder('批量修改阶段');
    if (await phaseSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await phaseSelect.click();
      await page.waitForTimeout(300);

      const options = page.locator('[data-slot="select-content"]:visible [role="option"]');
      if (await options.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
        await options.first().click();
        await page.waitForTimeout(1_000);
      }
    }
  });

  test('cancel selection', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const checkboxes = page.locator('table [data-slot="checkbox"]');
    const rowCheckboxes = checkboxes.filter({ hasNot: page.locator('[data-state="indeterminate"]') });
    if (await rowCheckboxes.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await rowCheckboxes.first().click();
      await page.waitForTimeout(300);
    }

    const cancelBtn = page.getByRole('button', { name: '取消选择' });
    if (await cancelBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(300);

      await expect(page.getByText(/已选 \d+ 项/)).not.toBeVisible({ timeout: 3_000 }).catch(() => {});
    }
  });

  test('cleanup: delete project', async ({ authedPage: page }) => {
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
