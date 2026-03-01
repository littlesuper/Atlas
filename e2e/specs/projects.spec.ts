import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import { expectMessage, confirmModal, waitForTableLoad, clickDrawerSubmit, pickDateRange, searchProject } from '../helpers/arco';

test.describe.serial('Project Management', () => {
  const projectName = uniqueName(text.projectName);

  test('view project list with table', async ({ authedPage: page }) => {
    await expect(page).toHaveURL(/\/projects/);
    await waitForTableLoad(page);
    await expect(page.locator('.arco-table')).toBeVisible();
    await expect(page.locator('.arco-table-tr').first()).toBeVisible();
  });

  test('create new project', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '新建项目' }).click();
    await expect(page.locator('.arco-drawer')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300);

    // Fill name and description
    await page.getByPlaceholder('请输入项目名称').fill(projectName);
    await page.getByPlaceholder('请输入项目描述').fill(text.projectDesc);

    // Pick date range via calendar UI
    await pickDateRange(page);

    // Select 项目经理
    const managerSelect = page.locator('.arco-drawer .arco-select').filter({ has: page.locator('[placeholder="项目经理"]') });
    await managerSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
    await page.waitForTimeout(200);

    // Submit — listen for response before clicking
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/projects') && resp.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  });

  test('click into project detail', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await expect(page.locator('.arco-table').first()).toBeVisible({ timeout: 10_000 });
  });

  test('delete project', async ({ authedPage: page }) => {
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    await row.locator('button[class*="danger"]').click();
    await confirmModal(page);
    await expectMessage(page, '项目删除成功');

    await waitForTableLoad(page);
    await expect(page.getByText(projectName)).not.toBeVisible();
  });
});
