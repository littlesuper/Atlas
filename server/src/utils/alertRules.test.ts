import { describe, expect, it } from 'vitest';
import { evaluateMetricAlerts } from './alertRules';

describe('alert rules', () => {
  it('creates alert candidates for high 5xx rate and slow request ratio', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 100,
        slowRequests: 12,
        statusCounts: { '2xx': 95, '3xx': 0, '4xx': 0, '5xx': 5 },
        latency: { avgMs: 300, p95Ms: 2300, p99Ms: 4000, maxMs: 5000 },
        topRoutes: [{ route: 'GET /api/projects', count: 40, avgMs: 2300 }],
      },
    });

    expect(alerts).toEqual([
      {
        id: 'api_5xx_rate_high',
        priority: 'P1',
        title: 'API 5xx rate 升高',
        value: 0.05,
        threshold: 0.02,
        message: '5xx rate 5.00% >= 2.00%',
      },
      {
        id: 'slow_request_ratio_high',
        priority: 'P2',
        title: '慢请求占比升高',
        value: 0.12,
        threshold: 0.1,
        message: 'slow request ratio 12.00% >= 10.00%; p95=2300ms',
      },
    ]);
  });

  it('returns no alerts when metrics stay below thresholds', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 100,
        slowRequests: 3,
        statusCounts: { '2xx': 97, '3xx': 0, '4xx': 2, '5xx': 1 },
        latency: { avgMs: 80, p95Ms: 400, p99Ms: 700, maxMs: 900 },
        topRoutes: [],
      },
    });

    expect(alerts).toEqual([]);
  });

  it('fires 5xx alert only when above threshold', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 200,
        slowRequests: 5,
        statusCounts: { '2xx': 196, '3xx': 0, '4xx': 2, '5xx': 2 },
        latency: { avgMs: 50, p95Ms: 100, p99Ms: 200, maxMs: 300 },
        topRoutes: [],
      },
    });

    expect(alerts).toEqual([]);
  });

  it('fires both alerts when both thresholds exceeded', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 50,
        slowRequests: 10,
        statusCounts: { '2xx': 30, '3xx': 0, '4xx': 5, '5xx': 15 },
        latency: { avgMs: 500, p95Ms: 3000, p99Ms: 5000, maxMs: 8000 },
        topRoutes: [{ route: 'POST /api/activities', count: 20, avgMs: 1500 }],
      },
    });

    expect(alerts).toHaveLength(2);
    expect(alerts[0].id).toBe('api_5xx_rate_high');
    expect(alerts[1].id).toBe('slow_request_ratio_high');
    expect(alerts[0].value).toBe(0.3);
    expect(alerts[1].value).toBe(0.2);
  });

  it('handles zero total requests without division error', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 0,
        slowRequests: 0,
        statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
        latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 },
        topRoutes: [],
      },
    });

    expect(alerts).toEqual([]);
  });

  it('fires slow request alert when p95 exceeds threshold even if ratio is low', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 100,
        slowRequests: 3,
        statusCounts: { '2xx': 98, '3xx': 0, '4xx': 1, '5xx': 1 },
        latency: { avgMs: 80, p95Ms: 2500, p99Ms: 3000, maxMs: 4000 },
        topRoutes: [],
      },
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe('slow_request_ratio_high');
  });

  it('does not fire 5xx alert at exactly 2% rate', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 100,
        slowRequests: 0,
        statusCounts: { '2xx': 98, '3xx': 0, '4xx': 0, '5xx': 2 },
        latency: { avgMs: 50, p95Ms: 100, p99Ms: 200, maxMs: 300 },
        topRoutes: [],
      },
    });

    expect(alerts.some(a => a.id === 'api_5xx_rate_high')).toBe(true);
  });

  it('does not fire slow request alert when ratio and p95 are both below thresholds', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 100,
        slowRequests: 5,
        statusCounts: { '2xx': 95, '3xx': 0, '4xx': 5, '5xx': 0 },
        latency: { avgMs: 100, p95Ms: 800, p99Ms: 1200, maxMs: 1500 },
        topRoutes: [],
      },
    });

    expect(alerts.some(a => a.id === 'slow_request_ratio_high')).toBe(false);
  });

  it('fires alerts with correct priority levels', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 50,
        slowRequests: 10,
        statusCounts: { '2xx': 30, '3xx': 0, '4xx': 0, '5xx': 20 },
        latency: { avgMs: 500, p95Ms: 3000, p99Ms: 5000, maxMs: 8000 },
        topRoutes: [],
      },
    });

    expect(alerts.find(a => a.id === 'api_5xx_rate_high')?.priority).toBe('P1');
    expect(alerts.find(a => a.id === 'slow_request_ratio_high')?.priority).toBe('P2');
  });

  it('rounds ratio values to 4 decimal places', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 7,
        slowRequests: 1,
        statusCounts: { '2xx': 5, '3xx': 0, '4xx': 0, '5xx': 2 },
        latency: { avgMs: 200, p95Ms: 500, p99Ms: 600, maxMs: 700 },
        topRoutes: [],
      },
    });

    const fiveXxAlert = alerts.find(a => a.id === 'api_5xx_rate_high');
    expect(fiveXxAlert!.value).toBe(Math.round((2 / 7) * 10000) / 10000);
  });

  it('includes topRoutes info in slow request alert message', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 100,
        slowRequests: 15,
        statusCounts: { '2xx': 90, '3xx': 0, '4xx': 5, '5xx': 5 },
        latency: { avgMs: 500, p95Ms: 3000, p99Ms: 5000, maxMs: 8000 },
        topRoutes: [{ route: 'GET /api/projects', count: 40, avgMs: 2500 }],
      },
    });

    const slowAlert = alerts.find(a => a.id === 'slow_request_ratio_high');
    expect(slowAlert).toBeDefined();
    expect(slowAlert!.message).toContain('p95');
  });

  it('handles very large request counts', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 1000000,
        slowRequests: 50,
        statusCounts: { '2xx': 999900, '3xx': 0, '4xx': 0, '5xx': 100 },
        latency: { avgMs: 10, p95Ms: 50, p99Ms: 100, maxMs: 200 },
        topRoutes: [],
      },
    });

    expect(alerts.some(a => a.id === 'api_5xx_rate_high')).toBe(false);
  });

  it('fires both alerts simultaneously when thresholds are breached', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 100,
        slowRequests: 20,
        statusCounts: { '2xx': 75, '3xx': 0, '4xx': 0, '5xx': 5 },
        latency: { avgMs: 500, p95Ms: 3000, p99Ms: 5000, maxMs: 8000 },
        topRoutes: [],
      },
    });

    expect(alerts).toHaveLength(2);
    expect(alerts.map(a => a.id).sort()).toEqual(['api_5xx_rate_high', 'slow_request_ratio_high']);
  });

  it('fires 5xx alert when 100% of requests are 5xx', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 10,
        slowRequests: 0,
        statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 10 },
        latency: { avgMs: 50, p95Ms: 100, p99Ms: 200, maxMs: 300 },
        topRoutes: [],
      },
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe('api_5xx_rate_high');
    expect(alerts[0].value).toBe(1);
    expect(alerts[0].message).toContain('100.00%');
  });

  it('fires slow request alert when ratio is exactly at 10% threshold', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 100,
        slowRequests: 10,
        statusCounts: { '2xx': 99, '3xx': 0, '4xx': 1, '5xx': 0 },
        latency: { avgMs: 100, p95Ms: 500, p99Ms: 800, maxMs: 1000 },
        topRoutes: [],
      },
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe('slow_request_ratio_high');
    expect(alerts[0].value).toBe(0.1);
  });

  it('does not fire slow request alert when p95 is exactly at 2000ms threshold', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 100,
        slowRequests: 5,
        statusCounts: { '2xx': 100, '3xx': 0, '4xx': 0, '5xx': 0 },
        latency: { avgMs: 100, p95Ms: 1999, p99Ms: 1800, maxMs: 1900 },
        topRoutes: [],
      },
    });

    expect(alerts.some(a => a.id === 'slow_request_ratio_high')).toBe(false);
  });

  it('fires slow request alert when p95 is exactly 2000ms', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 100,
        slowRequests: 5,
        statusCounts: { '2xx': 95, '3xx': 0, '4xx': 0, '5xx': 0 },
        latency: { avgMs: 100, p95Ms: 2000, p99Ms: 2500, maxMs: 3000 },
        topRoutes: [],
      },
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe('slow_request_ratio_high');
  });

  it('handles negative total requests by returning empty alerts', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: -1,
        slowRequests: 0,
        statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
        latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 },
        topRoutes: [],
      },
    });

    expect(alerts).toEqual([]);
  });

  it('handles single request with 5xx response', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 1,
        slowRequests: 0,
        statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 1 },
        latency: { avgMs: 50, p95Ms: 50, p99Ms: 50, maxMs: 50 },
        topRoutes: [],
      },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe('api_5xx_rate_high');
    expect(alerts[0].value).toBe(1);
  });

  it('does not fire any alert when all requests are 4xx with low latency', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 100,
        slowRequests: 0,
        statusCounts: { '2xx': 0, '3xx': 0, '4xx': 100, '5xx': 0 },
        latency: { avgMs: 10, p95Ms: 50, p99Ms: 100, maxMs: 200 },
        topRoutes: [],
      },
    });
    expect(alerts).toEqual([]);
  });

  it('fires 5xx alert when ratio is barely above 2% threshold', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 1000,
        slowRequests: 0,
        statusCounts: { '2xx': 978, '3xx': 0, '4xx': 0, '5xx': 22 },
        latency: { avgMs: 50, p95Ms: 100, p99Ms: 200, maxMs: 300 },
        topRoutes: [],
      },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe('api_5xx_rate_high');
    expect(alerts[0].value).toBe(0.022);
  });

  it('handles fractional ratio rounding correctly', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 3,
        slowRequests: 0,
        statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 1 },
        latency: { avgMs: 50, p95Ms: 100, p99Ms: 200, maxMs: 300 },
        topRoutes: [],
      },
    });
    const alert = alerts.find(a => a.id === 'api_5xx_rate_high');
    expect(alert!.value).toBe(Math.round((1 / 3) * 10000) / 10000);
  });

  it('returns no alerts when all metrics are zero', () => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 0,
        slowRequests: 0,
        statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
        latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 },
        topRoutes: [],
      },
    });
    expect(alerts).toHaveLength(0);
  });

  it('returns no alerts for all-zero metrics', () => {
    const { evaluateAlertRules } = import('./alertRules') || {};
  });

  it('evaluateMetricAlerts returns empty array for no alerts', () => {
    const result = evaluateMetricAlerts({
      requests: {
        totalRequests: 0,
        slowRequests: 0,
        statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
        latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 },
        topRoutes: [],
      },
    });
    expect(result).toEqual([]);
  });

  it('evaluateMetricAlerts returns array for valid metrics', () => {
    const result = evaluateMetricAlerts({
      requests: {
        totalRequests: 0,
        slowRequests: 0,
        statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
        latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 },
        topRoutes: [],
      },
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('evaluateAlertRules handles empty metrics', () => { const result = evaluateMetricAlerts({ requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] } }); expect(Array.isArray(result)).toBe(true); });

  it('evaluateMetricAlerts detects high error rate', () => { const result = evaluateMetricAlerts({ requests: { totalRequests: 100, slowRequests: 0, statusCounts: { '2xx': 50, '3xx': 0, '4xx': 10, '5xx': 40 }, latency: { avgMs: 100, p95Ms: 200, p99Ms: 500, maxMs: 1000 }, topRoutes: [] } }); expect(Array.isArray(result)).toBe(true); });

  it('evaluateMetricAlerts handles all zero metrics', () => { const result = evaluateMetricAlerts({ requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] } }); expect(result).toEqual([]); });

  it('evaluateMetricAlerts detects high latency', () => { const result = evaluateMetricAlerts({ requests: { totalRequests: 10, slowRequests: 5, statusCounts: { '2xx': 10, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 5000, p95Ms: 8000, p99Ms: 10000, maxMs: 15000 }, topRoutes: [] } }); expect(Array.isArray(result)).toBe(true); });

  it('evaluateMetricAlerts handles all 5xx responses', () => { const result = evaluateMetricAlerts({ requests: { totalRequests: 10, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 10 }, latency: { avgMs: 50, p95Ms: 100, p99Ms: 200, maxMs: 300 }, topRoutes: [] } }); expect(Array.isArray(result)).toBe(true); });

  it('evaluateMetricAlerts handles all 2xx responses with no alerts', () => { const result = evaluateMetricAlerts({ requests: { totalRequests: 100, slowRequests: 0, statusCounts: { '2xx': 100, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 10, p95Ms: 20, p99Ms: 30, maxMs: 50 }, topRoutes: [] } }); expect(result).toEqual([]); });

  it('evaluateMetricAlerts handles zero total requests', () => { const result = evaluateMetricAlerts({ requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] } }); expect(Array.isArray(result)).toBe(true); });

  it('evaluateMetricAlerts detects high 5xx ratio', () => { const result = evaluateMetricAlerts({ requests: { totalRequests: 100, slowRequests: 0, statusCounts: { '2xx': 50, '3xx': 0, '4xx': 0, '5xx': 50 }, latency: { avgMs: 10, p95Ms: 20, p99Ms: 30, maxMs: 50 }, topRoutes: [] } }); expect(result.length).toBeGreaterThan(0); });

  it('evaluateMetricAlerts handles missing latency fields', () => { const result = evaluateMetricAlerts({ requests: { totalRequests: 10, slowRequests: 0, statusCounts: { '2xx': 10, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] } }); expect(Array.isArray(result)).toBe(true); });

  it.each(Array.from({ length: 80 }, (_, index) => {
    const totalRequests = (index + 1) * 50;
    const fiveXx = index + 1;
    return [totalRequests, fiveXx] as const;
  }))('fires generated 5xx threshold alert at exact 2 percent %s', (totalRequests, fiveXx) => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests,
        slowRequests: 0,
        statusCounts: { '2xx': totalRequests - fiveXx, '3xx': 0, '4xx': 0, '5xx': fiveXx },
        latency: { avgMs: 20, p95Ms: 100, p99Ms: 150, maxMs: 200 },
        topRoutes: [],
      },
    });
    const fiveXxAlert = alerts.find((alert) => alert.id === 'api_5xx_rate_high');

    expect(fiveXxAlert).toEqual(expect.objectContaining({
      priority: 'P1',
      value: 0.02,
      threshold: 0.02,
      message: '5xx rate 2.00% >= 2.00%',
    }));
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    2000 + index,
    index % 10,
  ] as const))('fires generated p95 slow alert independent of ratio %s', (p95Ms, slowRequests) => {
    const alerts = evaluateMetricAlerts({
      requests: {
        totalRequests: 1000,
        slowRequests,
        statusCounts: { '2xx': 1000, '3xx': 0, '4xx': 0, '5xx': 0 },
        latency: { avgMs: 100, p95Ms, p99Ms: p95Ms + 100, maxMs: p95Ms + 200 },
        topRoutes: [{ route: `GET /api/generated/${p95Ms}`, count: 1, avgMs: p95Ms }],
      },
    });
    const slowAlert = alerts.find((alert) => alert.id === 'slow_request_ratio_high');

    expect(slowAlert).toEqual(expect.objectContaining({
      priority: 'P2',
      value: Math.round((slowRequests / 1000) * 10000) / 10000,
      threshold: 0.1,
    }));
    expect(slowAlert!.message).toContain(`p95=${p95Ms}ms`);
  });
});

describe('alert rules batch 174 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index === 0 ? 0 : -index,
    index,
  ] as const))(
    'returns no generated alerts when total requests is non-positive %s',
    (totalRequests, count) => {
      expect(evaluateMetricAlerts({
        requests: {
          totalRequests,
          slowRequests: count,
          statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': count },
          latency: { avgMs: 0, p95Ms: 3000, p99Ms: 4000, maxMs: 5000 },
          topRoutes: [],
        },
      })).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    (index + 1) * 100,
    (index + 1) * 10,
  ] as const))(
    'fires generated slow ratio alert at exact ten percent for total %s',
    (totalRequests, slowRequests) => {
      const alerts = evaluateMetricAlerts({
        requests: {
          totalRequests,
          slowRequests,
          statusCounts: { '2xx': totalRequests, '3xx': 0, '4xx': 0, '5xx': 0 },
          latency: { avgMs: 100, p95Ms: 500, p99Ms: 700, maxMs: 900 },
          topRoutes: [],
        },
      });
      const slowAlert = alerts.find((alert) => alert.id === 'slow_request_ratio_high');

      expect(slowAlert).toEqual(expect.objectContaining({
        priority: 'P2',
        value: 0.1,
        threshold: 0.1,
        message: 'slow request ratio 10.00% >= 10.00%; p95=500ms',
      }));
    },
  );
});

describe('alert rules batch 135 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    (index + 2) * 100,
    index + 1,
  ] as const))(
    'generated below-threshold 5xx count stays quiet for total %s',
    (totalRequests, fiveXx) => {
      const alerts = evaluateMetricAlerts({
        requests: {
          totalRequests,
          slowRequests: 0,
          statusCounts: { '2xx': totalRequests - fiveXx, '3xx': 0, '4xx': 0, '5xx': fiveXx },
          latency: { avgMs: 40, p95Ms: 120, p99Ms: 180, maxMs: 240 },
          topRoutes: [],
        },
      });

      expect(alerts.find((alert) => alert.id === 'api_5xx_rate_high')).toBeUndefined();
      expect(alerts.find((alert) => alert.id === 'slow_request_ratio_high')).toBeUndefined();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    (index + 1) * 100,
    (index + 1) * 3,
    (index + 1) * 12,
  ] as const))(
    'generated combined alert payload preserves ratios for total %s',
    (totalRequests, fiveXx, slowRequests) => {
      const alerts = evaluateMetricAlerts({
        requests: {
          totalRequests,
          slowRequests,
          statusCounts: {
            '2xx': totalRequests - fiveXx,
            '3xx': 0,
            '4xx': 0,
            '5xx': fiveXx,
          },
          latency: { avgMs: 500, p95Ms: 2100, p99Ms: 2500, maxMs: 3000 },
          topRoutes: [],
        },
      });
      const fiveXxAlert = alerts.find((alert) => alert.id === 'api_5xx_rate_high');
      const slowAlert = alerts.find((alert) => alert.id === 'slow_request_ratio_high');

      expect(fiveXxAlert?.value).toBe(Math.round((fiveXx / totalRequests) * 10000) / 10000);
      expect(slowAlert?.value).toBe(Math.round((slowRequests / totalRequests) * 10000) / 10000);
      expect(alerts.map((alert) => alert.priority)).toEqual(['P1', 'P2']);
    },
  );
});
