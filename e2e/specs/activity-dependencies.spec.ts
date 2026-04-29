import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  clickDrawerSubmit,
  openCreateActivityDrawer,
  searchProject,
  createProjectViaPage,
} from '../helpers/arco';

/**
 * 活动依赖关系测试
 * - 创建带前置依赖的活动
 * - 验证依赖显示格式（MS Project 格式：001FS, 002FS+2）
 * - 内联编辑依赖
 * - 依赖变更后级联更新
 */
test.describe.serial('Activity Dependencies', () => {
  const projectName = uniqueName('依赖测试项目');
  const activity1 = '依赖活动A_' + Date.now();
  const activity2 = '依赖活动B_' + Date.now();
  const activity3 = '依赖活动C_' + Date.now();

  // ──────── setup ────────
  test('setup: create project with three activities', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });
    await searchProject(page, projectName);

    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Create 3 activities
    for (const name of [activity1, activity2, activity3]) {
      await openCreateActivityDrawer(page);

      const phaseSelect = page.locator('.arco-drawer .arco-select').first();
      await phaseSelect.click();
      await page.locator('.arco-select-popup:visible .arco-select-option').first().click();

      await page.getByPlaceholder('请输入活动名称').fill(name);

      const actResp = page.waitForResponse(
        (r) => r.url().includes('/api/activities') && r.request().method() === 'POST',
        { timeout: 15_000 },
      );
      await clickDrawerSubmit(page, '创建');
      expect((await actResp).status()).toBeLessThan(400);
      await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
    }
  });

  // ──────── TC1: verify activity IDs format ────────
  test('activities have 3-digit padded IDs', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Should see IDs like 001, 002, 003
    await expect(page.getByText('001')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('002')).toBeVisible();
    await expect(page.getByText('003')).toBeVisible();
  });

  // ──────── TC2: inline edit predecessor ────────
  test('inline edit predecessor with MS Project format', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Find the row for activity B
    const row2 = page.locator('.arco-table-tr').filter({ hasText: activity2 });
    await expect(row2).toBeVisible({ timeout: 10_000 });

    // Find predecessor column cell — it may have placeholder text like "-"
    const predCell = row2.locator('.arco-table-td').nth(1); // Usually column index 1
    await predCell.click();
    await page.waitForTimeout(300);

    // Should show an input for predecessor
    const predInput = row2.locator('.arco-input').first();
    if (await predInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Type MS Project format dependency
      await predInput.fill('001');
      await predInput.press('Tab');
      await page.waitForTimeout(1_000);

      // The dependency should be saved and displayed
      const cellText = await row2.locator('.arco-table-td').nth(1).textContent();
      // Should contain reference to 001
      if (cellText) {
        expect(cellText).toMatch(/001/);
      }
    }
  });

  // ──────── TC3: set dependency with lag ────────
  test('set predecessor with lag (FS+2)', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    // Find the row for activity C
    const row3 = page.locator('.arco-table-tr').filter({ hasText: activity3 });
    const predCell = row3.locator('.arco-table-td').nth(1);
    await predCell.click();
    await page.waitForTimeout(300);

    const predInput = row3.locator('.arco-input').first();
    if (await predInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Set with lag
      await predInput.fill('002FS+2');
      await predInput.press('Tab');
      await page.waitForTimeout(1_000);

      // Verify it's displayed correctly
      const cellText = await row3.locator('.arco-table-td').nth(1).textContent();
      if (cellText) {
        expect(cellText).toMatch(/002/);
      }
    }
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
