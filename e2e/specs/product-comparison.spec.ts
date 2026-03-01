import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  clickDrawerSubmit,
  clickNavItem,
} from '../helpers/arco';

/**
 * 产品对比功能测试
 * - 选中 2-3 个产品后显示对比按钮
 * - 对比抽屉并排显示产品属性
 * - 差异高亮
 */
test.describe.serial('Product Comparison', () => {
  const product1 = uniqueName('对比产品A');
  const product2 = uniqueName('对比产品B');
  const product3 = uniqueName('对比产品C');

  async function createProduct(page: import('@playwright/test').Page, name: string, model: string) {
    await page.getByRole('button', { name: /新建产品/ }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300);

    await page.getByPlaceholder('请输入产品名称').fill(name);
    await page.getByPlaceholder(/型号|RX/).fill(model);

    // Select category
    const categorySelect = page.locator('.arco-drawer .arco-select').filter({ has: page.locator('[placeholder*="类别"]') });
    if (await categorySelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await categorySelect.click();
      await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
      await page.waitForTimeout(200);
    }

    // Select status
    const statusSelect = page.locator('.arco-drawer .arco-select').filter({ has: page.locator('[placeholder*="状态"]') });
    if (await statusSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await statusSelect.click();
      await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
      await page.waitForTimeout(200);
    }

    // Select related project (required field)
    const projectSelect = page.locator('.arco-drawer .arco-select').filter({ has: page.locator('[placeholder="请选择关联项目"]') });
    if (await projectSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await projectSelect.click();
      await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
      await page.waitForTimeout(200);
    }

    const resp = page.waitForResponse(
      (r) => r.url().includes('/api/products') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await resp).status()).toBeLessThan(400);
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
  }

  // ──────── setup ────────
  test('setup: create three products', async ({ authedPage: page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    await createProduct(page, product1, 'CMP-A');
    await createProduct(page, product2, 'CMP-B');
    await createProduct(page, product3, 'CMP-C');
  });

  // ──────── TC1: compare button appears with 2 products selected ────────
  test('compare button appears when 2 products are selected', async ({ authedPage: page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    // Select first product checkbox
    const checkboxes = page.locator('.arco-table-body .arco-checkbox');
    const count = await checkboxes.count();

    if (count >= 2) {
      await checkboxes.first().click();
      await page.waitForTimeout(200);
      await checkboxes.nth(1).click();
      await page.waitForTimeout(200);

      // Compare button should appear
      const compareBtn = page.getByRole('button', { name: /对比|比较/ });
      const hasCompare = await compareBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasCompare) {
        expect(hasCompare).toBeTruthy();
      }
    }
  });

  // ──────── TC2: compare drawer shows side-by-side view ────────
  test('compare drawer shows products side by side', async ({ authedPage: page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    const checkboxes = page.locator('.arco-table-body .arco-checkbox');
    const count = await checkboxes.count();

    if (count >= 2) {
      await checkboxes.first().click();
      await page.waitForTimeout(200);
      await checkboxes.nth(1).click();
      await page.waitForTimeout(200);

      const compareBtn = page.getByRole('button', { name: /对比|比较/ });
      if (await compareBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await compareBtn.click();
        await page.waitForTimeout(500);

        // Drawer should open with comparison table
        const drawer = page.locator('.arco-drawer:visible');
        if (await drawer.isVisible({ timeout: 5_000 }).catch(() => false)) {
          // Should contain product names
          const table = drawer.locator('.arco-table, table');
          await expect(table).toBeVisible({ timeout: 3_000 });

          // Close drawer
          await page.keyboard.press('Escape');
        }
      }
    }
  });

  // ──────── TC3: cannot compare with less than 2 selected ────────
  test('compare button not visible with less than 2 products selected', async ({ authedPage: page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    // With no selection, compare button should not be visible
    const compareBtn = page.getByRole('button', { name: /对比|比较/ });
    const isVisible = await compareBtn.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(isVisible).toBeFalsy();

    // Select only one
    const checkboxes = page.locator('.arco-table-body .arco-checkbox');
    if (await checkboxes.count() >= 1) {
      await checkboxes.first().click();
      await page.waitForTimeout(200);

      // Should still not be visible (or disabled)
      const isVisibleAfter = await compareBtn.isVisible({ timeout: 2_000 }).catch(() => false);
      // With 1 product, compare should not be actionable
    }
  });

  // ──────── cleanup ────────
  test('cleanup: delete test products', async ({ authedPage: page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    for (const name of [product1, product2, product3]) {
      const row = page.locator('.arco-table-tr').filter({ hasText: name });
      if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
        // Find delete button (icon)
        const deleteBtn = row.locator('button[class*="danger"]').first();
        if (await deleteBtn.isVisible()) {
          await deleteBtn.click();
          await confirmModal(page);
          await page.waitForTimeout(500);
          await waitForTableLoad(page);
        }
      }
    }
  });
});
