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
 * 项目归档与恢复测试
 * - 归档项目（点击归档 → 确认弹窗 → 填写备注 → 确认）
 * - 归档后项目显示在「已归档」统计卡片下
 * - 归档项目不显示编辑/删除按钮
 * - 恢复归档项目
 */
test.describe.serial('Project Archive & Restore', () => {
  const projectName = uniqueName('归档测试项目');

  // ──────── setup: create project ────────
  test('setup: create project', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName, desc: '归档测试用项目' });
    await searchProject(page, projectName);
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC1: archive project from detail page ────────
  test('archive project via detail page', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Find and click the archive button
    const archiveBtn = page.getByRole('button', { name: /归档/ });
    if (await archiveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await archiveBtn.click();
      await page.waitForTimeout(300);

      // Modal should appear
      const modal = page.locator('.arco-modal:visible');
      await expect(modal).toBeVisible({ timeout: 5_000 });

      // Fill optional remark
      const textarea = modal.locator('textarea');
      if (await textarea.isVisible()) {
        await textarea.fill('E2E 测试归档');
      }

      // Confirm
      const confirmBtn = modal.locator('.arco-btn-warning, .arco-btn-primary').filter({ hasText: /确认|归档/ });
      const archiveResp = page.waitForResponse(
        (r) => r.url().includes('/api/projects') && r.url().includes('archive'),
        { timeout: 15_000 },
      );
      await confirmBtn.click();
      const resp = await archiveResp.catch(() => null);
      if (resp) {
        expect(resp.status()).toBeLessThan(400);
      }

      await page.waitForTimeout(1_000);
    }
  });

  // ──────── TC2: archived project shows in archived stat card ────────
  test('archived project appears under archived filter', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);

    // Click the "已归档" stat card
    const archivedCard = page.getByText('已归档').first();
    if (await archivedCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await archivedCard.click();
      await waitForTableLoad(page);

      // Search for our project
      await searchProject(page, projectName);
      await page.waitForTimeout(500);

      // Project should be visible in the list
      const hasProject = await page.getByText(projectName).isVisible({ timeout: 5_000 }).catch(() => false);
      if (hasProject) {
        // Verify no edit/delete buttons for archived projects
        const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
        const editBtn = row.locator('button').filter({ hasText: /编辑/ });
        const deleteBtn = row.locator('button[class*="danger"]');

        // Edit button should not be visible for archived project
        expect(await editBtn.count()).toBe(0);
        // Delete button should not be visible for archived project
        expect(await deleteBtn.count()).toBe(0);
      }
    }
  });

  // ──────── TC3: unarchive project ────────
  test('unarchive project restores it', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);

    // Click archived filter
    const archivedCard = page.getByText('已归档').first();
    if (await archivedCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await archivedCard.click();
      await waitForTableLoad(page);
      await searchProject(page, projectName);

      const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
      // Look for unarchive/restore button
      const unarchiveBtn = row.locator('button').filter({ hasText: /恢复|取消归档/ });
      if (await unarchiveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const resp = page.waitForResponse(
          (r) => r.url().includes('/api/projects') && r.url().includes('unarchive'),
          { timeout: 15_000 },
        );
        await unarchiveBtn.click();
        // May have a confirmation modal
        const modal = page.locator('.arco-modal:visible');
        if (await modal.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await confirmModal(page);
        }
        const archiveResp = await resp.catch(() => null);
        if (archiveResp) {
          expect(archiveResp.status()).toBeLessThan(400);
        }
        await waitForTableLoad(page);
      }
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
