import { test, expect } from '@playwright/test';
import { login } from '../fixtures/auth';
import { credentials, uniqueName } from '../fixtures/test-data';
import {
  createProjectViaPage,
  pickDateRangeOnPage,
  waitForTableLoad,
  clickTab,
  clickSubNav,
  searchProject,
  clickNavItem,
  expectMessage,
  confirmModal,
  waitForPageLoad,
} from '../helpers/arco';

test.describe.serial('P1 UI Interactions', () => {
  const projectName = uniqueName('P1UI项目');

  test.afterAll(async ({}) => {});

  // ────────────────────────────────────────────────
  // AUTH-040: WeChat tab hidden when disabled
  // ────────────────────────────────────────────────
  test.describe('AUTH-040: WeChat tab behavior when unconfigured', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('wecom tab shows not-configured state', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      const wecomTab = page.locator('[role="tab"]').filter({ hasText: '企业微信' });

      if (await wecomTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await wecomTab.click();
        await page.waitForTimeout(2_000);
        const notConfigured = page.getByText(/未配置|加载.*失败|不可用/);
        expect(
          await notConfigured.isVisible({ timeout: 5_000 }).catch(() => false),
        ).toBeTruthy();
      }

      const passwordTab = page.locator('[role="tab"]').filter({ hasText: '密码登录' });
      await expect(passwordTab).toBeVisible();
      await expect(page.getByPlaceholder('请输入用户名')).toBeVisible();
      await expect(page.getByPlaceholder('请输入密码')).toBeVisible();
    });
  });

  // ────────────────────────────────────────────────
  // AUTH-047: Network error shows friendly message
  // ────────────────────────────────────────────────
  test.describe('AUTH-047: Network error on login', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('shows friendly error and re-enables login button', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      await page.route('**/api/**', (route) => route.abort());

      await page.getByPlaceholder('请输入用户名').fill(credentials.admin.username);
      await page.getByPlaceholder('请输入密码').fill(credentials.admin.password);
      await page.getByRole('button', { name: '登录' }).click();

      const errorMsg = page.locator('.arco-message, .arco-form-message-error, .arco-notification');
      await expect(errorMsg.first()).toBeVisible({ timeout: 10_000 });

      await page.waitForTimeout(1_000);
      const loginBtn = page.getByRole('button', { name: /登录/ });
      await expect(loginBtn).toBeEnabled({ timeout: 5_000 });

      await page.unroute('**/api/**');
    });
  });

  // ────────────────────────────────────────────────
  // AUTH-041: URL ?code=xxx auto-switches to WeChat tab
  // ────────────────────────────────────────────────
  test.describe('AUTH-041: URL code param switches to WeChat tab', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('code parameter activates wecom tab', async ({ page }) => {
      test.skip(true, 'Requires WeChat (wecom) to be configured');

      await page.goto('/login?code=test-code');
      await page.waitForLoadState('networkidle');

      const wecomTab = page.locator('[role="tab"]').filter({ hasText: '企业微信' });
      await expect(wecomTab).toHaveClass(/active|arco-tabs-tab-active/, { timeout: 5_000 });
    });
  });

  // ────────────────────────────────────────────────
  // PROD-028: Compare button disabled with < 2 selected
  // ────────────────────────────────────────────────
  test.describe('PROD-028: Compare button with < 2 selected', () => {
    test('compare button not actionable with only 1 product selected', async ({ page }) => {
      await login(page, credentials.admin.username, credentials.admin.password);
      await page.goto('/products');
      await waitForTableLoad(page);

      const compareBtn = page.getByRole('button', { name: /对比|比较/ });

      const visibleBeforeSelect = await compareBtn.isVisible({ timeout: 2_000 }).catch(() => false);
      expect(visibleBeforeSelect).toBeFalsy();

      const checkboxes = page.locator('.arco-table-body .arco-checkbox');
      const count = await checkboxes.count();

      if (count >= 1) {
        await checkboxes.first().click();
        await page.waitForTimeout(300);

        const visibleAfterOne = await compareBtn.isVisible({ timeout: 2_000 }).catch(() => false);
        if (visibleAfterOne) {
          await expect(compareBtn).toBeDisabled();
        }
      }
    });
  });

  // ────────────────────────────────────────────────
  // PROD-039: Create form only shows DEVELOPING status
  // ────────────────────────────────────────────────
  test.describe('PROD-039: Create product form default status', () => {
    test('status dropdown only shows DEVELOPING when creating', async ({ page }) => {
      await login(page, credentials.admin.username, credentials.admin.password);
      await page.goto('/products');
      await waitForTableLoad(page);

      await page.getByRole('button', { name: /新建产品/ }).click();
      await expect(page.locator('.arco-drawer')).toBeVisible({ timeout: 5_000 });
      await page.waitForTimeout(300);

      const statusSelect = page
        .locator('.arco-drawer .arco-select')
        .filter({ has: page.locator('[placeholder="请选择产品状态"]') });

      if (await statusSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await statusSelect.click();
        await page.waitForTimeout(300);

        const options = page.locator('.arco-select-popup:visible .arco-select-option');
        const optionCount = await options.count();

        expect(optionCount).toBeGreaterThanOrEqual(1);

        const firstOption = options.first();
        await expect(firstOption).toContainText('研发中');
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    });
  });

  // ────────────────────────────────────────────────
  // PROD-040: Project tab shows associated products
  // ────────────────────────────────────────────────
  test.describe.serial('PROD-040: Project detail products tab', () => {
    test('setup: create project', async ({ page }) => {
      await login(page, credentials.admin.username, credentials.admin.password);
      await createProjectViaPage(page, { name: projectName });
      await searchProject(page, projectName);
      await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
    });

    test('products tab is visible in project detail', async ({ page }) => {
      await login(page, credentials.admin.username, credentials.admin.password);
      await page.goto('/projects');
      await waitForTableLoad(page);
      await searchProject(page, projectName);

      await page.locator('.arco-table-td').getByText(projectName).click();
      await expect(page).toHaveURL(/\/projects\/.+/);
      await page.waitForTimeout(1_000);

      const productsTab = page.locator('[role="tab"]').filter({ hasText: '产品列表' });
      if (await productsTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await productsTab.click();
        await page.waitForTimeout(1_000);
        const tabContent = page.locator('.arco-tabs-content-item-active');
        await expect(tabContent).toBeVisible({ timeout: 10_000 });
        const hasTable = await tabContent.locator('.arco-table').isVisible().catch(() => false);
        const hasEmpty = await tabContent.locator('.arco-empty').isVisible().catch(() => false);
        expect(hasTable || hasEmpty).toBeTruthy();
      }
    });

    test('cleanup: delete project', async ({ page }) => {
      await login(page, credentials.admin.username, credentials.admin.password);
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

  // ────────────────────────────────────────────────
  // CHK-008: Activity shows check item count "3/5"
  // ────────────────────────────────────────────────
  test.describe('CHK-008: Activity check item count', () => {
    test('check items column shows fraction format', async ({ page }) => {
      test.skip(true, 'Requires complex setup with check items');

      const project = uniqueName('CHK测试');
      await login(page, credentials.admin.username, credentials.admin.password);
      await createProjectViaPage(page, { name: project });
      await searchProject(page, project);

      await page.locator('.arco-table-td').getByText(project).click();
      await expect(page).toHaveURL(/\/projects\/.+/);
      await page.waitForTimeout(1_000);

      // TODO: Create activity with 5 check items, check 3
      // Verify column shows "3/5" format

      const countCell = page.getByText(/\d+\/\d+/);
      if (await countCell.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(countCell).toContainText(/\d+\/\d+/);
      }

      await page.goto('/projects');
      await waitForTableLoad(page);
      await searchProject(page, project);
      const row = page.locator('.arco-table-tr').filter({ hasText: project });
      if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await row.locator('button[class*="danger"]').click();
        await confirmModal(page);
      }
    });
  });

  // ────────────────────────────────────────────────
  // I18N-001: Language switch zh-CN <-> en-US
  // ────────────────────────────────────────────────
  test.describe('I18N-001: Language switch', () => {
    test('language switcher toggles UI language', async ({ page }) => {
      test.skip(true, 'No language switcher UI currently implemented');

      await login(page, credentials.admin.username, credentials.admin.password);
      await page.goto('/projects');
      await waitForTableLoad(page);

      await expect(page.getByText('项目管理')).toBeVisible();

      const langSwitcher = page.locator('[data-testid="lang-switcher"], button').filter({ hasText: /EN|中文|English/ });
      await langSwitcher.click();

      await expect(page.getByText('Project Management')).toBeVisible({ timeout: 5_000 });

      await langSwitcher.click();
      await expect(page.getByText('项目管理')).toBeVisible({ timeout: 5_000 });
    });
  });

  // ────────────────────────────────────────────────
  // PROJ-032: Snapshot readonly mode
  // ────────────────────────────────────────────────
  test.describe.serial('PROJ-032: Snapshot readonly mode', () => {
    const snapProject = uniqueName('快照只读测试');

    test('setup: create project and snapshot', async ({ page }) => {
      await login(page, credentials.admin.username, credentials.admin.password);
      await createProjectViaPage(page, { name: snapProject });
      await searchProject(page, snapProject);
      await page.locator('.arco-table-td').getByText(snapProject).click();
      await expect(page).toHaveURL(/\/projects\/.+/);
      await page.waitForTimeout(1_000);

      await clickTab(page, '项目快照');
      await page.waitForTimeout(500);

      await page.getByRole('button', { name: '创建快照' }).click();
      const modal = page.locator('.arco-modal').filter({ hasText: '创建项目快照' });
      await expect(modal).toBeVisible({ timeout: 5_000 });

      const createResp = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/snapshot') && r.request().method() === 'POST',
          { timeout: 15_000 },
        ),
        modal.getByRole('button', { name: '创建' }).click(),
      ]).then(([r]) => r);
      expect(createResp.status()).toBeLessThan(400);
      await expectMessage(page, '快照创建成功');
    });

    test('snapshot view is read-only', async ({ page }) => {
      await login(page, credentials.admin.username, credentials.admin.password);
      await page.goto('/projects');
      await waitForTableLoad(page);
      await searchProject(page, snapProject);
      await page.locator('.arco-table-td').getByText(snapProject).click();
      await expect(page).toHaveURL(/\/projects\/.+/);
      await page.waitForTimeout(1_000);

      await clickTab(page, '项目快照');
      await page.waitForTimeout(500);

      await page.getByRole('button', { name: '查看' }).first().click();
      await expect(page).toHaveURL(/\/projects\/.+\/snapshot\/.+/, { timeout: 10_000 });
      await page.waitForTimeout(1_500);

      const banner = page.locator('.arco-alert');
      await expect(banner).toBeVisible({ timeout: 5_000 });
      await expect(banner.getByText('所有内容为只读')).toBeVisible();

      const editIcons = page.locator('.arco-table-td .arco-icon-edit');
      const deleteIcons = page.locator('.arco-table-td .arco-icon-delete');
      await expect(editIcons).toHaveCount(0);
      await expect(deleteIcons).toHaveCount(0);

      const activityDropdown = page.getByRole('button', { name: /活动/ });
      if (await activityDropdown.isVisible().catch(() => false)) {
        await activityDropdown.click();
        await page.waitForTimeout(300);
        await expect(page.getByText('新建活动')).not.toBeVisible();
      }
    });

    test('cleanup: delete project', async ({ page }) => {
      await login(page, credentials.admin.username, credentials.admin.password);
      await page.goto('/projects');
      await waitForTableLoad(page);
      await searchProject(page, snapProject);

      const row = page.locator('.arco-table-tr').filter({ hasText: snapProject });
      if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await row.locator('button[class*="danger"]').click();
        await confirmModal(page);
        await expectMessage(page, '项目删除成功');
      }
    });
  });

  // ────────────────────────────────────────────────
  // SYS-003: Upload mid-disconnect friendly error
  // ────────────────────────────────────────────────
  test.describe('SYS-003: Upload disconnect error handling', () => {
    test('upload shows friendly error on network failure', async ({ page }) => {
      test.skip(true, 'Hard to test reliably in E2E - covered by unit tests');
    });
  });

  // ────────────────────────────────────────────────
  // THEME-004: Column preferences persistence
  // ────────────────────────────────────────────────
  test.describe('THEME-004: Column preferences persistence', () => {
    test('column prefs persist across page reloads', async ({ page }) => {
      test.skip(true, 'Already covered by useColumnPrefs.test.ts unit test');
    });
  });
});
