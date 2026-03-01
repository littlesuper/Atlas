import { test, expect } from '../fixtures/auth';
import { waitForTableLoad, clickDrawerSubmit, pickDateRange, openCreateActivityDrawer } from '../helpers/arco';

/**
 * 表单验证测试
 * - 项目表单必填字段验证
 * - 活动表单必填字段验证
 * - 产品表单必填字段验证
 * - 空表单提交显示错误提示
 */
test.describe('Form Validation', () => {
  // ──────── TC1: project form validation ────────
  test('project form shows validation errors on empty submit', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '新建项目' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible();

    // Try to submit empty form
    await clickDrawerSubmit(page, '创建');
    await page.waitForTimeout(500);

    // Should show validation errors
    const errors = page.locator('.arco-form-message');
    const errorCount = await errors.count();
    expect(errorCount).toBeGreaterThan(0);

    // Drawer should still be open
    await expect(page.locator('.arco-drawer')).toBeVisible();

    // Close drawer
    await page.locator('.arco-drawer-close-icon').click();
  });

  // ──────── TC2: project name is required ────────
  test('project form requires project name', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '新建项目' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible();

    // Fill everything except name
    await pickDateRange(page);

    const managerSelect = page.locator('.arco-drawer .arco-select').filter({
      has: page.locator('[placeholder="项目经理"]'),
    });
    await managerSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
    await page.waitForTimeout(200);

    // Try to submit
    await clickDrawerSubmit(page, '创建');
    await page.waitForTimeout(500);

    // Name field should show error
    const nameError = page.locator('.arco-form-message').first();
    await expect(nameError).toBeVisible();

    // Close drawer
    await page.locator('.arco-drawer-close-icon').click();
  });

  // ──────── TC3: activity form validation ────────
  test('activity form shows validation on empty submit', async ({ authedPage: page }) => {
    await waitForTableLoad(page);

    // Navigate to first project
    const firstProjectLink = page.locator('.arco-table-td a, .arco-table-td .arco-link').first();
    if (await firstProjectLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstProjectLink.click();
      await expect(page).toHaveURL(/\/projects\/.+/);
      await page.waitForTimeout(1_000);

      await openCreateActivityDrawer(page);

      // Try to submit without filling required fields
      await clickDrawerSubmit(page, '创建');
      await page.waitForTimeout(500);

      // Should show validation errors
      const errors = page.locator('.arco-form-message');
      const errorCount = await errors.count();
      expect(errorCount).toBeGreaterThan(0);

      // Close drawer
      await page.locator('.arco-drawer-close-icon').click();
    }
  });

  // ──────── TC4: product form validation ────────
  test('product form shows validation on empty submit', async ({ authedPage: page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    await page.getByRole('button', { name: '新建产品' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible();

    // Try to submit empty form
    await page.locator('.arco-drawer-footer').getByRole('button', { name: '创建' }).click();
    await page.waitForTimeout(500);

    // Should show validation errors
    const errors = page.locator('.arco-form-message');
    const errorCount = await errors.count();
    expect(errorCount).toBeGreaterThan(0);

    // Close drawer
    await page.locator('.arco-drawer-close-icon').click();
  });

  // ──────── TC5: drawer cancel button closes without saving ────────
  test('drawer cancel/close discards changes', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '新建项目' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible();

    // Fill some data
    await page.getByPlaceholder('请输入项目名称').fill('不应该保存的项目');

    // Click close icon
    await page.locator('.arco-drawer-close-icon').click();
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 3_000 });

    // The project should NOT appear in the list
    await waitForTableLoad(page);
    await expect(page.getByText('不应该保存的项目')).not.toBeVisible();
  });
});
