import { test, expect } from '../fixtures/auth';
import { waitForPageLoad, waitForTableLoad } from '../helpers/arco';

test.describe.serial('Workload Analysis', () => {
  test('navigate to workload page', async ({ authedPage: page }) => {
    // Click the "资源负载" nav item in the header
    await page.getByText('资源负载').first().click();
    await waitForPageLoad(page);

    // Page title should be visible
    await expect(page.getByText('资源负载').first()).toBeVisible({ timeout: 10_000 });
  });

  test('project filter is present', async ({ authedPage: page }) => {
    await page.getByText('资源负载').first().click();
    await waitForPageLoad(page);

    // The filter select with placeholder "筛选项目" should be visible
    const projectFilter = page.getByPlaceholder('筛选项目');
    await expect(projectFilter).toBeVisible({ timeout: 5_000 });
  });

  test('workload table displays expected columns', async ({ authedPage: page }) => {
    await page.getByText('资源负载').first().click();
    await waitForPageLoad(page);
    await waitForTableLoad(page);

    // Verify column headers
    const table = page.locator('.arco-table');
    await expect(table).toBeVisible({ timeout: 5_000 });
    await expect(table.getByText('姓名')).toBeVisible();
    await expect(table.getByText('活动总数')).toBeVisible();
    await expect(table.getByText('进行中')).toBeVisible();
    await expect(table.getByText('逾期')).toBeVisible();
    await expect(table.getByText('总工期')).toBeVisible();
  });
});
