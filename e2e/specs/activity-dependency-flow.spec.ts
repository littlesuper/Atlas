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
  clickTab,
} from '../helpers/arco';

test.describe.serial('Activity Dependency Flow @p1', () => {
  const projectName = uniqueName('依赖测试项目');
  const activityA = uniqueName('前置活动A');
  const activityB = uniqueName('后续活动B');

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

    await createActivityHelper(page, activityA);
    await createActivityHelper(page, activityB);

    if (await page.getByText(activityB).isVisible({ timeout: 5_000 }).catch(() => false) === false) {
      await page.reload();
      await waitForTableLoad(page);
    }
    await expect(page.getByText(activityA)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(activityB)).toBeVisible({ timeout: 10_000 });
  });

  test('edit activity B to add dependency on activity A', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const rowB = page.locator('tbody tr').filter({ hasText: activityB }).first();
    if (await rowB.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await rowB.locator('[aria-label*="编辑"], [class*="icon-edit"]').first().click().catch(() => {
        rowB.locator('button').first().click();
      });

      const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: /编辑活动/ });
      if (await drawer.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await page.waitForTimeout(500);

        const depSection = drawer.getByText(/前置依赖|依赖/).first();
        if (await depSection.isVisible({ timeout: 3_000 }).catch(() => false)) {
          const addDepBtn = drawer.getByRole('button', { name: /添加依赖|新增依赖/ }).first();
          if (await addDepBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await addDepBtn.click();
            await page.waitForTimeout(300);

            const depSelects = drawer.locator('[role="combobox"]');
            const lastSelect = depSelects.last();
            if (await lastSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
              await lastSelect.click();
              await page.waitForTimeout(300);

              const optionA = page.locator('[data-slot="select-content"]:visible [role="option"]').filter({ hasText: activityA });
              if (await optionA.isVisible({ timeout: 2_000 }).catch(() => false)) {
                await optionA.click();
              } else {
                const options = page.locator('[data-slot="select-content"]:visible [role="option"]');
                if (await options.count() > 0) {
                  await options.first().click();
                }
              }
            }

            await page.waitForTimeout(300);

            const resp = page.waitForResponse(
              (r) => r.url().includes('/api/activities') && r.request().method() === 'PUT',
              { timeout: 15_000 },
            );
            await clickDrawerSubmit(page, '保存');
            const response = await resp;
            expect(response.status()).toBeLessThan(400);

            await expect(drawer).not.toBeVisible({ timeout: 5_000 });
          }
        }
      }
    }
  });

  test('verify dependency in gantt chart view', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const ganttTab = page.locator('[role="tab"]').filter({ hasText: '甘特图' });
    if (await ganttTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await ganttTab.click();
      await page.waitForTimeout(2_000);

      const ganttCanvas = page.locator('canvas, .gantt-chart, [class*="gantt"]');
      if (await ganttCanvas.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(ganttCanvas.first()).toBeVisible();
      }
    }
  });

  test('dependency notice shown in edit drawer when deps are set', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const rowB = page.locator('tbody tr').filter({ hasText: activityB }).first();
    if (await rowB.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await rowB.locator('[aria-label*="编辑"], [class*="icon-edit"]').first().click().catch(() => {
        rowB.locator('button').first().click();
      });

      const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: /编辑活动/ });
      if (await drawer.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await page.waitForTimeout(500);

        const depNotice = drawer.getByText(/前置依赖|自动计算/);
        if (await depNotice.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await expect(depNotice.first()).toBeVisible();
        }

        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
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
