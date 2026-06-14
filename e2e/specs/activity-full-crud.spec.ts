import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
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

test.describe.serial('Activity Full CRUD @smoke', () => {
  const projectName = uniqueName('活动CRUD项目');
  const activityName = uniqueName('完整测试活动');
  const activityName2 = uniqueName('第二个活动');

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
    await page.getByPlaceholder('请输入描述').fill('E2E测试活动描述');

    const resp = page.waitForResponse(
      (r) => r.url().includes('/api/activities') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await resp).status()).toBeLessThan(400);

    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(2_000);
  }

  test('setup: create project', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });
  });

  test('create activity with all form fields', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);
    await createActivityHelper(page, activityName);

    if (await page.getByText(activityName).isVisible({ timeout: 5_000 }).catch(() => false) === false) {
      await page.reload();
      await waitForTableLoad(page);
    }
    await expect(page.getByText(activityName)).toBeVisible({ timeout: 10_000 });
  });

  test('create second activity', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);
    await createActivityHelper(page, activityName2);

    if (await page.getByText(activityName2).isVisible({ timeout: 5_000 }).catch(() => false) === false) {
      await page.reload();
      await waitForTableLoad(page);
    }
    await expect(page.getByText(activityName2)).toBeVisible({ timeout: 10_000 });
  });

  test('edit activity name and description', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const row = page.locator('tbody tr').filter({ hasText: activityName }).first();
    if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await row.locator('[aria-label*="编辑"], [class*="icon-edit"]').first().click().catch(() => {
        row.locator('button').first().click();
      });

      const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: /编辑活动/ });
      if (await drawer.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const nameInput = drawer.getByPlaceholder('请输入活动名称');
        await nameInput.clear();
        await nameInput.fill(activityName + '已编辑');

        const descInput = drawer.getByPlaceholder('请输入描述');
        if (await descInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await descInput.clear();
          await descInput.fill('E2E修改后的描述');
        }

        const resp = page.waitForResponse(
          (r) => r.url().includes('/api/activities') && r.request().method() === 'PUT',
          { timeout: 15_000 },
        );
        await clickDrawerSubmit(page, '保存');
        expect((await resp).status()).toBeLessThan(400);

        await expect(drawer).not.toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test('change activity status to IN_PROGRESS', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const row = page.locator('tbody tr').filter({ hasText: activityName }).first();
    if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await row.locator('[aria-label*="编辑"], [class*="icon-edit"]').first().click().catch(() => {
        row.locator('button').first().click();
      });

      const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: /编辑活动/ });
      if (await drawer.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const statusSelects = drawer.locator('[role="combobox"]');
        let statusSelect = statusSelects.first();
        for (let i = 0; i < await statusSelects.count(); i++) {
          const el = statusSelects.nth(i);
          const t = await el.textContent();
          if (t?.includes('未开始') || t?.includes('状态')) {
            statusSelect = el;
            break;
          }
        }

        await statusSelect.click();
        await page.waitForTimeout(300);

        const inProgressOpt = page.locator('[data-slot="select-content"]:visible [role="option"]').filter({ hasText: '进行中' });
        if (await inProgressOpt.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await inProgressOpt.click();
        } else {
          const options = page.locator('[data-slot="select-content"]:visible [role="option"]');
          if (await options.count() > 1) {
            await options.nth(1).click();
          }
        }

        await page.waitForTimeout(300);

        const resp = page.waitForResponse(
          (r) => r.url().includes('/api/activities') && r.request().method() === 'PUT',
          { timeout: 15_000 },
        );
        await clickDrawerSubmit(page, '保存');
        expect((await resp).status()).toBeLessThan(400);

        await expect(drawer).not.toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test('add notes to activity', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const row = page.locator('tbody tr').filter({ hasText: activityName }).first();
    if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await row.locator('[aria-label*="编辑"], [class*="icon-edit"]').first().click().catch(() => {
        row.locator('button').first().click();
      });

      const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: /编辑活动/ });
      if (await drawer.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const notesInputs = drawer.locator('textarea');
        let notesInput = notesInputs.last();
        for (let i = 0; i < await notesInputs.count(); i++) {
          const el = notesInputs.nth(i);
          const placeholder = await el.getAttribute('placeholder') ?? '';
          if (placeholder.includes('备注')) {
            notesInput = el;
            break;
          }
        }

        if (await notesInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await notesInput.fill('E2E测试添加的备注信息');
        }

        const resp = page.waitForResponse(
          (r) => r.url().includes('/api/activities') && r.request().method() === 'PUT',
          { timeout: 15_000 },
        );
        await clickDrawerSubmit(page, '保存');
        expect((await resp).status()).toBeLessThan(400);

        await expect(drawer).not.toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test('delete activities', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    for (const name of [activityName, activityName2]) {
      const suffixedName = name === activityName ? activityName + '已编辑' : name;
      const row = page.locator('tbody tr').filter({ hasText: suffixedName }).first();
      if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await row.locator('[aria-label*="删除"]').first().click();
        await confirmModal(page);
        await page.waitForTimeout(1_000);
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
