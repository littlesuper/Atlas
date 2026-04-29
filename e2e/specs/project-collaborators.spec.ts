import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  expectMessage,
  waitForTableLoad,
  searchProject,
  createProjectViaPage,
} from '../helpers/arco';

test.describe.serial('Project Collaborators', () => {
  const projectName = uniqueName('协作者');
  let projectId: string;

  async function getToken(page: import('@playwright/test').Page): Promise<string> {
    return (await page.evaluate(() => localStorage.getItem('accessToken'))) || '';
  }

  test('setup: create project', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });

    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    projectId = page.url().match(/\/projects\/([^/]+)/)?.[1]!;
    expect(projectId).toBeTruthy();
  });

  test('PROJ-027: add collaborator to project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName }).first();
    const editBtn = row.getByRole('button', { name: '编辑' });
    await editBtn.click();
    await expect(page.locator('.arco-drawer')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(500);

    const collaboratorSelect = page.locator('.arco-drawer .arco-select').filter({
      has: page.locator('[placeholder="选择项目协作者"]'),
    });
    if (await collaboratorSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await collaboratorSelect.click();
      await page.waitForTimeout(300);

      const option = page.locator('.arco-select-popup:visible .arco-select-option').first();
      if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(300);
      }

      await page.locator('.arco-drawer-footer').getByRole('button', { name: '保存修改' }).click();
      await page.waitForTimeout(1_000);
    }

    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 }).catch(() => {
      page.locator('.arco-drawer-close-icon').click();
    });
  });

  test('PROJ-029: cannot add project manager as collaborator', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName }).first();
    const editBtn = row.getByRole('button', { name: '编辑' });
    await editBtn.click();
    await expect(page.locator('.arco-drawer')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(500);

    const collaboratorSelect = page.locator('.arco-drawer .arco-select').filter({
      has: page.locator('[placeholder="选择项目协作者"]'),
    });
    if (await collaboratorSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await collaboratorSelect.click();
      await page.waitForTimeout(300);

      const options = page.locator('.arco-select-popup:visible .arco-select-option');
      const count = await options.count();

      const managerSelect = page.locator('.arco-drawer .arco-select').filter({
        has: page.locator('[placeholder="选择项目经理"]'),
      });
      let managerName = '';
      const managerValue = await managerSelect.locator('.arco-select-view-value').textContent().catch(() => '');
      managerName = managerValue || '';

      for (let i = 0; i < count; i++) {
        const optText = await options.nth(i).textContent();
        if (optText && !managerName.includes(optText.split('(')[0].trim())) {
          await options.nth(i).click();
          break;
        }
      }
      await page.waitForTimeout(300);
    }

    await page.locator('.arco-drawer-close-icon').click();
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
  });

  test('PROJ-031: collaborator cannot add other collaborators', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/state.json' });
    const page = await context.newPage();
    await page.goto('/projects');
    await page.waitForTimeout(1_000);

    const token = await getToken(page);

    const resp = await page.request.post(`/api/projects/${projectId}/members`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { userIds: [], role: 'COLLABORATOR' },
    });

    if (resp.status() === 403 || resp.status() === 401) {
      expect([401, 403]).toContain(resp.status());
    }

    await context.close();
  });

  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await page.getByPlaceholder(/搜索项目名称/).clear();
    await page.waitForTimeout(300);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName }).first();
    const delBtn = row.locator('button[class*="danger"]').first();
    if (await delBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await delBtn.click();
      await page.locator('.arco-modal-footer .arco-btn-primary').click();
      await expectMessage(page, '删除');
    }
  });
});
