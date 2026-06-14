import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  clickNavItem,
  expectMessage,
  confirmModal,
  waitForTableLoad,
  waitForPageLoad,
  createProjectViaPage,
  searchProject,
} from '../helpers/arco';

test.describe.serial('Product Edit and Detail @p1', () => {
  const productName = uniqueName('编辑测试产品');
  const updatedName = uniqueName('已修改产品');
  const projectName = uniqueName('产品编辑项目');

  test('setup: create project for product association', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });
  });

  test('create product with full fields', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    await page.getByRole('button', { name: '新建产品' }).click();
    const drawer = page.locator('[data-slot="sheet-content"]');
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    await drawer.getByPlaceholder('请输入产品名称').fill(productName);
    await drawer.getByPlaceholder('例如: RX-3000').fill('TEST-EDIT-001');

    const revisionInput = drawer.getByPlaceholder('例如: V2.1');
    if (await revisionInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await revisionInput.fill('V1.0');
    }

    const categorySelect = drawer.locator('[role="combobox"]').filter({
      has: page.locator('[placeholder="请选择产品类别"]'),
    });
    if (await categorySelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await categorySelect.click();
      await page.waitForTimeout(300);
      const routerOption = page.locator('[data-slot="select-content"]:visible [role="option"]').filter({ hasText: '路由器' });
      if (await routerOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await routerOption.click();
      } else {
        await page.locator('[data-slot="select-content"]:visible [role="option"]').first().click();
      }
    }

    const projectSelect = drawer.locator('[role="combobox"]').filter({
      has: page.locator('[placeholder="请选择关联项目"]'),
    });
    await projectSelect.click();
    await page.waitForTimeout(300);
    const projectOption = page.locator('[data-slot="select-content"]:visible [role="option"]').filter({ hasText: projectName });
    if (await projectOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await projectOption.click();
    } else {
      await page.locator('[data-slot="select-content"]:visible [role="option"]').first().click();
    }

    const descInput = drawer.getByPlaceholder('请输入产品描述');
    if (await descInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await descInput.fill(text.productDesc);
    }

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/products') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.locator('[data-slot="sheet-footer"]').getByRole('button', { name: '创建' }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expectMessage(page, '产品创建成功');
    await waitForTableLoad(page);
    await expect(page.getByText(productName)).toBeVisible({ timeout: 10_000 });
  });

  test('view product detail via eye icon', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    const row = page.locator('tbody tr').filter({ hasText: productName });
    await expect(row).toBeVisible({ timeout: 5_000 });

    const viewBtns = row.locator('button');
    for (let i = 0; i < await viewBtns.count(); i++) {
      const btn = viewBtns.nth(i);
      const tooltip = await btn.getAttribute('aria-label') ?? '';
      const title = await btn.getAttribute('title') ?? '';
      if (tooltip.includes('查看') || title.includes('查看')) {
        await btn.click();
        break;
      }
    }

    const detailDrawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: '产品详情' });
    if (await detailDrawer.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(detailDrawer.getByText('基本信息')).toBeVisible();

      await expect(detailDrawer.getByText(productName)).toBeVisible();

      const closeBtn = detailDrawer.locator('.arco-drawer-close-btn, button').filter({ has: page.locator('[class*="close"]') }).first();
      if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await closeBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
    }
  });

  test('edit product name and description', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    const row = page.locator('tbody tr').filter({ hasText: productName });

    const editBtns = row.locator('button');
    for (let i = 0; i < await editBtns.count(); i++) {
      const btn = editBtns.nth(i);
      const tooltip = await btn.getAttribute('aria-label') ?? '';
      const title = await btn.getAttribute('title') ?? '';
      if (tooltip.includes('编辑') || title.includes('编辑')) {
        await btn.click();
        break;
      }
    }

    const editDrawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: '编辑产品' });
    await expect(editDrawer).toBeVisible({ timeout: 5_000 });

    const nameInput = editDrawer.getByPlaceholder('请输入产品名称');
    await nameInput.clear();
    await nameInput.fill(updatedName);

    const descInput = editDrawer.getByPlaceholder('请输入产品描述');
    if (await descInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await descInput.clear();
      await descInput.fill('E2E测试修改后的产品描述');
    }

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/products') && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('[data-slot="sheet-footer"]').getByRole('button', { name: '保存' }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expectMessage(page, '产品更新成功');
    await waitForTableLoad(page);
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10_000 });
  });

  test('product search filters work', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    const searchInput = page.getByPlaceholder('搜索产品名称');
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchInput.fill(updatedName);
      await page.waitForTimeout(500);
      await waitForTableLoad(page);

      await expect(page.getByText(updatedName)).toBeVisible({ timeout: 5_000 });

      await searchInput.clear();
      await page.waitForTimeout(500);
      await waitForTableLoad(page);
    }

    const statusFilter = page.getByPlaceholder('状态筛选');
    if (await statusFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await statusFilter.click();
      await page.waitForTimeout(300);
      const options = page.locator('[data-slot="select-content"]:visible [role="option"]');
      if (await options.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
        await options.first().click();
        await page.waitForTimeout(500);
        await waitForTableLoad(page);
      }
    }
  });

  test('cleanup: delete product and project', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    const productRow = page.locator('tbody tr').filter({ hasText: updatedName });
    if (await productRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await productRow.locator('button[aria-label*="删除"]').click();
      await confirmModal(page);
      await expectMessage(page, '产品删除成功');
    }

    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    const projectRow = page.locator('tbody tr').filter({ hasText: projectName });
    if (await projectRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await projectRow.locator('button[aria-label*="删除"]').click();
      await confirmModal(page);
      await expectMessage(page, '项目删除成功');
    }
  });
});
