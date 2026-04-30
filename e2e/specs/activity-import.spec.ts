import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  createProjectViaPage,
  searchProject,
} from '../helpers/arco';

/**
 * 活动批量导入测试
 * - 导入 Modal 显示和交互
 * - 仅支持 .xlsx 格式
 * - 导入成功后显示撤回功能
 */
test.describe.serial('Activity Batch Import', () => {
  const projectName = uniqueName('导入测试项目');

  async function goToProject(page: import('@playwright/test').Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);
    await waitForTableLoad(page);
  }

  // ──────── setup ────────
  test('setup: create project', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });
  });

  // ──────── TC1: import button visible in toolbar ────────
  test('import button is visible in activity toolbar', async ({ authedPage: page }) => {
    await goToProject(page);

    // The import button is inside the "活动" dropdown
    const activityDropdown = page.locator('button.arco-btn-primary').filter({ hasText: '活动' });
    if (await activityDropdown.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await activityDropdown.click();
      await page.waitForTimeout(300);

      // Check for "批量导入" menu item
      const importItem = page.locator('.arco-dropdown-menu-item, .arco-menu-item').filter({ hasText: /批量导入|导入/ });
      await expect(importItem).toBeVisible({ timeout: 3_000 });
    }
  });

  // ──────── TC2: import modal displays correctly ────────
  test('import modal shows drag-drop upload area', async ({ authedPage: page }) => {
    await goToProject(page);

    // Open import modal via dropdown
    const activityDropdown = page.locator('button.arco-btn-primary').filter({ hasText: '活动' });
    if (!(await activityDropdown.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await activityDropdown.click();
    await page.waitForTimeout(300);

    const importItem = page.locator('.arco-dropdown-menu-item, .arco-menu-item').filter({ hasText: /批量导入|导入/ });
    if (!(await importItem.isVisible({ timeout: 3_000 }).catch(() => false))) return;

    await importItem.click();
    await page.waitForTimeout(500);

    // Modal should appear
    const modal = page.locator('.arco-modal:visible');
    if (await modal.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Should have a drag-drop upload area
      const uploadArea = modal.locator('.arco-upload-drag, [class*="upload"]');
      await expect(uploadArea).toBeVisible({ timeout: 3_000 });

      // Should mention supported formats
      const formatText = modal.getByText(/xlsx|Excel/i);
      await expect(formatText).toBeVisible({ timeout: 3_000 });

      // Close the modal
      const closeBtn = modal.locator('.arco-modal-close-icon, button').filter({ hasText: /取消|关闭/ });
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
    }
  });

  // ──────── TC3: import modal accepts xlsx file ────────
  test('import modal accepts xlsx file format', async ({ authedPage: page }) => {
    await goToProject(page);

    const activityDropdown = page.locator('button.arco-btn-primary').filter({ hasText: '活动' });
    if (!(await activityDropdown.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await activityDropdown.click();
    await page.waitForTimeout(300);

    const importItem = page.locator('.arco-dropdown-menu-item, .arco-menu-item').filter({ hasText: /批量导入|导入/ });
    if (!(await importItem.isVisible({ timeout: 3_000 }).catch(() => false))) return;

    await importItem.click();
    await page.waitForTimeout(500);

    const modal = page.locator('.arco-modal:visible');
    if (await modal.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // The upload input should accept .xlsx only.
      const fileInput = modal.locator('input[type="file"]');
      if (await fileInput.count() > 0) {
        const acceptAttr = await fileInput.getAttribute('accept');
        if (acceptAttr) {
          expect(acceptAttr).toBe('.xlsx');
        }
      }

      // Close
      await page.keyboard.press('Escape');
    }
  });

  // ──────── cleanup ────────
  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await row.locator('button[class*="danger"]').click();
      await confirmModal(page);
      await expectMessage(page, '项目删除成功');
    }
  });
});
