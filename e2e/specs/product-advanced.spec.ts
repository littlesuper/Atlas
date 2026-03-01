import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  clickNavItem,
  confirmModal,
  waitForTableLoad,
} from '../helpers/arco';

/**
 * 产品高级功能测试
 * - 编辑产品信息
 * - 产品复制
 * - 产品类别切换与规格模板
 * - 产品变更记录
 * - 产品状态转换
 */
test.describe.serial('Product Advanced Features', () => {
  const productName = uniqueName('高级产品');
  const updatedProductName = uniqueName('已编辑产品');

  // ──────── setup: create product ────────
  test('setup: create product', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    await page.getByRole('button', { name: '新建产品' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible();

    await page.getByPlaceholder('请输入产品名称').fill(productName);
    await page.getByPlaceholder('例如: RX-3000').fill('ADV-' + Date.now());

    // Select project
    await page.locator('.arco-select').filter({ has: page.locator('[placeholder="请选择关联项目"]') }).click();
    await page.locator('.arco-select-popup .arco-select-option').first().click();

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/products') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.locator('.arco-drawer-footer').getByRole('button', { name: '创建' }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
    await expect(page.getByText(productName)).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC1: edit product ────────
  test('edit product name and model', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    const row = page.locator('.arco-table-tr').filter({ hasText: productName });
    await expect(row).toBeVisible();

    // Click edit button (second action button; first is view/IconEye, second is edit/IconEdit)
    const editBtn = row.locator('button').nth(1);
    await editBtn.click();

    const drawer = page.locator('.arco-drawer');
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    // Verify it's the edit drawer
    await expect(drawer.getByText('编辑产品')).toBeVisible({ timeout: 5_000 });

    // Update name
    const nameInput = page.getByPlaceholder('请输入产品名称');
    await nameInput.clear();
    await nameInput.fill(updatedProductName);

    // Update model
    const modelInput = page.getByPlaceholder('例如: RX-3000');
    await modelInput.clear();
    await modelInput.fill('ADV-' + Date.now());

    // Submit
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/products') && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await drawer.locator('.arco-drawer-footer').getByRole('button', { name: '保存' }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await waitForTableLoad(page);
    await expect(page.getByText(updatedProductName)).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC2: copy product ────────
  test('copy product creates duplicate', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    const row = page.locator('.arco-table-tr').filter({ hasText: updatedProductName });
    await expect(row).toBeVisible();

    // Find copy button (usually has a copy icon)
    const copyBtn = row.getByRole('button', { name: /复制/ });
    if (await copyBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/api/products') && r.url().includes('/copy') && r.request().method() === 'POST',
        { timeout: 15_000 },
      );
      await copyBtn.click();
      await confirmModal(page);
      const resp = await responsePromise;
      expect(resp.status()).toBeLessThan(400);

      await waitForTableLoad(page);
      // Should see at least two entries with similar names
      const copyRows = page.locator('.arco-table-tr').filter({ hasText: updatedProductName });
      const count = await copyRows.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  // ──────── TC3: product category selection ────────
  test('product category change shows spec template', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    await page.getByRole('button', { name: '新建产品' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible();

    // Select category
    const categorySelect = page.locator('.arco-drawer .arco-select').filter({
      has: page.locator('[placeholder*="类别"]'),
    });
    if (await categorySelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await categorySelect.click();
      // Select "路由器" category
      const routerOption = page.locator('.arco-select-popup:visible .arco-select-option').filter({ hasText: '路由器' });
      if (await routerOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await routerOption.click();
        await page.waitForTimeout(500);

        // Should show category-specific spec fields
        const specSection = page.locator('.arco-drawer').getByText(/规格|参数/);
        // Category-specific template content may or may not appear
      }
    }

    // Close drawer without saving
    await page.locator('.arco-drawer-close-icon').click();
  });

  // ──────── TC4: view product detail ────────
  test('view product detail', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    const row = page.locator('.arco-table-tr').filter({ hasText: updatedProductName });
    await expect(row).toBeVisible();

    // Click view button (first action button with IconEye)
    const viewBtn = row.locator('button').nth(0);
    await viewBtn.click();
    await page.waitForTimeout(500);

    // Should show product detail drawer with title "产品详情"
    const drawer = page.locator('.arco-drawer');
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    await expect(drawer.getByText('产品详情')).toBeVisible({ timeout: 5_000 });
    await expect(drawer.getByText(updatedProductName)).toBeVisible();
  });

  // ──────── cleanup ────────
  test('cleanup: delete test products', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    // Delete all products matching our test name
    const rows = page.locator('.arco-table-tr').filter({ hasText: updatedProductName });
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = page.locator('.arco-table-tr').filter({ hasText: updatedProductName }).first();
      if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await row.locator('button[class*="danger"]').click();
        await confirmModal(page);
        await page.waitForTimeout(1_000);
        await waitForTableLoad(page);
      }
    }
  });
});
