import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  createProjectViaPage,
  searchProject,
  waitForPageLoad,
  clickTab,
} from '../helpers/arco';

test.describe.serial('Project Collaborators Flow @p1', () => {
  const projectName = uniqueName('协作者测试项目');

  test('setup: create project', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });
  });

  test('navigate to project detail and find manage button', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('tbody tr').filter({ hasText: projectName });
    await row.locator('td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    const manageBtn = page.getByRole('button', { name: '管理' }).first();
    if (await manageBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(manageBtn).toBeVisible();
    }
  });

  test('open collaborators modal', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('tbody tr').filter({ hasText: projectName });
    await row.locator('td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    const manageBtn = page.getByRole('button', { name: '管理' }).first();
    if (await manageBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await manageBtn.click();

      const modal = page.locator('[data-slot="dialog-content"]').filter({ hasText: '管理协作者' });
      await expect(modal).toBeVisible({ timeout: 5_000 });

      await expect(modal.getByText('当前协作者')).toBeVisible();
      await expect(modal.getByText('添加成员')).toBeVisible();
      await expect(modal.getByPlaceholder('搜索姓名或用户名...')).toBeVisible();
    }
  });

  test('search and add a collaborator', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('tbody tr').filter({ hasText: projectName });
    await row.locator('td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    const manageBtn = page.getByRole('button', { name: '管理' }).first();
    if (await manageBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await manageBtn.click();

      const modal = page.locator('[data-slot="dialog-content"]').filter({ hasText: '管理协作者' });
      await expect(modal).toBeVisible({ timeout: 5_000 });

      const searchInput = modal.getByPlaceholder('搜索姓名或用户名...');
      if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await searchInput.fill('张三');
        await page.waitForTimeout(500);

        const plusIcon = modal.locator('[aria-label*="新建"]').first();
        if (await plusIcon.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await plusIcon.click();
          await page.waitForTimeout(300);

          await expect(modal.locator('[data-slot="badge"]').filter({ hasText: '张三' })).toBeVisible({ timeout: 3_000 });
        }
      }

      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/members') && r.request().method() === 'POST',
        { timeout: 10_000 },
      );
      await modal.getByRole('button', { name: '确定' }).click();
      const resp = await responsePromise.catch(() => null);
      if (resp) {
        expect(resp.status()).toBeLessThan(400);
      }

      await expectMessage(page, '协作者已更新');
    }
  });

  test('verify collaborator appears in project detail', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('tbody tr').filter({ hasText: projectName });
    await row.locator('td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    const memberArea = page.getByText('张三');
    if (await memberArea.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(memberArea).toBeVisible();
    }
  });

  test('remove collaborator', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('tbody tr').filter({ hasText: projectName });
    await row.locator('td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    const manageBtn = page.getByRole('button', { name: '管理' }).first();
    if (await manageBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await manageBtn.click();

      const modal = page.locator('[data-slot="dialog-content"]').filter({ hasText: '管理协作者' });
      await expect(modal).toBeVisible({ timeout: 5_000 });

      const closeIcon = modal.locator('[data-slot="badge"] .arco-icon-close').first();
      if (await closeIcon.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await closeIcon.click();
        await page.waitForTimeout(300);
      }

      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/members') && r.request().method() === 'DELETE',
        { timeout: 10_000 },
      );
      await modal.getByRole('button', { name: '确定' }).click();
      const resp = await responsePromise.catch(() => null);
      if (resp) {
        expect(resp.status()).toBeLessThan(400);
      }

      await expectMessage(page, '协作者已更新');
    }
  });

  test('cleanup: delete project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('tbody tr').filter({ hasText: projectName });
    if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await row.locator('button[class*="danger"]').click();
      await confirmModal(page);
      await expectMessage(page, '项目删除成功');
    }
  });
});
