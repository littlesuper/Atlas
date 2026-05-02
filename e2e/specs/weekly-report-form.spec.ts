import { type Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { credentials, uniqueName } from '../fixtures/test-data';
import { expectMessage, waitForTableLoad } from '../helpers/arco';

type UserSummary = {
  id: string;
  username?: string | null;
};

type WeeklyReportSummary = {
  id: string;
  projectId: string;
  status: 'DRAFT' | 'SUBMITTED' | string;
  progressStatus: string;
  keyProgress?: string | null;
  nextWeekPlan?: string | null;
  riskWarning?: string | null;
};

test.describe('Weekly Report Form', () => {
  async function refreshAdminToken(page: Page): Promise<string> {
    const loginResp = await page.request.post('/api/auth/login', {
      data: credentials.admin,
    });
    expect(loginResp.status()).toBe(200);
    const body = (await loginResp.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    expect(body.accessToken).toBeTruthy();
    await page.evaluate(({ accessToken, refreshToken }) => {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
    }, body);
    return body.accessToken;
  }

  async function createProjectViaApi(page: Page, token: string, name: string): Promise<string> {
    const usersResp = await page.request.get('/api/users?page=1&pageSize=100', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(usersResp.status()).toBe(200);
    const users = await usersResp.json();
    const manager = users.data?.find((user: UserSummary) => user.username === 'admin') ?? users.data?.[0];
    expect(manager?.id).toBeTruthy();

    const projectResp = await page.request.post('/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name,
        description: 'E2E weekly report form project',
        productLine: 'DANDELION',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        startDate: '2026-06-01',
        endDate: '2026-12-31',
        managerId: manager.id,
      },
    });
    expect(projectResp.status()).toBe(201);
    const project = await projectResp.json();
    expect(project.id).toBeTruthy();
    return project.id;
  }

  async function deleteProjectViaApi(page: Page, token: string, projectId: string) {
    const resp = await page.request.delete(`/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 404]).toContain(resp.status());
  }

  async function getReportViaApi(page: Page, token: string, reportId: string) {
    const resp = await page.request.get(`/api/weekly-reports/${reportId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.status()).toBe(200);
    return (await resp.json()) as WeeklyReportSummary;
  }

  async function expectProjectReportCount(page: Page, token: string, projectId: string, expectedCount: number) {
    await expect
      .poll(async () => {
        const resp = await page.request.get(`/api/weekly-reports/project/${projectId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        expect(resp.status()).toBe(200);
        const reports = (await resp.json()) as WeeklyReportSummary[];
        return reports.length;
      })
      .toBe(expectedCount);
  }

  async function fillRichTextEditor(page: Page, index: number, text: string) {
    const editor = page.locator('[contenteditable="true"]').nth(index);
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await editor.click();
    await editor.fill(text);
    await expect(editor).toContainText(text);
  }

  test('creates a draft, verifies it in drafts, submits it, and verifies summary state', async ({
    authedPage: page,
  }) => {
    const token = await refreshAdminToken(page);
    const projectName = uniqueName('周报表单项目');
    const keyProgress = `周报进展-${Date.now()}-硬断言`;
    const nextWeekPlan = `周报计划-${Date.now()}-硬断言`;
    const riskWarning = `周报风险-${Date.now()}-硬断言`;
    let projectId = '';
    let reportId = '';

    try {
      projectId = await createProjectViaApi(page, token, projectName);
      await expectProjectReportCount(page, token, projectId, 0);

      await page.goto(`/projects/${projectId}?tab=weekly`);
      await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
      const createButton = page.getByRole('button', { name: '创建周报' });
      await expect(createButton).toBeVisible({ timeout: 10_000 });
      await createButton.click();

      await expect(page).toHaveURL(new RegExp(`/weekly-reports/new\\?projectId=${projectId}`));
      await expect(page.getByRole('heading', { name: '创建周报' })).toBeVisible();
      await expect(page.getByText(projectName)).toBeVisible();

      const minorIssueRadio = page.getByText('轻度阻碍');
      await expect(minorIssueRadio).toBeVisible();
      await minorIssueRadio.click();

      await fillRichTextEditor(page, 2, keyProgress);
      await fillRichTextEditor(page, 3, nextWeekPlan);
      await fillRichTextEditor(page, 4, riskWarning);

      const createReportPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/weekly-reports') && resp.request().method() === 'POST',
        { timeout: 15_000 }
      );
      await page.getByRole('button', { name: '保存草稿' }).click();
      const createReportResp = await createReportPromise;
      expect(createReportResp.status()).toBe(201);
      const createdReport = (await createReportResp.json()) as WeeklyReportSummary;
      reportId = createdReport.id;
      expect(reportId).toBeTruthy();
      await expect(page).toHaveURL(new RegExp(`/weekly-reports/${reportId}/edit`));
      await expectMessage(page, '创建成功');

      const draftReport = await getReportViaApi(page, token, reportId);
      expect(draftReport.projectId).toBe(projectId);
      expect(draftReport.status).toBe('DRAFT');
      expect(draftReport.progressStatus).toBe('MINOR_ISSUE');
      expect(draftReport.keyProgress).toContain(keyProgress);
      expect(draftReport.nextWeekPlan).toContain(nextWeekPlan);
      expect(draftReport.riskWarning).toContain(riskWarning);

      await page.goto('/weekly-reports');
      await expect(page.getByText('项目周报汇总')).toBeVisible({ timeout: 10_000 });
      await page.getByRole('tab', { name: '草稿箱' }).click();
      await waitForTableLoad(page);
      await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(keyProgress)).toBeVisible();

      await page.goto(`/weekly-reports/${reportId}/edit`);
      await expect(page.getByRole('heading', { name: '编辑周报' })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText(keyProgress)).toBeVisible();

      const updateReportPromise = page.waitForResponse(
        (resp) => resp.url().endsWith(`/api/weekly-reports/${reportId}`) && resp.request().method() === 'PUT',
        { timeout: 15_000 }
      );
      const submitReportPromise = page.waitForResponse(
        (resp) => resp.url().endsWith(`/api/weekly-reports/${reportId}/submit`) && resp.request().method() === 'POST',
        { timeout: 15_000 }
      );
      await page.getByRole('button', { name: '提交周报' }).click();
      const updateReportResp = await updateReportPromise;
      const submitReportResp = await submitReportPromise;
      expect(updateReportResp.status()).toBe(200);
      expect(submitReportResp.status()).toBe(200);
      await expectMessage(page, '周报提交成功');
      await expect(page).toHaveURL(new RegExp(`/projects/${projectId}\\?tab=weekly`));

      const submittedReport = await getReportViaApi(page, token, reportId);
      expect(submittedReport.status).toBe('SUBMITTED');
      expect(submittedReport.progressStatus).toBe('MINOR_ISSUE');

      await page.goto('/weekly-reports');
      await waitForTableLoad(page);
      await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(keyProgress)).toBeVisible();
    } finally {
      if (projectId) {
        await deleteProjectViaApi(page, token, projectId);
      }
    }
  });
});
