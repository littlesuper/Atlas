import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import { expectMessage, confirmModal, waitForTableLoad, createProjectViaPage, searchProject } from '../helpers/arco';

test.describe.serial('Project Management', () => {
  const projectName = uniqueName(text.projectName);

  test('view project list with table', async ({ authedPage: page }) => {
    await expect(page).toHaveURL(/\/projects/);
    await waitForTableLoad(page);
    await expect(page.locator('.arco-table')).toBeVisible();
    await expect(page.locator('.arco-table-tr').first()).toBeVisible();
  });

  test('create new project', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName, desc: text.projectDesc });
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
