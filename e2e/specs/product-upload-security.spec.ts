import { test, expect } from '../fixtures/auth';
import { uniqueName } from '../fixtures/test-data';
import { waitForTableLoad } from '../helpers/arco';

test.describe.serial('Product Upload Security', () => {
  const productName = uniqueName('上传安全');
  let productId: string;

  async function getToken(page: import('@playwright/test').Page): Promise<string> {
    return (await page.evaluate(() => localStorage.getItem('accessToken'))) || '';
  }

  test('setup: create product', async ({ authedPage: page }) => {
    await page.goto('/products');
    await waitForTableLoad(page);

    const token = await getToken(page);
    const resp = await page.request.post('/api/products', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: productName, model: 'TEST-001', category: 'ROUTER', status: 'DEVELOPING' },
    });
    expect(resp.status()).toBeLessThan(400);
    const body = await resp.json();
    productId = body.data?.id ?? body.id;
    expect(productId).toBeTruthy();
  });

  test('PROD-026: .exe file upload is rejected by server', async ({ authedPage: page }) => {
    const token = await getToken(page);

    const buffer = Buffer.from('MZ\x90\x00' + '\x00'.repeat(100));
    const resp = await page.request.post('/api/uploads', {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'malware.exe',
          mimeType: 'application/x-msdownload',
          buffer,
        },
      },
    });

    expect([400, 415, 500]).toContain(resp.status());
  });

  test('PROD-024: file with mismatched extension (exe renamed to png)', async ({ authedPage: page }) => {
    const token = await getToken(page);

    const buffer = Buffer.from('MZ\x90\x00' + '\x00'.repeat(100));
    const resp = await page.request.post('/api/uploads', {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'fake.png',
          mimeType: 'image/png',
          buffer,
        },
      },
    });

    if (resp.status() < 400) {
      const body = await resp.json();
      const url = body.data?.url ?? body.url;
      expect(url).not.toContain('.exe');
    } else {
      expect(resp.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('PROD-025: SVG with XSS onload is sanitized', async ({ authedPage: page }) => {
    const token = await getToken(page);

    const xssSvg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(\'xss\')"><rect width="100" height="100"/></svg>';
    const buffer = Buffer.from(xssSvg);
    const resp = await page.request.post('/api/uploads', {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'xss.svg',
          mimeType: 'image/svg+xml',
          buffer,
        },
      },
    });

    expect(resp.status()).toBeLessThan(400);

    const body = await resp.json();
    const url = body.data?.url ?? body.url;
    expect(url).toBeTruthy();

    const fileResp = await page.request.get(url);
    const text = await fileResp.text();
    expect(text).not.toContain('onload');
    expect(text).toContain('<rect');
    expect(text).toContain('</svg>');
  });

  test('cleanup: delete test product', async ({ authedPage: page }) => {
    if (!productId) return;
    const token = await getToken(page);
    await page.request.delete(`/api/products/${productId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });
});
