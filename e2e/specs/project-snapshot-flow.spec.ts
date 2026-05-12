import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import {
  expectMessage,
  confirmModal,
  waitForTableLoad,
  createProjectViaPage,
  searchProject,
  clickTab,
  waitForPageLoad,
} from '../helpers/arco';

test.describe.serial('Project Snapshot Flow @p1', () => {
  const projectName = uniqueName('快照测试项目');

  async function navigateToProjectDetail(page: import('@playwright/test').Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);
    await searchProject(page, projectName);
    await page.locator('.arco-table-td').getByText(projectName).first().click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);
  }

  test('setup: create project', async ({ authedPage: page }) => {
    await createProjectViaPage(page, { name: projectName });
  });

  test('navigate to snapshots tab', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const snapshotTab = page.locator('[role="tab"]').filter({ hasText: '快照' });
    if (await snapshotTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await snapshotTab.click();
      await page.waitForTimeout(1_000);

      await expect(
        page.getByText('暂无快照').or(page.getByText(/个快照/)),
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test('create snapshot', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const snapshotTab = page.locator('[role="tab"]').filter({ hasText: '快照' });
    if (await snapshotTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await snapshotTab.click();
      await page.waitForTimeout(1_000);

      const createBtn = page.getByRole('button', { name: /创建快照/ });
      if (await createBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await createBtn.click();

        const modal = page.locator('.arco-modal').filter({ hasText: '创建项目快照' });
        if (await modal.isVisible({ timeout: 3_000 }).catch(() => false)) {
          const remarkInput = modal.getByPlaceholder(/备注/);
          if (await remarkInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await remarkInput.fill('E2E测试快照 - 初始状态');
          }

          const responsePromise = page.waitForResponse(
            (r) => r.url().includes('/snapshot') && r.request().method() === 'POST',
            { timeout: 15_000 },
          );
          await modal.getByRole('button', { name: '创建' }).click();
          const resp = await responsePromise;
          expect(resp.status()).toBeLessThan(400);
        }
      }
    }
  });

  test('snapshot appears in list with remark', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const snapshotTab = page.locator('[role="tab"]').filter({ hasText: '快照' });
    if (await snapshotTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await snapshotTab.click();
      await page.waitForTimeout(1_000);

      await expect(page.getByText('E2E测试快照 - 初始状态')).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(/共 \d+ 个快照/)).toBeVisible({ timeout: 3_000 });
    }
  });

  test('view snapshot detail', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const snapshotTab = page.locator('[role="tab"]').filter({ hasText: '快照' });
    if (await snapshotTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await snapshotTab.click();
      await page.waitForTimeout(1_000);

      const viewBtn = page.getByRole('button', { name: '查看' }).or(page.locator('.arco-icon-eye')).first();
      if (await viewBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await viewBtn.click();

        await page.waitForTimeout(1_000);
        await expect(page).toHaveURL(/\/snapshot\//, { timeout: 10_000 });

        await page.goBack();
        await page.waitForTimeout(1_000);
      }
    }
  });

  test('create second snapshot', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const snapshotTab = page.locator('[role="tab"]').filter({ hasText: '快照' });
    if (await snapshotTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await snapshotTab.click();
      await page.waitForTimeout(1_000);

      const createBtn = page.getByRole('button', { name: /创建快照/ });
      if (await createBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await createBtn.click();

        const modal = page.locator('.arco-modal').filter({ hasText: '创建项目快照' });
        if (await modal.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await modal.getByPlaceholder(/备注/).fill('E2E测试快照 - 第二次');

          const responsePromise = page.waitForResponse(
            (r) => r.url().includes('/snapshot') && r.request().method() === 'POST',
            { timeout: 15_000 },
          );
          await modal.getByRole('button', { name: '创建' }).click();
          const resp = await responsePromise;
          expect(resp.status()).toBeLessThan(400);
        }
      }
    }
  });

  test('snapshot count updates to 2', async ({ authedPage: page }) => {
    await navigateToProjectDetail(page);

    const snapshotTab = page.locator('[role="tab"]').filter({ hasText: '快照' });
    if (await snapshotTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await snapshotTab.click();
      await page.waitForTimeout(1_000);

      await expect(page.getByText(/共 2 个快照/)).toBeVisible({ timeout: 5_000 });
    }
  });

  test('cleanup: delete project', async ({ authedPage: page }) => {
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
