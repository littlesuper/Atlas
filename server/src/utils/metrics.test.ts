import { beforeEach, describe, expect, it } from 'vitest';
import { getMetrics, recordBusinessEvent, recordHttpRequest, resetMetricsForTests } from './metrics';

describe('metrics utilities', () => {
  beforeEach(() => {
    resetMetricsForTests();
  });

  it('exports HTTP duration and request counters in Prometheus format', async () => {
    recordHttpRequest({
      method: 'GET',
      route: '/api/projects',
      statusCode: 200,
      durationMs: 125,
    });

    const metrics = await getMetrics();

    expect(metrics).toContain('atlas_http_requests_total');
    expect(metrics).toContain('method="GET"');
    expect(metrics).toContain('route="/api/projects"');
    expect(metrics).toContain('status_code="200"');
    expect(metrics).toContain('atlas_http_request_duration_seconds_bucket');
  });

  it('exports business event counters without user-specific labels', async () => {
    recordBusinessEvent('auth_login', 'success');
    recordBusinessEvent('auth_login', 'failure');

    const metrics = await getMetrics();

    expect(metrics).toContain('atlas_business_events_total');
    expect(metrics).toContain('event="auth_login"');
    expect(metrics).toContain('result="success"');
    expect(metrics).toContain('result="failure"');
    expect(metrics).not.toContain('user_id');
  });
});
