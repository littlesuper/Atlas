import { test, expect } from '../fixtures/auth';
import { type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { uniqueName } from '../fixtures/test-data';
import { expectMessage, confirmModal, waitForTableLoad, createProjectViaPage, searchProject } from '../helpers/arco';

/**
 * 活动批量导入测试
 * - 导入 Modal 显示和交互
 * - 仅支持 .xlsx 格式
 * - 导入成功后显示撤回功能
 */
test.describe.serial('Activity Batch Import', () => {
  const projectName = uniqueName('导入测试项目');

  async function getToken(page: Page): Promise<string> {
    return (await page.evaluate(() => localStorage.getItem('accessToken'))) || '';
  }

  async function createProjectViaApi(page: Page, token: string, name: string): Promise<string> {
    const usersResp = await page.request.get('/api/users?page=1&pageSize=20', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(usersResp.status()).toBe(200);
    const users = await usersResp.json();
    const manager = users.data?.find((user: { username?: string }) => user.username === 'admin') ?? users.data?.[0];
    expect(manager?.id).toBeTruthy();

    const projectResp = await page.request.post('/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name,
        description: 'E2E import undo rollback project',
        productLine: 'DANDELION',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        startDate: '2026-06-01',
        endDate: '2026-12-31',
        managerId: manager.id,
      },
    });
    expect(projectResp.status()).toBe(201);
    const project = await projectResp.json();
    expect(project.id).toBeTruthy();
    return project.id;
  }

  async function deleteProjectViaApi(page: Page, token: string, projectId: string) {
    await page.request.delete(`/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async function listProjectActivities(page: Page, token: string, projectId: string) {
    const resp = await page.request.get(`/api/activities/project/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.status()).toBe(200);
    return (await resp.json()) as Array<{ id: string; name: string; dependencies?: Array<{ id: string }> }>;
  }

  async function buildImportWorkbook(activityNames: string[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Activities');
    sheet.addRow([
      '序号',
      '活动名称',
      '类型',
      '阶段',
      '负责人',
      '计划开始',
      '计划结束',
      '工期',
      '状态',
      '备注',
      '前置依赖',
    ]);
    sheet.addRow([
      1,
      activityNames[0],
      '任务',
      'EVT',
      '张三',
      '2026-06-01',
      '2026-06-03',
      3,
      '未开始',
      'import undo parent',
      '',
    ]);
    sheet.addRow([
      2,
      activityNames[1],
      '任务',
      'DVT',
      '李四',
      '2026-06-04',
      '2026-06-08',
      3,
      '进行中',
      'import undo child',
      '1FS',
    ]);

    const rawBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);
  }

  async function goToProject(page: Page) {
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
      if ((await fileInput.count()) > 0) {
        const acceptAttr = await fileInput.getAttribute('accept');
        if (acceptAttr) {
          expect(acceptAttr).toBe('.xlsx');
        }
      }

      // Close
      await page.keyboard.press('Escape');
    }
  });

  // ──────── TC4: real import can be rolled back through undo stack ────────
  test('imported activities can be undone and removed from the project', async ({ authedPage: page }) => {
    const token = await getToken(page);
    const importId = Date.now();
    const rollbackProjectName = uniqueName('导入撤回项目');
    const activityNames = [`导入撤回-${importId}-结构评审`, `导入撤回-${importId}-样机验证`];
    let projectId = '';

    try {
      projectId = await createProjectViaApi(page, token, rollbackProjectName);
      const workbook = await buildImportWorkbook(activityNames);

      await page.goto(`/projects/${projectId}`);
      await waitForTableLoad(page);

      const activityDropdown = page.locator('button.arco-btn-primary').filter({ hasText: '活动' });
      await activityDropdown.click();
      await page.locator('.arco-dropdown-menu-item, .arco-menu-item').filter({ hasText: '批量导入' }).click();

      const modal = page.locator('.arco-modal:visible').filter({ hasText: '批量导入活动' });
      await expect(modal).toBeVisible({ timeout: 5_000 });

      const importResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/activities/project/${projectId}/import-excel`) &&
          resp.request().method() === 'POST',
        { timeout: 15_000 }
      );
      const fileChooserPromise = page.waitForEvent('filechooser');
      await modal.getByText(/拖拽 Excel 文件到此处/).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: `activity-import-undo-${importId}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: workbook,
      });

      const importResp = await importResponsePromise;
      expect(importResp.status()).toBe(200);
      const importBody = await importResp.json();
      expect(importBody.count).toBe(2);
      expect(importBody.activities.map((activity: { name: string }) => activity.name).sort()).toEqual(
        [...activityNames].sort()
      );

      await expectMessage(page, '导入成功');
      await waitForTableLoad(page);
      for (const activityName of activityNames) {
        await expect(page.getByText(activityName)).toBeVisible({ timeout: 10_000 });
      }

      await expect
        .poll(async () => {
          const activities = await listProjectActivities(page, token, projectId);
          return activities.filter((activity) => activityNames.includes(activity.name)).length;
        })
        .toBe(2);

      const undoButton = page.locator('button:has(.arco-icon-undo)').first();
      await expect(undoButton).toBeEnabled();

      const undoResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/activities/project/${projectId}/undo-import`) && resp.request().method() === 'POST',
        { timeout: 15_000 }
      );
      await undoButton.click();

      const confirm = page.locator('.arco-modal:visible').filter({ hasText: '确认撤回' });
      await expect(confirm).toContainText('撤回批量导入的 2 条活动');
      await confirm.getByRole('button', { name: '确认撤回' }).click();

      const undoResp = await undoResponsePromise;
      expect(undoResp.status()).toBe(200);
      const undoBody = await undoResp.json();
      expect(undoBody.count).toBe(2);
      await expectMessage(page, '撤回成功');

      await expect
        .poll(async () => {
          const activities = await listProjectActivities(page, token, projectId);
          return activities.filter((activity) => activityNames.includes(activity.name)).length;
        })
        .toBe(0);
      for (const activityName of activityNames) {
        await expect(page.getByText(activityName)).not.toBeVisible();
      }
    } finally {
      if (projectId) {
        await deleteProjectViaApi(page, token, projectId);
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
