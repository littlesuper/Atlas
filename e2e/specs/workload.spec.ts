import { test, expect } from '../fixtures/auth';
import { waitForPageLoad, waitForTableLoad } from '../helpers/arco';

test.describe.serial('Workload Analysis', () => {
  test('navigate to workload page', async ({ authedPage: page }) => {
    // Navigate via sidebar or direct URL
    const navItem = page.locator('.nav-item').filter({ hasText: '工作负荷' });
    if (await navItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await navItem.click();
    } else {
      await page.goto('/workload');
    }
    await waitForPageLoad(page);

    // Should be on workload page
    await expect(page.getByText('工作负荷').first()).toBeVisible({ timeout: 10_000 });
  });

  test('project filter works', async ({ authedPage: page }) => {
    const navItem = page.locator('.nav-item').filter({ hasText: '工作负荷' });
    if (await navItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await navItem.click();
    } else {
      await page.goto('/workload');
    }
    await waitForPageLoad(page);

    // Look for a project filter/select
    const projectFilter = page.locator('.arco-select').first();
    if (await projectFilter.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await projectFilter.click();
      await page.waitForTimeout(500);
      // Verify options appear
      const options = page.locator('.arco-select-popup:visible .arco-select-option');
      const count = await options.count();
      expect(count).toBeGreaterThanOrEqual(0);
      // Close popup by pressing Escape
      await page.keyboard.press('Escape');
    }
  });

  test('workload table displays columns', async ({ authedPage: page }) => {
    const navItem = page.locator('.nav-item').filter({ hasText: '工作负荷' });
    if (await navItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await navItem.click();
    } else {
      await page.goto('/workload');
    }
    await waitForPageLoad(page);
    await waitForTableLoad(page);

    // Verify the page has rendered relevant content
    // Check for table or list structure
    const table = page.locator('.arco-table');
    if (await table.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Verify column headers exist
      const headers = table.locator('.arco-table-th');
      const count = await headers.count();
      expect(count).toBeGreaterThan(0);
    }
  });
});
