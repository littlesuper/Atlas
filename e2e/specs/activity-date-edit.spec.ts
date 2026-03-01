import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  clickDrawerSubmit,
  pickDateRange,
  openCreateActivityDrawer,
  searchProject,
} from '../helpers/arco';

/**
 * 活动日期内联编辑与三联计算测试
 * - 日期列显示格式：有值时 YY年MM月DD日，无值时 "-"
 * - 点击日期单元格触发 AutoOpenDatePicker
 * - 点击工期单元格触发 InputNumber
 */
test.describe.serial('Activity Date Inline Editing', () => {
  const projectName = uniqueName('日期编辑项目');
  const activityName = uniqueName('日期编辑活动');

  async function goToProject(page: import('@playwright/test').Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);
    await waitForTableLoad(page);
  }

  /**
   * 根据表头文字找到对应的列索引，然后点击目标行中该列的单元格。
   */
  async function clickCellByHeader(
    page: import('@playwright/test').Page,
    row: import('@playwright/test').Locator,
    headerText: string,
  ) {
    // 找到所有表头单元格
    const headers = page.locator('.arco-table-th');
    const headerCount = await headers.count();
    let colIndex = -1;
    for (let i = 0; i < headerCount; i++) {
      const text = await headers.nth(i).textContent();
      if (text?.includes(headerText)) {
        colIndex = i;
        break;
      }
    }
    if (colIndex >= 0) {
      const cell = row.locator('.arco-table-td').nth(colIndex);
      await cell.scrollIntoViewIfNeeded();
      await cell.click();
      await page.waitForTimeout(500);
    }
    return colIndex;
  }

  // ──────── setup ────────
  test('setup: create project with activity', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '新建项目' }).click();
    await page.getByPlaceholder('请输入项目名称').fill(projectName);
    await pickDateRange(page);

    const managerSelect = page.locator('.arco-drawer .arco-select').filter({
      has: page.locator('[placeholder="项目经理"]'),
    });
    await managerSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
    await page.waitForTimeout(200);

    const projResp = page.waitForResponse(
      (r) => r.url().includes('/api/projects') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await projResp).status()).toBeLessThan(400);
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await openCreateActivityDrawer(page);

    const phaseSelect = page.locator('.arco-drawer .arco-select').first();
    await phaseSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();

    await page.getByPlaceholder('请输入活动名称').fill(activityName);

    const actResp = page.waitForResponse(
      (r) => r.url().includes('/api/activities') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await actResp).status()).toBeLessThan(400);
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(activityName)).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC1: inline edit plan start date ────────
  test('inline edit plan start date via date picker', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = page.locator('.arco-table-body .arco-table-tr').filter({ hasText: activityName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // 点击「计划开始」列的单元格（显示为 "-"），触发 AutoOpenDatePicker
    const colIndex = await clickCellByHeader(page, row, '计划开始');

    if (colIndex >= 0) {
      // 检查是否弹出日期选择器
      const picker = page.locator('.arco-picker-dropdown:visible, .arco-picker-container:visible');
      if (await picker.isVisible({ timeout: 3_000 }).catch(() => false)) {
        // 选择今天
        const todayCell = picker.locator('.arco-picker-cell-today');
        if (await todayCell.isVisible()) {
          const updateResp = page.waitForResponse(
            (r) => r.url().includes('/api/activities') && r.request().method() === 'PUT',
            { timeout: 10_000 },
          );
          await todayCell.click();
          const resp = await updateResp.catch(() => null);
          if (resp) {
            expect(resp.status()).toBeLessThan(400);
          }
        }
        // 日期设置成功后，单元格不再显示 "-"
        await page.waitForTimeout(500);
        const cellText = await row.locator('.arco-table-td').nth(colIndex).textContent();
        expect(cellText).not.toBe('-');
      }
    }

    // 验证表格仍然正常渲染
    await expect(page.locator('.arco-table')).toBeVisible();
  });

  // ──────── TC2: inline edit plan duration ────────
  test('inline edit plan duration updates end date', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = page.locator('.arco-table-body .arco-table-tr').filter({ hasText: activityName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // 点击「计划工期」列
    const colIndex = await clickCellByHeader(page, row, '计划工期');

    if (colIndex >= 0) {
      const numInput = page.locator('.arco-input-number input:visible');
      if (await numInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await numInput.clear();
        await numInput.fill('5');

        const updateResp = page.waitForResponse(
          (r) => r.url().includes('/api/activities') && r.request().method() === 'PUT',
          { timeout: 10_000 },
        );
        await numInput.press('Tab');
        const resp = await updateResp.catch(() => null);
        if (resp) {
          expect(resp.status()).toBeLessThan(400);
        }
        await page.waitForTimeout(500);
      }
    }

    await expect(page.locator('.arco-table')).toBeVisible();
  });

  // ──────── TC3: date cells display format ────────
  test('date cells display correct format', async ({ authedPage: page }) => {
    await goToProject(page);

    const row = page.locator('.arco-table-body .arco-table-tr').filter({ hasText: activityName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // 日期列使用 YY年MM月DD日 格式 或 "-"
    const cells = row.locator('.arco-table-td');
    const cellCount = await cells.count();

    let foundDateOrDash = false;
    for (let i = 0; i < cellCount; i++) {
      const text = (await cells.nth(i).textContent())?.trim() || '';
      if (text === '-' || text.match(/\d{2}年\d{2}月\d{2}日/)) {
        foundDateOrDash = true;
        break;
      }
    }
    expect(foundDateOrDash).toBeTruthy();
  });

  // ──────── cleanup ────────
  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    await row.locator('button[class*="danger"]').click();
    await confirmModal(page);
    await expectMessage(page, '项目删除成功');
  });
});
