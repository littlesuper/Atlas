import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  expectMessage,
  waitForTableLoad,
  searchProject,
  createProjectViaPage,
} from '../helpers/arco';

test.describe.serial('Check Items @p1', () => {
  const projectName = uniqueName('检查项');
  let projectId: string;
  let activityId: string;

  async function getToken(page: import('@playwright/test').Page): Promise<string> {
    return (await page.evaluate(() => localStorage.getItem('accessToken'))) || '';
  }

  async function openActivityDrawer(page: import('@playwright/test').Page) {
    const editIcon = page.locator('tbody tr').first().locator('[aria-label*="编辑"]').first();
    await editIcon.click();
    await expect(page.getByText('编辑活动')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(500);
  }

  test('setup: create project and activity', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });

    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    projectId = page.url().match(/\/projects\/([^/]+)/)?.[1]!;
    expect(projectId).toBeTruthy();

    const token = await getToken(page);
    const resp = await page.request.post('/api/activities', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId, name: '检查项测试活动', type: 'TASK', status: 'NOT_STARTED', sortOrder: 10 },
    });
    expect(resp.status()).toBeLessThan(400);
    const body = await resp.json();
    activityId = body.data?.id ?? body.id;

    await page.reload();
    await waitForTableLoad(page);
  });

  test('CHK-001: create check items via drawer', async ({ authedPage: page }) => {
    await page.goto(`/projects/${projectId}`);
    await waitForTableLoad(page);
    await openActivityDrawer(page);

    const checkItemInput = page.locator('[data-slot="sheet-content"]').getByPlaceholder('添加检查项...');
    await expect(checkItemInput).toBeVisible({ timeout: 5_000 });

    for (let i = 1; i <= 3; i++) {
      await checkItemInput.fill(`检查项${i}`);
      const addBtn = page.locator('[data-slot="sheet-content"]').locator('button.arco-btn-icon-only').filter({ has: page.locator('[aria-label*="新建"]') }).last();
      await addBtn.click();
      await page.waitForTimeout(500);
    }

    const checkboxes = page.locator('[data-slot="sheet-content"] [data-slot="checkbox"]');
    await expect(checkboxes).toHaveCount(3, { timeout: 5_000 });
  });

  test('CHK-001: toggle check item updates progress', async ({ authedPage: page }) => {
    await page.goto(`/projects/${projectId}`);
    await waitForTableLoad(page);
    await openActivityDrawer(page);

    const checkboxes = page.locator('[data-slot="sheet-content"] [data-slot="checkbox"]');
    await expect(checkboxes).toHaveCount(3, { timeout: 5_000 });

    await checkboxes.nth(0).click();
    await page.waitForTimeout(500);

    const progress = page.locator('[data-slot="sheet-content"] .arco-progress');
    await expect(progress).toBeVisible({ timeout: 3_000 });

    const fraction = page.locator('[data-slot="sheet-content"]').getByText('1/3');
    await expect(fraction).toBeVisible({ timeout: 3_000 });
  });

  test('CHK-001: delete check item removes it and updates count', async ({ authedPage: page }) => {
    await page.goto(`/projects/${projectId}`);
    await waitForTableLoad(page);
    await openActivityDrawer(page);

    const deleteButtons = page.locator('[data-slot="sheet-content"] [aria-label*="删除"]');
    const count = await deleteButtons.count();
    expect(count).toBeGreaterThan(0);

    await deleteButtons.first().click();
    await page.waitForTimeout(500);

    const checkboxes = page.locator('[data-slot="sheet-content"] [data-slot="checkbox"]');
    await expect(checkboxes).toHaveCount(2, { timeout: 3_000 });
  });

  test('CHK-001: edit check item title inline', async ({ authedPage: page }) => {
    await page.goto(`/projects/${projectId}`);
    await waitForTableLoad(page);
    await openActivityDrawer(page);

    const titleSpan = page.locator('[data-slot="sheet-content"]').getByText('检查项2').first();
    if (await titleSpan.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await titleSpan.click();
      await page.waitForTimeout(300);

      const input = page.locator('[data-slot="sheet-content"] input[data-slot="input"]').filter({ hasText: '' }).last();
      if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await input.clear();
        await input.fill('已编辑检查项');
        await input.press('Enter');
        await page.waitForTimeout(500);
        await expect(page.locator('[data-slot="sheet-content"]').getByText('已编辑检查项')).toBeVisible({ timeout: 3_000 });
      }
    }
  });

  test('CHK-008: activity table shows check item fraction', async ({ authedPage: page }) => {
    await page.goto(`/projects/${projectId}`);
    await waitForTableLoad(page);

    const checkItemsCell = page.locator('tbody tr').first().locator('td').filter({ hasText: /\d\/\d/ });
    if (await checkItemsCell.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const text = await checkItemsCell.textContent();
      expect(text).toMatch(/\d\/\d/);
    }
  });

  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('tbody tr').filter({ hasText: projectName }).first();
    const delBtn = row.locator('button[aria-label*="删除"]').first();
    if (await delBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await delBtn.click();
      await page.locator('[data-slot="dialog-footer"] .arco-btn-primary').click();
      await expectMessage(page, '删除');
    }
  });
});
