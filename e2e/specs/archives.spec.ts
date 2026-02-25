import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  clickDrawerSubmit,
  pickDateRange,
} from '../helpers/arco';

test.describe.serial('Activity Archive Management', () => {
  const projectName = uniqueName('归档测试项目');
  const activityName1 = uniqueName('归档活动A');
  const activityName2 = uniqueName('归档活动B');
  const activityNotes = '这是一段测试备注，用于验证归档内容完整性';

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
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  });

  // ──────── setup: add two activities ────────
  test('setup: add activities with notes', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Create activity 1
    await page.getByRole('button', { name: '新建活动' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible();

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
    await page.getByRole('button', { name: '新建活动' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible();

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

  // ──────── TC1: open archive drawer via settings ────────
  test('TC1: open archive drawer from column settings', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Open column settings popover (the ⋮ icon button)
    const settingsBtn = page.locator('button').filter({ has: page.locator('svg.arco-icon-more-vertical') });
    await settingsBtn.click();
    await page.waitForTimeout(300);

    // Click "归档管理" inside the popover
    await page.getByText('归档管理').click();
    await page.waitForTimeout(500);

    // Archive drawer should be visible
    const archiveDrawer = page.locator('.arco-drawer').filter({ hasText: '归档管理' });
    await expect(archiveDrawer).toBeVisible({ timeout: 5_000 });

    // Should show "共 0 个归档"
    await expect(archiveDrawer.getByText('共 0 个归档')).toBeVisible();

    // Should show empty state
    await expect(archiveDrawer.locator('.arco-empty')).toBeVisible();

    // Close the drawer
    await archiveDrawer.locator('.arco-drawer-close-icon').click();
    await expect(archiveDrawer).not.toBeVisible({ timeout: 3_000 });
  });

  // ──────── TC2: create archive snapshot ────────
  test('TC2: create archive snapshot', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Open archive drawer
    const settingsBtn = page.locator('button').filter({ has: page.locator('svg.arco-icon-more-vertical') });
    await settingsBtn.click();
    await page.waitForTimeout(300);
    await page.getByText('归档管理').click();
    await page.waitForTimeout(500);

    const archiveDrawer = page.locator('.arco-drawer').filter({ hasText: '归档管理' });
    await expect(archiveDrawer).toBeVisible({ timeout: 5_000 });

    // Click "创建归档" to open the creation modal
    await archiveDrawer.getByRole('button', { name: '创建归档' }).click();

    // Wait for the modal to appear
    const modal = page.locator('.arco-modal').filter({ hasText: '创建归档' });
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Click "创建" in the modal to submit
    const createResp = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/archives') && r.request().method() === 'POST',
        { timeout: 15_000 },
      ),
      modal.getByRole('button', { name: '创建' }).click(),
    ]).then(([r]) => r);
    expect(createResp.status()).toBeLessThan(400);

    await expectMessage(page, '归档创建成功');

    // Should now show "共 1 个归档"
    await expect(archiveDrawer.getByText('共 1 个归档')).toBeVisible({ timeout: 5_000 });

    // Left panel should have the archive entry with "2 个活动"
    await expect(archiveDrawer.getByText('2 个活动')).toBeVisible();
  });

  // ──────── TC3: view archive detail — layout and content ────────
  test('TC3: view archive detail with full columns', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Open archive drawer
    const settingsBtn = page.locator('button').filter({ has: page.locator('svg.arco-icon-more-vertical') });
    await settingsBtn.click();
    await page.waitForTimeout(300);
    await page.getByText('归档管理').click();
    await page.waitForTimeout(500);

    const archiveDrawer = page.locator('.arco-drawer').filter({ hasText: '归档管理' });
    await expect(archiveDrawer).toBeVisible({ timeout: 5_000 });

    // Click the archive entry in the left panel
    await archiveDrawer.getByText('2 个活动').click();
    await page.waitForTimeout(1_000);

    // Wait for the detail table to load
    const detailTable = archiveDrawer.locator('.arco-table');
    await expect(detailTable).toBeVisible({ timeout: 10_000 });

    // Verify table has correct column headers
    // Arco Table with scroll renders a separate header table in .arco-table-header
    const headerContainer = archiveDrawer.locator('.arco-table-header, .arco-table thead').first();
    const headerTexts = ['ID', '阶段', '活动名称', '类型', '状态', '负责人', '计划工期', '计划时间', '实际时间', '备注'];
    for (const headerText of headerTexts) {
      await expect(headerContainer.getByText(headerText, { exact: false })).toBeVisible();
    }

    // Verify table body has 2 rows (the 2 activities)
    const rows = detailTable.locator('tbody tr.arco-table-tr');
    await expect(rows).toHaveCount(2);

    // Verify activity names are present in the table
    await expect(detailTable.getByText(activityName1)).toBeVisible();
    await expect(detailTable.getByText(activityName2)).toBeVisible();
  });

  // ──────── TC4: archive drawer layout — height and scroll ────────
  test('TC4: archive drawer has proper height and scrollable layout', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Open archive drawer
    const settingsBtn = page.locator('button').filter({ has: page.locator('svg.arco-icon-more-vertical') });
    await settingsBtn.click();
    await page.waitForTimeout(300);
    await page.getByText('归档管理').click();
    await page.waitForTimeout(500);

    const archiveDrawer = page.locator('.arco-drawer').filter({ hasText: '归档管理' });
    await expect(archiveDrawer).toBeVisible({ timeout: 5_000 });

    // Click archive entry
    await archiveDrawer.getByText('2 个活动').click();
    await page.waitForTimeout(1_000);

    // The table in the right panel should be visible
    const table = archiveDrawer.locator('.arco-table').first();
    await expect(table).toBeVisible({ timeout: 5_000 });
    const tableBox = await table.boundingBox();
    expect(tableBox).toBeTruthy();

    // Table should have a reasonable height (header + 2 rows ≈ 90-120px)
    expect(tableBox!.height).toBeGreaterThan(80);

    // The table should not overflow beyond the viewport
    const viewportHeight = page.viewportSize()?.height ?? 720;
    expect(tableBox!.y + tableBox!.height).toBeLessThanOrEqual(viewportHeight + 20);

    // The left panel archive entry should still be visible (not pushed off-screen)
    await expect(archiveDrawer.getByText('2 个活动').first()).toBeVisible();

    // The drawer width should use most of viewport width (85vw)
    const viewportWidth = page.viewportSize()?.width ?? 1280;
    const drawerBox = await archiveDrawer.boundingBox();
    expect(drawerBox).toBeTruthy();
    expect(drawerBox!.width).toBeGreaterThan(viewportWidth * 0.7);
  });

  // ──────── TC5: create second archive ────────
  test('TC5: create multiple archives', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Open archive drawer
    const settingsBtn = page.locator('button').filter({ has: page.locator('svg.arco-icon-more-vertical') });
    await settingsBtn.click();
    await page.waitForTimeout(300);
    await page.getByText('归档管理').click();
    await page.waitForTimeout(500);

    const archiveDrawer = page.locator('.arco-drawer').filter({ hasText: '归档管理' });
    await expect(archiveDrawer).toBeVisible({ timeout: 5_000 });

    // Create a second archive — click button to open modal first
    await archiveDrawer.getByRole('button', { name: '创建归档' }).click();

    const modal = page.locator('.arco-modal').filter({ hasText: '创建归档' });
    await expect(modal).toBeVisible({ timeout: 5_000 });

    const createResp = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/archives') && r.request().method() === 'POST',
        { timeout: 15_000 },
      ),
      modal.getByRole('button', { name: '创建' }).click(),
    ]).then(([r]) => r);
    expect(createResp.status()).toBeLessThan(400);

    await expectMessage(page, '归档创建成功');

    // Should now show "共 2 个归档"
    await expect(archiveDrawer.getByText('共 2 个归档')).toBeVisible({ timeout: 5_000 });

    // Left panel should have exactly 2 "2 个活动" entries
    const archiveEntries = archiveDrawer.getByText('2 个活动');
    await expect(archiveEntries).toHaveCount(2);
  });

  // ──────── TC6: switch between archives ────────
  test('TC6: switch between archives in left panel', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Open archive drawer
    const settingsBtn = page.locator('button').filter({ has: page.locator('svg.arco-icon-more-vertical') });
    await settingsBtn.click();
    await page.waitForTimeout(300);
    await page.getByText('归档管理').click();
    await page.waitForTimeout(500);

    const archiveDrawer = page.locator('.arco-drawer').filter({ hasText: '归档管理' });
    await expect(archiveDrawer).toBeVisible({ timeout: 5_000 });

    // Click first archive entry
    const entries = archiveDrawer.getByText('2 个活动');
    await entries.first().click();
    await page.waitForTimeout(1_000);

    // Table should be visible
    await expect(archiveDrawer.locator('.arco-table')).toBeVisible({ timeout: 5_000 });

    // Click second archive entry
    await entries.nth(1).click();
    await page.waitForTimeout(1_000);

    // Table should still be visible (different archive loaded)
    await expect(archiveDrawer.locator('.arco-table')).toBeVisible({ timeout: 5_000 });
  });

  // ──────── TC7: delete archive ────────
  test('TC7: delete archive', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Open archive drawer
    const settingsBtn = page.locator('button').filter({ has: page.locator('svg.arco-icon-more-vertical') });
    await settingsBtn.click();
    await page.waitForTimeout(300);
    await page.getByText('归档管理').click();
    await page.waitForTimeout(500);

    const archiveDrawer = page.locator('.arco-drawer').filter({ hasText: '归档管理' });
    await expect(archiveDrawer).toBeVisible({ timeout: 5_000 });

    // Should start with 2 archives
    await expect(archiveDrawer.getByText('共 2 个归档')).toBeVisible({ timeout: 5_000 });

    // Click "删除" on the first archive
    const deleteResp = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/archives/') && r.request().method() === 'DELETE',
        { timeout: 15_000 },
      ),
      archiveDrawer.getByRole('button', { name: '删除' }).first().click(),
    ]).then(([r]) => r);
    expect(deleteResp.status()).toBeLessThan(400);

    await expectMessage(page, '已删除归档');

    // Should now show "共 1 个归档"
    await expect(archiveDrawer.getByText('共 1 个归档')).toBeVisible({ timeout: 5_000 });
  });

  // ──────── TC8: delete all archives → empty state ────────
  test('TC8: delete all archives shows empty state', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Open archive drawer
    const settingsBtn = page.locator('button').filter({ has: page.locator('svg.arco-icon-more-vertical') });
    await settingsBtn.click();
    await page.waitForTimeout(300);
    await page.getByText('归档管理').click();
    await page.waitForTimeout(500);

    const archiveDrawer = page.locator('.arco-drawer').filter({ hasText: '归档管理' });
    await expect(archiveDrawer).toBeVisible({ timeout: 5_000 });

    // Delete the remaining archive
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/archives/') && r.request().method() === 'DELETE',
        { timeout: 15_000 },
      ),
      archiveDrawer.getByRole('button', { name: '删除' }).first().click(),
    ]);

    await expectMessage(page, '已删除归档');

    // Should show empty state
    await expect(archiveDrawer.getByText('共 0 个归档')).toBeVisible({ timeout: 5_000 });
    await expect(archiveDrawer.locator('.arco-empty')).toBeVisible();
  });

  // ──────── cleanup: delete test project ────────
  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    await row.locator('button[class*="danger"]').click();
    await confirmModal(page);
    await expectMessage(page, '项目删除成功');
  });
});
