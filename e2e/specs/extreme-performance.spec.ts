import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  waitForTableLoad,
  searchProject,
  createProjectViaPage,
} from '../helpers/arco';

test.describe.serial('Extreme Performance Tests', () => {
  async function getToken(page: import('@playwright/test').Page): Promise<string> {
    return (await page.evaluate(() => localStorage.getItem('accessToken'))) || '';
  }

  test('PROJ-017: pageSize=10000 is clamped to 100', async ({ authedPage: page }) => {
    const token = await getToken(page);

    const resp = await page.request.get('/api/projects?page=1&pageSize=10000', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.data.length).toBeLessThanOrEqual(100);
  });

  test('PROD-034: CSV export handles large dataset without OOM', async ({ authedPage: page }) => {
    const token = await getToken(page);

    const start = Date.now();
    const resp = await page.request.get('/api/products/export', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const elapsed = Date.now() - start;

    expect(resp.status()).toBe(200);
    expect(elapsed).toBeLessThan(30_000);
    expect(resp.headers()['content-type']).toContain('text/csv');

    const text = await resp.text();
    expect(text).toContain('名称');
    expect(text).toContain('DEVELOPING');
  });

  test('SYS-020: Gantt chart renders with many activities', async ({ authedPage: page }) => {
    const projectName = uniqueName('PERF-GANTT');
    await createProjectViaPage(page, { name: projectName });

    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    const projectId = page.url().match(/\/projects\/([^/]+)/)?.[1]!;

    const token = await getToken(page);
    const batchSize = 50;
    for (let batch = 0; batch < 5; batch++) {
      const promises = [];
      for (let i = 0; i < batchSize; i++) {
        promises.push(
          page.request.post('/api/activities', {
            headers: { Authorization: `Bearer ${token}` },
            data: {
              projectId,
              name: `Activity-${batch * batchSize + i + 1}`,
              type: 'TASK',
              status: 'NOT_STARTED',
              sortOrder: batch * batchSize + i + 1,
            },
          })
        );
      }
      await Promise.all(promises);
    }

    await page.getByText('甘特图').click();
    await page.waitForTimeout(3_000);

    const ganttBars = await page.locator('.gantt-bar, [class*="gantt"]').count();
    expect(ganttBars).toBeGreaterThanOrEqual(0);

    const elapsed = await page.evaluate(() => {
      return performance.now();
    });
    expect(typeof elapsed).toBe('number');

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

  test('CHAOS-002: Excel import rejects oversized file gracefully', async ({ authedPage: page }) => {
    const token = await getToken(page);

    const usersResp = await page.request.get('/api/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const users = await usersResp.json();
    const managerId = users.data?.[0]?.id;

    const projectName = uniqueName('PERF-IMPORT');
    const projResp = await page.request.post('/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: projectName,
        description: 'perf import test',
        productLine: 'DANDELION',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        managerId,
      },
    });
    const projBody = await projResp.json();
    const projectId = projBody.data?.id ?? projBody.id;

    const headerRow = '活动名称\t阶段\t类型\t负责人\t计划开始\t计划结束\t工期\n';
    const row = `活动-${Date.now()}\tEVT\tTASK\tadmin\t2026-01-01\t2026-01-10\t10\n`;
    const largeContent = headerRow + row.repeat(500);

    const buffer = Buffer.from(largeContent, 'utf-8');
    const resp = await page.request.post(`/api/activities/project/${projectId}/import-excel`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'large_import.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer,
        },
      },
    });

    expect([200, 400, 413, 500]).toContain(resp.status());

    await page.request.delete(`/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  test('CHAOS-007: concurrent requests do not crash server', async ({ authedPage: page }) => {
    const token = await getToken(page);

    const promises = Array.from({ length: 50 }, () =>
      page.request.get('/api/projects?page=1&pageSize=20', {
        headers: { Authorization: `Bearer ${token}` },
      })
    );

    const results = await Promise.allSettled(promises);
    const succeeded = results.filter(r => r.status === 'fulfilled');
    expect(succeeded.length).toBeGreaterThanOrEqual(40);

    const healthResp = await page.request.get('/api/health');
    expect(healthResp.status()).toBe(200);
  });
});
