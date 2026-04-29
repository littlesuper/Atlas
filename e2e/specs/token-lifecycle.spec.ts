import { test, expect } from '../fixtures/auth';
import { credentials } from '../fixtures/test-data';

test.describe.serial('Token Lifecycle (AUTH-016/017/033)', () => {
  async function getToken(page: import('@playwright/test').Page): Promise<string> {
    return (await page.evaluate(() => localStorage.getItem('accessToken'))) || '';
  }

  async function getRefreshToken(page: import('@playwright/test').Page): Promise<string> {
    return (await page.evaluate(() => localStorage.getItem('refreshToken'))) || '';
  }

  test('AUTH-016: logout blacklists access token', async ({ authedPage: page }) => {
    const token = await getToken(page);
    expect(token).toBeTruthy();

    const logoutResp = await page.request.post('/api/auth/logout', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logoutResp.status()).toBe(200);

    const meResp = await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meResp.status()).toBe(401);
  });

  test('AUTH-016b: logout clears client-side tokens', async ({ authedPage: page }) => {
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="user-menu"], .arco-dropdown-trigger');
      if (btn) (btn as HTMLElement).click();
    });
    await page.waitForTimeout(300);

    const logoutBtn = page.locator('text=退出登录').first();
    if (await logoutBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await logoutBtn.click();
      await page.waitForURL('**/login**', { timeout: 10_000 });
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      expect(accessToken).toBeNull();
    }
  });

  test('AUTH-017: refresh token returns new access token', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('请输入用户名').fill(credentials.admin.username);
    await page.getByPlaceholder('请输入密码').fill(credentials.admin.password);
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForURL('**/projects**', { timeout: 15_000 });

    const refreshToken = await getRefreshToken(page);
    expect(refreshToken).toBeTruthy();

    const refreshResp = await page.request.post('/api/auth/refresh', {
      data: { refreshToken },
    });
    expect(refreshResp.status()).toBe(200);

    const body = await refreshResp.json();
    expect(body.accessToken).toBeTruthy();

    const meResp = await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${body.accessToken}` },
    });
    expect(meResp.status()).toBe(200);
  });

  test('AUTH-017b: invalid refresh token returns 401', async ({ authedPage: page }) => {
    const refreshResp = await page.request.post('/api/auth/refresh', {
      data: { refreshToken: 'invalid.refresh.token' },
    });
    expect(refreshResp.status()).toBe(401);
  });

  test('AUTH-017c: missing refresh token returns 400', async ({ authedPage: page }) => {
    const refreshResp = await page.request.post('/api/auth/refresh', {
      data: {},
    });
    expect(refreshResp.status()).toBe(400);
  });

  test('AUTH-033: expired/malformed access token returns 401', async ({ authedPage: page }) => {
    const meResp = await page.request.get('/api/auth/me', {
      headers: { Authorization: 'Bearer expired.jwt.token' },
    });
    expect(meResp.status()).toBe(401);

    const noTokenResp = await page.request.get('/api/auth/me');
    expect(noTokenResp.status()).toBe(401);
  });

  test('AUTH-033b: change-password blacklists current token', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('请输入用户名').fill(credentials.admin.username);
    await page.getByPlaceholder('请输入密码').fill(credentials.admin.password);
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForURL('**/projects**', { timeout: 15_000 });

    const token = await getToken(page);

    const changeResp = await page.request.post('/api/auth/change-password', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        currentPassword: credentials.admin.password,
        newPassword: credentials.admin.password,
      },
    });
    expect(changeResp.status()).toBe(200);

    const meResp = await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meResp.status()).toBe(401);
  });
});
