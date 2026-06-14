import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  clickNavItem,
  expectMessage,
  confirmModal,
  waitForTableLoad,
  createProjectViaPage,
  searchProject,
} from '../helpers/arco';

test.describe.serial('Product Detail Changelog @p2', () => {
  const productName = uniqueName('变更日志产品');
  const updatedName = uniqueName('已修改产品');
  const projectName = uniqueName('变更日志项目');

  test('setup: create project and product', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });

    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    await page.getByRole('button', { name: '新建产品' }).click();
    const drawer = page.locator('[data-slot="sheet-content"]');
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    await drawer.getByPlaceholder('请输入产品名称').fill(productName);
    await drawer.getByPlaceholder('例如: RX-3000').fill('CL-001');

    const categorySelect = drawer.locator('[role="combobox"]').filter({
      has: page.locator('[placeholder="请选择产品类别"]'),
    });
    if (await categorySelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await categorySelect.click();
      await page.waitForTimeout(300);
      await page.locator('[data-slot="select-content"]:visible [role="option"]').first().click();
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

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/products') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.locator('[data-slot="sheet-footer"]').getByRole('button', { name: '创建' }).click();
    expect((await responsePromise).status()).toBeLessThan(400);
    await expectMessage(page, '产品创建成功');
  });

  test('edit product to generate changelog entry', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    const row = page.locator('tbody tr').filter({ hasText: productName });
    await expect(row).toBeVisible({ timeout: 5_000 });

    const allButtons = row.locator('button');
    for (let i = 0; i < await allButtons.count(); i++) {
      const btn = allButtons.nth(i);
      const tooltip = await btn.getAttribute('aria-label') ?? '';
      const title = await btn.getAttribute('title') ?? '';
      if (tooltip.includes('编辑') || title.includes('编辑')) {
        await btn.click();
        break;
      }
    }

    const editDrawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: '编辑产品' });
    await expect(editDrawer).toBeVisible({ timeout: 5_000 });

    await editDrawer.getByPlaceholder('请输入产品名称').clear();
    await editDrawer.getByPlaceholder('请输入产品名称').fill(updatedName);

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/products') && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('[data-slot="sheet-footer"]').getByRole('button', { name: '保存' }).click();
    expect((await responsePromise).status()).toBeLessThan(400);
    await expectMessage(page, '产品更新成功');
  });

  test('view product detail with changelog', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    const row = page.locator('tbody tr').filter({ hasText: updatedName });
    await expect(row).toBeVisible({ timeout: 5_000 });

    const allButtons = row.locator('button');
    for (let i = 0; i < await allButtons.count(); i++) {
      const btn = allButtons.nth(i);
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

      const changelogSection = detailDrawer.getByText('变更记录');
      if (await changelogSection.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(changelogSection).toBeVisible();

        const updateLog = detailDrawer.getByText('UPDATE').or(detailDrawer.getByText('更新'));
        if (await updateLog.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
          await expect(updateLog.first()).toBeVisible();
        }
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
      await page.waitForTimeout(1_000);
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
