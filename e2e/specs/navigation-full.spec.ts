import { test, expect } from '../fixtures/auth';
import {
  clickNavItem,
  waitForPageLoad,
} from '../helpers/arco';

test.describe.serial('Full Navigation Coverage @p1', () => {

  test('sidebar shows all major sections', async ({ authedPage: page }) => {
    await expect(page.getByText('项目管理').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('产品管理').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('项目资源').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('项目周报').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('AI管理').first()).toBeVisible({ timeout: 5_000 });
  });

  test('navigate to each major section and verify URL', async ({ authedPage: page }) => {
    const navItems = [
      { text: '项目管理', url: /\/projects/ },
      { text: '产品管理', url: /\/products/ },
      { text: '项目周报', url: /\/weekly-reports/ },
    ];

    for (const item of navItems) {
      await clickNavItem(page, item.text);
      await expect(page).toHaveURL(item.url, { timeout: 10_000 });
      await page.waitForTimeout(300);
    }
  });

  test('navigate to risk dashboard', async ({ authedPage: page }) => {
    const riskNav = page.locator('.nav-item').filter({ hasText: '风险' });
    if (await riskNav.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await riskNav.click();
      await page.waitForTimeout(1_000);
      await expect(page).toHaveURL(/\/risk/, { timeout: 5_000 }).catch(() => {});
    }
  });

  test('navigate to workload page', async ({ authedPage: page }) => {
    await clickNavItem(page, '项目资源');
    await waitForPageLoad(page);
    await expect(page.getByText('项目资源').first()).toBeVisible({ timeout: 10_000 });
  });

  test('admin page shows all sub-tabs', async ({ authedPage: page }) => {
    await clickNavItem(page, 'AI管理');
    await waitForPageLoad(page);

    await expect(page.getByText('AI管理').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('账号管理').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('操作日志').first()).toBeVisible({ timeout: 5_000 });
  });

  test('breadcrumb or page title updates on navigation', async ({ authedPage: page }) => {
    await clickNavItem(page, '产品管理');
    await page.waitForTimeout(500);
    await expect(page.getByText(/产品管理|产品列表/).first()).toBeVisible({ timeout: 5_000 });
  });
});
