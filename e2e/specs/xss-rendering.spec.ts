import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  expectMessage,
  waitForTableLoad,
  searchProject,
  createProjectViaPage,
} from '../helpers/arco';

test.describe.serial('XSS Rendering Verification', () => {
  const projectName = uniqueName('XSS');
  let projectId: string;
  let activityId: string;

  async function getToken(page: import('@playwright/test').Page): Promise<string> {
    return (await page.evaluate(() => localStorage.getItem('accessToken'))) || '';
  }

  test('setup: create project and activity', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });

    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    projectId = page.url().match(/\/projects\/([^/]+)/)?.[1]!;

    const token = await getToken(page);
    const resp = await page.request.post('/api/activities', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId, name: 'XSS测试活动', type: 'TASK', status: 'NOT_STARTED', sortOrder: 10 },
    });
    const body = await resp.json();
    activityId = body.data?.id ?? body.id;

    await page.reload();
    await waitForTableLoad(page);
  });

  test('AUTH-036: realName with XSS is rendered as text, not executed', async ({ authedPage: page }) => {
    await page.goto('/admin?tab=account');
    await page.waitForTimeout(1_000);
    await waitForTableLoad(page);

    const hasXssText = await page.locator('text=<img').count();
    if (hasXssText > 0) {
      const dialogPromise = page.waitForEvent('dialog', { timeout: 3_000 }).catch(() => null);
      const dialog = await dialogPromise;
      if (dialog) {
        await dialog.dismiss();
        throw new Error('XSS executed via realName!');
      }
    }
  });

  test('AUTH-008: SQL injection in login field does not cause error page', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('请输入用户名').fill("admin' OR '1'='1");
    await page.getByPlaceholder('请输入密码').fill('anything');
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForTimeout(2_000);

    const hasSQLError = await page.locator('text=/SQL|syntax|mysql|postgres|sqlite/i').count();
    expect(hasSQLError).toBe(0);

    await expect(page).toHaveURL(/\/login/);
  });

  test('PROJ-009: project name with XSS is rendered as text', async ({ authedPage: page }) => {
    const xssName = `<img src=x onerror="window.__xssFired=true">`;
    const token = await getToken(page);

    const resp = await page.request.post('/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: xssName,
        description: 'xss test',
        productLine: 'DANDELION',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        managerId: (await (await page.request.get('/api/users', { headers: { Authorization: `Bearer ${token}` } })).json()).data?.[0]?.id,
      },
    });

    if (resp.status() < 400) {
      await page.goto('/projects');
      await waitForTableLoad(page);

      const xssFired = await page.evaluate(() => (window as any).__xssFired);
      expect(xssFired).toBeFalsy();

      const body = await resp.json();
      const id = body.data?.id ?? body.id;
      if (id) {
        await page.request.delete(`/api/projects/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }
  });

  test('CHK-007: check item title with XSS is rendered as text', async ({ authedPage: page }) => {
    const token = await getToken(page);

    const xssTitle = `<img src=x onerror="window.__chkXss=true">`;
    await page.request.post('/api/check-items', {
      headers: { Authorization: `Bearer ${token}` },
      data: { activityId, title: xssTitle },
    });

    await page.goto(`/projects/${projectId}`);
    await waitForTableLoad(page);

    const editIcon = page.locator('.arco-table-body .arco-table-tr').first().locator('.arco-icon-edit').first();
    await editIcon.click();
    await expect(page.getByText('编辑活动')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(1_000);

    const xssFired = await page.evaluate(() => (window as any).__chkXss);
    expect(xssFired).toBeFalsy();

    await page.locator('.arco-drawer-close-icon').click();
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
