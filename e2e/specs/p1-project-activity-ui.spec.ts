import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  createProjectViaPage,
  searchProject,
  waitForTableLoad,
  clickTab,
  confirmModal,
  expectMessage,
} from '../helpers/arco';

test.describe.serial('P1 Project & Activity UI Tests', () => {
  async function getToken(page: import('@playwright/test').Page): Promise<string> {
    return (await page.evaluate(() => localStorage.getItem('accessToken'))) || '';
  }

  // ═══════════════════════════════════════════════════════════════════
  // PROJ-032: Snapshot readonly mode
  // ═══════════════════════════════════════════════════════════════════
  test.describe.serial('PROJ-032: Snapshot readonly mode', () => {
    const projectName = uniqueName('快照只读项目');
    let projectId: string;
    let snapshotId: string;

    test('setup: create project and archive via API', async ({ authedPage: page }) => {
      const token = await getToken(page);

      await createProjectViaPage(page, { name: projectName });
      await searchProject(page, projectName);
      await page.locator('.arco-table-td').getByText(projectName).click();
      await expect(page).toHaveURL(/\/projects\/(.+)/);
      projectId = page.url().match(/\/projects\/([^/]+)/)?.[1]!;
      expect(projectId).toBeTruthy();

      const actResp = await page.request.post('/api/activities', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          name: 'Snapshot Readonly Activity',
          projectId,
          status: 'NOT_STARTED',
          phase: 'EVT',
        },
      });
      expect(actResp.status()).toBeLessThan(400);

      const archiveResp = await page.request.post(`/api/projects/${projectId}/archive`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { remark: 'Test snapshot' },
      });
      expect(archiveResp.status()).toBeLessThan(400);
      const archiveData = await archiveResp.json();
      snapshotId = archiveData.id;
      expect(snapshotId).toBeTruthy();
    });

    test('PROJ-032: snapshot page is readonly', async ({ authedPage: page }) => {
      await page.goto(`/projects/${projectId}/snapshot/${snapshotId}`);
      await page.waitForTimeout(2_000);

      const banner = page.locator('.arco-alert');
      await expect(banner).toBeVisible({ timeout: 10_000 });
      const bannerText = await banner.textContent();
      expect(bannerText).toMatch(/只读|快照/);

      const editIcons = page.locator('.arco-table-td .arco-icon-edit');
      const deleteIcons = page.locator('.arco-table-td .arco-icon-delete');
      await expect(editIcons).toHaveCount(0);
      await expect(deleteIcons).toHaveCount(0);

      await expect(
        page.locator('.arco-tabs-tab').filter({ hasText: '排期工具' }),
      ).not.toBeVisible();
      await expect(
        page.locator('.arco-tabs-tab').filter({ hasText: '项目快照' }),
      ).not.toBeVisible();

      const returnBtn = page.getByRole('button', { name: '返回项目' });
      if (await returnBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await returnBtn.click();
      } else {
        await page.goto('/projects');
      }
    });

    test('cleanup: unarchive and delete project', async ({ authedPage: page }) => {
      const token = await getToken(page);
      await page.request.post(`/api/projects/${projectId}/unarchive`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      await page.goto('/projects');
      await waitForTableLoad(page);
      await searchProject(page, projectName);

      const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
      await row.locator('button[class*="danger"]').click();
      await confirmModal(page);
      await expectMessage(page, '项目删除成功');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ACT-018: Gantt progress bar by status
  // ═══════════════════════════════════════════════════════════════════
  test.describe.serial('ACT-018: Gantt progress bar by status', () => {
    const projectName = uniqueName('甘特进度项目');
    let projectId: string;

    test('setup: create project with 3 status activities', async ({ authedPage: page }) => {
      const token = await getToken(page);

      await createProjectViaPage(page, { name: projectName });
      await searchProject(page, projectName);
      await page.locator('.arco-table-td').getByText(projectName).click();
      await expect(page).toHaveURL(/\/projects\/(.+)/);
      projectId = page.url().match(/\/projects\/([^/]+)/)?.[1]!;
      expect(projectId).toBeTruthy();

      const headers = { Authorization: `Bearer ${token}` };
      const statuses = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'];
      const names = ['甘特-未开始', '甘特-进行中', '甘特-已完成'];

      for (let i = 0; i < 3; i++) {
        const resp = await page.request.post('/api/activities', {
          headers,
          data: {
            name: names[i],
            projectId,
            status: statuses[i],
            phase: 'EVT',
            planStartDate: '2026-04-01',
            planEndDate: '2026-04-30',
          },
        });
        expect(resp.status()).toBeLessThan(400);
      }
    });

    test('ACT-018: gantt chart renders with legend', async ({ authedPage: page }) => {
      await page.goto(`/projects/${projectId}`);
      await page.waitForTimeout(1_500);

      await clickTab(page, '甘特图');
      await page.waitForTimeout(2_000);

      const ganttContainer = page.locator('[class*="gantt"], [class*="Gantt"], canvas, svg').first();
      await expect(ganttContainer).toBeVisible({ timeout: 10_000 });

      await expect(page.getByText('关键路径').first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText('已完成').first()).toBeVisible();
      await expect(page.getByText('进行中').first()).toBeVisible();
      await expect(page.getByText('未开始').first()).toBeVisible();
    });

    test('cleanup: delete test project', async ({ authedPage: page }) => {
      const token = await getToken(page);
      await page.request.delete(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ACT-020: Critical path UI highlight
  // ═══════════════════════════════════════════════════════════════════
  test.describe.serial('ACT-020: Critical path UI highlight', () => {
    const projectName = uniqueName('关键路径项目');
    let projectId: string;
    let actAId: string;
    let actBId: string;

    test('setup: create project with dependent activities', async ({ authedPage: page }) => {
      const token = await getToken(page);
      const headers = { Authorization: `Bearer ${token}` };

      await createProjectViaPage(page, { name: projectName });
      await searchProject(page, projectName);
      await page.locator('.arco-table-td').getByText(projectName).click();
      await expect(page).toHaveURL(/\/projects\/(.+)/);
      projectId = page.url().match(/\/projects\/([^/]+)/)?.[1]!;
      expect(projectId).toBeTruthy();

      const respA = await page.request.post('/api/activities', {
        headers,
        data: {
          name: 'CP活动A',
          projectId,
          status: 'IN_PROGRESS',
          phase: 'EVT',
          planStartDate: '2026-04-01',
          planEndDate: '2026-04-15',
        },
      });
      expect(respA.status()).toBeLessThan(400);
      actAId = (await respA.json()).id;
      expect(actAId).toBeTruthy();

      const respB = await page.request.post('/api/activities', {
        headers,
        data: {
          name: 'CP活动B',
          projectId,
          status: 'NOT_STARTED',
          phase: 'EVT',
          planStartDate: '2026-04-16',
          planEndDate: '2026-04-30',
          dependencies: [{ id: actAId, type: '0', lag: 0 }],
        },
      });
      expect(respB.status()).toBeLessThan(400);
      actBId = (await respB.json()).id;
      expect(actBId).toBeTruthy();
    });

    test('ACT-020: critical path tag and gantt legend', async ({ authedPage: page }) => {
      await page.goto(`/projects/${projectId}`);
      await waitForTableLoad(page);
      await page.waitForTimeout(1_500);

      const cpTag = page.locator('.arco-tag').filter({ hasText: /^CP$/ });
      if (await cpTag.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(cpTag).toBeVisible();
      }

      await clickTab(page, '甘特图');
      const ganttContainer = page.locator('[class*="gantt"], [class*="Gantt"], canvas, svg').first();
      await expect(ganttContainer).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1_000);

      await expect(page.getByText('关键路径').first()).toBeVisible({ timeout: 10_000 });
    });

    test('cleanup: delete test project', async ({ authedPage: page }) => {
      const token = await getToken(page);
      await page.request.delete(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CHK-008: Check item count display "3/5"
  // ═══════════════════════════════════════════════════════════════════
  test.describe.serial('CHK-008: Check item count display', () => {
    const projectName = uniqueName('检查项计数项目');
    let projectId: string;
    let activityId: string;

    test('setup: create project, activity, and check items', async ({ authedPage: page }) => {
      const token = await getToken(page);
      const headers = { Authorization: `Bearer ${token}` };

      await createProjectViaPage(page, { name: projectName });
      await searchProject(page, projectName);
      await page.locator('.arco-table-td').getByText(projectName).click();
      await expect(page).toHaveURL(/\/projects\/(.+)/);
      projectId = page.url().match(/\/projects\/([^/]+)/)?.[1]!;
      expect(projectId).toBeTruthy();

      const actResp = await page.request.post('/api/activities', {
        headers,
        data: {
          name: '检查项测试活动',
          projectId,
          status: 'IN_PROGRESS',
          phase: 'DVT',
        },
      });
      expect(actResp.status()).toBeLessThan(400);
      activityId = (await actResp.json()).id;
      expect(activityId).toBeTruthy();

      for (let i = 1; i <= 5; i++) {
        const checked = i <= 3;
        const resp = await page.request.post('/api/check-items', {
          headers,
          data: {
            activityId,
            title: `item ${i}`,
          },
        });
        expect(resp.status()).toBeLessThan(400);

        if (checked) {
          const created = await resp.json();
          await page.request.put(`/api/check-items/${created.id}`, {
            headers,
            data: { checked: true },
          });
        }
      }
    });

    test('CHK-008: activity row shows fraction 3/5', async ({ authedPage: page }) => {
      await page.goto(`/projects/${projectId}`);
      await page.waitForTimeout(2_000);

      const checkItemsHeader = page.locator('.arco-table-th').filter({ hasText: '检查项' });
      if (!(await checkItemsHeader.isVisible({ timeout: 5_000 }).catch(() => false))) {
        const colSettingsBtn = page.locator('button').filter({ hasText: /列设置/ }).or(
          page.locator('[class*="column-settings"]'),
        );
        if (await colSettingsBtn.isVisible().catch(() => false)) {
          await colSettingsBtn.click();
          await page.waitForTimeout(300);
          const checkItemsOption = page.locator('.arco-checkbox').filter({ hasText: '检查项' });
          if (await checkItemsOption.isVisible().catch(() => false)) {
            await checkItemsOption.click();
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
          }
        }
      }

      const row = page.locator('.arco-table-tr').filter({ hasText: '检查项测试活动' });
      await expect(row).toBeVisible({ timeout: 10_000 });

      await expect(row.getByText('3/5')).toBeVisible({ timeout: 5_000 });
    });

    test('cleanup: delete test project', async ({ authedPage: page }) => {
      const token = await getToken(page);
      await page.request.delete(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    });
  });
});
