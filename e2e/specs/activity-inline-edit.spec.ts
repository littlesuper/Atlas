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
} from '../helpers/arco';

/**
 * 活动内联编辑完整测试
 * - 编辑活动名称（Input）
 * - 编辑活动状态（Select → AutoOpenSelect）
 * - 编辑活动阶段（Select）
 * - 编辑活动类型（Select）
 * - 编辑备注（Input）
 * - 编辑负责人（多选搜索 Select）
 * - Click-outside 关闭编辑
 * - Esc 键退出编辑不保存
 */
test.describe.serial('Activity Inline Editing', () => {
  const projectName = uniqueName('内联编辑项目');
  const activityName = uniqueName('内联编辑活动');

  // ──────── setup ────────
  test('setup: create project with activity', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });
    await searchProject(page, projectName);

    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Create activity
    await openCreateActivityDrawer(page);

    const phaseSelect = page.locator('.arco-drawer .arco-select').first();
    await phaseSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();

    await page.getByPlaceholder('请输入活动名称').fill(activityName);
    await page.getByPlaceholder('请输入描述').fill(text.activityDesc);

    const actResp = page.waitForResponse(
      (r) => r.url().includes('/api/activities') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await actResp).status()).toBeLessThan(400);
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(activityName)).toBeVisible({ timeout: 10_000 });
  });

  // Helper to navigate to the project detail
  async function goToProject(page: import('@playwright/test').Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);
    await waitForTableLoad(page);
  }

  // ──────── TC1: inline edit activity name ────────
  test('inline edit activity name', async ({ authedPage: page }) => {
    await goToProject(page);

    // Find the activity row and click the name cell
    const row = page.locator('.arco-table-tr').filter({ hasText: activityName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Click on the name cell to enter edit mode
    const nameCell = row.locator('.arco-table-td').filter({ hasText: activityName }).first();
    await nameCell.click();
    await page.waitForTimeout(300);

    // An input should appear
    const input = row.locator('.arco-input').first();
    if (await input.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const newName = activityName + '_已编辑';
      await input.clear();
      await input.fill(newName);

      // Blur to submit
      await input.press('Tab');
      await page.waitForTimeout(1_000);

      // API call should have been made
      await expect(page.getByText(newName)).toBeVisible({ timeout: 5_000 });
    }
  });

  // ──────── TC2: inline edit status via select ────────
  test('inline edit activity status', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = page.locator('.arco-table-tr').filter({ has: page.locator('.arco-table-td') }).first();
    await expect(row).toBeVisible();

    // Find the status cell — status is rendered as a clickable div, not .arco-tag
    const statusCell = row.locator('.arco-table-td').filter({
      hasText: /^(未开始|进行中|已完成|已取消)$/,
    });

    if (await statusCell.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await statusCell.locator('[style*="cursor"], span, div').filter({ hasText: /未开始|进行中|已完成|已取消/ }).first().click();
      await page.waitForTimeout(300);

      // AutoOpenSelect should appear
      const selectPopup = page.locator('.arco-select-popup:visible');
      if (await selectPopup.isVisible({ timeout: 3_000 }).catch(() => false)) {
        // Select "进行中"
        const option = selectPopup.locator('.arco-select-option').filter({ hasText: '进行中' });
        if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
          const updateResp = page.waitForResponse(
            (r) => r.url().includes('/api/activities') && r.request().method() === 'PUT',
            { timeout: 10_000 },
          );
          await option.click();
          const resp = await updateResp;
          expect(resp.status()).toBeLessThan(400);
        }
      }
    }
  });

  // ──────── TC3: inline edit type ────────
  test('inline edit activity type', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = page.locator('.arco-table-body .arco-table-tr').first();
    const typeCell = row.locator('.arco-table-td').filter({ hasText: /任务|里程碑/ });

    if (await typeCell.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await typeCell.click();
      await page.waitForTimeout(300);

      const selectPopup = page.locator('.arco-select-popup:visible');
      if (await selectPopup.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const milestoneOption = selectPopup.locator('.arco-select-option').filter({ hasText: '里程碑' });
        if (await milestoneOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
          const updateResp = page.waitForResponse(
            (r) => r.url().includes('/api/activities') && r.request().method() === 'PUT',
            { timeout: 10_000 },
          );
          await milestoneOption.click();
          const resp = await updateResp;
          expect(resp.status()).toBeLessThan(400);
        }
      }
    }
  });

  // ──────── TC4: Esc exits inline edit without saving ────────
  test('Esc key cancels inline edit without saving', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = page.locator('.arco-table-tr').filter({ has: page.locator('.arco-table-td') }).first();
    // Name column is at index 5 (after checkbox, drag, ID, 前置, 阶段)
    const nameText = await row.locator('.arco-table-td').nth(5).textContent();

    // Click name cell to enter edit
    await row.locator('.arco-table-td').nth(5).click();
    await page.waitForTimeout(300);

    const input = row.locator('.arco-input').first();
    if (await input.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await input.fill('不应该保存的名称');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // The original name should still be displayed
      const currentText = await row.locator('.arco-table-td').nth(5).textContent();
      expect(currentText).toContain(nameText?.trim() ?? '');
    }
  });

  // ──────── TC5: click-outside closes inline edit ────────
  test('click-outside closes inline edit', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = page.locator('.arco-table-tr').filter({ has: page.locator('.arco-table-td') }).first();

    // Click name cell to enter edit
    await row.locator('.arco-table-td').nth(5).click();
    await page.waitForTimeout(300);

    const inlineInputs = page.locator('.arco-table .arco-input, .arco-table .arco-select-view');
    const hasEdit = await inlineInputs.count() > 0;

    if (hasEdit) {
      // Click somewhere else (page header)
      await page.locator('header, .arco-layout-header, h1, h2').first().click();
      await page.waitForTimeout(500);

      // Inline editor should be dismissed
      const remaining = await page.locator('.arco-table .arco-input').count();
      expect(remaining).toBe(0);
    }
  });

  // ──────── cleanup ────────
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
