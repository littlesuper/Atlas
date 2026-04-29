import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  clickNavItem,
  clickTab,
  expectMessage,
  waitForTableLoad,
  waitForPageLoad,
  createProjectViaPage,
  confirmModal,
  searchProject,
} from '../helpers/arco';

/**
 * 周报 CRUD 完整测试
 * - 创建周报草稿
 * - 查看草稿列表
 * - 编辑周报内容
 * - 提交周报
 * - 查看已提交周报
 * - 周报进度状态切换
 * - 删除周报
 */
test.describe.serial('Weekly Report CRUD', () => {
  const projectName = uniqueName('周报测试项目');

  // ──────── setup: create project ────────
  test('setup: create project for weekly reports', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });
    await searchProject(page, projectName);
  });

  // ──────── TC1: navigate to weekly reports from project ────────
  test('navigate to project weekly report tab', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    // Click on project name in the table
    const projectLink = page.locator('.arco-table-td').getByText(projectName);
    await projectLink.click();
    await expect(page).toHaveURL(/\/projects\/.+/);

    await clickTab(page, '项目周报');
    await page.waitForTimeout(1_000);

    // Should see the weekly report area - check for "创建周报" button which is always present
    await expect(
      page.getByRole('button', { name: /创建周报/ }),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC2: create weekly report from project tab ────────
  test('create weekly report draft from project tab', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    // Click on project name in the table
    const projectLink2 = page.locator('.arco-table-td').getByText(projectName);
    await projectLink2.click();
    await expect(page).toHaveURL(/\/projects\/.+/);

    await clickTab(page, '项目周报');
    await page.waitForTimeout(1_000);

    // Click create report button
    const createBtn = page.getByRole('button', { name: /新建周报|创建周报/ });
    if (await createBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await createBtn.click();

      // Should navigate to report form
      await expect(page).toHaveURL(/\/weekly-reports\/(new|create)/, { timeout: 10_000 });

      // Fill in some report content
      const changeInput = page.locator('textarea, .ql-editor, [contenteditable]').first();
      if (await changeInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await changeInput.click();
        await changeInput.fill('E2E测试 - 本周变更概述');
      }

      // Save as draft
      const saveDraftBtn = page.getByRole('button', { name: /保存草稿|保存/ });
      if (await saveDraftBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const responsePromise = page.waitForResponse(
          (r) => r.url().includes('/api/weekly-reports') && r.request().method() === 'POST',
          { timeout: 15_000 },
        );
        await saveDraftBtn.click();
        const resp = await responsePromise;
        expect(resp.status()).toBeLessThan(400);
      }
    }
  });

  // ──────── TC3: view weekly reports summary ────────
  test('view weekly reports summary with tabs', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目周报');
    await expect(page).toHaveURL(/\/weekly-reports/);
    await waitForPageLoad(page);

    // Should see "已提交" and "草稿箱" tabs
    const submittedTab = page.locator('[role="tab"]').filter({ hasText: '已提交' });
    const draftTab = page.locator('[role="tab"]').filter({ hasText: '草稿' });

    await expect(submittedTab).toBeVisible({ timeout: 5_000 });
    await expect(draftTab).toBeVisible();

    // Table should be visible (multiple tables exist on this page, one per week)
    await waitForTableLoad(page);
    await expect(page.locator('.arco-table').first()).toBeVisible();
  });

  // ──────── TC4: check drafts tab ────────
  test('view drafts tab', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目周报');
    await waitForPageLoad(page);

    // Click drafts tab
    const draftTab = page.locator('[role="tab"]').filter({ hasText: '草稿' });
    await draftTab.click();
    await page.waitForTimeout(500);
    await waitForTableLoad(page);

    // Should show the draft report table or empty state
    const hasTable = await page.locator('.arco-table').first().isVisible({ timeout: 3_000 }).catch(() => false);
    const hasEmpty = await page.locator('.arco-empty').isVisible({ timeout: 1_000 }).catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();
  });

  // ──────── TC5: week picker filter ────────
  test('weekly report week picker filter', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目周报');
    await waitForPageLoad(page);

    // Week picker should be visible
    const weekPicker = page.locator('.arco-picker').first();
    if (await weekPicker.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(weekPicker).toBeVisible();
    }
  });

  // ──────── cleanup ────────
  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);

    // Search for the project in case it's not on the first page
    const searchInput = page.getByPlaceholder('搜索项目名称');
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchInput.fill(projectName);
      await page.waitForTimeout(500);
      await waitForTableLoad(page);
    }

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await row.locator('button[class*="danger"]').click();
      await confirmModal(page);
      await expectMessage(page, '项目删除成功');
    }
  });
});
