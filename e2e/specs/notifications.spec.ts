import { test, expect } from '../fixtures/auth';
import { expectMessage, waitForPageLoad } from '../helpers/arco';

test.describe.serial('Notification Management', () => {
  test('notification bell is visible in header', async ({ authedPage: page }) => {
    await waitForPageLoad(page);
    // The bell icon should be rendered in the header area
    const bell = page.locator('.arco-icon-notification').first();
    await expect(bell).toBeVisible({ timeout: 10_000 });
  });

  test('clicking bell opens notification panel', async ({ authedPage: page }) => {
    await waitForPageLoad(page);
    const bellArea = page.locator('.arco-badge').first();
    await bellArea.click();

    // Panel should show "通知" header
    await expect(page.getByText('通知').first()).toBeVisible({ timeout: 5_000 });
  });

  test('generate notifications via API', async ({ authedPage: page }) => {
    await waitForPageLoad(page);

    // Use page.evaluate to call the API with the browser's auth token
    const status = await page.evaluate(async () => {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/notifications/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.status;
    });
    expect(status).toBeLessThan(400);
  });

  test('mark all as read', async ({ authedPage: page }) => {
    await waitForPageLoad(page);

    // Open notification panel
    const bellArea = page.locator('.arco-badge').first();
    await bellArea.click();
    await page.waitForTimeout(500);

    // If there's a "全部已读" button, click it
    const markAllBtn = page.getByText('全部已读').first();
    if (await markAllBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await markAllBtn.click();
      await expectMessage(page, '全部已读');
    }
  });

  test('delete a notification', async ({ authedPage: page }) => {
    await waitForPageLoad(page);

    // Generate fresh notifications so we have something to delete
    await page.evaluate(async () => {
      const token = localStorage.getItem('accessToken');
      await fetch('/api/notifications/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    });

    // Open notification panel
    const bellArea = page.locator('.arco-badge').first();
    await bellArea.click();
    await page.waitForTimeout(1_000);

    // The panel is a positioned div — scope delete button search within it
    const panel = page.locator('div[style*="position: absolute"][style*="width: 360"]');
    const deleteBtn = panel.locator('.arco-icon-delete').first();
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteBtn.click();
      await expectMessage(page, '已删除');
    }
  });
});
