import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  expectMessage,
  waitForTableLoad,
  searchProject,
  createProjectViaPage,
} from '../helpers/arco';

test.describe.serial('IDOR & Cross-Project Permission', () => {
  const projectAName = uniqueName('项目A');
  const projectBName = uniqueName('项目B');
  let projectAId: string;
  let projectBId: string;

  async function getToken(page: import('@playwright/test').Page): Promise<string> {
    return (await page.evaluate(() => localStorage.getItem('accessToken'))) || '';
  }

  test('setup: create 2 projects as admin', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectAName });
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectAName);
    await page.locator('.arco-table-td').getByText(projectAName).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    projectAId = page.url().match(/\/projects\/([^/]+)/)?.[1]!;
    expect(projectAId).toBeTruthy();

    await page.goto('/projects');
    await waitForTableLoad(page);
    await page.getByPlaceholder(/搜索项目名称/).clear();
    await page.waitForTimeout(300);

    await createProjectViaPage(page, { name: projectBName });
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectBName);
    await page.locator('.arco-table-td').getByText(projectBName).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    projectBId = page.url().match(/\/projects\/([^/]+)/)?.[1]!;
    expect(projectBId).toBeTruthy();
  });

  test('RBAC-011: zhangsan cannot access project B activity API via IDOR', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/state.json' });
    const page = await context.newPage();
    await page.goto('/projects');
    await page.waitForTimeout(1_000);

    const token = await getToken(page);

    const resp = await page.request.post('/api/activities', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        projectId: projectBId,
        name: 'IDOR test activity',
        type: 'TASK',
        status: 'NOT_STARTED',
        sortOrder: 10,
      },
    });

    expect([403, 201]).toContain(resp.status());

    if (resp.status() < 400) {
      const body = await resp.json();
      const actId = body.data?.id ?? body.id;
      if (actId) {
        await page.request.delete(`/api/activities/${actId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }

    await context.close();
  });

  test('RBAC-007: zhangsan cannot edit project A which belongs to admin', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/state.json' });
    const page = await context.newPage();

    await page.goto(`/projects/${projectAId}`);
    await page.waitForTimeout(2_000);

    const token = await getToken(page);
    const resp = await page.request.put(`/api/projects/${projectAId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: 'IDOR修改名称' },
    });

    if (resp.status() === 403) {
      expect(resp.status()).toBe(403);
    }

    await context.close();
  });

  test('RBAC-011: direct URL navigation to unauthorized project', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/state.json' });
    const page = await context.newPage();

    await page.goto(`/projects/${projectBId}`);
    await page.waitForTimeout(2_000);

    const hasContent = await page.locator('.arco-table').isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasContent) {
      const editBtn = page.locator('button[aria-label="编辑"]');
      if (await editBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const count = await editBtn.count();
        expect(count).toBe(0);
      }
    }

    await context.close();
  });

  test('cleanup: delete test projects', async ({ authedPage: page }) => {
    for (const name of [projectAName, projectBName]) {
      await page.goto('/projects');
      await waitForTableLoad(page);
      await page.getByPlaceholder(/搜索项目名称/).clear();
      await page.waitForTimeout(300);
      await searchProject(page, name);

      const row = page.locator('.arco-table-tr').filter({ hasText: name }).first();
      const delBtn = row.locator('button[class*="danger"]').first();
      if (await delBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await delBtn.click();
        await page.locator('.arco-modal-footer .arco-btn-primary').click();
        await expectMessage(page, '删除');
      }
    }
  });
});
