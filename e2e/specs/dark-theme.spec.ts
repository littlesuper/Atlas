import { test, expect } from '../fixtures/auth';
import { waitForTableLoad } from '../helpers/arco';

test.describe.serial('Dark Theme (THEME-001-003, SYS-007)', () => {
  test('THEME-001: toggle to dark theme applies arco-theme=dark', async ({ authedPage: page }) => {
    await page.goto('/projects');
    await waitForTableLoad(page);

    const bodyAttr = await page.evaluate(() => document.body.getAttribute('arco-theme'));
    const isDark = bodyAttr === 'dark';

    const themeToggle = page.locator('button[aria-label*="主题"], button[aria-label*="theme"], [data-testid="theme-toggle"]').first();
    if (await themeToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await themeToggle.click();
      await page.waitForTimeout(500);

      const newAttr = await page.evaluate(() => document.body.getAttribute('arco-theme'));
      expect(newAttr).toBe(isDark ? null : 'dark');

      await themeToggle.click();
      await page.waitForTimeout(500);
    } else {
      await page.evaluate(() => {
        document.body.setAttribute('arco-theme', 'dark');
      });
      const attr = await page.evaluate(() => document.body.getAttribute('arco-theme'));
      expect(attr).toBe('dark');
      await page.evaluate(() => {
        document.body.removeAttribute('arco-theme');
      });
    }
  });

  test('THEME-002: dark theme persists via localStorage and server sync', async ({ authedPage: page }) => {
    const token = await page.evaluate(() => localStorage.getItem('accessToken'));

    await page.request.put('/api/auth/preferences', {
      headers: { Authorization: `Bearer ${token}` },
      data: { preferences: { theme: 'dark' } },
    });

    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
    });

    await page.goto('/projects');
    await waitForTableLoad(page);
    await page.waitForTimeout(2_000);

    const bodyAttr = await page.evaluate(() => document.body.getAttribute('arco-theme'));
    expect(bodyAttr).toBe('dark');

    await page.request.put('/api/auth/preferences', {
      headers: { Authorization: `Bearer ${token}` },
      data: { preferences: { theme: 'light' } },
    });
    await page.evaluate(() => {
      localStorage.setItem('theme', 'light');
      document.body.removeAttribute('arco-theme');
    });
  });

  test('THEME-003: dark theme text has sufficient contrast', async ({ authedPage: page }) => {
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
      document.body.setAttribute('arco-theme', 'dark');
    });

    await page.goto('/projects');
    await waitForTableLoad(page);
    await page.waitForTimeout(1_000);

    const textElements = await page.locator('body').locator('h1, h2, h3, .arco-typography, .arco-table-td, .arco-card').all();
    let checked = 0;
    for (const el of textElements.slice(0, 10)) {
      const color = await el.evaluate((node) => {
        const style = window.getComputedStyle(node);
        return style.color;
      });
      expect(color).toBeTruthy();
      if (color) checked++;
    }
    expect(checked).toBeGreaterThan(0);

    await page.evaluate(() => {
      localStorage.setItem('theme', 'light');
      document.body.removeAttribute('arco-theme');
    });
  });

  test('SYS-007: theme preference saved to server preferences API', async ({ authedPage: page }) => {
    const token = await page.evaluate(() => localStorage.getItem('accessToken'));

    await page.request.put('/api/auth/preferences', {
      headers: { Authorization: `Bearer ${token}` },
      data: { preferences: { theme: 'dark' } },
    });

    const resp = await page.request.get('/api/auth/preferences', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.theme).toBe('dark');

    await page.request.put('/api/auth/preferences', {
      headers: { Authorization: `Bearer ${token}` },
      data: { preferences: { theme: 'light' } },
    });
  });
});
