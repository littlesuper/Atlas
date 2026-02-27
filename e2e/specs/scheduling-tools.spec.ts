import { test, expect } from '../fixtures/auth';
import { waitForTableLoad, clickTab } from '../helpers/arco';

/**
 * 排期工具功能测试
 * - 资源冲突检测（所有项目 / 仅当前项目 切换）
 * - What-If 模拟延期 / 提前方向切换
 * - 一键重排功能已移除
 */
test.describe('Scheduling Tools', () => {
  async function goToSchedulingTab(page: import('@playwright/test').Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);
    // Click the first project
    const firstProjectLink = page.locator('.arco-table-td a, .arco-table-td .arco-link').first();
    await firstProjectLink.waitFor({ state: 'visible', timeout: 10_000 });
    await firstProjectLink.click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);
    // Switch to scheduling tools tab
    await clickTab(page, '排期工具');
    await page.waitForTimeout(500);
  }

  test('resource conflict detection shows scope toggle', async ({ authedPage: page }) => {
    await goToSchedulingTab(page);

    // Verify scope toggle buttons exist
    const allProjectsBtn = page.locator('.arco-radio-group .arco-radio').filter({ hasText: '所有项目' });
    const currentProjectBtn = page.locator('.arco-radio-group .arco-radio').filter({ hasText: '仅当前项目' });

    await expect(allProjectsBtn).toBeVisible();
    await expect(currentProjectBtn).toBeVisible();
  });

  test('resource conflict detection: run with "所有项目" scope', async ({ authedPage: page }) => {
    await goToSchedulingTab(page);

    // Default should be "所有项目"
    const allProjectsRadio = page.locator('.arco-radio-group .arco-radio').filter({ hasText: '所有项目' });
    await expect(allProjectsRadio).toHaveClass(/arco-radio-checked/);

    // Click detect button
    const detectBtn = page.getByRole('button', { name: '开始检测' });
    await detectBtn.click();

    // Wait for results — either success alert or conflict table
    const result = page.locator('.arco-alert');
    await expect(result).toBeVisible({ timeout: 10_000 });
  });

  test('resource conflict detection: switch to "仅当前项目" scope', async ({ authedPage: page }) => {
    await goToSchedulingTab(page);

    // Switch scope
    const currentProjectBtn = page.locator('.arco-radio-group .arco-radio').filter({ hasText: '仅当前项目' });
    await currentProjectBtn.click();
    await page.waitForTimeout(200);

    // Click detect button
    const detectBtn = page.getByRole('button', { name: '开始检测' });
    await detectBtn.click();

    const result = page.locator('.arco-alert');
    await expect(result).toBeVisible({ timeout: 10_000 });
  });

  test('what-if simulation: delay/advance toggle exists', async ({ authedPage: page }) => {
    await goToSchedulingTab(page);

    // Find the What-If card
    const whatIfCard = page.locator('.arco-card').filter({ hasText: 'What-If 模拟' });
    await expect(whatIfCard).toBeVisible();

    // Verify delay/advance radio buttons
    const delayRadio = whatIfCard.locator('.arco-radio').filter({ hasText: '延期' });
    const advanceRadio = whatIfCard.locator('.arco-radio').filter({ hasText: '提前' });

    await expect(delayRadio).toBeVisible();
    await expect(advanceRadio).toBeVisible();
  });

  test('one-click reschedule card is removed', async ({ authedPage: page }) => {
    await goToSchedulingTab(page);

    // "一键重排" card should NOT be visible
    const rescheduleCard = page.locator('.arco-card').filter({ hasText: '一键重排' });
    await expect(rescheduleCard).not.toBeVisible();
  });
});
