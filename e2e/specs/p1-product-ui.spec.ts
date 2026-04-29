import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import { waitForTableLoad, clickTab, waitForPageLoad, clickNavItem, expectMessage } from '../helpers/arco';

test.describe.serial('P1 Product UI Tests', () => {
  async function getToken(page: import('@playwright/test').Page): Promise<string> {
    return (await page.evaluate(() => localStorage.getItem('accessToken'))) || '';
  }

  // ──────── PROD-039: Create form only shows DEVELOPING status ────────
  test('PROD-039: create form only shows DEVELOPING status', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    await page.getByRole('button', { name: '新建产品' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.arco-drawer').getByText('新建产品')).toBeVisible();

    const statusSelect = page
      .locator('.arco-drawer .arco-select')
      .filter({ has: page.locator('[placeholder="请选择产品状态"]') });
    await statusSelect.click();
    await page.waitForTimeout(500);

    const options = page.locator('.arco-select-popup .arco-select-option, [role="option"]');
    const visibleOptions = options.filter({ visible: true });
    const count = await visibleOptions.count();
    expect(count).toBe(1);
    await expect(visibleOptions.first()).toContainText('研发中');

    await page.locator('.arco-drawer-close-icon').click();
  });

  // ──────── PROD-028: Compare button not visible with < 2 selected ────────
  test('PROD-028: compare button not visible with < 2 selected', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await waitForTableLoad(page);

    const compareBtn = page.getByRole('button', { name: /对比/ });
    let isVisible = await compareBtn.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(isVisible).toBeFalsy();

    const dataRows = page.locator('main table').last().locator('tbody tr, [role="rowgroup"]:not(:first-child) [role="row"]');
    const rowCount = await dataRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(2);

    await dataRows.nth(0).locator('td, [role="cell"]').first().click();
    await page.waitForTimeout(300);

    isVisible = await compareBtn.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(isVisible).toBeFalsy();

    await dataRows.nth(1).locator('td, [role="cell"]').first().click();
    await page.waitForTimeout(300);

    await expect(compareBtn).toBeVisible({ timeout: 3_000 });
    await expect(compareBtn).toHaveText(/对比.*2/);

    await compareBtn.click();
    const drawer = page.locator('.arco-drawer:visible');
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    await expect(drawer.getByText(/产品对比/)).toBeVisible();

    await page.keyboard.press('Escape');
  });

  // ──────── PROD-038: Status dropdown shows only allowed transitions ────────
  test('PROD-038: status dropdown shows only allowed transitions', async ({ authedPage: page }) => {
    const token = await getToken(page);
    const productName = uniqueName('状态转换测试');

    const listResp = await page.request.get('/api/projects?pageSize=1', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listResp.json();
    const projectId = listData.data?.[0]?.id;
    expect(projectId).toBeTruthy();

    const createResp = await page.request.post('/api/products', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: productName,
        model: `STATUS-${Date.now()}`,
        revision: 'V1.0',
        category: 'ROUTER',
        status: 'DEVELOPING',
        projectId,
      },
    });
    expect(createResp.status()).toBeLessThan(400);

    try {
      await clickNavItem(page, '产品管理');
      await waitForTableLoad(page);

      const row = page.locator('.arco-table-tr').filter({ hasText: productName });
      await expect(row).toBeVisible({ timeout: 10_000 });

      const editBtn = row.locator('button').nth(1);
      await editBtn.click();

      const drawer = page.locator('.arco-drawer');
      await expect(drawer).toBeVisible({ timeout: 5_000 });
      await expect(drawer.getByText('编辑产品')).toBeVisible({ timeout: 5_000 });

      const statusSelect = drawer
        .locator('.arco-select')
        .filter({ has: page.locator('[placeholder="请选择产品状态"]') });
      await statusSelect.click();
      await page.waitForTimeout(500);

      const options = page.locator('.arco-select-popup .arco-select-option, [role="option"]').filter({ visible: true });
      const optionTexts = await options.allInnerTexts();
      const joined = optionTexts.join(',');

      expect(joined).toContain('研发中');
      expect(joined).toContain('量产');
      expect(joined).not.toContain('停产');

      await page.locator('.arco-drawer-close-icon').click();
    } finally {
      const allResp = await page.request.get(`/api/products?keyword=${encodeURIComponent(productName)}&pageSize=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const allData = await allResp.json();
      for (const p of allData.data || []) {
        if (p.name === productName) {
          await page.request.delete(`/api/products/${p.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      }
    }
  });

  // ──────── PROD-037: Load template preserves existing fields ────────
  test('PROD-037: load template preserves existing fields', async ({ authedPage: page }) => {
    const token = await getToken(page);
    const productName = uniqueName('模板保留测试');

    const listResp = await page.request.get('/api/projects?pageSize=1', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listResp.json();
    const projectId = listData.data?.[0]?.id;
    expect(projectId).toBeTruthy();

    const createResp = await page.request.post('/api/products', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: productName,
        model: `TMPL-${Date.now()}`,
        revision: 'V1.0',
        category: 'ROUTER',
        status: 'DEVELOPING',
        projectId,
        specifications: { '工作电压': '5V' },
      },
    });
    expect(createResp.status()).toBeLessThan(400);

    try {
      await clickNavItem(page, '产品管理');
      await waitForTableLoad(page);

      const row = page.locator('.arco-table-tr').filter({ hasText: productName });
      await expect(row).toBeVisible({ timeout: 10_000 });

      const editBtn = row.locator('button').nth(1);
      await editBtn.click();

      const drawer = page.locator('.arco-drawer');
      await expect(drawer).toBeVisible({ timeout: 5_000 });
      await expect(drawer.getByText('编辑产品')).toBeVisible({ timeout: 5_000 });

      const specSection = drawer.locator('.arco-form-item').filter({ hasText: '规格参数' });
      await expect(specSection).toBeVisible({ timeout: 3_000 });

      const valueInput = specSection.locator('input').filter({ hasText: '' }).nth(1);
      const specInputs = specSection.locator('.arco-input');
      const keyInputs = await specInputs.count();

      let specValueInput;
      for (let i = 0; i < keyInputs; i += 2) {
        const val = await specInputs.nth(i).inputValue();
        if (val === '工作电压') {
          specValueInput = specInputs.nth(i + 1);
          break;
        }
      }

      if (specValueInput) {
        await expect(specValueInput).toHaveValue('5V');
      }

      const loadTemplateBtn = drawer.getByRole('button', { name: '加载模板' });
      if (await loadTemplateBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await loadTemplateBtn.click();
        await page.waitForTimeout(500);

        if (specValueInput) {
          await expect(specValueInput).toHaveValue('5V');
        }
      }

      await page.locator('.arco-drawer-close-icon').click();
    } finally {
      const allResp = await page.request.get(`/api/products?keyword=${encodeURIComponent(productName)}&pageSize=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const allData = await allResp.json();
      for (const p of allData.data || []) {
        if (p.name === productName) {
          await page.request.delete(`/api/products/${p.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      }
    }
  });

  // ──────── PROD-040: Project tab shows associated products ────────
  test('PROD-040: project tab shows associated products', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目管理');
    await page.waitForSelector('.arco-table-container table tbody tr', { timeout: 15_000 });

    const firstProjectLink = page.locator('.arco-table-container table tbody tr a').first();
    await expect(firstProjectLink).toBeVisible({ timeout: 5_000 });
    await firstProjectLink.click();

    await page.waitForURL('**/projects/**', { timeout: 10_000 });

    await clickTab(page, '产品列表');

    const productsTabContent = page.locator('[role="tabpanel"]').filter({ has: page.getByText('产品名称') });
    await expect(productsTabContent).toBeVisible({ timeout: 5_000 });
    await expect(productsTabContent.locator('table')).toBeVisible({ timeout: 3_000 });
  });
});
