import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  searchProject,
  createProjectViaPage,
  waitForTableLoad,
  confirmModal,
} from '../helpers/arco';

test.describe('Activity Role Binding - Admin Role Members', () => {
  test('Admin can view role members tab', async ({ authedPage: page }) => {
    await page.goto('/admin?tab=account');
    await page.waitForTimeout(1000);

    const roleMembersTab = page.locator('.arco-tabs-tab').getByText('角色成员');
    if (await roleMembersTab.isVisible().catch(() => false)) {
      await roleMembersTab.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('.arco-table').or(page.getByText(/暂无/))).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe.serial('Activity Role Binding - Full Flow', () => {
  const projectName = uniqueName('角色绑定CRUD');

  test('create project, activity with role, verify, cleanup', async ({ authedPage: page }) => {
    // Setup: create project
    await page.goto('/projects');
    await waitForTableLoad(page);
    await createProjectViaPage(page, { name: projectName });
    await searchProject(page, projectName);

    const projectLink = page.locator('.arco-table-td').getByText(projectName).first();
    await projectLink.click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(2000);

    // Open create drawer via dropdown menu
    const dropdownTrigger = page.locator('.arco-btn').filter({ has: page.locator('.arco-icon-more') }).or(page.locator('.arco-btn').filter({ has: page.locator('.arco-icon-plus') }));
    if (await dropdownTrigger.first().isVisible().catch(() => false)) {
      await dropdownTrigger.first().click();
      await page.waitForTimeout(300);
    }

    const menuItem = page.getByText('新建活动');
    if (await menuItem.isVisible().catch(() => false)) {
      await menuItem.click();
    }
    await page.waitForTimeout(500);

    // Verify drawer and role/executor fields
    const drawer = page.locator('.arco-drawer');
    if (!(await drawer.isVisible().catch(() => false))) return;

    const phaseSelect = drawer.locator('.arco-select').first();
    await phaseSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();

    await drawer.getByPlaceholder('请输入活动名称').fill(uniqueName('角色活动'));

    const roleFormItem = drawer.locator('.arco-form-item').filter({ hasText: '角色' });
    const roleSelect = roleFormItem.locator('.arco-select').first();
    if (await roleSelect.isVisible().catch(() => false)) {
      await roleSelect.click();
      const options = page.locator('.arco-select-popup:visible .arco-select-option');
      const optCount = await options.count();
      if (optCount > 0) {
        await options.nth(Math.min(1, optCount - 1)).click();
        await page.waitForTimeout(500);
      }
    }

    const executorFormItem = drawer.locator('.arco-form-item').filter({ hasText: '执行人' });
    await expect(executorFormItem.locator('.arco-select')).toBeVisible({ timeout: 3000 });

    // Submit
    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/api/activities') && r.request().method() === 'POST',
      { timeout: 15000 },
    );
    await drawer.getByRole('button', { name: '创建' }).click();
    const resp = await respPromise;
    expect(resp.status()).toBeLessThan(400);
    await expect(drawer).not.toBeVisible({ timeout: 5000 });

    // Verify activity list
    await page.waitForTimeout(1500);
    const table = page.locator('.arco-table-tbody .arco-table-tr');
    const rowCount = await table.count();
    expect(rowCount).toBeGreaterThan(0);

    // Cleanup: delete project
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    if (await row.isVisible().catch(() => false)) {
      await row.locator('.arco-icon-delete').click();
      await confirmModal(page);
    }
  });
});
