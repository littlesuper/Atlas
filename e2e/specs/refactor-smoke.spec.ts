/**
 * Smoke test: verify the Detail page refactoring didn't break core functionality
 */
import { test, expect } from '@playwright/test';

/** Navigate from project list to first project's detail page */
async function navigateToFirstProject(page: any) {
  await page.goto('/projects');
  // Wait for project list table to render (no scroll.y → no .arco-table-body wrapper)
  await page.waitForSelector('.arco-table-container table tbody tr', { timeout: 15000 });

  // Click first project name link
  const firstProjectLink = page.locator('.arco-table-container table tbody tr a').first();
  await expect(firstProjectLink).toBeVisible({ timeout: 5000 });
  await firstProjectLink.click();

  // Should navigate to project detail
  await page.waitForURL('**/projects/**', { timeout: 10000 });
}

test.describe('Detail page refactor smoke test', () => {
  test('should load project list and navigate to detail', async ({ page }) => {
    await navigateToFirstProject(page);

    // Verify key tab sections are rendered (use tab role to avoid matching activity tags)
    await expect(page.locator('div[role="tab"]:has-text("活动列表")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('div[role="tab"]:has-text("里程碑")')).toBeVisible();
    await expect(page.locator('div[role="tab"]:has-text("甘特图")')).toBeVisible();
    // Verify stats cards
    await expect(page.getByText('整体进度')).toBeVisible();
    await expect(page.getByText('活动数量')).toBeVisible();
  });

  test('should display activity table with correct columns', async ({ page }) => {
    await navigateToFirstProject(page);

    // Wait for activity table to load (compact-table has scroll.y → .arco-table-body exists)
    await page.waitForSelector('.compact-table .arco-table', { timeout: 15000 });

    // Check key column headers exist
    const headers = page.locator('.compact-table .arco-table thead th');
    const headerTexts = await headers.allTextContents();
    const joinedHeaders = headerTexts.join(' ');

    expect(joinedHeaders).toContain('ID');
    expect(joinedHeaders).toContain('活动名称');
    expect(joinedHeaders).toContain('状态');
    expect(joinedHeaders).toContain('操作');
  });

  test('should open activity drawer when clicking edit icon', async ({ page }) => {
    await navigateToFirstProject(page);

    // Wait for activity table rows
    await page.waitForSelector('.compact-table .arco-table tbody tr', { timeout: 15000 });

    // Find and click edit icon on first activity row
    const editIcon = page.locator('.compact-table .arco-table tbody tr').first().locator('[class*="icon-edit"]').first();
    if (await editIcon.isVisible()) {
      await editIcon.click();

      // Verify drawer opens with title
      await expect(page.getByText('编辑活动')).toBeVisible({ timeout: 5000 });

      // Verify drawer has the form fields (scope to form to avoid table header ambiguity)
      const drawerForm = page.locator('form');
      await expect(drawerForm.getByText('前置依赖', { exact: true })).toBeVisible();
      await expect(drawerForm.getByText('计划开始')).toBeVisible();
    }
  });

  test('should show undo button and activity dropdown', async ({ page }) => {
    await navigateToFirstProject(page);

    // Wait for activity tab
    await page.waitForSelector('.compact-table', { timeout: 15000 });

    // Undo button should exist (disabled when no undo stack)
    const undoBtn = page.locator('button .arco-icon-undo').first();
    await expect(undoBtn).toBeVisible();

    // Activity dropdown menu button should exist
    await expect(page.locator('button:has-text("活动")')).toBeVisible();
  });

  test('should switch tabs correctly', async ({ page }) => {
    await navigateToFirstProject(page);

    // Click milestones tab
    await page.click('div[role="tab"]:has-text("里程碑")');
    await page.waitForTimeout(500);

    // Click Gantt tab
    await page.click('div[role="tab"]:has-text("甘特图")');
    await page.waitForTimeout(500);

    // Click back to activities
    await page.click('div[role="tab"]:has-text("活动列表")');
    await page.waitForTimeout(500);

    // Table should still be visible
    await expect(page.locator('.compact-table')).toBeVisible();
  });
});
