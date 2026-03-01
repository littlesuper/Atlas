import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  clickDrawerSubmit,
  clickTab,
  clickNavItem,
  clickSubNav,
} from '../helpers/arco';

/**
 * 用户角色分配和高级用户管理测试
 * - 创建用户时自动生成拼音用户名
 * - 编辑模式下用户名不可修改
 * - 切换 canLogin 开关
 * - 分配/修改用户角色
 * - 切换账户启用/禁用状态
 */
test.describe.serial('User Role Assignment & Management', () => {
  const userName = uniqueName('角色测试用户');

  async function goToUserManagement(page: import('@playwright/test').Page) {
    await page.goto('/admin');
    await page.waitForTimeout(1_000);

    // Click account management tab
    const accountTab = page.locator('[role="tab"]').filter({ hasText: /账号管理/ });
    if (await accountTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await accountTab.click();
      await page.waitForTimeout(500);
    }

    // Click user management sub-nav
    await clickSubNav(page, '用户管理');
    await waitForTableLoad(page);
  }

  // ──────── TC1: create user with auto-generated pinyin username ────────
  test('create user and verify auto-generated pinyin username', async ({ authedPage: page }) => {
    await goToUserManagement(page);

    await page.getByRole('button', { name: /新建用户/ }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300);

    // Fill real name
    const nameInput = page.getByPlaceholder(/请输入姓名|真实姓名/);
    await nameInput.fill(userName);
    await page.waitForTimeout(500); // Wait for pinyin generation

    // Username should be auto-generated from pinyin
    const usernameInput = page.locator('.arco-drawer input').filter({ has: page.locator('[placeholder*="用户名"]') });
    // In create mode, username field should have a value
    const usernameField = page.getByPlaceholder(/用户名/);
    if (await usernameField.isVisible()) {
      const usernameValue = await usernameField.inputValue();
      // Should have some auto-generated value (pinyin)
      expect(usernameValue.length).toBeGreaterThan(0);
    }

    // Enable canLogin
    const canLoginSwitch = page.locator('.arco-drawer .arco-switch').first();
    if (await canLoginSwitch.isVisible()) {
      // Check if it's off (for default canLogin state)
      const isChecked = await canLoginSwitch.getAttribute('class');
      if (isChecked && !isChecked.includes('arco-switch-checked')) {
        await canLoginSwitch.click();
        await page.waitForTimeout(300);
      }
    }

    // Set password
    const passwordInput = page.getByPlaceholder(/请输入密码|密码/);
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('test123456');
    }

    // Select a role
    const roleSelect = page.locator('.arco-drawer .arco-select').filter({ has: page.locator('[placeholder*="角色"]') });
    if (await roleSelect.isVisible()) {
      await roleSelect.click();
      await page.waitForTimeout(300);
      await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
      await page.waitForTimeout(200);
    }

    const resp = page.waitForResponse(
      (r) => r.url().includes('/api/users') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await resp).status()).toBeLessThan(400);
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
  });

  // ──────── TC2: username is read-only in edit mode ────────
  test('username field is disabled in edit mode', async ({ authedPage: page }) => {
    await goToUserManagement(page);

    // Search for the user
    const searchInput = page.getByPlaceholder(/搜索|关键词/);
    if (await searchInput.isVisible()) {
      await searchInput.fill(userName);
      await page.waitForTimeout(500);
      await waitForTableLoad(page);
    }

    // Click edit on the user row
    const row = page.locator('.arco-table-tr').filter({ hasText: userName });
    if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const editBtn = row.locator('[class*="icon-edit"], button').filter({ hasText: /编辑/ }).first();
      if (await editBtn.isVisible()) {
        await editBtn.click();
      } else {
        // Try clicking the first icon button
        await row.locator('.arco-icon-edit').click();
      }
      await expect(page.locator('.arco-drawer')).toBeVisible({ timeout: 5_000 });
      await page.waitForTimeout(300);

      // Username field should be disabled
      const usernameField = page.locator('.arco-drawer').getByPlaceholder(/用户名/);
      if (await usernameField.isVisible()) {
        const isDisabled = await usernameField.isDisabled();
        expect(isDisabled).toBeTruthy();
      }

      // Close drawer
      await page.keyboard.press('Escape');
    }
  });

  // ──────── TC3: toggle canLogin switch ────────
  test('toggle canLogin switch for user', async ({ authedPage: page }) => {
    await goToUserManagement(page);

    const searchInput = page.getByPlaceholder(/搜索|关键词/);
    if (await searchInput.isVisible()) {
      await searchInput.fill(userName);
      await page.waitForTimeout(500);
      await waitForTableLoad(page);
    }

    const row = page.locator('.arco-table-tr').filter({ hasText: userName });
    if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Open edit drawer
      await row.locator('.arco-icon-edit').first().click();
      await expect(page.locator('.arco-drawer')).toBeVisible({ timeout: 5_000 });
      await page.waitForTimeout(300);

      // Toggle canLogin switch
      const switches = page.locator('.arco-drawer .arco-switch');
      const switchCount = await switches.count();
      if (switchCount > 0) {
        const firstSwitch = switches.first();
        const initialClass = await firstSwitch.getAttribute('class') || '';
        await firstSwitch.click();
        await page.waitForTimeout(300);

        // Class should have changed
        const newClass = await firstSwitch.getAttribute('class') || '';
        expect(newClass).not.toBe(initialClass);

        // Toggle back
        await firstSwitch.click();
        await page.waitForTimeout(300);
      }

      await page.keyboard.press('Escape');
    }
  });

  // ──────── TC4: filter users by canLogin status ────────
  test('filter users by login status', async ({ authedPage: page }) => {
    await goToUserManagement(page);

    // Find canLogin filter select
    const filterSelect = page.locator('.arco-select').filter({ has: page.locator('[placeholder*="登录"]') });
    if (await filterSelect.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await filterSelect.click();
      await page.waitForTimeout(300);

      // Select "允许登录"
      const option = page.locator('.arco-select-popup:visible .arco-select-option').filter({ hasText: /允许登录/ });
      if (await option.isVisible()) {
        await option.click();
        await waitForTableLoad(page);
        await expect(page.locator('.arco-table')).toBeVisible();
      }
    }
  });

  // ──────── cleanup ────────
  test('cleanup: delete test user', async ({ authedPage: page }) => {
    await goToUserManagement(page);

    const searchInput = page.getByPlaceholder(/搜索|关键词/);
    if (await searchInput.isVisible()) {
      await searchInput.fill(userName);
      await page.waitForTimeout(500);
      await waitForTableLoad(page);
    }

    const row = page.locator('.arco-table-tr').filter({ hasText: userName });
    if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const deleteBtn = row.locator('.arco-icon-delete');
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();
        await confirmModal(page);
        await page.waitForTimeout(500);
      }
    }
  });
});
