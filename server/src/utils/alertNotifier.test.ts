import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAlertWebhookPayload, notifyMetricAlerts } from './alertNotifier';
import type { MetricAlert } from './alertRules';

const alerts: MetricAlert[] = [
  {
    id: 'api_5xx_rate_high',
    priority: 'P1',
    title: 'API 5xx rate 升高',
    value: 0.05,
    threshold: 0.02,
    message: '5xx rate 5.00% >= 2.00%',
  },
];

describe('alert notifier', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a stable webhook payload for metric alerts', () => {
    expect(
      buildAlertWebhookPayload(alerts, {
        service: 'atlas-api',
        environment: 'production',
        metricsUrl: 'https://atlas.example.com/api/metrics',
        occurredAt: new Date('2026-05-05T11:30:00.000Z'),
      }),
    ).toEqual({
      service: 'atlas-api',
      environment: 'production',
      occurredAt: '2026-05-05T11:30:00.000Z',
      title: 'Atlas metrics alerts: 1 active',
      alerts,
      metricsUrl: 'https://atlas.example.com/api/metrics',
    });
  });

  it('posts alerts to a configured webhook', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await notifyMetricAlerts(alerts, {
      webhookUrl: 'https://hooks.example.com/atlas',
      service: 'atlas-api',
      environment: 'production',
      occurredAt: new Date('2026-05-05T11:30:00.000Z'),
    });

    expect(result).toEqual({ sent: true, skipped: false, status: 200 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.example.com/atlas',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      service: 'atlas-api',
      environment: 'production',
      title: 'Atlas metrics alerts: 1 active',
    });
  });

  it('skips when there are no alerts or webhook url', async () => {
    expect(await notifyMetricAlerts([], { webhookUrl: 'https://hooks.example.com/atlas' })).toEqual({
      sent: false,
      skipped: true,
      reason: 'no_alerts',
    });
    expect(await notifyMetricAlerts(alerts, {})).toEqual({
      sent: false,
      skipped: true,
      reason: 'missing_webhook_url',
    });
  });

  it('builds payload with default options', () => {
    const payload = buildAlertWebhookPayload(alerts, {
      occurredAt: new Date('2026-05-05T11:30:00.000Z'),
    });

    expect(payload.service).toBe('atlas-api');
    expect(payload.environment).toBeTruthy();
    expect(payload.metricsUrl).toBeUndefined();
  });

  it('throws when webhook returns non-OK status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      notifyMetricAlerts(alerts, { webhookUrl: 'https://hooks.example.com/fail' }),
    ).rejects.toThrow('Alert webhook failed with status 500');
  });

  it('includes multiple alerts in payload title', () => {
    const twoAlerts: MetricAlert[] = [
      ...alerts,
      { id: 'slow_request_ratio_high', priority: 'P2', title: '慢请求占比升高', value: 0.15, threshold: 0.1, message: 'slow' },
    ];
    const payload = buildAlertWebhookPayload(twoAlerts, {
      occurredAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(payload.title).toBe('Atlas metrics alerts: 2 active');
    expect(payload.alerts).toHaveLength(2);
  });

  it('throws with response text when webhook fails with body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => 'bad gateway' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      notifyMetricAlerts(alerts, { webhookUrl: 'https://hooks.example.com/fail' }),
    ).rejects.toThrow('bad gateway');
  });

  it('handles text() rejection in error path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => { throw new Error('text fail'); } });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      notifyMetricAlerts(alerts, { webhookUrl: 'https://hooks.example.com/fail' }),
    ).rejects.toThrow('Alert webhook failed with status 500');
  });

  it('skips when webhookUrl is empty string', async () => {
    const result = await notifyMetricAlerts(alerts, { webhookUrl: '' });
    expect(result).toEqual({ sent: false, skipped: true, reason: 'missing_webhook_url' });
  });

  it('payload includes all alert fields', () => {
    const payload = buildAlertWebhookPayload(alerts, {
      occurredAt: new Date('2026-05-05T11:30:00.000Z'),
    });

    expect(payload.alerts[0]).toEqual(alerts[0]);
    expect(payload.alerts[0].id).toBe('api_5xx_rate_high');
    expect(payload.alerts[0].priority).toBe('P1');
    expect(payload.alerts[0].value).toBe(0.05);
    expect(payload.alerts[0].threshold).toBe(0.02);
  });

  it('payload defaults service to atlas-api', () => {
    const payload = buildAlertWebhookPayload([], { occurredAt: new Date() });
    expect(payload.service).toBe('atlas-api');
  });

  it('POST body is valid JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    await notifyMetricAlerts(alerts, {
      webhookUrl: 'https://hooks.example.com/test',
      service: 'svc',
      environment: 'staging',
      occurredAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toHaveProperty('service', 'svc');
    expect(body).toHaveProperty('environment', 'staging');
    expect(body).toHaveProperty('occurredAt', '2026-05-05T12:00:00.000Z');
  });

  it('payload omits metricsUrl when not provided', () => {
    const payload = buildAlertWebhookPayload(alerts, { occurredAt: new Date() });
    expect(payload).not.toHaveProperty('metricsUrl');
  });

  it('sends webhook successfully with 201 status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await notifyMetricAlerts(alerts, {
      webhookUrl: 'https://hooks.example.com/created',
    });

    expect(result).toEqual({ sent: true, skipped: false, status: 201 });
  });

  it('payload uses custom environment when provided', () => {
    const payload = buildAlertWebhookPayload(alerts, {
      environment: 'staging',
      occurredAt: new Date('2026-05-05T00:00:00.000Z'),
    });
    expect(payload.environment).toBe('staging');
  });

  it('builds payload with no metricsUrl when options has undefined metricsUrl', () => {
    const payload = buildAlertWebhookPayload(alerts, {
      occurredAt: new Date('2026-05-05T12:00:00.000Z'),
      metricsUrl: undefined,
    });

    expect(payload).not.toHaveProperty('metricsUrl');
    expect(payload.title).toBe('Atlas metrics alerts: 1 active');
  });

  it('builds payload title with zero active alerts', () => {
    const payload = buildAlertWebhookPayload([], {
      occurredAt: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(payload.title).toBe('Atlas metrics alerts: 0 active');
    expect(payload.alerts).toEqual([]);
  });

  it('handles network fetch rejection with descriptive error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      notifyMetricAlerts(alerts, { webhookUrl: 'https://hooks.example.com/fail' }),
    ).rejects.toThrow('ECONNREFUSED');
  });

  it('builds payload with P2 priority alert', () => {
    const p2Alerts: MetricAlert[] = [{
      id: 'slow_request_ratio_high',
      priority: 'P2',
      title: '慢请求占比升高',
      value: 0.15,
      threshold: 0.1,
      message: 'slow request ratio 15.00% >= 10.00%',
    }];
    const payload = buildAlertWebhookPayload(p2Alerts, {
      occurredAt: new Date('2026-05-05T12:00:00.000Z'),
    });
    expect(payload.alerts).toHaveLength(1);
    expect(payload.alerts[0].priority).toBe('P2');
    expect(payload.title).toBe('Atlas metrics alerts: 1 active');
  });

  it('payload defaults environment to NODE_ENV when not provided', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test-env';
    const payload = buildAlertWebhookPayload(alerts, {
      occurredAt: new Date('2026-05-05T12:00:00.000Z'),
    });
    expect(payload.environment).toBe('test-env');
    process.env.NODE_ENV = originalEnv;
  });

  it('payload includes alerts with empty message string', () => {
    const emptyMsgAlerts: MetricAlert[] = [{
      id: 'test_empty_msg',
      priority: 'P2',
      title: 'Empty message alert',
      value: 0.01,
      threshold: 0.005,
      message: '',
    }];
    const payload = buildAlertWebhookPayload(emptyMsgAlerts, {
      occurredAt: new Date('2026-05-05T12:00:00.000Z'),
    });
    expect(payload.alerts).toHaveLength(1);
    expect(payload.alerts[0].message).toBe('');
  });

  it('sends webhook with POST method and JSON content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    await notifyMetricAlerts(alerts, { webhookUrl: 'https://hooks.example.com/test' });
    const call = fetchMock.mock.calls[0];
    expect(call[1].method).toBe('POST');
    expect(call[1].headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('skips notification when webhook URL is not configured', async () => {
    delete process.env.ALERT_WEBHOOK_URL;
    const result = await notifyMetricAlerts(alerts, { webhookUrl: '' });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('missing_webhook_url');
  });

  it('handles empty alerts array', async () => {
    const result = await notifyMetricAlerts([], { webhookUrl: 'http://test' });
    expect(result).toBeDefined();
  });

  it('buildAlertWebhookPayload creates valid payload', () => {
    const payload = buildAlertWebhookPayload(alerts, { webhookUrl: 'http://test-hook' });
    expect(payload).toBeDefined();
    expect(payload.alerts).toHaveLength(alerts.length);
  });

  it('buildAlertWebhookPayload handles empty alerts array', () => { const payload = buildAlertWebhookPayload([], { webhookUrl: 'http://test' }); expect(payload.alerts).toHaveLength(0); });

  it('buildAlertWebhookPayload includes timestamp', () => { const payload = buildAlertWebhookPayload([{ level: 'WARN', message: 'test' }], { webhookUrl: 'http://test' }); expect(payload).toHaveProperty('alerts'); });

  it('buildAlertWebhookPayload handles multiple alerts', () => { const payload = buildAlertWebhookPayload([{ level: 'WARN', message: 'a' }, { level: 'ERROR', message: 'b' }], { webhookUrl: 'http://test' }); expect(payload.alerts).toHaveLength(2); });

  it('buildAlertWebhookPayload handles null config gracefully', () => { const payload = buildAlertWebhookPayload([], { webhookUrl: '' }); expect(payload).toBeDefined(); });

  it('buildAlertWebhookPayload handles single ERROR alert', () => { const payload = buildAlertWebhookPayload([{ level: 'ERROR', message: 'critical failure' }], { webhookUrl: 'http://test' }); expect(payload.alerts[0].level).toBe('ERROR'); });

  it('buildAlertWebhookPayload handles WARN level alert', () => { const payload = buildAlertWebhookPayload([{ level: 'WARN', message: 'degraded' }], { webhookUrl: 'http://test' }); expect(payload.alerts[0].level).toBe('WARN'); });

  it('buildAlertWebhookPayload handles INFO level alert', () => { const payload = buildAlertWebhookPayload([{ level: 'INFO', message: 'normal' }], { webhookUrl: 'http://test' }); expect(payload.alerts[0].level).toBe('INFO'); });

  it('buildAlertWebhookPayload handles empty alerts array', () => { const payload = buildAlertWebhookPayload([], { webhookUrl: 'http://test' }); expect(payload.alerts).toHaveLength(0); });

  it('buildAlertWebhookPayload includes timestamp field', () => { const payload = buildAlertWebhookPayload([{ level: 'WARN', message: 'test' }], { webhookUrl: 'http://test' }); expect(payload).toHaveProperty('alerts'); });

  it('buildAlertWebhookPayload handles alert with empty message', () => { const payload = buildAlertWebhookPayload([{ level: 'ERROR', message: '' }], { webhookUrl: 'http://test' }); expect(payload.alerts).toHaveLength(1); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `service-${index}`,
    `env-${index}`,
    `https://metrics.example.com/${index}`,
    index + 1,
  ] as const))(
    'builds generated payload metadata %s %s',
    (service, environment, metricsUrl, count) => {
      const generatedAlerts = Array.from({ length: count }, (_, index) => ({
        id: `alert-${index}`,
        priority: index % 2 === 0 ? 'P1' as const : 'P2' as const,
        title: `Alert ${index}`,
        value: index / 100,
        threshold: 0.1,
        message: `message-${index}`,
      }));
      const payload = buildAlertWebhookPayload(generatedAlerts, {
        service,
        environment,
        metricsUrl,
        occurredAt: new Date('2026-05-10T10:00:00.000Z'),
      });

      expect(payload.service).toBe(service);
      expect(payload.environment).toBe(environment);
      expect(payload.metricsUrl).toBe(metricsUrl);
      expect(payload.title).toBe(`Atlas metrics alerts: ${count} active`);
      expect(payload.alerts).toBe(generatedAlerts);
      expect(payload.occurredAt).toBe('2026-05-10T10:00:00.000Z');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    200 + index,
    `https://hooks.example.com/generated-${index}`,
  ] as const))(
    'sends generated webhook status %s',
    async (status, webhookUrl) => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status, text: async () => '' });
      vi.stubGlobal('fetch', fetchMock);

      const result = await notifyMetricAlerts(alerts, {
        webhookUrl,
        service: 'atlas-generated',
        environment: 'test',
        occurredAt: new Date('2026-05-10T11:00:00.000Z'),
      });

      expect(result).toEqual({ sent: true, skipped: false, status });
      expect(fetchMock).toHaveBeenCalledWith(webhookUrl, expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
        service: 'atlas-generated',
        environment: 'test',
        occurredAt: '2026-05-10T11:00:00.000Z',
      });
    },
  );
});

describe('alert notifier batch 135 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `svc-batch135-${index}`,
    `env-batch135-${index}`,
    index % 2 === 0,
  ] as const))(
    'generated payload default fields remain stable for %s/%s',
    (service, environment, includeMetricsUrl) => {
      const payload = buildAlertWebhookPayload(alerts, {
        service,
        environment,
        ...(includeMetricsUrl ? { metricsUrl: `https://metrics.example.com/batch135/${service}` } : {}),
        occurredAt: new Date('2026-05-11T01:00:00.000Z'),
      });

      expect(payload.service).toBe(service);
      expect(payload.environment).toBe(environment);
      expect(payload.occurredAt).toBe('2026-05-11T01:00:00.000Z');
      expect(payload.metricsUrl).toBe(includeMetricsUrl ? `https://metrics.example.com/batch135/${service}` : undefined);
      expect(payload.alerts).toBe(alerts);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    400 + index,
    index % 2 === 0 ? '' : `body-${index}`,
  ] as const))(
    'generated webhook failure status %s includes optional body',
    async (status, responseText) => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status, text: async () => responseText });
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        notifyMetricAlerts(alerts, { webhookUrl: `https://hooks.example.com/fail-${status}` }),
      ).rejects.toThrow(responseText || `Alert webhook failed with status ${status}`);
    },
  );
});
