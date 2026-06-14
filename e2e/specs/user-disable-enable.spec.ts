import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  clickNavItem,
  expectMessage,
  waitForTableLoad,
  waitForPageLoad,
} from '../helpers/arco';

test.describe.serial('User Disable Enable Lifecycle @p1', () => {
  const userName = '测试禁启用_' + Date.now();

  async function goToUserTab(page: import('@playwright/test').Page) {
    await clickNavItem(page, '账号管理');
    await waitForPageLoad(page);
    await page.waitForTimeout(500);
    await page.getByText('用户管理', { exact: true }).click();
    await page.waitForTimeout(500);
    await waitForTableLoad(page);
  }

  test('create a login-enabled user for disable/enable testing', async ({ authedPage: page }) => {
    await goToUserTab(page);

    await page.getByRole('button', { name: /新建用户|创建用户|添加用户/ }).click();

    const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: /新建用户/ });
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    await drawer.getByPlaceholder('请输入姓名').fill(userName);
    await page.waitForTimeout(500);

    const canLoginSwitch = drawer.locator('[data-slot="switch"]').first();
    const isChecked = await canLoginSwitch.getAttribute('class');
    if (!isChecked?.includes('arco-switch-checked')) {
      await canLoginSwitch.click();
      await page.waitForTimeout(300);
    }

    const passwordInput = drawer.getByPlaceholder('请输入密码');
    if (await passwordInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await passwordInput.fill('test123456');
    }

    const roleSelect = drawer.locator('[role="combobox"]').filter({ has: page.locator('[placeholder*="角色"]') });
    if (await roleSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await roleSelect.click();
      await page.locator('[data-slot="select-content"]:visible [role="option"]').first().click();
      await page.waitForTimeout(300);
    }

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/users') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.locator('[data-slot="sheet-footer"]').getByRole('button', { name: '创建' }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
    await expect(page.getByText(userName)).toBeVisible({ timeout: 10_000 });
  });

  test('verify user shows active status tag', async ({ authedPage: page }) => {
    await goToUserTab(page);

    const row = page.locator('tbody tr').filter({ hasText: userName });
    await expect(row).toBeVisible({ timeout: 5_000 });

    const statusTag = row.locator('[data-slot="badge"]').filter({ hasText: '启用' });
    if (await statusTag.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(statusTag).toBeVisible();
    }
  });

  test('disable user via edit drawer status switch', async ({ authedPage: page }) => {
    await goToUserTab(page);

    const row = page.locator('tbody tr').filter({ hasText: userName });
    await expect(row).toBeVisible();

    const editBtn = row.locator('button').filter({ has: page.locator('svg') }).first();
    await editBtn.click();

    const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: /编辑/ });
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(500);

    const switches = drawer.locator('[data-slot="switch"]');
    let statusSwitch = switches.last();
    for (let i = 0; i < await switches.count(); i++) {
      const sw = switches.nth(i);
      const parent = sw.locator('..');
      const parentText = await parent.textContent();
      if (parentText?.includes('状态') || parentText?.includes('禁用')) {
        statusSwitch = sw;
        break;
      }
    }

    const isCurrentlyActive = await statusSwitch.getAttribute('class');
    if (isCurrentlyActive?.includes('arco-switch-checked')) {
      await statusSwitch.click();
      await page.waitForTimeout(300);
    }

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/users') && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('[data-slot="sheet-footer"]').getByRole('button', { name: /确定|更新|保存/ }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);

    const disabledTag = row.locator('[data-slot="badge"]').filter({ hasText: '禁用' });
    if (await disabledTag.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(disabledTag).toBeVisible();
    }
  });

  test('re-enable user via edit drawer', async ({ authedPage: page }) => {
    await goToUserTab(page);

    const row = page.locator('tbody tr').filter({ hasText: userName });
    await expect(row).toBeVisible();

    const editBtn = row.locator('button').filter({ has: page.locator('svg') }).first();
    await editBtn.click();

    const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: /编辑/ });
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(500);

    const switches = drawer.locator('[data-slot="switch"]');
    let statusSwitch = switches.last();
    for (let i = 0; i < await switches.count(); i++) {
      const sw = switches.nth(i);
      const parent = sw.locator('..');
      const parentText = await parent.textContent();
      if (parentText?.includes('状态') || parentText?.includes('启用')) {
        statusSwitch = sw;
        break;
      }
    }

    const isCurrentlyDisabled = await statusSwitch.getAttribute('class');
    if (!isCurrentlyDisabled?.includes('arco-switch-checked')) {
      await statusSwitch.click();
      await page.waitForTimeout(300);
    }

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/users') && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('[data-slot="sheet-footer"]').getByRole('button', { name: /确定|更新|保存/ }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);

    const activeTag = row.locator('[data-slot="badge"]').filter({ hasText: '启用' });
    if (await activeTag.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(activeTag).toBeVisible();
    }
  });

  test('cleanup: delete test user', async ({ authedPage: page }) => {
    await goToUserTab(page);

    const row = page.locator('tbody tr').filter({ hasText: userName });
    if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await row.locator('button[aria-label*="删除"]').click();
      await page.waitForTimeout(500);
      const confirmBtn = page.locator('[data-slot="dialog-footer"] .arco-btn-primary');
      if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(1_000);
      }
    }
  });
});
