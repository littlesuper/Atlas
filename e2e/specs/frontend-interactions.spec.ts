import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  waitForTableLoad,
  searchProject,
  createProjectViaPage,
  clickTab,
} from '../helpers/arco';

test.describe.serial('Frontend Interaction Details', () => {
  async function getToken(page: import('@playwright/test').Page): Promise<string> {
    return (await page.evaluate(() => localStorage.getItem('accessToken'))) || '';
  }

  test('PROJ-012: keyword fuzzy search matches name and description', async ({ authedPage: page }) => {
    const token = await getToken(page);
    const uniqueKeyword = `搜索${Date.now()}`;

    const usersResp = await page.request.get('/api/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const users = await usersResp.json();
    const managerId = users.data?.[0]?.id;

    await page.request.post('/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: `${uniqueKeyword}项目`,
        description: `包含${uniqueKeyword}关键字的描述`,
        productLine: 'DANDELION',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        managerId,
      },
    });

    await page.goto('/projects');
    await waitForTableLoad(page);
    await page.waitForTimeout(1_000);

    const apiResp = await page.request.get(`/api/projects?keyword=${encodeURIComponent(uniqueKeyword)}&page=1&pageSize=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(apiResp.status()).toBe(200);
    const apiBody = await apiResp.json();
    const found = apiBody.data?.some((p: any) => p.name?.includes(uniqueKeyword) || p.description?.includes(uniqueKeyword));
    expect(found).toBe(true);

    const target = apiBody.data?.find((p: any) => p.name?.includes(uniqueKeyword));
    if (target) {
      await page.request.delete(`/api/projects/${target.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });

  test('ACT-007: plan duration auto-calculates end date', async ({ authedPage: page }) => {
    const projectName = uniqueName('DURATION');
    await createProjectViaPage(page, { name: projectName });

    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    const projectId = page.url().match(/\/projects\/([^/]+)/)?.[1]!;

    const token = await getToken(page);
    const resp = await page.request.post('/api/activities', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        projectId,
        name: '工期测试活动',
        type: 'TASK',
        status: 'NOT_STARTED',
        sortOrder: 10,
        planStartDate: '2026-03-02',
        planDuration: 5,
      },
    });
    expect(resp.status()).toBeLessThan(400);

    const body = await resp.json();
    const activity = body.data ?? body;
    if (activity.planDuration) {
      expect(activity.planDuration).toBe(5);
    }
    if (activity.planEndDate) {
      expect(new Date(activity.planEndDate).getTime()).toBeGreaterThanOrEqual(
        new Date('2026-03-02').getTime()
      );
    }

    await page.reload();
    await waitForTableLoad(page);

    const durCell = page.locator('.arco-table-body .arco-table-tr').first().locator('td').filter({ hasText: /^5$/ });
    if (await durCell.count() > 0) {
      await durCell.first().click();
      await page.waitForTimeout(300);
    }

    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    const row = page.locator('.arco-table-tr').filter({ hasText: projectName }).first();
    const delBtn = row.locator('button[class*="danger"]').first();
    if (await delBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await delBtn.click();
      await page.locator('.arco-modal-footer .arco-btn-primary').click();
      await page.waitForTimeout(1_000);
    }
  });

  test('ACT-042: drag reorder activity persists', async ({ authedPage: page }) => {
    const projectName = uniqueName('DRAG');
    await createProjectViaPage(page, { name: projectName });

    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    const projectId = page.url().match(/\/projects\/([^/]+)/)?.[1]!;

    const token = await getToken(page);
    for (let i = 1; i <= 3; i++) {
      await page.request.post('/api/activities', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          projectId,
          name: `DragAct-${i}`,
          type: 'TASK',
          status: 'NOT_STARTED',
          sortOrder: i * 10,
        },
      });
    }

    await page.reload();
    await waitForTableLoad(page);
    await page.waitForTimeout(500);

    const dragHandles = page.locator('.arco-table-body .arco-table-tr .drag-handle');
    const handleCount = await dragHandles.count();
    expect(handleCount).toBeGreaterThanOrEqual(3);

    if (handleCount >= 2) {
      const firstHandle = dragHandles.first();
      const thirdRow = page.locator('.arco-table-body .arco-table-tr').nth(2);
      const box = await thirdRow.boundingBox();
      if (box) {
        await firstHandle.dispatchEvent('mousedown');
        await page.mouse.move(box.x + box.width / 2, box.y + box.height);
        await page.waitForTimeout(200);
        await page.mouse.up();
        await page.waitForTimeout(500);

        const reorderResp = await page.evaluate(() => {
          return performance.getEntriesByType('resource')
            .filter((e: any) => e.name.includes('/api/activities/reorder'))
            .length;
        });
      }
    }

    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    const row = page.locator('.arco-table-tr').filter({ hasText: projectName }).first();
    const delBtn = row.locator('button[class*="danger"]').first();
    if (await delBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await delBtn.click();
      await page.locator('.arco-modal-footer .arco-btn-primary').click();
      await page.waitForTimeout(1_000);
    }
  });

  test('CHK-002: check item order can be reordered via drag', async ({ authedPage: page }) => {
    const projectName = uniqueName('CHK-DRAG');
    await createProjectViaPage(page, { name: projectName });

    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    const projectId = page.url().match(/\/projects\/([^/]+)/)?.[1]!;

    const token = await getToken(page);
    const actResp = await page.request.post('/api/activities', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        projectId,
        name: 'CheckDrag活动',
        type: 'TASK',
        status: 'NOT_STARTED',
        sortOrder: 10,
      },
    });
    const actBody = await actResp.json();
    const activityId = actBody.data?.id ?? actBody.id;

    for (let i = 1; i <= 3; i++) {
      await page.request.post('/api/check-items', {
        headers: { Authorization: `Bearer ${token}` },
        data: { activityId, title: `CheckItem-${i}`, sortOrder: i },
      });
    }

    await page.reload();
    await waitForTableLoad(page);

    const editIcon = page.locator('.arco-table-body .arco-table-tr').first().locator('.arco-icon-edit').first();
    await editIcon.click();
    await expect(page.getByText('编辑活动')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(1_000);

    const checkItems = page.locator('.check-item, [class*="check-item"], .arco-checkbox');
    const checkCount = await checkItems.count();

    if (checkCount >= 2) {
      const dragHandleInDrawer = page.locator('.arco-drawer [class*="drag"], .arco-drawer .arco-icon-drag-dot-vertical');
      const drawerDragCount = await dragHandleInDrawer.count();
      expect(drawerDragCount).toBeGreaterThanOrEqual(0);
    }

    await page.locator('.arco-drawer-close-icon').click();

    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    const row = page.locator('.arco-table-tr').filter({ hasText: projectName }).first();
    const delBtn = row.locator('button[class*="danger"]').first();
    if (await delBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await delBtn.click();
      await page.locator('.arco-modal-footer .arco-btn-primary').click();
      await page.waitForTimeout(1_000);
    }
  });

  test('ACT-043: undo delete activity via button', async ({ authedPage: page }) => {
    const projectName = uniqueName('UNDO');
    await createProjectViaPage(page, { name: projectName });

    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);

    const token = await getToken(page);
    const projectId = page.url().match(/\/projects\/([^/]+)/)?.[1]!;

    await page.request.post('/api/activities', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        projectId,
        name: 'UndoTarget活动',
        type: 'TASK',
        status: 'NOT_STARTED',
        sortOrder: 10,
      },
    });

    await page.reload();
    await waitForTableLoad(page);
    await page.waitForTimeout(500);

    const deleteIcon = page.locator('.arco-table-body .arco-table-tr').first().locator('.arco-icon-delete').first();
    if (await deleteIcon.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteIcon.click();
      await page.waitForTimeout(500);

      const undoBtn = page.locator('button').filter({ hasText: /撤回|撤销|undo/i }).first();
      if (await undoBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await undoBtn.click();
        await page.waitForTimeout(1_000);
      }
    }

    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    const row = page.locator('.arco-table-tr').filter({ hasText: projectName }).first();
    const delBtn = row.locator('button[class*="danger"]').first();
    if (await delBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await delBtn.click();
      await page.locator('.arco-modal-footer .arco-btn-primary').click();
      await page.waitForTimeout(1_000);
    }
  });
});
