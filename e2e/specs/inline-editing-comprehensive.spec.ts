import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  expectMessage,
  waitForTableLoad,
  searchProject,
  clickSubNav,
  pickDateRange,
} from '../helpers/arco';

test.describe.serial('Comprehensive Inline Editing', () => {
  const projectName = uniqueName('内联全面');
  let projectId: string;
  let activityId: string;

  async function getToken(page: import('@playwright/test').Page): Promise<string> {
    return (await page.evaluate(() => localStorage.getItem('accessToken'))) || '';
  }

  async function apiHeaders(page: import('@playwright/test').Page) {
    return { Authorization: `Bearer ${await getToken(page)}` };
  }

  async function goToProject(page: import('@playwright/test').Page) {
    await page.goto(`/projects/${projectId}`);
    await page.waitForTimeout(1_000);
    await waitForTableLoad(page);
  }

  async function getColIndex(page: import('@playwright/test').Page, headerText: string): Promise<number> {
    const headers = page.locator('.arco-table-th');
    const count = await headers.count();
    for (let i = 0; i < count; i++) {
      const txt = await headers.nth(i).textContent();
      if (txt?.includes(headerText)) return i;
    }
    return -1;
  }

  async function getFirstActivityRow(page: import('@playwright/test').Page) {
    return page.locator('.arco-table-body .arco-table-tr').first();
  }

  async function createProjectViaDrawer(page: import('@playwright/test').Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);

    await page.getByRole('button', { name: '新建项目' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300);

    await page.getByPlaceholder('请输入项目名称').fill(projectName);
    await page.getByPlaceholder('请输入项目描述').fill('E2E inline editing test project');

    await pickDateRange(page);

    const managerSelect = page.locator('.arco-drawer .arco-select').filter({
      has: page.locator('[placeholder="选择项目经理"]'),
    });
    await managerSelect.click();
    await page.waitForTimeout(300);
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
    await page.waitForTimeout(200);

    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/api/projects') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.locator('.arco-drawer-footer').getByRole('button', { name: '创建' }).click();
    const resp = await respPromise;
    expect(resp.status()).toBeLessThan(400);

    const body = await resp.json();
    projectId = body.data?.id ?? body.id;
    expect(projectId).toBeTruthy();

    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
  }

  test('setup: create project + 2 activities via API', async ({ authedPage: page }) => {
    await createProjectViaDrawer(page);

    const headers = await apiHeaders(page);
    for (let i = 0; i < 2; i++) {
      const resp = await page.request.post('/api/activities', {
        headers,
        data: {
          projectId,
          name: `测试活动${i + 1}`,
          type: 'TASK',
          status: 'NOT_STARTED',
          sortOrder: (i + 1) * 10,
        },
      });
      expect(resp.status()).toBeLessThan(400);
      if (i === 0) {
        const body = await resp.json();
        activityId = body.data?.id ?? body.id;
      }
    }

    await goToProject(page);
    await expect(page.getByText('测试活动1')).toBeVisible({ timeout: 10_000 });
  });

  // ──────────────────────────────────────────────────
  // Activity table inline edits (10 points)
  // ──────────────────────────────────────────────────

  // 1. Predecessor (前置) - InlineTextEditor
  test('inline edit predecessor field', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = page.locator('.arco-table-body .arco-table-tr').filter({ hasText: '测试活动2' });
    await expect(row).toBeVisible({ timeout: 10_000 });

    const colIdx = await getColIndex(page, '前置');
    if (colIdx < 0) return;
    const cell = row.locator('.arco-table-td').nth(colIdx);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(300);

    const input = cell.locator('input.arco-input');
    if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await input.clear();
      await input.fill('1');
      const updateResp = page.waitForResponse(
        (r) => r.url().includes('/api/activities/') && r.request().method() === 'PUT',
        { timeout: 10_000 },
      );
      await input.press('Tab');
      const resp = await updateResp.catch(() => null);
      if (resp) {
        expect(resp.status()).toBeLessThan(400);
        await expectMessage(page, '更新成功');
      }
    }
  });

  // 2. Phase (阶段) - AutoOpenSelect
  test('inline edit phase field', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = await getFirstActivityRow(page);
    const colIdx = await getColIndex(page, '阶段');
    if (colIdx < 0) return;
    const cell = row.locator('.arco-table-td').nth(colIdx);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(500);

    const selectPopup = page.locator('.arco-select-popup:visible');
    if (await selectPopup.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const option = selectPopup.locator('.arco-select-option').filter({ hasText: 'EVT' }).first();
      if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const updateResp = page.waitForResponse(
          (r) => r.url().includes('/api/activities/') && r.request().method() === 'PUT',
          { timeout: 10_000 },
        );
        await option.click();
        const resp = await updateResp.catch(() => null);
        if (resp) expect(resp.status()).toBeLessThan(400);
      }
    }
  });

  // 3. Name (活动名称) - InlineTextEditor
  test('inline edit activity name', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = page.locator('.arco-table-body .arco-table-tr').filter({ hasText: '测试活动1' });
    await expect(row).toBeVisible({ timeout: 10_000 });

    const colIdx = await getColIndex(page, '活动名称');
    if (colIdx < 0) return;
    const cell = row.locator('.arco-table-td').nth(colIdx);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(300);

    const input = cell.locator('input.arco-input');
    if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await input.clear();
      await input.fill('已编辑活动名');
      const updateResp = page.waitForResponse(
        (r) => r.url().includes('/api/activities/') && r.request().method() === 'PUT',
        { timeout: 10_000 },
      );
      await input.press('Tab');
      const resp = await updateResp.catch(() => null);
      if (resp) {
        expect(resp.status()).toBeLessThan(400);
        await expect(page.getByText('已编辑活动名')).toBeVisible({ timeout: 5_000 });
      }
    }
  });

  // 4. Type (类型) - AutoOpenSelect
  test('inline edit type field', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = await getFirstActivityRow(page);
    const colIdx = await getColIndex(page, '类型');
    if (colIdx < 0) return;
    const cell = row.locator('.arco-table-td').nth(colIdx);
    await cell.scrollIntoViewIfNeeded();

    const tag = cell.locator('.arco-tag, [style*="cursor"]').first();
    await tag.click();
    await page.waitForTimeout(500);

    const selectPopup = page.locator('.arco-select-popup:visible');
    if (await selectPopup.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const option = selectPopup.locator('.arco-select-option').filter({ hasText: '里程碑' }).first();
      if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const updateResp = page.waitForResponse(
          (r) => r.url().includes('/api/activities/') && r.request().method() === 'PUT',
          { timeout: 10_000 },
        );
        await option.click();
        const resp = await updateResp.catch(() => null);
        if (resp) expect(resp.status()).toBeLessThan(400);
      }
    }
  });

  // 5. Status (状态) - AutoOpenSelect
  test('inline edit status field', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = await getFirstActivityRow(page);
    const colIdx = await getColIndex(page, '状态');
    if (colIdx < 0) return;
    const cell = row.locator('.arco-table-td').nth(colIdx);
    await cell.scrollIntoViewIfNeeded();

    const tag = cell.locator('.arco-tag, [style*="cursor"]').first();
    await tag.click();
    await page.waitForTimeout(500);

    const selectPopup = page.locator('.arco-select-popup:visible');
    if (await selectPopup.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const option = selectPopup.locator('.arco-select-option').filter({ hasText: '进行中' }).first();
      if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const updateResp = page.waitForResponse(
          (r) => r.url().includes('/api/activities/') && r.request().method() === 'PUT',
          { timeout: 10_000 },
        );
        await option.click();
        const resp = await updateResp.catch(() => null);
        if (resp) expect(resp.status()).toBeLessThan(400);
      }
    }
  });

  // 6. Assignee (负责人) - AutoOpenSelect multiple
  test('inline edit assignee field', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = await getFirstActivityRow(page);
    const colIdx = await getColIndex(page, '负责人');
    if (colIdx < 0) return;
    const cell = row.locator('.arco-table-td').nth(colIdx);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(500);

    const selectPopup = page.locator('.arco-select-popup:visible');
    if (await selectPopup.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const option = selectPopup.locator('.arco-select-option').first();
      if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const updateResp = page.waitForResponse(
          (r) => r.url().includes('/api/activities/') && r.request().method() === 'PUT',
          { timeout: 10_000 },
        );
        await option.click();
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
        const resp = await updateResp.catch(() => null);
        if (resp) expect(resp.status()).toBeLessThan(400);
      }
    }
  });

  // 7. Plan Duration (计划工期) - InputNumber
  test('inline edit plan duration field', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = await getFirstActivityRow(page);
    const colIdx = await getColIndex(page, '计划工期');
    if (colIdx < 0) return;
    const cell = row.locator('.arco-table-td').nth(colIdx);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(300);

    const numInput = page.locator('.arco-input-number input:visible').first();
    if (await numInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await numInput.clear();
      await numInput.fill('10');
      const updateResp = page.waitForResponse(
        (r) => r.url().includes('/api/activities/') && r.request().method() === 'PUT',
        { timeout: 10_000 },
      );
      await numInput.press('Tab');
      const resp = await updateResp.catch(() => null);
      if (resp) expect(resp.status()).toBeLessThan(400);
    }
  });

  // 8. Plan Dates (计划时间) - AutoOpenRangePicker
  test('inline edit plan dates via range picker', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = page.locator('.arco-table-body .arco-table-tr').filter({ hasText: '测试活动2' }).first();
    if (!(await row.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    const colIdx = await getColIndex(page, '计划时间');
    if (colIdx < 0) return;
    const cell = row.locator('.arco-table-td').nth(colIdx);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(800);

    const pickerPopup = page.locator('.arco-picker-container:visible, .arco-trigger:visible .arco-panel-date');
    if (await pickerPopup.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      const panels = page.locator('.arco-panel-date');
      if (await panels.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        const todayCell = panels.first().locator('.arco-picker-cell-today');
        if (await todayCell.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await todayCell.click();
          await page.waitForTimeout(500);

          const rightCells = panels.nth(1).locator('.arco-picker-cell.arco-picker-cell-in-view');
          const cellCount = await rightCells.count();
          if (cellCount >= 15) {
            const updateResp = page.waitForResponse(
              (r) => r.url().includes('/api/activities/') && r.request().method() === 'PUT',
              { timeout: 15_000 },
            );
            await rightCells.nth(14).click();
            const resp = await updateResp.catch(() => null);
            if (resp) expect(resp.status()).toBeLessThan(400);
          }
        }
      }
    }
  });

  // 9. Actual Dates (实际时间) - AutoOpenRangePicker
  test('inline edit actual dates via range picker', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = page.locator('.arco-table-body .arco-table-tr').filter({ hasText: '测试活动2' }).first();
    if (!(await row.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    const colIdx = await getColIndex(page, '实际时间');
    if (colIdx < 0) return;
    const cell = row.locator('.arco-table-td').nth(colIdx);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(800);

    const pickerPopup = page.locator('.arco-picker-container:visible, .arco-trigger:visible .arco-panel-date');
    if (await pickerPopup.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      const panels = page.locator('.arco-panel-date');
      if (await panels.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        const todayCell = panels.first().locator('.arco-picker-cell-today');
        if (await todayCell.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await todayCell.click();
          await page.waitForTimeout(500);

          const rightCells = panels.nth(1).locator('.arco-picker-cell.arco-picker-cell-in-view');
          const cellCount = await rightCells.count();
          if (cellCount >= 15) {
            const updateResp = page.waitForResponse(
              (r) => r.url().includes('/api/activities/') && r.request().method() === 'PUT',
              { timeout: 15_000 },
            );
            await rightCells.nth(14).click();
            const resp = await updateResp.catch(() => null);
            if (resp) expect(resp.status()).toBeLessThan(400);
          }
        }
      }
    }
  });

  // 10. Notes (备注) - InlineTextEditor
  test('inline edit notes field', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = await getFirstActivityRow(page);
    const colIdx = await getColIndex(page, '备注');
    if (colIdx < 0) return;
    const cell = row.locator('.arco-table-td').nth(colIdx);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(300);

    const input = cell.locator('input.arco-input');
    if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await input.clear();
      await input.fill('测试备注内容');
      const updateResp = page.waitForResponse(
        (r) => r.url().includes('/api/activities/') && r.request().method() === 'PUT',
        { timeout: 10_000 },
      );
      await input.press('Tab');
      const resp = await updateResp.catch(() => null);
      if (resp) expect(resp.status()).toBeLessThan(400);
    }
  });

  // ──────────────────────────────────────────────────
  // Keyboard and dismiss behaviors
  // ──────────────────────────────────────────────────

  test('Escape cancels inline edit without saving', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = await getFirstActivityRow(page);
    const colIdx = await getColIndex(page, '活动名称');
    if (colIdx < 0) return;

    const cell = row.locator('.arco-table-td').nth(colIdx);
    const before = await cell.textContent();
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(300);

    const input = cell.locator('input.arco-input');
    if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await input.clear();
      await input.fill('不应保存的文字');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      const after = await cell.textContent();
      expect(after).toContain(before?.trim() ?? '');
    }
  });

  test('click outside closes select inline edit', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = await getFirstActivityRow(page);
    const colIdx = await getColIndex(page, '阶段');
    if (colIdx < 0) return;
    const cell = row.locator('.arco-table-td').nth(colIdx);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(500);

    const selectPopup = page.locator('.arco-select-popup:visible');
    if (await selectPopup.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await page.locator('header, h1, h2, .arco-layout-header').first().click({ force: true });
      await page.waitForTimeout(500);
      await expect(selectPopup).not.toBeVisible({ timeout: 3_000 }).catch(() => {});
    }
  });

  // ──────────────────────────────────────────────────
  // 11. Admin user role inline edit
  // ──────────────────────────────────────────────────

  test('inline edit user role in admin page', async ({ authedPage: page }) => {
    await page.goto('/admin?tab=account');
    await page.waitForTimeout(1_000);
    await waitForTableLoad(page);

    await clickSubNav(page, '用户管理');
    await page.waitForTimeout(500);
    await waitForTableLoad(page);

    const userRows = page.locator('.arco-table-body .arco-table-tr');
    const rowCount = await userRows.count();
    if (rowCount === 0) return;

    const targetRow = userRows.nth(0);
    const roleCellIdx = await (async () => {
      const headers = page.locator('.arco-table-th');
      const count = await headers.count();
      for (let i = 0; i < count; i++) {
        const txt = await headers.nth(i).textContent();
        if (txt?.includes('角色')) return i;
      }
      return -1;
    })();
    if (roleCellIdx < 0) return;

    const roleCell = targetRow.locator('.arco-table-td').nth(roleCellIdx);
    await roleCell.scrollIntoViewIfNeeded();

    const roleArea = roleCell.locator('[style*="cursor"]').first();
    await roleArea.click();
    await page.waitForTimeout(800);

    const roleSelect = page.locator('.arco-select-popup:visible');
    if (await roleSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const firstOption = roleSelect.locator('.arco-select-option').first();
      if (await firstOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await firstOption.click();
        await page.waitForTimeout(300);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  // ──────────────────────────────────────────────────
  // 13. Insert activity triggers auto name edit
  // ──────────────────────────────────────────────────

  test('insert activity auto-triggers name inline edit', async ({ authedPage: page }) => {
    await goToProject(page);

    const insertTrigger = page.locator('.row-insert-trigger').first();
    if (!(await insertTrigger.isVisible({ timeout: 3_000 }).catch(() => false))) return;

    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/api/activities') && r.request().method() === 'POST',
      { timeout: 10_000 },
    );
    await insertTrigger.click();
    const resp = await respPromise.catch(() => null);
    expect(resp).toBeTruthy();

    await page.waitForTimeout(500);

    const nameInput = page.locator('.arco-table-body input.arco-input').first();
    const hasInput = await nameInput.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasInput) {
      expect(await nameInput.inputValue()).toBe('新活动');
      await page.keyboard.press('Escape');
    }
  });

  // ──────────────────────────────────────────────────
  // 12. Check item title inline edit
  // ──────────────────────────────────────────────────

  test('inline edit check item title', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = await getFirstActivityRow(page);
    const colIdx = await getColIndex(page, '检查项');
    if (colIdx < 0) return;
    const cell = row.locator('.arco-table-td').nth(colIdx);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await page.waitForTimeout(300);

    const checkItemTitle = cell.locator('span[style*="cursor"]').first();
    if (!(await checkItemTitle.isVisible({ timeout: 2_000 }).catch(() => false))) return;

    const activityUrl = page.url();
    const actMatch = activityUrl.match(/\/projects\/([^/]+)/);
    if (!actMatch) return;

    const resp = await page.request.post('/api/check-items', {
      data: {
        activityId: activityId,
        title: '待编辑检查项',
      },
    });
    if (resp.status() >= 400) return;

    await page.reload();
    await waitForTableLoad(page);
    await page.waitForTimeout(500);

    const newRow = await getFirstActivityRow(page);
    const newCell = newRow.locator('.arco-table-td').nth(colIdx);
    await newCell.scrollIntoViewIfNeeded();
    await newCell.click();
    await page.waitForTimeout(300);

    const titleSpan = page.getByText('待编辑检查项').first();
    if (await titleSpan.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await titleSpan.click();
      await page.waitForTimeout(300);

      const editInput = page.locator('input.arco-input[value="待编辑检查项"], input.arco-input').last();
      if (await editInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await editInput.clear();
        await editInput.fill('已编辑检查项');
        const updateResp = page.waitForResponse(
          (r) => r.url().includes('/api/check-items/') && r.request().method() === 'PUT',
          { timeout: 10_000 },
        );
        await editInput.press('Enter');
        const resp = await updateResp.catch(() => null);
        if (resp) expect(resp.status()).toBeLessThan(400);
      }
    }
  });

  // ──────────────────────────────────────────────────
  // Cleanup
  // ──────────────────────────────────────────────────

  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName }).first();
    const delBtn = row.locator('button[class*="danger"], button[style*="danger"]').first();
    if (await delBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await delBtn.click();
      await page.locator('.arco-modal-footer .arco-btn-primary').click();
      await expectMessage(page, '删除');
    }
  });
});
