import { type Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import { confirmModal, expectMessage, pickDateRange, searchProject, waitForTableLoad } from '../helpers/arco';

test.describe.serial('Project Template Instantiation', () => {
  const templateName = uniqueName('模板实例化');
  const projectName = uniqueName('模板建项项目');
  const firstActivity = uniqueName('模板活动设计');
  const secondActivity = uniqueName('模板活动验证');

  let templateId = '';

  async function apiHeaders(page: Page) {
    const token = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(token).toBeTruthy();
    return { Authorization: `Bearer ${token}` };
  }

  async function createTemplateViaApi(page: Page) {
    const response = await page.request.post('/api/templates', {
      headers: await apiHeaders(page),
      data: {
        name: templateName,
        description: 'E2E template used to verify project creation instantiates activities',
        activities: [
          {
            id: `${templateName}-activity-1`,
            name: firstActivity,
            type: 'TASK',
            phase: 'EVT',
            planDuration: 2,
            sortOrder: 1,
          },
          {
            id: `${templateName}-activity-2`,
            name: secondActivity,
            type: 'TASK',
            phase: 'DVT',
            planDuration: 3,
            sortOrder: 2,
          },
        ],
      },
    });
    expect(response.status()).toBe(201);

    const body = await response.json();
    templateId = body.id;
    expect(templateId).toBeTruthy();
    expect(body.activities).toHaveLength(2);
  }

  async function selectFirstProjectManager(page: Page) {
    const managerSelect = page.locator('.arco-drawer .arco-select').filter({
      has: page.locator('[placeholder="选择项目经理"]'),
    });
    await managerSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
  }

  async function selectTemplate(page: Page) {
    const templateSelect = page.locator('.arco-drawer .arco-select').filter({
      has: page.locator('[placeholder="选择模板（可选）"]'),
    });
    await templateSelect.click();
    const option = page
      .locator('.arco-select-popup:visible .arco-select-option')
      .filter({ hasText: templateName })
      .first();
    await option.click();
  }

  test('create project from template and verify generated activities', async ({ authedPage: page }) => {
    await createTemplateViaApi(page);

    await page.goto('/projects');
    await waitForTableLoad(page);

    await page.getByRole('button', { name: '新建项目' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible({ timeout: 5_000 });

    await page.locator('.arco-drawer').getByPlaceholder('请输入项目名称').fill(projectName);
    await page
      .locator('.arco-drawer')
      .getByPlaceholder('请输入项目描述')
      .fill('E2E verifies template activities are generated during project creation');
    await selectTemplate(page);
    await pickDateRange(page);
    await selectFirstProjectManager(page);

    const createProjectResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/projects') && resp.request().method() === 'POST',
      { timeout: 15_000 }
    );
    const instantiateResponse = page.waitForResponse(
      (resp) => resp.url().includes(`/api/templates/${templateId}/instantiate`) && resp.request().method() === 'POST',
      { timeout: 15_000 }
    );

    await page.locator('.arco-drawer-footer').getByRole('button', { name: '创建项目' }).click();

    const projectResp = await createProjectResponse;
    expect(projectResp.status()).toBeLessThan(400);

    const instResp = await instantiateResponse;
    expect(instResp.status()).toBe(201);
    const instBody = await instResp.json();
    expect(instBody.count).toBe(2);
    expect(instBody.activities.map((activity: { name: string }) => activity.name)).toEqual([
      firstActivity,
      secondActivity,
    ]);

    await expectMessage(page, '项目已创建，并从模板生成 2 个活动');
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });

    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName, { exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await waitForTableLoad(page);

    await expect(page.getByText(firstActivity)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(secondActivity)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('001', { exact: true })).toBeVisible();
    await expect(page.getByText('002', { exact: true })).toBeVisible();
  });

  test('cleanup generated project and template', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const projectRow = page.locator('.arco-table-tr').filter({ hasText: projectName }).first();
    if (await projectRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await projectRow.locator('button[class*="danger"]').click();
      await confirmModal(page);
      await expectMessage(page, '项目删除成功');
    }

    if (templateId) {
      const response = await page.request.delete(`/api/templates/${templateId}`, {
        headers: await apiHeaders(page),
      });
      expect([200, 404]).toContain(response.status());
    }
  });
});
