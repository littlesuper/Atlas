import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import { clickNavItem, expectMessage, confirmModal, waitForTableLoad } from '../helpers/arco';

test.describe.serial('Product Management', () => {
  const productName = uniqueName(text.productName);

  test('view product list', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await expect(page).toHaveURL(/\/products/);
    await waitForTableLoad(page);
    await expect(page.locator('.arco-table')).toBeVisible();
  });

  test('create new product', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    await page.getByRole('button', { name: '新建产品' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible();

    // Fill required fields
    await page.getByPlaceholder('请输入产品名称').fill(productName);
    await page.getByPlaceholder('例如: RX-3000').fill(text.productModel);

    // Select 关联项目
    await page.locator('.arco-select').filter({ has: page.locator('[placeholder="请选择关联项目"]') }).click();
    await page.locator('.arco-select-popup .arco-select-option').first().click();

    // Submit
    await page.locator('.arco-drawer-footer').getByRole('button', { name: '创建' }).click();
    await expectMessage(page, '产品创建成功');

    // Verify in list
    await waitForTableLoad(page);
    await expect(page.getByText(productName)).toBeVisible();
  });

  test('delete product', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    const row = page.locator('.arco-table-tr').filter({ hasText: productName });
    await row.locator('button[class*="danger"]').click();

    await confirmModal(page);
    await expectMessage(page, '产品删除成功');

    await waitForTableLoad(page);
    await expect(page.getByText(productName)).not.toBeVisible();
  });
});
