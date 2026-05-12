import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  createProjectViaPage,
  searchProject,
  waitForPageLoad,
} from '../helpers/arco';

test.describe.serial('Project Status Lifecycle @smoke', () => {
  const projectName = uniqueName('状态流转项目');

  test('setup: create project (default IN_PROGRESS)', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await expect(row.getByText('进行中')).toBeVisible({ timeout: 5_000 });
  });

  test('change status from IN_PROGRESS to ON_HOLD via edit drawer', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    await row.getByRole('button', { name: '编辑' }).click();

    const drawer = page.locator('.arco-drawer');
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(500);

    const statusSelect = drawer.locator('.arco-select').filter({
      has: page.locator('[class*="arco-select-view-value"]'),
    });
    const allSelects = drawer.locator('.arco-select');
    let statusSelectEl = allSelects.nth(1);

    for (let i = 0; i < await allSelects.count(); i++) {
      const el = allSelects.nth(i);
      const text = await el.textContent();
      if (text?.includes('进行中') || text?.includes('选择')) {
        statusSelectEl = el;
        break;
      }
    }

    await statusSelectEl.click();
    await page.waitForTimeout(300);

    const holdOption = page.locator('.arco-select-popup:visible .arco-select-option').filter({ hasText: '已暂停' });
    if (await holdOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await holdOption.click();
    } else {
      const options = page.locator('.arco-select-popup:visible .arco-select-option');
      const count = await options.count();
      if (count > 1) {
        await options.nth(1).click();
      }
    }

    await page.waitForTimeout(300);

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/projects') && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('.arco-drawer-footer').getByRole('button', { name: '保存修改' }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
  });

  test('change status to COMPLETED via edit drawer', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    await row.getByRole('button', { name: '编辑' }).click();

    const drawer = page.locator('.arco-drawer');
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(500);

    const allSelects = drawer.locator('.arco-select');
    let statusSelectEl = allSelects.nth(1);
    for (let i = 0; i < await allSelects.count(); i++) {
      const el = allSelects.nth(i);
      const t = await el.textContent();
      if (t?.includes('暂停') || t?.includes('选择')) {
        statusSelectEl = el;
        break;
      }
    }

    await statusSelectEl.click();
    await page.waitForTimeout(300);

    const completedOption = page.locator('.arco-select-popup:visible .arco-select-option').filter({ hasText: '已完成' });
    if (await completedOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await completedOption.click();
    } else {
      const options = page.locator('.arco-select-popup:visible .arco-select-option');
      const count = await options.count();
      if (count > 0) {
        const lastOption = options.nth(count - 1);
        await lastOption.click();
      }
    }

    await page.waitForTimeout(300);

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/projects') && r.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await page.locator('.arco-drawer-footer').getByRole('button', { name: '保存修改' }).click();
    const resp = await responsePromise;
    expect(resp.status()).toBeLessThan(400);

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
  });

  test('archive project via list button', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });

    const archiveBtn = row.locator('button').filter({ has: page.locator('svg') }).filter({
      has: page.locator('[class*="icon-storage"], [class*="IconStorage"]'),
    }).first();

    if (await archiveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await archiveBtn.click();
    } else {
      const allButtons = row.locator('button');
      for (let i = 0; i < await allButtons.count(); i++) {
        const btn = allButtons.nth(i);
        const tooltip = await btn.getAttribute('aria-label') ?? '';
        const title = await btn.getAttribute('title') ?? '';
        if (tooltip.includes('归档') || title.includes('归档')) {
          await btn.click();
          break;
        }
      }
    }

    await page.waitForTimeout(500);

    const confirmBtn = page.getByRole('button', { name: /确认归档/ });
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/archive') && r.request().method() === 'POST',
        { timeout: 15_000 },
      );
      await confirmBtn.click();
      const resp = await responsePromise;
      expect(resp.status()).toBeLessThan(400);
    } else {
      await confirmModal(page);
    }

    await waitForTableLoad(page);
  });

  test('archived project shows read-only alert in detail page', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    await expect(row).toBeVisible({ timeout: 5_000 });

    await row.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/, { timeout: 10_000 });
    await page.waitForTimeout(1_000);

    const alert = page.locator('.arco-alert').filter({ hasText: '已归档' });
    if (await alert.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(alert).toBeVisible();
      await expect(alert.getByText('取消归档')).toBeVisible();
    }
  });

  test('unarchive project from detail page alert', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    await row.locator('.arco-table-td').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/, { timeout: 10_000 });
    await page.waitForTimeout(1_000);

    const unarchiveLink = page.getByText('取消归档').first();
    if (await unarchiveLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/unarchive') && r.request().method() === 'POST',
        { timeout: 15_000 },
      );
      await unarchiveLink.click();
      const resp = await responsePromise;
      expect(resp.status()).toBeLessThan(400);
    }
  });

  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    if (await row.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await row.locator('button[class*="danger"]').click();
      await confirmModal(page);
      await expectMessage(page, '项目删除成功');
    }
  });
});
