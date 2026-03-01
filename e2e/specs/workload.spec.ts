import { test, expect } from '../fixtures/auth';
import { clickNavItem, waitForPageLoad } from '../helpers/arco';

test.describe.serial('Workload Analysis', () => {
  test('navigate to workload page', async ({ authedPage: page }) => {
    // Click the "项目资源" nav item in the header
    await clickNavItem(page, '项目资源');
    await waitForPageLoad(page);

    // Page title should be visible
    await expect(page.getByText('项目资源').first()).toBeVisible({ timeout: 10_000 });
  });

  test('project filter is present', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目资源');
    await waitForPageLoad(page);

    // The filter select with placeholder "筛选项目" should be visible
    const projectFilter = page.getByPlaceholder('筛选项目');
    await expect(projectFilter).toBeVisible({ timeout: 5_000 });
  });

  test('workload page displays stat cards and member load section', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目资源');
    await waitForPageLoad(page);
    await page.waitForTimeout(1_000);

    // Verify stat card labels are visible (bar chart UI, not table)
    await expect(page.getByText('逾期任务').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('无人负责').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('超载人员').first()).toBeVisible({ timeout: 5_000 });

    // Verify the "人员负载" section title is visible
    await expect(page.getByText('人员负载').first()).toBeVisible({ timeout: 5_000 });
  });
});
