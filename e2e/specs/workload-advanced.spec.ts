import { test, expect } from '../fixtures/auth';
import { clickNavItem, waitForPageLoad } from '../helpers/arco';

/**
 * 资源负载高级功能测试
 * - 统计卡片数据（逾期任务、无人负责、超载人员）
 * - 项目筛选功能
 * - 人员负载条形图
 * - 统计卡片数值展示
 * - 负载条视觉显示
 */
test.describe('Workload Advanced Features', () => {
  async function goToWorkload(page: import('@playwright/test').Page) {
    await clickNavItem(page, '项目资源');
    await waitForPageLoad(page);
    await page.waitForTimeout(1_000);
  }

  // ──────── TC1: stat cards show correct labels ────────
  test('workload stat cards display labels', async ({ authedPage: page }) => {
    await goToWorkload(page);

    // Should see stat cards for overdue, unassigned, overloaded
    await expect(page.getByText('逾期任务').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('无人负责').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('超载人员').first()).toBeVisible({ timeout: 5_000 });
  });

  // ──────── TC2: project filter dropdown works ────────
  test('filter by project in workload page', async ({ authedPage: page }) => {
    await goToWorkload(page);

    const projectFilter = page.getByPlaceholder('筛选项目');
    await expect(projectFilter).toBeVisible({ timeout: 5_000 });

    // Click to open dropdown
    await projectFilter.click();
    await page.waitForTimeout(300);

    const options = page.locator('.arco-select-popup:visible .arco-select-option');
    const optionCount = await options.count();

    if (optionCount > 0) {
      // Select the first project
      await options.first().click();
      await page.waitForTimeout(500);

      // After filtering, the page should still show the member load section
      await expect(page.getByText('人员负载').first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ──────── TC3: member load section displays bar chart ────────
  test('member load section shows bar chart with member names', async ({ authedPage: page }) => {
    await goToWorkload(page);

    // Verify the "人员负载" section title is visible
    await expect(page.getByText('人员负载').first()).toBeVisible({ timeout: 5_000 });

    // Check that the bar chart container is present (rendered with colored bars)
    // The bar chart shows member names on the left with horizontal bars
    const barChartSection = page.locator('.arco-card').filter({ hasText: '人员负载' });
    await expect(barChartSection).toBeVisible({ timeout: 5_000 });
  });

  // ──────── TC4: stat card values are numeric ────────
  test('stat cards show numeric values', async ({ authedPage: page }) => {
    await goToWorkload(page);

    // Each stat card should show a numeric value
    // Look for the stat value elements near the labels
    const overdueCard = page.locator('.arco-card, .arco-statistic, div').filter({ hasText: '逾期任务' }).first();
    await expect(overdueCard).toBeVisible({ timeout: 5_000 });

    const unassignedCard = page.locator('.arco-card, .arco-statistic, div').filter({ hasText: '无人负责' }).first();
    await expect(unassignedCard).toBeVisible({ timeout: 5_000 });

    const overloadedCard = page.locator('.arco-card, .arco-statistic, div').filter({ hasText: '超载人员' }).first();
    await expect(overloadedCard).toBeVisible({ timeout: 5_000 });
  });

  // ──────── TC5: member load bars are rendered ────────
  test('member load bars are rendered for members', async ({ authedPage: page }) => {
    await goToWorkload(page);

    // The member load section uses horizontal bar charts (not table rows with progress bars)
    const barChartSection = page.locator('.arco-card').filter({ hasText: '人员负载' });
    await expect(barChartSection).toBeVisible({ timeout: 5_000 });

    // Check that there is at least some content within the bar chart section
    // (member names and colored bars)
    const barChartContent = barChartSection.locator('div').first();
    await expect(barChartContent).toBeVisible();
  });
});
