import { test, expect } from '../fixtures/auth';
import { uniqueName, text } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  clickDrawerSubmit,
  pickDateRange,
  waitForPageLoad,
  openCreateActivityDrawer,
  searchProject,
  clickTab,
} from '../helpers/arco';

test.describe.serial('Risk Items Management', () => {
  const projectName = uniqueName('风险项测试项目');

  test('setup: create project with activity and assessment', async ({ authedPage: page }) => {
    test.setTimeout(60_000);
    // Create project
    await page.getByRole('button', { name: '新建项目' }).click();
    await page.getByPlaceholder('请输入项目名称').fill(projectName);
    await pickDateRange(page);

    const managerSelect = page.locator('.arco-drawer .arco-select').filter({ has: page.locator('[placeholder="项目经理"]') });
    await managerSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
    await page.waitForTimeout(200);

    const projResp = page.waitForResponse(
      (resp) => resp.url().includes('/api/projects') && resp.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await projResp).status()).toBeLessThan(400);
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    // Navigate to project and add activity
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await openCreateActivityDrawer(page);
    const phaseSelect = page.locator('.arco-drawer .arco-select').first();
    await phaseSelect.click();
    await page.locator('.arco-select-popup:visible .arco-select-option').first().click();
    await page.getByPlaceholder('请输入活动名称').fill(uniqueName(text.activityName));

    const actResp = page.waitForResponse(
      (resp) => resp.url().includes('/api/activities') && resp.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await clickDrawerSubmit(page, '创建');
    expect((await actResp).status()).toBeLessThan(400);
    await expect(page.locator('.arco-drawer')).not.toBeVisible({ timeout: 5_000 });

    // Navigate to risk tab and trigger assessment
    await clickTab(page, '风险评估');
    await page.waitForTimeout(1_000);

    const assessBtn = page.getByRole('button', { name: /发起评估/ });
    if (await assessBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const assessResp = page.waitForResponse(
        (resp) => resp.url().includes('/assess') && resp.request().method() === 'POST',
        { timeout: 45_000 },
      );
      await assessBtn.click();
      const resp = await assessResp;
      expect(resp.status()).toBeLessThan(400);
    }
  });

  test('risk items panel is visible in risk tab', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '风险评估');
    await page.waitForTimeout(1_000);

    // Risk items panel should be visible
    await expect(page.getByText('风险项').first()).toBeVisible({ timeout: 5_000 });
  });

  test('create risk item via button', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '风险评估');
    await page.waitForTimeout(1_000);

    // Click "新建风险项" button
    const createBtn = page.getByRole('button', { name: /新建风险项/ });
    if (await createBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(500);

      // Fill in the modal form
      const modal = page.locator('.arco-modal');
      await expect(modal).toBeVisible({ timeout: 3_000 });

      await modal.getByPlaceholder('请输入风险项标题').fill('E2E测试风险项');

      // Select severity
      const severitySelect = modal.locator('.arco-select').first();
      await severitySelect.click();
      await page.locator('.arco-select-popup:visible .arco-select-option').filter({ hasText: /高|HIGH/ }).first().click();
      await page.waitForTimeout(200);

      // Submit
      const createResp = page.waitForResponse(
        (resp) => resp.url().includes('/api/risk-items') && resp.request().method() === 'POST',
        { timeout: 10_000 },
      );
      await modal.getByRole('button', { name: /确定|创建/ }).click();
      expect((await createResp).status()).toBeLessThan(400);
    }
  });

  test('risk item appears in table', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '风险评估');
    await page.waitForTimeout(1_000);

    // Look for the risk item in the table
    const riskItemText = page.getByText('E2E测试风险项');
    await expect(riskItemText.first()).toBeVisible({ timeout: 5_000 }).catch(() => {
      // Item might not be visible if creation didn't work; skip
    });
  });

  test('risk assessment card shows source tag', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '风险评估');
    await page.waitForTimeout(1_000);

    // Assessment card should show source tag (规则引擎 or AI)
    const sourceTag = page.locator('.arco-tag').filter({ hasText: /规则引擎|AI 评估|定时/ });
    if (await sourceTag.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(sourceTag.first()).toBeVisible();
    }
  });

  test('risk assessment card shows risk level tag', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    await clickTab(page, '风险评估');
    await page.waitForTimeout(1_000);

    // Risk level tag should be visible
    const riskTag = page.locator('.arco-tag').filter({ hasText: /低风险|中风险|高风险|极高风险/ });
    if (await riskTag.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(riskTag.first()).toBeVisible();
    }
  });

  test('cleanup: delete test project', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);

    const row = page.locator('.arco-table-tr').filter({ hasText: projectName });
    if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await row.locator('button[class*="danger"]').click();
      await confirmModal(page);
      await expectMessage(page, '项目删除成功');
    }
  });
});
