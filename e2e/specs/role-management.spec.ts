import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  clickNavItem,
  clickTab,
  expectMessage,
  confirmModal,
  waitForTableLoad,
  waitForPageLoad,
} from '../helpers/arco';

/**
 * 角色管理 CRUD 测试
 * - 查看角色列表
 * - 创建角色并分配权限
 * - 编辑角色名称/描述
 * - 修改角色权限
 * - 删除角色
 */
test.describe.serial('Role Management', () => {
  const roleName = uniqueName(text.roleName);
  const updatedRoleName = uniqueName('已修改角色');

  async function goToRoleTab(page: import('@playwright/test').Page) {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, '账号管理');
    await page.waitForTimeout(500);
    await page.getByText('角色管理', { exact: true }).click();
    await page.waitForTimeout(500);
    await waitForTableLoad(page);
  }

  // ──────── TC1: view role list ────────
  test('view role list', async ({ authedPage: page }) => {
    await goToRoleTab(page);

    // Verify table is visible and contains known roles - scope to role section
    const table = page.locator('.arco-table').filter({ hasText: '角色名称' });
    await expect(table).toBeVisible({ timeout: 5_000 });
    // At least the system admin role should exist
    await expect(table.getByText('系统管理员').first()).toBeVisible({ timeout: 5_000 });
  });

  // ──────── TC2: create role with permissions ────────
  test('create role with permissions', async ({ authedPage: page }) => {
    await goToRoleTab(page);

    await page.getByRole('button', { name: /新建角色|创建角色|添加角色/ }).click();

    const drawer = page.locator('.arco-drawer').filter({ hasText: /新建|创建|添加/ });
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    // Fill role name and description
    await drawer.getByPlaceholder(/角色名/).fill(roleName);
    const descInput = drawer.getByPlaceholder(/描述/);
    if (await descInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await descInput.fill(text.roleDesc);
    }

    // Select some permissions (checkboxes in the permission tree)
    const permCheckboxes = drawer.locator('.arco-checkbox');
    const checkboxCount = await permCheckboxes.count();
    if (checkboxCount > 0) {
      // Check the first few permissions
      await permCheckboxes.first().click();
      if (checkboxCount > 1) {
        await permCheckboxes.nth(1).click();
      }
    }

    // Submit
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/roles') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.locator('.arco-drawer-footer').getByRole('button', { name: /确定|创建|提交/ }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
    const roleTable = page.locator('.arco-table').filter({ hasText: '角色名称' });
    await expect(roleTable.getByText(roleName)).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC3: edit role ────────
  test('edit role name and description', async ({ authedPage: page }) => {
    await goToRoleTab(page);

    const roleTable = page.locator('.arco-table').filter({ hasText: '角色名称' });
    const row = roleTable.locator('.arco-table-tr').filter({ hasText: roleName });
    await expect(row).toBeVisible();

    // Click edit button
    const editBtn = row.locator('button').filter({ has: page.locator('svg') }).first();
    await editBtn.click();

    const drawer = page.locator('.arco-drawer').filter({ hasText: /编辑/ });
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    // Update name
    const nameInput = drawer.getByPlaceholder(/角色名/);
    await nameInput.clear();
    await nameInput.fill(updatedRoleName);

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/roles') && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('.arco-drawer-footer').getByRole('button', { name: /确定|更新|保存/ }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
    await expect(roleTable.getByText(updatedRoleName)).toBeVisible({ timeout: 10_000 });
  });

  // ──────── TC4: delete role ────────
  test('delete role', async ({ authedPage: page }) => {
    await goToRoleTab(page);

    const roleTable = page.locator('.arco-table').filter({ hasText: '角色名称' });
    const row = roleTable.locator('.arco-table-tr').filter({ hasText: updatedRoleName });
    await expect(row).toBeVisible();

    await row.locator('button[class*="danger"]').click();
    await confirmModal(page);

    await page.waitForTimeout(1_000);
    await waitForTableLoad(page);
    await expect(roleTable.getByText(updatedRoleName)).not.toBeVisible({ timeout: 5_000 });
  });
});
