import { test, expect } from '../fixtures/auth';
import { waitForTableLoad } from '../helpers/arco';
import type { Page } from '@playwright/test';

/**
 * 活动列表列宽拖拽调整测试
 * - 可调整列有 resize handle，固定列无 handle
 * - 表头与表体列对齐
 * - 拖拽调整列宽生效
 * - 最小列宽限制 40px
 * - 操作列 fixed:right 定位正确
 * - 刷新后列宽持久化
 * - 恢复默认清除列宽偏好
 */
test.describe('Column Resize', () => {
  /** Navigate to first project detail page and wait for activity table */
  async function goToProjectDetail(page: Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);
    const firstProjectLink = page.locator('.arco-table-td a, .arco-table-td .arco-link').first();
    await firstProjectLink.waitFor({ state: 'visible', timeout: 10_000 });
    await firstProjectLink.click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);
    await waitForTableLoad(page);
  }

  /** Get array of header th info from the compact-table */
  async function getHeaderInfo(page: Page) {
    return page.evaluate(() => {
      const ths = document.querySelectorAll('.compact-table .arco-table-header th');
      return Array.from(ths).map(th => ({
        text: th.textContent?.trim() || '',
        width: Math.round(th.getBoundingClientRect().width),
        left: Math.round(th.getBoundingClientRect().left),
        columnKey: th.getAttribute('data-column-key'),
        hasResizeHandle: !!th.querySelector('.column-resize-handle'),
        isFixedRight: th.classList.contains('arco-table-col-fixed-right'),
        position: getComputedStyle(th).position,
      }));
    });
  }

  /** Get first body row td info */
  async function getFirstRowTdInfo(page: Page) {
    return page.evaluate(() => {
      const row = document.querySelector('.compact-table .arco-table-body tr');
      if (!row) return [];
      const tds = row.querySelectorAll('td');
      return Array.from(tds).map(td => ({
        text: td.textContent?.trim().substring(0, 30) || '',
        width: Math.round(td.getBoundingClientRect().width),
        left: Math.round(td.getBoundingClientRect().left),
        isFixedRight: td.classList.contains('arco-table-col-fixed-right'),
      }));
    });
  }

  // ──────── TC1: resizable columns have resize handles ────────
  test('data columns have resize handles, fixed columns do not', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    const headers = await getHeaderInfo(page);
    expect(headers.length).toBeGreaterThan(0);

    // Data columns with column key should have resize handle
    const dataColumns = headers.filter(h => h.columnKey);
    expect(dataColumns.length).toBeGreaterThan(0);
    for (const col of dataColumns) {
      expect(col.hasResizeHandle).toBe(true);
    }

    // Columns without column key (checkbox, drag, actions) should NOT have resize handle
    const nonDataColumns = headers.filter(h => !h.columnKey);
    expect(nonDataColumns.length).toBeGreaterThan(0);
    for (const col of nonDataColumns) {
      expect(col.hasResizeHandle).toBe(false);
    }
  });

  // ──────── TC2: header and body columns are aligned ────────
  test('header and body columns are properly aligned', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    const headers = await getHeaderInfo(page);
    const bodyTds = await getFirstRowTdInfo(page);
    expect(headers.length).toBe(bodyTds.length);

    for (let i = 0; i < headers.length; i++) {
      const thWidth = headers[i].width;
      const tdWidth = bodyTds[i].width;
      // Widths should match within 2px tolerance
      expect(Math.abs(thWidth - tdWidth)).toBeLessThanOrEqual(2);
      // Left positions should match
      const thLeft = headers[i].left;
      const tdLeft = bodyTds[i].left;
      expect(Math.abs(thLeft - tdLeft)).toBeLessThanOrEqual(2);
    }
  });

  // ──────── TC3: fixed-right actions column retains sticky positioning ────────
  test('actions column has sticky position and is aligned between header and body', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    const headers = await getHeaderInfo(page);
    const bodyTds = await getFirstRowTdInfo(page);

    // Find fixed-right column in header
    const fixedTh = headers.find(h => h.isFixedRight);
    expect(fixedTh).toBeTruthy();
    expect(fixedTh!.text).toBe('操作');
    expect(fixedTh!.position).toBe('sticky');
    expect(fixedTh!.hasResizeHandle).toBe(false);

    // Find fixed-right column in body
    const fixedTd = bodyTds.find(t => t.isFixedRight);
    expect(fixedTd).toBeTruthy();

    // Both should have the same left position
    expect(Math.abs(fixedTh!.left - fixedTd!.left)).toBeLessThanOrEqual(2);
  });

  // ──────── TC4: drag to resize a column changes its width ────────
  test('dragging resize handle changes column width', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    // Find the "活动名称" header with column key "name"
    const nameTh = page.locator('.compact-table .arco-table-header th[data-column-key="name"]');
    await expect(nameTh).toBeVisible();
    const resizeHandle = nameTh.locator('.column-resize-handle');
    await expect(resizeHandle).toBeAttached();

    // Get initial width
    const initialWidth = await nameTh.evaluate(el => Math.round(el.getBoundingClientRect().width));

    // Get handle bounding box for drag start
    const thBox = await nameTh.boundingBox();
    expect(thBox).toBeTruthy();

    // Drag from right edge of the th to extend by 80px
    const startX = thBox!.x + thBox!.width - 3; // right edge near the handle
    const startY = thBox!.y + thBox!.height / 2;
    const deltaX = 80;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Move in steps for smooth drag
    for (let i = 1; i <= 4; i++) {
      await page.mouse.move(startX + (deltaX * i) / 4, startY);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Width should have increased
    const newWidth = await nameTh.evaluate(el => Math.round(el.getBoundingClientRect().width));
    expect(newWidth).toBeGreaterThan(initialWidth);
    expect(newWidth).toBeCloseTo(initialWidth + deltaX, -1); // ~80px larger, 10px tolerance
  });

  // ──────── TC5: minimum width is enforced (40px) ────────
  test('column cannot be resized below minimum width', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    // Use the "ID" column (smallest default width = 60px)
    const idTh = page.locator('.compact-table .arco-table-header th[data-column-key="id"]');
    await expect(idTh).toBeVisible();

    const thBox = await idTh.boundingBox();
    expect(thBox).toBeTruthy();

    // Drag left by a large amount to try to shrink below min
    const startX = thBox!.x + thBox!.width - 3;
    const startY = thBox!.y + thBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Drag left 200px — should be clamped to min 40px
    await page.mouse.move(startX - 200, startY);
    await page.mouse.up();
    await page.waitForTimeout(300);

    const finalWidth = await idTh.evaluate(el => Math.round(el.getBoundingClientRect().width));
    expect(finalWidth).toBeGreaterThanOrEqual(40);
  });

  // ──────── TC6: resized width persists after page reload ────────
  test('resized column width persists after page reload', async ({ authedPage: page }) => {
    await goToProjectDetail(page);
    const currentUrl = page.url();

    // Resize "状态" column by +60px
    const statusTh = page.locator('.compact-table .arco-table-header th[data-column-key="status"]');
    await expect(statusTh).toBeVisible();
    const initialWidth = await statusTh.evaluate(el => Math.round(el.getBoundingClientRect().width));

    const thBox = await statusTh.boundingBox();
    expect(thBox).toBeTruthy();

    const startX = thBox!.x + thBox!.width - 3;
    const startY = thBox!.y + thBox!.height / 2;
    const deltaX = 60;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 1; i <= 4; i++) {
      await page.mouse.move(startX + (deltaX * i) / 4, startY);
    }
    await page.mouse.up();

    // Wait for debounced save (500ms) + API roundtrip
    await page.waitForTimeout(1500);

    const widthAfterResize = await statusTh.evaluate(el => Math.round(el.getBoundingClientRect().width));
    expect(widthAfterResize).toBeGreaterThan(initialWidth);

    // Reload page and navigate back
    await page.goto(currentUrl);
    await page.waitForTimeout(2000);
    await waitForTableLoad(page);

    const statusThAfter = page.locator('.compact-table .arco-table-header th[data-column-key="status"]');
    await expect(statusThAfter).toBeVisible({ timeout: 10_000 });
    const widthAfterReload = await statusThAfter.evaluate(el => Math.round(el.getBoundingClientRect().width));

    // Should still be the resized width (within small tolerance)
    expect(Math.abs(widthAfterReload - widthAfterResize)).toBeLessThanOrEqual(5);
  });

  // ──────── TC7: "恢复默认" resets column widths ────────
  test('reset to default clears custom column widths', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    // First resize "类型" column to make it wider
    const typeTh = page.locator('.compact-table .arco-table-header th[data-column-key="type"]');
    await expect(typeTh).toBeVisible();

    // Get default width
    const defaultTypeMap: Record<string, number> = {
      type: 80, status: 100, name: 240,
    };
    const defaultWidth = defaultTypeMap.type;

    const thBox = await typeTh.boundingBox();
    expect(thBox).toBeTruthy();

    const startX = thBox!.x + thBox!.width - 3;
    const startY = thBox!.y + thBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 60, startY);
    await page.mouse.up();
    await page.waitForTimeout(1500);

    const widthAfterResize = await typeTh.evaluate(el => Math.round(el.getBoundingClientRect().width));
    expect(widthAfterResize).toBeGreaterThan(defaultWidth);

    // Open column settings and click "恢复默认"
    const settingsBtn = page.locator('button').filter({ has: page.locator('svg.arco-icon-more-vertical') });
    await settingsBtn.click();
    await page.waitForTimeout(300);

    const popover = page.locator('.arco-popover-content');
    await expect(popover).toBeVisible({ timeout: 5_000 });
    await popover.getByText('恢复默认').click();
    await page.waitForTimeout(1500);

    // Close popover
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(500);

    // Width should be back to default
    const widthAfterReset = await typeTh.evaluate(el => Math.round(el.getBoundingClientRect().width));
    expect(Math.abs(widthAfterReset - defaultWidth)).toBeLessThanOrEqual(5);
  });

  // ──────── TC8: cursor changes to col-resize on hover ────────
  test('resize handle shows col-resize cursor on hover', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    const nameTh = page.locator('.compact-table .arco-table-header th[data-column-key="name"]');
    await expect(nameTh).toBeVisible();
    const handle = nameTh.locator('.column-resize-handle');
    await expect(handle).toBeAttached();

    // Check cursor style on the handle element
    const cursor = await handle.evaluate(el => getComputedStyle(el).cursor);
    expect(cursor).toBe('col-resize');
  });

  // ──────── TC9: body cursor resets after drag finishes ────────
  test('body cursor and user-select reset after drag', async ({ authedPage: page }) => {
    await goToProjectDetail(page);

    const nameTh = page.locator('.compact-table .arco-table-header th[data-column-key="name"]');
    const thBox = await nameTh.boundingBox();
    expect(thBox).toBeTruthy();

    const startX = thBox!.x + thBox!.width - 3;
    const startY = thBox!.y + thBox!.height / 2;

    // Start drag
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 30, startY);

    // During drag: body should have col-resize cursor
    const cursorDuring = await page.evaluate(() => document.body.style.cursor);
    expect(cursorDuring).toBe('col-resize');

    // Release
    await page.mouse.up();
    await page.waitForTimeout(100);

    // After drag: body cursor and user-select should be reset
    const cursorAfter = await page.evaluate(() => document.body.style.cursor);
    const userSelectAfter = await page.evaluate(() => document.body.style.userSelect);
    expect(cursorAfter).toBe('');
    expect(userSelectAfter).toBe('');
  });
});
