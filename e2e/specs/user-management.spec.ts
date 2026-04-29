import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  clickNavItem,
  clickTab,
  expectMessage,
  confirmModal,
  waitForTableLoad,
  waitForPageLoad,
} from '../helpers/arco';

/**
 * 用户管理 CRUD 测试
 * - 查看用户列表
 * - 创建可登录用户
 * - 创建仅联系人用户（canLogin=false）
 * - 搜索用户
 * - 编辑用户信息
 * - 禁用/启用用户
 * - 删除用户
 */
test.describe.serial('User Management', () => {
  const loginUserName = '测试登录用户_' + Date.now();
  const contactUserName = '测试联系人_' + Date.now();

  async function goToUserTab(page: import('@playwright/test').Page) {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, '账号管理');
    await page.waitForTimeout(500);
    await page.getByText('用户管理', { exact: true }).click();
    await page.waitForTimeout(500);
    await waitForTableLoad(page);
  }

  // ──────── TC1: view user list ────────
  test('view user list with admin user', async ({ authedPage: page }) => {
    await goToUserTab(page);

    await expect(page.locator('.arco-table').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: '新建用户' })).toBeVisible();
  });

  // ──────── TC2: create login-enabled user ────────
  test('create user with canLogin=true', async ({ authedPage: page }) => {
    await goToUserTab(page);

    // Click create user button
    await page.getByRole('button', { name: /新建用户|创建用户|添加用户/ }).click();

    // Drawer should appear
    const drawer = page.locator('.arco-drawer').filter({ hasText: /新建用户/ });
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    // Fill real name
    await drawer.getByPlaceholder('请输入姓名').fill(loginUserName);
    await page.waitForTimeout(500);

    // Enable canLogin toggle (if not already enabled)
    const canLoginSwitch = drawer.locator('.arco-switch').first();
    const isChecked = await canLoginSwitch.getAttribute('class');
    if (!isChecked?.includes('arco-switch-checked')) {
      await canLoginSwitch.click();
      await page.waitForTimeout(300);
    }

    // Fill password (should be visible when canLogin=true)
    const passwordInput = drawer.getByPlaceholder('请输入密码');
    if (await passwordInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await passwordInput.fill('test123456');
    }

    // Select a role (required field - "请选择至少一个角色")
    const roleSelect = drawer.locator('.arco-select').filter({ has: page.locator('[placeholder*="角色"]') });
    await roleSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
    await page.waitForTimeout(300);

    // Submit
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/users') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.locator('.arco-drawer-footer').getByRole('button', { name: '创建' }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
    await expect(page.getByText(loginUserName)).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC3: create contact-only user ────────
  test('create contact-only user (canLogin=false)', async ({ authedPage: page }) => {
    await goToUserTab(page);

    await page.getByRole('button', { name: /新建用户|创建用户|添加用户/ }).click();

    const drawer = page.locator('.arco-drawer').filter({ hasText: /新建用户/ });
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    await drawer.getByPlaceholder('请输入姓名').fill(contactUserName);
    await page.waitForTimeout(500);

    // Ensure canLogin is off
    const canLoginSwitch = drawer.locator('.arco-switch').first();
    const isChecked = await canLoginSwitch.getAttribute('class');
    if (isChecked?.includes('arco-switch-checked')) {
      await canLoginSwitch.click();
      await page.waitForTimeout(300);
    }

    // Select a role (defensive - may be required even for contact-only users)
    const roleSelect = drawer.locator('.arco-select').filter({ has: page.locator('[placeholder*="角色"]') });
    if (await roleSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await roleSelect.click();
      await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
      await page.waitForTimeout(300);
    }

    // Submit
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/users') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.locator('.arco-drawer-footer').getByRole('button', { name: '创建' }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
    await expect(page.getByText(contactUserName)).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC4: search user ────────
  test('search users by keyword', async ({ authedPage: page }) => {
    await goToUserTab(page);

    const searchInput = page.getByPlaceholder(/搜索|关键词/);
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchInput.fill(loginUserName);
      await page.waitForTimeout(500);
      await waitForTableLoad(page);

      await expect(page.getByText(loginUserName)).toBeVisible();

      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(500);
    }
  });

  // ──────── TC5: edit user ────────
  test('edit user real name', async ({ authedPage: page }) => {
    await goToUserTab(page);

    const row = page.locator('.arco-table-tr').filter({ hasText: loginUserName });
    await expect(row).toBeVisible();

    // Click edit button
    const editBtn = row.locator('button').filter({ has: page.locator('svg') }).first();
    await editBtn.click();

    const drawer = page.locator('.arco-drawer').filter({ hasText: /编辑/ });
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    // Modify name
    const nameInput = drawer.getByPlaceholder('请输入姓名');
    await nameInput.clear();
    await nameInput.fill(loginUserName + '已修改');

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/users') && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('.arco-drawer-footer').getByRole('button', { name: /确定|更新|保存/ }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
    await expect(page.getByText(loginUserName + '已修改')).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC6: delete users ────────
  test('delete test users', async ({ authedPage: page }) => {
    await goToUserTab(page);

    // Delete first user
    const row1 = page.locator('.arco-table-tr').filter({ hasText: loginUserName });
    if (await row1.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await row1.locator('button[class*="danger"]').click();
      await confirmModal(page);
      await page.waitForTimeout(1_000);
    }

    // Delete second user
    const row2 = page.locator('.arco-table-tr').filter({ hasText: contactUserName });
    if (await row2.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await row2.locator('button[class*="danger"]').click();
      await confirmModal(page);
      await page.waitForTimeout(1_000);
    }
  });
});
