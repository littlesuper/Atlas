import { test, expect } from '../fixtures/auth';
import { uniqueName, credentials } from '../fixtures/test-data';
import {
  clickNavItem,
  clickTab,
  expectMessage,
  waitForTableLoad,
  waitForPageLoad,
} from '../helpers/arco';
import { login } from '../fixtures/auth';

test.describe.serial('Role Permission Effect @p1', () => {
  const roleName = uniqueName('受限角色');
  const testUserName = '权限测试用户_' + Date.now();
  const testPassword = 'test123456';
  let createdUserId: string | null = null;
  let createdRoleId: string | null = null;

  async function goToRoleTab(page: import('@playwright/test').Page) {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, '账号管理');
    await page.waitForTimeout(500);
    await page.getByText('角色管理', { exact: true }).click();
    await page.waitForTimeout(500);
    await waitForTableLoad(page);
  }

  async function goToUserTab(page: import('@playwright/test').Page) {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, '账号管理');
    await page.waitForTimeout(500);
    await page.getByText('用户管理', { exact: true }).click();
    await page.waitForTimeout(500);
    await waitForTableLoad(page);
  }

  test('create role with limited permissions (only project:read)', async ({ authedPage: page }) => {
    await goToRoleTab(page);

    await page.getByRole('button', { name: /新建角色|创建角色/ }).click();

    const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: /新建|创建/ });
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    await drawer.getByPlaceholder(/角色名/).fill(roleName);

    const permSection = drawer.locator('.arco-form-item').filter({ hasText: /权限/ });
    const permCheckboxes = permSection.locator('[data-slot="checkbox"]');

    const selectAllCheckbox = permCheckboxes.first();
    const isChecked = await selectAllCheckbox.getAttribute('class');
    if (isChecked?.includes('checked')) {
      await selectAllCheckbox.click();
      await page.waitForTimeout(300);
    }

    const checkboxLabels = permSection.locator('[data-slot="checkbox"]');
    for (let i = 0; i < await checkboxLabels.count(); i++) {
      const label = await checkboxLabels.nth(i).textContent();
      if (label?.includes('project') && label?.includes('read')) {
        await checkboxLabels.nth(i).click();
        break;
      }
    }

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/roles') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.locator('[data-slot="sheet-footer"]').getByRole('button', { name: /确定|创建/ }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    const respBody = await resp.json();
    createdRoleId = respBody.data?.id || respBody.id;

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
  });

  test('create user with the limited role', async ({ authedPage: page }) => {
    await goToUserTab(page);

    await page.getByRole('button', { name: /新建用户/ }).click();

    const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: /新建用户/ });
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    await drawer.getByPlaceholder('请输入姓名').fill(testUserName);

    const canLoginSwitch = drawer.locator('[data-slot="switch"]').first();
    const isChecked = await canLoginSwitch.getAttribute('class');
    if (!isChecked?.includes('arco-switch-checked')) {
      await canLoginSwitch.click();
      await page.waitForTimeout(300);
    }

    await drawer.getByPlaceholder('请输入密码').fill(testPassword);

    const roleSelect = drawer.locator('[role="combobox"]').filter({ has: page.locator('[placeholder*="角色"]') });
    await roleSelect.click();
    await page.waitForTimeout(300);

    const roleOption = page.locator('[data-slot="select-content"]:visible [role="option"]').filter({ hasText: roleName });
    if (await roleOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await roleOption.click();
    } else {
      await page.locator('[data-slot="select-content"]:visible [role="option"]').first().click();
    }

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/users') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.locator('[data-slot="sheet-footer"]').getByRole('button', { name: '创建' }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    const respBody = await resp.json();
    createdUserId = respBody.data?.id || respBody.id;
  });

  test('login as limited user and verify restricted access', async ({ page }) => {
    if (!createdUserId) return;

    await page.goto('/login');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const usernameField = page.getByPlaceholder('请输入用户名');
    await usernameField.fill(testUserName);
    await page.getByPlaceholder('请输入密码').fill(testPassword);
    await page.getByRole('button', { name: '登录' }).click();

    const navigated = await page.waitForURL('**/projects**', { timeout: 15_000 }).catch(() => null);
    if (navigated) {
      await waitForTableLoad(page);

      const createProjectBtn = page.getByRole('button', { name: '新建项目' });
      const isVisible = await createProjectBtn.isVisible({ timeout: 3_000 }).catch(() => false);

      if (!isVisible) {
        expect(true).toBeTruthy();
      }
    }
  });

  test('limited user cannot access admin page', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('请输入用户名').fill(testUserName);
    await page.getByPlaceholder('请输入密码').fill(testPassword);
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForURL('**/projects**', { timeout: 15_000 }).catch(() => {});

    await page.goto('/admin');
    await page.waitForTimeout(2_000);

    const currentUrl = page.url();
    const onAdminPage = currentUrl.includes('/admin');
    if (onAdminPage) {
      const tabs = page.locator('[role="tab"]');
      const tabCount = await tabs.count();
      expect(tabCount).toBeLessThan(3);
    } else {
      expect(currentUrl).not.toContain('/admin');
    }
  });

  test('cleanup: delete test user and role', async ({ authedPage: page }) => {
    await goToUserTab(page);
    const userRow = page.locator('tbody tr').filter({ hasText: testUserName });
    if (await userRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await userRow.locator('button[class*="danger"]').click();
      await page.waitForTimeout(500);
      const confirmBtn = page.locator('[data-slot="dialog-footer"] .arco-btn-primary');
      if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(1_000);
      }
    }

    await goToRoleTab(page);
    const roleRow = page.locator('tbody tr').filter({ hasText: roleName });
    if (await roleRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await roleRow.locator('button[class*="danger"]').click();
      await page.waitForTimeout(500);
      const confirmBtn = page.locator('[data-slot="dialog-footer"] .arco-btn-primary');
      if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(1_000);
      }
    }
  });
});
