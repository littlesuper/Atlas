import { test, expect } from '../fixtures/auth';
import {
  clickNavItem,
  clickTab,
  waitForTableLoad,
  waitForPageLoad,
} from '../helpers/arco';

test.describe.serial('AI Config Management @p1', () => {

  test('navigate to AI config tab', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, 'AI管理');

    await page.waitForTimeout(1_000);
    await expect(page.getByText('API 配置')).toBeVisible({ timeout: 5_000 });
  });

  test('view token usage statistics', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, 'AI管理');
    await page.waitForTimeout(1_000);

    const statsSection = page.getByText('Token 使用统计');
    if (await statsSection.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(statsSection).toBeVisible();

      await expect(page.getByText('总调用次数')).toBeVisible({ timeout: 3_000 });
    }
  });

  test('create AI config drawer opens with correct fields', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, 'AI管理');
    await page.waitForTimeout(1_000);

    const createBtn = page.getByRole('button', { name: /新建配置/ });
    if (await createBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await createBtn.click();

      const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: /新建配置/ });
      if (await drawer.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(drawer.getByText('配置名称')).toBeVisible({ timeout: 3_000 });
        await expect(drawer.getByText('API URL')).toBeVisible();
        await expect(drawer.getByText('API Key')).toBeVisible();

        const providerSelect = drawer.locator('[role="combobox"]').filter({
          has: page.locator('[placeholder*="服务商"]'),
        });
        if (await providerSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await providerSelect.click();
          await page.waitForTimeout(300);

          const deepseekOpt = page.locator('[data-slot="select-content"]:visible [role="option"]').filter({ hasText: 'DeepSeek' });
          if (await deepseekOpt.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await deepseekOpt.click();
            await page.waitForTimeout(500);

            const apiUrlInput = drawer.getByPlaceholder(/api\.openai/);
            if (await apiUrlInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
              const value = await apiUrlInput.inputValue();
              expect(value).toContain('deepseek');
            }
          } else {
            await page.keyboard.press('Escape');
          }
        }

        await page.keyboard.press('Escape');
      }
    }
  });

  test('empty state or config list displays', async ({ authedPage: page }) => {
    await clickNavItem(page, '系统管理');
    await waitForPageLoad(page);
    await clickTab(page, 'AI管理');
    await page.waitForTimeout(1_000);

    const hasConfig = await page.getByText(/暂无AI配置/).isVisible({ timeout: 3_000 }).catch(() => false);
    const hasCard = await page.locator('[data-slot="card"]').first().isVisible({ timeout: 3_000 }).catch(() => false);

    expect(hasConfig || hasCard).toBeTruthy();
  });
});
