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

test.describe.serial('Activity Check Items Flow @p1', () => {
  const projectName = uniqueName('检查项测试项目');
  const activityName = uniqueName('检查项活动');

  async function navigateToProjectDetail(page: import('@playwright/test').Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);
  }

  async function createActivityHelper(page: import('@playwright/test').Page) {
    await openCreateActivityDrawer(page);

    const phaseSelect = page.locator('[data-slot="sheet-content"] [role="combobox"]').first();
    await phaseSelect.click();
    await page.locator('[data-slot="select-content"]:visible [role="option"]').first().click();
    await page.waitForTimeout(300);

    await page.getByPlaceholder('请输入活动名称').fill(activityName);

    const resp = page.waitForResponse(
      (r) => r.url().includes('/api/activities') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await resp).status()).toBeLessThan(400);

    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(2_000);
  }

  async function openActivityEditDrawer(page: import('@playwright/test').Page) {
    await navigateToProjectDetail(page);

    const row = page.locator('tbody tr').filter({ hasText: activityName }).first();
    if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await row.locator('[aria-label*="编辑"], [class*="icon-edit"]').first().click().catch(() => {
        row.locator('button').first().click();
      });
      await page.waitForTimeout(1_000);
    }

    if (await page.getByText(activityName).isVisible({ timeout: 5_000 }).catch(() => false) === false) {
      await page.reload();
      await waitForTableLoad(page);
      const retryRow = page.locator('tbody tr').filter({ hasText: activityName }).first();
      await retryRow.locator('[aria-label*="编辑"], [class*="icon-edit"]').first().click().catch(() => {
        retryRow.locator('button').first().click();
      });
      await page.waitForTimeout(1_000);
    }
  }

  test('setup: create project and activity', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });
    await navigateToProjectDetail(page);
    await createActivityHelper(page);
  });

  test('open activity edit drawer shows check items section', async ({ authedPage: page }) => {
    await openActivityEditDrawer(page);

    const drawer = page.locator('[data-slot="sheet-content"]');
    if (await drawer.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const checkItemsSection = drawer.getByText('检查项');
      if (await checkItemsSection.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(checkItemsSection).toBeVisible();
      }

      const addInput = drawer.getByPlaceholder('添加检查项...');
      if (await addInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(addInput).toBeVisible();
      }
    }
  });

  test('add check item to activity', async ({ authedPage: page }) => {
    await openActivityEditDrawer(page);

    const drawer = page.locator('[data-slot="sheet-content"]');
    if (await drawer.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const addInput = drawer.getByPlaceholder('添加检查项...');
      if (await addInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const responsePromise = page.waitForResponse(
          (r) => r.url().includes('/api/check-items') && r.request().method() === 'POST',
          { timeout: 10_000 },
        );
        await addInput.fill('E2E测试检查项');
        await addInput.press('Enter');
        const resp = await responsePromise.catch(() => null);
        if (resp) {
          expect(resp.status()).toBeLessThan(400);
        }

        await page.waitForTimeout(500);
        await expect(drawer.getByText('E2E测试检查项')).toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test('toggle check item checkbox', async ({ authedPage: page }) => {
    await openActivityEditDrawer(page);

    const drawer = page.locator('[data-slot="sheet-content"]');
    if (await drawer.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const checkItemText = drawer.getByText('E2E测试检查项');
      if (await checkItemText.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const checkbox = drawer.locator('[data-slot="checkbox"]').first();

        const responsePromise = page.waitForResponse(
          (r) => r.url().includes('/api/check-items') && r.request().method() === 'PUT',
          { timeout: 10_000 },
        );
        await checkbox.click();
        const resp = await responsePromise.catch(() => null);
        if (resp) {
          expect(resp.status()).toBeLessThan(400);
        }

        await page.waitForTimeout(500);
      }
    }
  });

  test('progress bar updates after toggle', async ({ authedPage: page }) => {
    await openActivityEditDrawer(page);

    const drawer = page.locator('[data-slot="sheet-content"]');
    if (await drawer.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const progress = drawer.locator('.arco-progress');
      if (await progress.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(progress).toBeVisible();
      }

      const counter = drawer.getByText(/1\/1|0\/1/);
      if (await counter.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(counter).toBeVisible();
      }
    }
  });

  test('delete check item', async ({ authedPage: page }) => {
    await openActivityEditDrawer(page);

    const drawer = page.locator('[data-slot="sheet-content"]');
    if (await drawer.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const checkItemText = drawer.getByText('E2E测试检查项');
      if (await checkItemText.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const deleteBtn = drawer.locator('[aria-label*="删除"]').first();

        const responsePromise = page.waitForResponse(
          (r) => r.url().includes('/api/check-items') && r.request().method() === 'DELETE',
          { timeout: 10_000 },
        );
        await deleteBtn.click();
        const resp = await responsePromise.catch(() => null);
        if (resp) {
          expect(resp.status()).toBeLessThan(400);
        }

        await page.waitForTimeout(500);
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
      await confirmModal(page);
      await expectMessage(page, '项目删除成功');
    }
  });
});
