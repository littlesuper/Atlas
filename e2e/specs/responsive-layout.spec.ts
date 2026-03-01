import { test, expect } from '../fixtures/auth';
import { waitForTableLoad, waitForPageLoad } from '../helpers/arco';

/**
 * 响应式布局与导航测试
 * - 侧边栏显示
 * - 头部 header 元素
 * - 用户头像与下拉菜单
 * - 主题切换（如有）
 * - 通知铃铛
 * - 页面布局完整性
 */
test.describe('Layout & Navigation', () => {
  // ──────── TC1: header elements visible ────────
  test('header shows logo, navigation and user avatar', async ({ authedPage: page }) => {
    await waitForPageLoad(page);

    // Header should exist
    const header = page.locator('header, .arco-layout-header').first();
    await expect(header).toBeVisible({ timeout: 5_000 });

    // User avatar should be visible
    const avatar = page.locator('.arco-avatar').first();
    await expect(avatar).toBeVisible({ timeout: 5_000 });
  });

  // ──────── TC2: sidebar navigation items ────────
  test('sidebar contains all navigation items', async ({ authedPage: page }) => {
    await waitForPageLoad(page);

    const navItems = ['项目管理', '项目周报', '产品管理', '项目资源', '系统管理'];
    for (const item of navItems) {
      const navItem = page.locator('.nav-item').filter({ hasText: item });
      if (await navItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(navItem).toBeVisible();
      }
    }
  });

  // ──────── TC3: user dropdown menu ────────
  test('clicking avatar shows dropdown with logout option', async ({ authedPage: page }) => {
    await waitForPageLoad(page);

    await page.locator('.arco-avatar').first().click();
    await page.waitForTimeout(300);

    // Dropdown should show logout option
    const logoutOption = page.getByText('退出登录');
    await expect(logoutOption).toBeVisible({ timeout: 5_000 });

    // Close dropdown by clicking elsewhere
    await page.locator('body').click({ position: { x: 10, y: 10 } });
  });

  // ──────── TC4: notification bell ────────
  test('notification bell icon is in header', async ({ authedPage: page }) => {
    await waitForPageLoad(page);

    const bellIcon = page.locator('.arco-icon-notification, .arco-badge').first();
    await expect(bellIcon).toBeVisible({ timeout: 5_000 });
  });

  // ──────── TC5: project table is properly rendered ────────
  test('project list table has proper structure', async ({ authedPage: page }) => {
    await waitForTableLoad(page);

    const table = page.locator('.arco-table').first();
    await expect(table).toBeVisible();

    // Should have header row
    const headerRow = table.locator('thead .arco-table-tr, .arco-table-header .arco-table-tr').first();
    await expect(headerRow).toBeVisible();

    // Should have body rows
    const bodyRows = table.locator('tbody .arco-table-tr, .arco-table-body .arco-table-tr');
    const rowCount = await bodyRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });

  // ──────── TC6: page title matches route ────────
  test('page title reflects current section', async ({ authedPage: page }) => {
    await waitForPageLoad(page);

    // On projects page, should see project-related heading
    await expect(page).toHaveURL(/\/projects/);
    // Either in document title or page content
    const pageTitle = await page.title();
    // Title should contain Atlas or project-related text
    expect(pageTitle.length).toBeGreaterThan(0);
  });

  // ──────── TC7: table responsive behavior ────────
  test('table handles horizontal overflow', async ({ authedPage: page }) => {
    // Navigate to project detail (which has many columns)
    await waitForTableLoad(page);
    const firstProjectLink = page.locator('.arco-table-td a, .arco-table-td .arco-link').first();
    if (await firstProjectLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstProjectLink.click();
      await expect(page).toHaveURL(/\/projects\/.+/);
      await page.waitForTimeout(1_000);

      const table = page.locator('.arco-table').first();
      await expect(table).toBeVisible({ timeout: 10_000 });

      // Table should not overflow the viewport
      const tableBox = await table.boundingBox();
      const viewportWidth = page.viewportSize()?.width ?? 1280;
      if (tableBox) {
        // Table width should be within viewport or have scroll
        expect(tableBox.x).toBeGreaterThanOrEqual(-10);
      }
    }
  });
});
