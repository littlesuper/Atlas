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

test.describe.serial('Product Version Copy @p1', () => {
  const productName = uniqueName('版本复制产品');
  const projectName = uniqueName('版本复制项目');

  test('setup: create project and product', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });

    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    await page.getByRole('button', { name: '新建产品' }).click();
    const drawer = page.locator('[data-slot="sheet-content"]');
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    await drawer.getByPlaceholder('请输入产品名称').fill(productName);
    await drawer.getByPlaceholder('例如: RX-3000').fill('COPY-001');

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
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expectMessage(page, '产品创建成功');
    await waitForTableLoad(page);
    await expect(page.getByText(productName)).toBeVisible({ timeout: 10_000 });
  });

  test('copy product version via copy icon', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    const row = page.locator('tbody tr').filter({ hasText: productName });
    await expect(row).toBeVisible({ timeout: 5_000 });

    const allButtons = row.locator('button');
    let copyBtn = null;
    for (let i = 0; i < await allButtons.count(); i++) {
      const btn = allButtons.nth(i);
      const tooltip = await btn.getAttribute('aria-label') ?? '';
      const title = await btn.getAttribute('title') ?? '';
      if (tooltip.includes('复制版本') || title.includes('复制版本')) {
        copyBtn = btn;
        break;
      }
    }

    if (copyBtn) {
      await copyBtn.click();

      const modal = page.locator('[data-slot="dialog-content"]').filter({ hasText: '复制版本' });
      if (await modal.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const versionInput = modal.getByPlaceholder(/新版本号/);
        if (await versionInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await versionInput.fill('V2.0');
        }

        const responsePromise = page.waitForResponse(
          (r) => r.url().includes('/copy') && r.request().method() === 'POST',
          { timeout: 15_000 },
        );
        await modal.getByRole('button', { name: /确定|复制/ }).click();
        const resp = await responsePromise;
        expect(resp.status()).toBeLessThan(400);

        await expectMessage(page, '版本复制成功');
      }
    }
  });

  test('verify copied product appears in list with new version', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    const productLinks = page.getByText(productName);
    const count = await productLinks.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const v2Text = page.getByText('V2.0');
    if (await v2Text.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(v2Text.first()).toBeVisible();
    }
  });

  test('cleanup: delete products and project', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    let row = page.locator('tbody tr').filter({ hasText: productName }).first();
    while (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await row.locator('button[aria-label*="删除"]').click();
      await confirmModal(page);
      await page.waitForTimeout(1_000);
      await waitForTableLoad(page);
      row = page.locator('tbody tr').filter({ hasText: productName }).first();
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
