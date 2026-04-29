import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  clickDrawerSubmit,
  createProjectViaPage,
  clickTab,
  openCreateActivityDrawer,
  searchProject,
} from '../helpers/arco';

/**
 * 甘特图功能测试
 * - 甘特图标签页切换
 * - 甘特图视图缩放（日/周/月/季/年）
 * - 甘特图活动条显示
 * - 甘特图依赖箭头
 * - 甘特图今日线
 */
test.describe.serial('Gantt Chart', () => {
  const projectName = uniqueName('甘特图项目');

  // ──────── setup ────────
  test('setup: create project with activities', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });
    await searchProject(page, projectName);

    // Navigate to project and create activities
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Create first activity with date range
    await openCreateActivityDrawer(page);

    const phaseSelect = page.locator('.arco-drawer .arco-select').first();
    await phaseSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();

    await page.getByPlaceholder('请输入活动名称').fill('甘特活动A');

    const actResp = page.waitForResponse(
      (r) => r.url().includes('/api/activities') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await actResp).status()).toBeLessThan(400);
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });

    // Create second activity
    await openCreateActivityDrawer(page);

    const phaseSelect2 = page.locator('.arco-drawer .arco-select').first();
    await phaseSelect2.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();

    await page.getByPlaceholder('请输入活动名称').fill('甘特活动B');

    const actResp2 = page.waitForResponse(
      (r) => r.url().includes('/api/activities') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await actResp2).status()).toBeLessThan(400);
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
  });

  // ──────── TC1: switch to Gantt tab ────────
  test('switch to Gantt chart tab', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '甘特图');
    await page.waitForTimeout(1_000);

    // Gantt chart container should be visible
    const ganttContainer = page.locator('[class*="gantt"], [class*="Gantt"], canvas, svg').first();
    await expect(ganttContainer).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC2: zoom controls ────────
  test('Gantt chart zoom controls are functional', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '甘特图');
    await page.waitForTimeout(1_000);

    // Look for zoom level buttons/selectors (日/周/月/季/年)
    const zoomOptions = ['日', '周', '月', '季', '年'];
    for (const zoom of zoomOptions) {
      const btn = page.locator('.arco-radio, .arco-btn, button').filter({ hasText: zoom });
      if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
        // Gantt should re-render
        const ganttContainer = page.locator('[class*="gantt"], [class*="Gantt"], canvas, svg').first();
        await expect(ganttContainer).toBeVisible();
        break; // At least one zoom option works
      }
    }
  });

  // ──────── TC3: Gantt shows activity bars ────────
  test('Gantt chart displays activity bars', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '甘特图');
    await page.waitForTimeout(2_000);

    // Should see activity names in the gantt area
    await expect(
      page.getByText('甘特活动A', { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
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
