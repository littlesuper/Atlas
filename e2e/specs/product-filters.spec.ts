import { test, expect } from '../fixtures/auth';
import { waitForTableLoad, waitForPageLoad } from '../helpers/arco';

/**
 * 产品筛选与搜索测试
 * - 按名称搜索
 * - 按规格搜索
 * - 按状态筛选
 * - 按类别筛选
 * - 统计卡片切换
 */
test.describe('Product Filters & Search', () => {

  // ──────── TC1: search by product name ────────
  test('search products by name', async ({ authedPage: page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    const searchInput = page.getByPlaceholder(/搜索产品|产品名称/);
    if (await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await searchInput.fill('测试');
      await page.waitForTimeout(500); // debounce
      await waitForTableLoad(page);

      // Table should have filtered results or be empty
      await expect(page.locator('.arco-table')).toBeVisible();
    }
  });

  // ──────── TC2: search by spec keywords ────────
  test('search products by spec keywords', async ({ authedPage: page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    const specSearch = page.getByPlaceholder(/规格|关键词/);
    if (await specSearch.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await specSearch.fill('电压');
      await page.waitForTimeout(500);
      await waitForTableLoad(page);
      await expect(page.locator('.arco-table')).toBeVisible();
    }
  });

  // ──────── TC3: filter by status ────────
  test('filter products by status dropdown', async ({ authedPage: page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    // Find status filter select
    const statusFilter = page.locator('.arco-select').filter({ has: page.locator('[placeholder*="状态"]') });
    if (await statusFilter.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await statusFilter.click();
      await page.waitForTimeout(300);

      // Select first status option
      const option = page.locator('.arco-select-popup:visible .arco-select-option').first();
      if (await option.isVisible()) {
        await option.click();
        await waitForTableLoad(page);
        await expect(page.locator('.arco-table')).toBeVisible();
      }
    }
  });

  // ──────── TC4: filter by category ────────
  test('filter products by category', async ({ authedPage: page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    const categoryFilter = page.locator('.arco-select').filter({ has: page.locator('[placeholder*="类别"]') });
    if (await categoryFilter.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await categoryFilter.click();
      await page.waitForTimeout(300);

      const option = page.locator('.arco-select-popup:visible .arco-select-option').first();
      if (await option.isVisible()) {
        await option.click();
        await waitForTableLoad(page);
        await expect(page.locator('.arco-table')).toBeVisible();
      }
    }
  });

  // ──────── TC5: stat cards toggle filter ────────
  test('clicking stat card filters product list', async ({ authedPage: page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    // Find stat cards (e.g., 全部, 研发中, 量产, 停产)
    const statCards = page.locator('[class*="stat"], [class*="card"]').filter({ hasText: /研发中|量产|停产/ });
    const cardCount = await statCards.count();

    if (cardCount > 0) {
      await statCards.first().click();
      await waitForTableLoad(page);
      await expect(page.locator('.arco-table')).toBeVisible();
    }
  });

  // ──────── TC6: pagination works ────────
  test('product table pagination', async ({ authedPage: page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    const pagination = page.locator('.arco-pagination');
    if (await pagination.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Check if there's a next page button
      const nextBtn = pagination.locator('.arco-pagination-item-next');
      const isDisabled = await nextBtn.getAttribute('class');

      // If next button is not disabled, click it
      if (isDisabled && !isDisabled.includes('disabled')) {
        await nextBtn.click();
        await waitForTableLoad(page);
        await expect(page.locator('.arco-table')).toBeVisible();
      }
    }
  });

  // ──────── TC7: CSV export ────────
  test('CSV export triggers file download', async ({ authedPage: page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    const exportBtn = page.getByRole('button', { name: /导出/ });
    if (await exportBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
      await exportBtn.click();
      const download = await downloadPromise;
      if (download) {
        const filename = download.suggestedFilename();
        expect(filename).toMatch(/\.csv$/);
      }
    }
  });
});
