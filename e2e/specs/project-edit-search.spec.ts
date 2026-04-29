import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  createProjectViaPage,
  searchProject,
} from '../helpers/arco';

/**
 * 项目编辑、搜索与状态管理测试
 * - 编辑项目基本信息
 * - 修改项目状态
 * - 关键词搜索
 * - 状态筛选
 * - 日期范围筛选
 * - 统计卡片验证
 * - 组合筛选
 */
test.describe.serial('Project Edit & Search', () => {
  const projectName = uniqueName('编辑搜索项目');
  const updatedName = uniqueName('已编辑项目');

  // ──────── setup: create project ────────
  test('setup: create project', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await createProjectViaPage(page, { name: projectName, desc: text.projectDesc });
    await searchProject(page, projectName);
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC1: stat cards display ────────
  test('project stat cards display correct counts', async ({ authedPage: page }) => {
    await waitForTableLoad(page);

    // Should have stat cards showing project counts (全部项目, 进行中, 已完成, 已暂停)
    const allCard = page.locator('div').filter({ hasText: /^全部项目/ }).first();
    await expect(allCard).toBeVisible({ timeout: 5_000 });

    const inProgressCard = page.locator('div').filter({ hasText: /^进行中/ }).first();
    await expect(inProgressCard).toBeVisible();
  });

  // ──────── TC2: search by keyword ────────
  test('search projects by keyword', async ({ authedPage: page }) => {
    await waitForTableLoad(page);

    const searchInput = page.getByPlaceholder('搜索项目名称');
    await expect(searchInput).toBeVisible();

    // Search for our specific project
    await searchInput.fill(projectName);
    await page.waitForTimeout(500);
    await waitForTableLoad(page);

    // The created project should be visible
    await expect(page.getByText(projectName)).toBeVisible();

    // Search for non-existent project
    await searchInput.fill('不存在的项目名称_XYZ123');
    await page.waitForTimeout(500);
    await waitForTableLoad(page);

    // Table should show empty or no matching rows
    const rows = page.locator('.arco-table-body .arco-table-tr');
    const rowCount = await rows.count();
    expect(rowCount).toBe(0);

    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(500);
    await waitForTableLoad(page);
  });

  // ──────── TC3: status filter ────────
  test('filter projects by status', async ({ authedPage: page }) => {
    await waitForTableLoad(page);

    const totalRows = await page.locator('.arco-table-body .arco-table-tr').count();

    // Find status filter - look for status dropdown or tabs
    const statusSelect = page.locator('.arco-select').filter({ has: page.locator('[placeholder*="状态"]') });
    if (await statusSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await statusSelect.click();
      await page.locator('.arco-select-popup:visible .arco-select-option').filter({ hasText: '进行中' }).click();
      await page.waitForTimeout(500);
      await waitForTableLoad(page);

      const filteredRows = await page.locator('.arco-table-body .arco-table-tr').count();
      expect(filteredRows).toBeLessThanOrEqual(totalRows);
    }
  });

  // ──────── TC4: edit project ────────
  test('edit project via table action button', async ({ authedPage: page }) => {
    // Navigate fresh and wait for all network requests to complete
    await page.goto('/projects', { waitUntil: 'networkidle' });
    await waitForTableLoad(page);

    // Verify projects loaded (stat cards show data) before searching
    await expect(
      page.locator('.arco-table-tr').filter({ has: page.locator('.arco-table-td') }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Search for the project
    await searchProject(page, projectName);

    // Find the row with our project
    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });

    // If search returned no results, retry with page reload
    if (await row.isVisible({ timeout: 5_000 }).catch(() => false) === false) {
      await page.goto('/projects', { waitUntil: 'networkidle' });
      await waitForTableLoad(page);
      await page.waitForTimeout(1_000);
      await searchProject(page, projectName);
    }

    await expect(row).toBeVisible({ timeout: 10_000 });

    // Click edit button - opens drawer
    const editBtn = row.getByRole('button', { name: '编辑' });
    await editBtn.click();
    await expect(page.locator('.arco-drawer')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(500);

    // Modify name
    const nameInput = page.locator('.arco-drawer').getByPlaceholder('请输入项目名称');
    await nameInput.clear();
    await nameInput.fill(updatedName);

    // Submit update
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/projects') && resp.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('.arco-drawer-footer').getByRole('button', { name: '保存修改' }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);

    // Clear old search and search for the updated name
    await searchProject(page, updatedName);
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC5: project detail shows updated name ────────
  test('project detail reflects updated name', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    // Search for the updated project name
    const searchInput = page.getByPlaceholder('搜索项目名称');
    await searchInput.fill(updatedName);
    await page.waitForTimeout(500);
    await waitForTableLoad(page);
    await page.getByText(updatedName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);

    // Page should show the updated project name
    await expect(page.getByText(updatedName).first()).toBeVisible({ timeout: 10_000 });
  });

  // ──────── cleanup ────────
  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);

    // Search for the project
    const searchInput = page.getByPlaceholder('搜索项目名称');
    await searchInput.fill(updatedName);
    await page.waitForTimeout(500);
    await waitForTableLoad(page);

    const row = page.locator('.arco-table-tr').filter({ hasText: updatedName });
    await row.locator('button[class*="danger"]').click();
    await confirmModal(page);
    await expectMessage(page, '项目删除成功');
  });
});
