import { describe, expect, it } from 'vitest';
import {
  createRequestMetrics,
  isMetricsRequestAuthorized,
  recordRequestMetric,
  snapshotRequestMetrics,
} from './requestMetrics';

describe('request metrics', () => {
  it('summarizes request counts, status families, slow requests and latency percentiles', () => {
    const metrics = createRequestMetrics({ slowRequestThresholdMs: 1000 });

    recordRequestMetric(metrics, { method: 'GET', path: '/api/projects', statusCode: 200, durationMs: 40 });
    recordRequestMetric(metrics, { method: 'POST', path: '/api/projects', statusCode: 201, durationMs: 80 });
    recordRequestMetric(metrics, { method: 'GET', path: '/api/projects', statusCode: 500, durationMs: 1200 });

    expect(snapshotRequestMetrics(metrics)).toEqual({
      totalRequests: 3,
      slowRequests: 1,
      statusCounts: {
        '2xx': 2,
        '3xx': 0,
        '4xx': 0,
        '5xx': 1,
      },
      latency: {
        avgMs: 440,
        p95Ms: 1200,
        p99Ms: 1200,
        maxMs: 1200,
      },
      topRoutes: [
        { route: 'GET /api/projects', count: 2, avgMs: 620 },
        { route: 'POST /api/projects', count: 1, avgMs: 80 },
      ],
    });
  });

  it('requires a matching metrics token in production', () => {
    expect(isMetricsRequestAuthorized({}, 'production', 'secret-token')).toBe(false);
    expect(
      isMetricsRequestAuthorized({ authorization: 'Bearer secret-token' }, 'production', 'secret-token'),
    ).toBe(true);
    expect(
      isMetricsRequestAuthorized({ 'x-metrics-token': 'secret-token' }, 'production', 'secret-token'),
    ).toBe(true);
    expect(isMetricsRequestAuthorized({}, 'development', undefined)).toBe(true);
  });

  it('starts with zero metrics', () => {
    const metrics = createRequestMetrics({ slowRequestThresholdMs: 1000 });
    const snap = snapshotRequestMetrics(metrics);

    expect(snap.totalRequests).toBe(0);
    expect(snap.slowRequests).toBe(0);
    expect(snap.topRoutes).toEqual([]);
  });

  it('categorizes 3xx and 4xx status codes', () => {
    const metrics = createRequestMetrics({ slowRequestThresholdMs: 1000 });
    recordRequestMetric(metrics, { method: 'GET', path: '/a', statusCode: 301, durationMs: 10 });
    recordRequestMetric(metrics, { method: 'GET', path: '/b', statusCode: 404, durationMs: 10 });
    recordRequestMetric(metrics, { method: 'POST', path: '/c', statusCode: 422, durationMs: 10 });

    const snap = snapshotRequestMetrics(metrics);
    expect(snap.statusCounts['3xx']).toBe(1);
    expect(snap.statusCounts['4xx']).toBe(2);
    expect(snap.statusCounts['2xx']).toBe(0);
    expect(snap.statusCounts['5xx']).toBe(0);
  });

  it('tracks slow requests above threshold', () => {
    const metrics = createRequestMetrics({ slowRequestThresholdMs: 500 });
    recordRequestMetric(metrics, { method: 'GET', path: '/a', statusCode: 200, durationMs: 400 });
    recordRequestMetric(metrics, { method: 'GET', path: '/b', statusCode: 200, durationMs: 600 });
    recordRequestMetric(metrics, { method: 'GET', path: '/c', statusCode: 200, durationMs: 1000 });

    const snap = snapshotRequestMetrics(metrics);
    expect(snap.slowRequests).toBe(2);
  });

  it('rejects wrong metrics token in production', () => {
    expect(
      isMetricsRequestAuthorized({ authorization: 'Bearer wrong' }, 'production', 'secret'),
    ).toBe(false);
  });

  it('rejects empty token in production when token is configured', () => {
    expect(
      isMetricsRequestAuthorized({}, 'production', 'secret'),
    ).toBe(false);
  });

  it('uses default slowRequestThresholdMs of 1000 when no options', () => {
    const metrics = createRequestMetrics();
    expect(metrics.slowRequestThresholdMs).toBe(1000);
  });

  it('normalizes method to uppercase in route key', () => {
    const metrics = createRequestMetrics();
    recordRequestMetric(metrics, { method: 'get', path: '/api/test', statusCode: 200, durationMs: 10 });
    expect(metrics.routes.has('GET /api/test')).toBe(true);
  });

  it('ignores status codes outside 200-599 range', () => {
    const metrics = createRequestMetrics();
    recordRequestMetric(metrics, { method: 'GET', path: '/a', statusCode: 100, durationMs: 10 });
    recordRequestMetric(metrics, { method: 'GET', path: '/b', statusCode: 600, durationMs: 10 });

    const snap = snapshotRequestMetrics(metrics);
    expect(snap.statusCounts).toEqual({ '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 });
  });

  it('computes percentile correctly with single value', () => {
    const metrics = createRequestMetrics();
    recordRequestMetric(metrics, { method: 'GET', path: '/a', statusCode: 200, durationMs: 42 });

    const snap = snapshotRequestMetrics(metrics);
    expect(snap.latency.p95Ms).toBe(42);
    expect(snap.latency.p99Ms).toBe(42);
    expect(snap.latency.maxMs).toBe(42);
    expect(snap.latency.avgMs).toBe(42);
  });

  it('sorts top routes by count descending then avgMs descending', () => {
    const metrics = createRequestMetrics();
    recordRequestMetric(metrics, { method: 'GET', path: '/slow', statusCode: 200, durationMs: 900 });
    recordRequestMetric(metrics, { method: 'GET', path: '/fast', statusCode: 200, durationMs: 10 });
    recordRequestMetric(metrics, { method: 'GET', path: '/fast', statusCode: 200, durationMs: 20 });

    const snap = snapshotRequestMetrics(metrics);
    expect(snap.topRoutes[0].route).toBe('GET /fast');
    expect(snap.topRoutes[0].count).toBe(2);
    expect(snap.topRoutes[1].route).toBe('GET /slow');
  });

  it('limits top routes to 10 entries', () => {
    const metrics = createRequestMetrics();
    for (let i = 0; i < 15; i++) {
      recordRequestMetric(metrics, { method: 'GET', path: `/route-${i}`, statusCode: 200, durationMs: i * 10 });
    }

    const snap = snapshotRequestMetrics(metrics);
    expect(snap.topRoutes).toHaveLength(10);
  });

  it('handles array header values for authorization', () => {
    expect(
      isMetricsRequestAuthorized({ authorization: ['Bearer tok'] }, 'production', 'tok'),
    ).toBe(true);
  });

  it('rejects non-Bearer authorization scheme in production', () => {
    expect(
      isMetricsRequestAuthorized({ authorization: 'Basic dG9r' }, 'production', 'tok'),
    ).toBe(false);
  });

  it('handles array header values for x-metrics-token', () => {
    expect(
      isMetricsRequestAuthorized({ 'x-metrics-token': ['my-token'] }, 'production', 'my-token'),
    ).toBe(true);
  });

  it('duration equal to slowRequestThresholdMs is counted as slow', () => {
    const metrics = createRequestMetrics({ slowRequestThresholdMs: 500 });
    recordRequestMetric(metrics, { method: 'GET', path: '/a', statusCode: 200, durationMs: 500 });

    const snap = snapshotRequestMetrics(metrics);
    expect(snap.slowRequests).toBe(1);
  });

  it('rejects production request with undefined token even when auth header is valid', () => {
    expect(
      isMetricsRequestAuthorized({ authorization: 'Bearer my-token' }, 'production', undefined),
    ).toBe(false);
  });

  it('avgMs is correctly rounded in snapshot', () => {
    const metrics = createRequestMetrics();
    recordRequestMetric(metrics, { method: 'GET', path: '/a', statusCode: 200, durationMs: 33 });
    recordRequestMetric(metrics, { method: 'GET', path: '/a', statusCode: 200, durationMs: 34 });

    const snap = snapshotRequestMetrics(metrics);
    expect(snap.latency.avgMs).toBe(34);
  });

  it('avgMs matches average of all recorded durations', () => {
    const metrics = createRequestMetrics();
    recordRequestMetric(metrics, { method: 'GET', path: '/a', statusCode: 200, durationMs: 10 });
    recordRequestMetric(metrics, { method: 'GET', path: '/a', statusCode: 200, durationMs: 20 });
    recordRequestMetric(metrics, { method: 'GET', path: '/a', statusCode: 200, durationMs: 30 });

    const snap = snapshotRequestMetrics(metrics);
    expect(snap.latency.avgMs).toBe(20);
    expect(snap.totalRequests).toBe(3);
  });

  it('snapshot with no requests has zero latency stats', () => {
    const metrics = createRequestMetrics();
    const snap = snapshotRequestMetrics(metrics);
    expect(snap.totalRequests).toBe(0);
    expect(snap.latency.avgMs).toBe(0);
    expect(snap.latency.p95Ms).toBe(0);
    expect(snap.slowRequests).toBe(0);
  });

  it('recordRequest tracks multiple status codes correctly', () => {
    const metrics = createRequestMetrics();
    recordRequestMetric(metrics, { method: 'GET', path: '/api/test', statusCode: 200, durationMs: 50 });
    recordRequestMetric(metrics, { method: 'GET', path: '/api/test', statusCode: 404, durationMs: 20 });
    recordRequestMetric(metrics, { method: 'GET', path: '/api/test', statusCode: 500, durationMs: 100 });
    const snap = snapshotRequestMetrics(metrics);
    expect(snap.totalRequests).toBe(3);
    expect(snap.statusCounts['2xx']).toBe(1);
    expect(snap.statusCounts['4xx']).toBe(1);
    expect(snap.statusCounts['5xx']).toBe(1);
  });

  it('averages response time correctly across multiple requests', () => {
    const metrics = createRequestMetrics({ slowRequestThresholdMs: 1000 });
    recordRequestMetric(metrics, { method: 'GET', path: '/api/a', statusCode: 200, durationMs: 100 });
    recordRequestMetric(metrics, { method: 'GET', path: '/api/b', statusCode: 200, durationMs: 200 });
    const snap = snapshotRequestMetrics(metrics);
    expect(snap.latency.avgMs).toBe(150);
  });

  it('snapshot with single request returns valid average', async () => {
    vi.resetModules();
    const { createRequestMetrics, recordRequestMetric, snapshotRequestMetrics } = await import('./requestMetrics');
    const metrics = createRequestMetrics();
    recordRequestMetric(metrics, { method: 'GET', path: '/api/test', statusCode: 200, durationMs: 50 });
    const snap = snapshotRequestMetrics(metrics);
    expect(snap.latency.avgMs).toBe(50);
  });

  it('snapshotRequestMetrics handles single request', () => { const metrics = createRequestMetrics(); recordRequestMetric(metrics, { method: 'GET', path: '/api/test', statusCode: 200, durationMs: 100 }); const snap = snapshotRequestMetrics(metrics); expect(snap.totalRequests).toBe(1); });

  it('recordRequestMetric handles 500 status code', () => { const metrics = createRequestMetrics(); recordRequestMetric(metrics, { method: 'GET', path: '/api/test', statusCode: 500, durationMs: 100 }); const snap = snapshotRequestMetrics(metrics); expect(snap.totalRequests).toBe(1); });

  it('createRequestMetrics uses default slow request threshold', () => { const metrics = createRequestMetrics(); recordRequestMetric(metrics, { method: 'GET', path: '/api/test', statusCode: 200, durationMs: 5000 }); const snap = snapshotRequestMetrics(metrics); expect(snap.slowRequests).toBe(1); });

  it('createRequestMetrics initializes with zero counts', () => { const metrics = createRequestMetrics(); const snap = snapshotRequestMetrics(metrics); expect(snap.totalRequests).toBe(0); expect(snap.slowRequests).toBe(0); });

  it('recordRequestMetric tracks POST method', () => { const metrics = createRequestMetrics(); recordRequestMetric(metrics, { method: 'POST', path: '/api/test', statusCode: 201, durationMs: 50 }); const snap = snapshotRequestMetrics(metrics); expect(snap.totalRequests).toBe(1); });

  it('recordRequestMetric tracks DELETE method', () => { const metrics = createRequestMetrics(); recordRequestMetric(metrics, { method: 'DELETE', path: '/api/test/1', statusCode: 204, durationMs: 30 }); const snap = snapshotRequestMetrics(metrics); expect(snap.totalRequests).toBe(1); });

  it('recordRequestMetric tracks PUT method', () => { const metrics = createRequestMetrics(); recordRequestMetric(metrics, { method: 'PUT', path: '/api/test/1', statusCode: 200, durationMs: 50 }); const snap = snapshotRequestMetrics(metrics); expect(snap.totalRequests).toBe(1); });

  it('recordRequestMetric tracks PATCH method', () => { const metrics = createRequestMetrics(); recordRequestMetric(metrics, { method: 'PATCH', path: '/api/test/1', statusCode: 200, durationMs: 25 }); const snap = snapshotRequestMetrics(metrics); expect(snap.totalRequests).toBe(1); });

  it('recordRequestMetric tracks DELETE method', () => { const metrics = createRequestMetrics(); recordRequestMetric(metrics, { method: 'DELETE', path: '/api/test/1', statusCode: 204, durationMs: 10 }); const snap = snapshotRequestMetrics(metrics); expect(snap.totalRequests).toBe(1); });

  it('recordRequestMetric tracks POST method', () => { const metrics = createRequestMetrics(); recordRequestMetric(metrics, { method: 'POST', path: '/api/test', statusCode: 201, durationMs: 50 }); const snap = snapshotRequestMetrics(metrics); expect(snap.totalRequests).toBe(1); });
});

describe('request metrics batch 172 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `/api/batch172/${index}`,
    index + 1,
    200 + (index % 4) * 100,
  ] as const))(
    'records generated batch172 repeated route average for %s',
    (path, count, statusCode) => {
      const metrics = createRequestMetrics({ slowRequestThresholdMs: 50 });
      Array.from({ length: count }).forEach((_, requestIndex) => {
        recordRequestMetric(metrics, { method: 'post', path, statusCode, durationMs: requestIndex + 1 });
      });
      const snapshot = snapshotRequestMetrics(metrics);
      expect(snapshot.totalRequests).toBe(count);
      expect(snapshot.topRoutes[0]).toEqual({
        route: `POST ${path}`,
        count,
        avgMs: Math.round((count + 1) / 2),
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `token-batch172-${index}`,
    index % 2 === 0 ? 'development' : undefined,
  ] as const))(
    'authorizes generated non-production metrics request without token %s',
    (_token, nodeEnv) => {
      expect(isMetricsRequestAuthorized({}, nodeEnv, undefined)).toBe(true);
    },
  );
});

describe('request metrics boundary matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => 200 + index))(
    'records 2xx status %s in 2xx family',
    (statusCode) => {
      const metrics = createRequestMetrics();
      recordRequestMetric(metrics, { method: 'GET', path: `/status-${statusCode}`, statusCode, durationMs: 1 });

      expect(snapshotRequestMetrics(metrics).statusCounts['2xx']).toBe(1);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => 400 + index))(
    'records 4xx status %s in 4xx family',
    (statusCode) => {
      const metrics = createRequestMetrics();
      recordRequestMetric(metrics, { method: 'GET', path: `/status-${statusCode}`, statusCode, durationMs: 1 });

      expect(snapshotRequestMetrics(metrics).statusCounts['4xx']).toBe(1);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => index + 1))(
    'duration %s below threshold is not slow',
    (durationMs) => {
      const metrics = createRequestMetrics({ slowRequestThresholdMs: 1000 });
      recordRequestMetric(metrics, { method: 'GET', path: `/duration-${durationMs}`, statusCode: 200, durationMs });

      expect(snapshotRequestMetrics(metrics).slowRequests).toBe(0);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => 1000 + index))(
    'duration %s at or above threshold is slow',
    (durationMs) => {
      const metrics = createRequestMetrics({ slowRequestThresholdMs: 1000 });
      recordRequestMetric(metrics, { method: 'GET', path: `/duration-${durationMs}`, statusCode: 200, durationMs });

      expect(snapshotRequestMetrics(metrics).slowRequests).toBe(1);
    }
  );

  it.each(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'])(
    'normalizes method %s to uppercase route key',
    (method) => {
      const metrics = createRequestMetrics();
      recordRequestMetric(metrics, { method, path: '/api/method', statusCode: 200, durationMs: 10 });

      expect(snapshotRequestMetrics(metrics).topRoutes[0].route).toBe(`${method.toUpperCase()} /api/method`);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => 300 + index))(
    'records generated 3xx status %s in 3xx family',
    (statusCode) => {
      const metrics = createRequestMetrics();
      recordRequestMetric(metrics, { method: 'GET', path: `/status-${statusCode}`, statusCode, durationMs: 1 });

      expect(snapshotRequestMetrics(metrics).statusCounts['3xx']).toBe(1);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => 500 + index))(
    'records generated 5xx status %s in 5xx family',
    (statusCode) => {
      const metrics = createRequestMetrics();
      recordRequestMetric(metrics, { method: 'GET', path: `/status-${statusCode}`, statusCode, durationMs: 1 });

      expect(snapshotRequestMetrics(metrics).statusCounts['5xx']).toBe(1);
    },
  );
});

describe('request metrics batch 164 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `secret-${index}`,
    index % 2 === 0 ? 'authorization' : 'x-metrics-token',
  ] as const))(
    'authorizes generated production metrics request with array header %s/%s',
    (token, header) => {
      expect(isMetricsRequestAuthorized({ [header]: header === 'authorization' ? [`Bearer ${token}`] : [token] }, 'production', token)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `GET /api/batch164/${index}`,
    index + 20,
  ] as const))(
    'keeps generated top route list capped after adding %s',
    (primaryRoute, primaryCount) => {
      const metrics = createRequestMetrics();

      Array.from({ length: primaryCount }).forEach(() => {
        recordRequestMetric(metrics, { method: 'GET', path: primaryRoute.replace('GET ', ''), statusCode: 200, durationMs: 10 });
      });
      Array.from({ length: 12 }).forEach((_, routeIndex) => {
        recordRequestMetric(metrics, { method: 'GET', path: `/api/batch164/sibling-${routeIndex}`, statusCode: 200, durationMs: routeIndex + 1 });
      });

      const snapshot = snapshotRequestMetrics(metrics);
      expect(snapshot.topRoutes).toHaveLength(10);
      expect(snapshot.topRoutes[0].route).toBe(primaryRoute);
    },
  );
});
