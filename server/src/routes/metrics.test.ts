import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/metrics', () => ({
  getMetrics: vi.fn(async () => '# HELP atlas_test_metric test\natlas_test_metric 1\n'),
  getMetricsContentType: vi.fn(() => 'text/plain; version=0.0.4; charset=utf-8'),
}));

import metricsRoutes from './metrics';

function createTestApp() {
  const app = express();
  app.use('/api/metrics', metricsRoutes);
  return app;
}

describe('metrics route', () => {
  const originalEnv = process.env.METRICS_ENABLED;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.METRICS_ENABLED;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.METRICS_ENABLED;
    } else {
      process.env.METRICS_ENABLED = originalEnv;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('returns Prometheus metrics when enabled', async () => {
    process.env.METRICS_ENABLED = 'true';

    const res = await request(createTestApp()).get('/api/metrics');

    expect(res.status).toBe(200);
    expect(res.text).toContain('atlas_test_metric 1');
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('does not expose metrics in production unless explicitly enabled', async () => {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_ENABLED = undefined;

    const res = await request(createTestApp()).get('/api/metrics');

    expect(res.status).toBe(404);
  });
});
