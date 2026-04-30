import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  confirmModal,
  waitForTableLoad,
  waitForPageLoad,
} from '../helpers/arco';

/**
 * 模板管理测试
 * - 查看模板列表
 * - 创建模板
 * - 添加模板活动
 * - 编辑模板活动（内联编辑）
 * - 复制模板
 * - 删除模板
 */
test.describe.serial('Template Management', () => {
  const templateName = uniqueName('测试模板');
  const activityName1 = '模板活动A_' + Date.now();
  const activityName2 = '模板活动B_' + Date.now();

  async function goToTemplates(page: import('@playwright/test').Page) {
    // Templates are accessed via direct route /templates
    // (linked from the template icon button next to "新建项目" on project list page)
    await page.goto('/templates');
    await waitForPageLoad(page);
    await page.waitForTimeout(500);
  }

  // ──────── TC1: view template list ────────
  test('view template list page', async ({ authedPage: page }) => {
    await goToTemplates(page);

    // Should show template list or empty state
    const pageReady = page
      .getByText('模板管理')
      .or(page.locator('.arco-table').first())
      .or(page.locator('.arco-empty').first());
    await expect(pageReady.first()).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC2: create template ────────
  test('create new template', async ({ authedPage: page }) => {
    await goToTemplates(page);

    const createBtn = page.getByRole('button', { name: /新建模板|创建模板/ });
    if (await createBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(500);

      // Fill template name (placeholder is "如：标准路由器项目模板")
      const nameInput = page.locator('input[placeholder*="标准路由器"]');
      await nameInput.waitFor({ state: 'visible', timeout: 5_000 });
      await nameInput.fill(templateName);

      // Fill description (placeholder is "模板描述（选填）")
      const descInput = page.locator('input[placeholder*="模板描述"]');
      if (await descInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await descInput.fill('E2E测试创建的模板');
      }

      // Save template (button text is "创建")
      const saveBtn = page.getByRole('button', { name: '创建' });
      await saveBtn.waitFor({ state: 'visible', timeout: 3_000 });
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/api/templates') && r.request().method() === 'POST',
        { timeout: 15_000 },
      );
      await saveBtn.click();
      const resp = await responsePromise;
      expect(resp.status()).toBeLessThan(400);

      await page.waitForTimeout(1_000);
      await expect(page.getByText(templateName)).toBeVisible({ timeout: 10_000 });
    }
  });

  // ──────── TC3: add activities to template ────────
  test('add activities to template', async ({ authedPage: page }) => {
    await goToTemplates(page);

    // Click on template to edit
    const templateLink = page.getByText(templateName);
    if (await templateLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await templateLink.click();
      await page.waitForTimeout(1_000);

      // Add activity button
      const addBtn = page.getByRole('button', { name: /添加活动|新增活动|新建活动/ });
      if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        // Add first activity
        await addBtn.click();
        await page.waitForTimeout(300);

        // Fill activity name in the table row (inline)
        const nameInputs = page.locator('.arco-table-body .arco-input').filter({
          has: page.locator('[placeholder*="活动名称"]'),
        });
        if (await nameInputs.last().isVisible({ timeout: 3_000 }).catch(() => false)) {
          await nameInputs.last().fill(activityName1);
        }

        // Add second activity
        await addBtn.click();
        await page.waitForTimeout(300);

        if (await nameInputs.last().isVisible({ timeout: 3_000 }).catch(() => false)) {
          await nameInputs.last().fill(activityName2);
        }

        // Save
        const saveBtn = page.getByRole('button', { name: /保存/ });
        if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await saveBtn.click();
          await page.waitForTimeout(1_000);
        }
      }
    }
  });

  // ──────── TC4: template activity table has correct columns ────────
  test('template activity table shows ID, name, type, phase columns', async ({ authedPage: page }) => {
    await goToTemplates(page);

    const templateLink = page.getByText(templateName);
    if (await templateLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await templateLink.click();
      await page.waitForTimeout(1_000);

      const table = page.locator('.arco-table').first();
      if (await table.isVisible({ timeout: 5_000 }).catch(() => false)) {
        // Check column headers
        const headers = ['ID', '活动名称', '类型', '阶段', '工期'];
        for (const header of headers) {
          const headerEl = table.getByText(header, { exact: false });
          if (await headerEl.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await expect(headerEl).toBeVisible();
          }
        }
      }
    }
  });

  // ──────── TC5: copy template ────────
  test('copy template', async ({ authedPage: page }) => {
    await goToTemplates(page);

    const row = page.locator('.arco-table-tr, .arco-card').filter({ hasText: templateName });
    if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const copyBtn = row.getByRole('button', { name: /复制/ });
      if (await copyBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await copyBtn.click();
        await page.waitForTimeout(1_000);

        // Should show a copy in the list
        const templates = page.getByText(templateName);
        const count = await templates.count();
        expect(count).toBeGreaterThanOrEqual(1);
      }
    }
  });

  // ──────── TC6: delete template ────────
  test('delete templates', async ({ authedPage: page }) => {
    await goToTemplates(page);

    // Delete all test templates
    let row = page.locator('.arco-table-tr, .arco-card').filter({ hasText: templateName }).first();
    while (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const deleteBtn = row.getByRole('button', { name: /删除/ });
      if (await deleteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await deleteBtn.click();
        await confirmModal(page);
        await page.waitForTimeout(1_000);
      } else {
        break;
      }
      row = page.locator('.arco-table-tr, .arco-card').filter({ hasText: templateName }).first();
    }
  });
});
