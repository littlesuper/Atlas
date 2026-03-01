import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  clickTab,
  clickDrawerSubmit,
  pickDateRange,
  openCreateActivityDrawer,
  searchProject,
} from '../helpers/arco';

test.describe.serial('Project Snapshot Management', () => {
  const projectName = uniqueName('快照测试项目');
  const activityName1 = uniqueName('快照活动A');
  const activityName2 = uniqueName('快照活动B');
  const activityNotes = '这是一段测试备注，用于验证快照内容完整性';
  const snapshotRemark = '测试快照备注';

  // ──────── setup: create project ────────
  test('setup: create project', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '新建项目' }).click();
    await page.getByPlaceholder('请输入项目名称').fill(projectName);
    await pickDateRange(page);

    const managerSelect = page.locator('.arco-drawer .arco-select').filter({
      has: page.locator('[placeholder="项目经理"]'),
    });
    await managerSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
    await page.waitForTimeout(200);

    const resp = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/projects') && r.request().method() === 'POST',
        { timeout: 15_000 },
      ),
      clickDrawerSubmit(page, '创建'),
    ]).then(([r]) => r);
    expect(resp.status()).toBeLessThan(400);

    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  });

  // ──────── setup: add two activities ────────
  test('setup: add activities with notes', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Create activity 1
    await openCreateActivityDrawer(page);

    const phaseSelect = page.locator('.arco-drawer .arco-select').first();
    await phaseSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();

    await page.getByPlaceholder('请输入活动名称').fill(activityName1);
    await page.getByPlaceholder('请输入描述').fill('活动A描述');

    // Fill notes field
    const notesInput = page.locator('.arco-drawer').getByPlaceholder('请输入备注');
    if (await notesInput.isVisible()) {
      await notesInput.fill(activityNotes);
    }

    const resp1 = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/activities') && r.request().method() === 'POST',
        { timeout: 15_000 },
      ),
      clickDrawerSubmit(page, '创建'),
    ]).then(([r]) => r);
    expect(resp1.status()).toBeLessThan(400);
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(activityName1)).toBeVisible({ timeout: 10_000 });

    // Create activity 2
    await openCreateActivityDrawer(page);

    const phaseSelect2 = page.locator('.arco-drawer .arco-select').first();
    await phaseSelect2.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();

    await page.getByPlaceholder('请输入活动名称').fill(activityName2);

    const resp2 = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/activities') && r.request().method() === 'POST',
        { timeout: 15_000 },
      ),
      clickDrawerSubmit(page, '创建'),
    ]).then(([r]) => r);
    expect(resp2.status()).toBeLessThan(400);
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(activityName2)).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC1: open snapshots tab ────────
  test('TC1: snapshots tab shows empty state', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Switch to snapshots tab
    await clickTab(page, '项目快照');
    await page.waitForTimeout(500);

    // Should show "共 0 个快照"
    await expect(page.getByText('共 0 个快照')).toBeVisible({ timeout: 5_000 });

    // Should show empty state
    await expect(page.locator('.arco-empty')).toBeVisible();

    // Should show "创建快照" button
    await expect(page.getByRole('button', { name: '创建快照' })).toBeVisible();
  });

  // ──────── TC2: create snapshot ────────
  test('TC2: create snapshot', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '项目快照');
    await page.waitForTimeout(500);

    // Click "创建快照"
    await page.getByRole('button', { name: '创建快照' }).click();

    // Modal should appear
    const modal = page.locator('.arco-modal').filter({ hasText: '创建项目快照' });
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Should show description text
    await expect(modal.getByText('快照将保存项目当前的所有数据')).toBeVisible();

    // Click "创建" to submit (no remark)
    const createResp = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/snapshot') && r.request().method() === 'POST',
        { timeout: 15_000 },
      ),
      modal.getByRole('button', { name: '创建' }).click(),
    ]).then(([r]) => r);
    expect(createResp.status()).toBeLessThan(400);

    await expectMessage(page, '快照创建成功');

    // Should now show "共 1 个快照"
    await expect(page.getByText('共 1 个快照')).toBeVisible({ timeout: 5_000 });

    // Timeline should have an entry with "查看" button
    await expect(page.getByRole('button', { name: '查看' })).toBeVisible();
  });

  // ──────── TC3: create snapshot with remark ────────
  test('TC3: create snapshot with remark', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '项目快照');
    await page.waitForTimeout(500);

    // Click "创建快照"
    await page.getByRole('button', { name: '创建快照' }).click();

    const modal = page.locator('.arco-modal').filter({ hasText: '创建项目快照' });
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Fill in remark
    await modal.locator('textarea').fill(snapshotRemark);

    const createResp = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/snapshot') && r.request().method() === 'POST',
        { timeout: 15_000 },
      ),
      modal.getByRole('button', { name: '创建' }).click(),
    ]).then(([r]) => r);
    expect(createResp.status()).toBeLessThan(400);

    await expectMessage(page, '快照创建成功');

    // Should now show "共 2 个快照"
    await expect(page.getByText('共 2 个快照')).toBeVisible({ timeout: 5_000 });

    // Remark should be visible as a Tag
    await expect(page.getByText(snapshotRemark)).toBeVisible();
  });

  // ──────── TC4: view snapshot via route navigation ────────
  test('TC4: view snapshot navigates to read-only page', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '项目快照');
    await page.waitForTimeout(500);

    // Click "查看" on the first snapshot (most recent, which has the remark)
    const viewButtons = page.getByRole('button', { name: '查看' });
    await viewButtons.first().click();

    // Should navigate to snapshot route
    await expect(page).toHaveURL(/\/projects\/.+\/snapshot\/.+/, { timeout: 10_000 });
    await page.waitForTimeout(1_500);
  });

  // ──────── TC5: snapshot banner displays correctly ────────
  test('TC5: snapshot banner shows time and return button', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '项目快照');
    await page.waitForTimeout(500);

    // Click "查看" on a snapshot
    await page.getByRole('button', { name: '查看' }).first().click();
    await expect(page).toHaveURL(/\/projects\/.+\/snapshot\/.+/, { timeout: 10_000 });
    await page.waitForTimeout(1_500);

    // Blue banner should be visible
    const banner = page.locator('.arco-alert');
    await expect(banner).toBeVisible({ timeout: 5_000 });

    // Banner should contain "您正在查看" text
    await expect(banner.getByText('您正在查看')).toBeVisible();

    // Banner should contain "所有内容为只读" text
    await expect(banner.getByText('所有内容为只读')).toBeVisible();

    // Return button should be visible
    await expect(banner.getByRole('button', { name: '返回项目' })).toBeVisible();

    // Should NOT show archive warning
    await expect(page.getByText('该项目已归档')).not.toBeVisible();
  });

  // ──────── TC6: snapshot is read-only (no edit/delete buttons) ────────
  test('TC6: snapshot mode hides editing controls', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '项目快照');
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: '查看' }).first().click();
    await expect(page).toHaveURL(/\/projects\/.+\/snapshot\/.+/, { timeout: 10_000 });
    await page.waitForTimeout(1_500);

    // "活动" dropdown button (new/import/export) should not have new/import options
    // The "新建活动" and "批量导入" menu items should be hidden
    const activityDropdown = page.getByRole('button', { name: /活动/ });
    if (await activityDropdown.isVisible().catch(() => false)) {
      await activityDropdown.click();
      await page.waitForTimeout(300);
      await expect(page.getByText('新建活动')).not.toBeVisible();
      await expect(page.getByText('批量导入')).not.toBeVisible();
    }

    // Edit/delete icons in actions column should not be visible
    const editIcons = page.locator('.arco-table-td .arco-icon-edit');
    const deleteIcons = page.locator('.arco-table-td .arco-icon-delete');
    await expect(editIcons).toHaveCount(0);
    await expect(deleteIcons).toHaveCount(0);

    // Scheduling and Snapshots tabs should be hidden
    await expect(page.locator('.arco-tabs-tab').filter({ hasText: '排期工具' })).not.toBeVisible();
    await expect(page.locator('.arco-tabs-tab').filter({ hasText: '项目快照' })).not.toBeVisible();
  });

  // ──────── TC7: snapshot shows activity data ────────
  test('TC7: snapshot activity list shows correct data', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '项目快照');
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: '查看' }).first().click();
    await expect(page).toHaveURL(/\/projects\/.+\/snapshot\/.+/, { timeout: 10_000 });
    await page.waitForTimeout(1_500);

    // Activity table should be visible (activity list is the default tab in snapshot mode)
    const table = page.locator('.arco-table');
    await expect(table).toBeVisible({ timeout: 5_000 });

    // Both activities should be in the snapshot
    await expect(page.getByText(activityName1)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(activityName2)).toBeVisible({ timeout: 5_000 });
  });

  // ──────── TC8: return navigation works correctly ────────
  test('TC8: return from snapshot goes back to project snapshots tab', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '项目快照');
    await page.waitForTimeout(500);

    // Navigate to snapshot
    await page.getByRole('button', { name: '查看' }).first().click();
    await expect(page).toHaveURL(/\/projects\/.+\/snapshot\/.+/, { timeout: 10_000 });
    await page.waitForTimeout(1_500);

    // Click "返回项目" in the banner
    await page.getByRole('button', { name: '返回项目' }).click();

    // Should navigate back to project detail with snapshots tab
    await expect(page).toHaveURL(/\/projects\/[^/]+\?tab=snapshots/, { timeout: 10_000 });
    await page.waitForTimeout(1_000);

    // Snapshots tab should be active
    await expect(page.getByText('共 2 个快照')).toBeVisible({ timeout: 5_000 });

    // Click the main return button (back to project list)
    const returnBtn = page.locator('button').filter({ has: page.locator('.arco-icon-left') }).first();
    await returnBtn.click();

    // Should navigate to projects list, NOT back to snapshot
    await expect(page).toHaveURL(/\/projects$/, { timeout: 10_000 });
  });

  // ──────── TC9: snapshot tabs show data ────────
  test('TC9: snapshot sub-tabs load correctly', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '项目快照');
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: '查看' }).first().click();
    await expect(page).toHaveURL(/\/projects\/.+\/snapshot\/.+/, { timeout: 10_000 });
    await page.waitForTimeout(1_500);

    // Switch to milestones tab
    await clickTab(page, '里程碑');
    await page.waitForTimeout(500);
    // Milestones tab content should render (empty or with data)
    const milestonesContent = page.locator('.arco-tabs-content-item-active');
    await expect(milestonesContent).toBeVisible();

    // Switch to gantt tab
    await clickTab(page, '甘特图');
    await page.waitForTimeout(500);

    // Switch to risk tab
    await clickTab(page, 'AI风险评估');
    await page.waitForTimeout(500);

    // Switch to products tab
    await clickTab(page, '产品列表');
    await page.waitForTimeout(500);

    // Switch to weekly reports tab
    await clickTab(page, '项目周报');
    await page.waitForTimeout(500);

    // Switch back to activities — data should still be visible
    await clickTab(page, '活动列表');
    await page.waitForTimeout(1_000);
    // The status filter counts should reflect our activities
    await expect(page.getByText('未开始 2')).toBeVisible({ timeout: 10_000 });
  });

  // ──────── cleanup: delete test project ────────
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
