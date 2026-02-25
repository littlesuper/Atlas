import { test, expect } from '../fixtures/auth';
import { clickNavItem, waitForTableLoad } from '../helpers/arco';

test.describe.serial('Weekly Reports', () => {
  test('view weekly reports summary page', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目周报');
    await expect(page).toHaveURL(/\/weekly-reports/);

    // Should see the summary heading
    await expect(page.getByText('项目周报汇总')).toBeVisible();
    await waitForTableLoad(page);
    await expect(page.locator('.arco-table')).toBeVisible();
  });

  test('navigate to project detail weekly reports tab', async ({ authedPage: page }) => {
    // First go to projects
    await clickNavItem(page, '项目管理');
    await waitForTableLoad(page);

    // Click first project in the table
    const firstProjectLink = page.locator('.arco-table-td a').first();
    if (await firstProjectLink.isVisible()) {
      const projectName = await firstProjectLink.textContent();
      await firstProjectLink.click();
      await expect(page).toHaveURL(/\/projects\/.+/);

      // Click the weekly reports tab inside project detail
      const weeklyTab = page.locator('.arco-tabs-tab').filter({ hasText: '项目周报' });
      if (await weeklyTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await weeklyTab.click();
        // Should see the weekly reports area (either cards or empty state)
        await expect(
          page.getByText('份周报').or(page.getByText('暂无周报')),
        ).toBeVisible({ timeout: 10_000 });
      }
    }
  });
});
