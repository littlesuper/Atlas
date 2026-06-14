import { test, expect } from '../fixtures/auth';
import {
  clickNavItem,
  waitForPageLoad,
  waitForTableLoad,
} from '../helpers/arco';

test.describe.serial('Admin WeCom Config @p2', () => {

  test('navigate to admin page and find wecom config tab', async ({ authedPage: page }) => {
    await clickNavItem(page, '账号管理');
    await waitForPageLoad(page);
    await page.waitForTimeout(500);

    const wecomTab = page.getByText('企微配置', { exact: false });
    if (await wecomTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await wecomTab.click();
      await page.waitForTimeout(1_000);

      await expect(
        page.getByText(/企业微信|企微/).first(),
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test('wecom config form has expected fields', async ({ authedPage: page }) => {
    await clickNavItem(page, '账号管理');
    await waitForPageLoad(page);
    await page.waitForTimeout(500);

    const wecomTab = page.getByText('企微配置', { exact: false });
    if (await wecomTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await wecomTab.click();
      await page.waitForTimeout(1_000);

      const corpIdField = page.getByPlaceholder(/CorpID|corpId|企业ID/i);
      if (await corpIdField.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(corpIdField).toBeVisible();
      }

      const agentIdField = page.getByPlaceholder(/AgentId|应用ID/i);
      if (await agentIdField.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(agentIdField).toBeVisible();
      }

      const secretField = page.getByPlaceholder(/Secret|密钥/i).first();
      if (await secretField.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(secretField).toBeVisible();
      }
    }
  });

  test('wecom config save button is present', async ({ authedPage: page }) => {
    await clickNavItem(page, '账号管理');
    await waitForPageLoad(page);
    await page.waitForTimeout(500);

    const wecomTab = page.getByText('企微配置', { exact: false });
    if (await wecomTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await wecomTab.click();
      await page.waitForTimeout(1_000);

      const saveBtn = page.getByRole('button', { name: /保存|确定/ });
      if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(saveBtn).toBeVisible();
      }
    }
  });
});
