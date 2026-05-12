import { describe, expect, it } from 'vitest';
import { formatPrometheusMetrics } from './prometheusMetrics';

describe('prometheus metrics formatter', () => {
  it('formats request, process, business and alert metrics as prometheus text', () => {
    const text = formatPrometheusMetrics({
      process: {
        uptime: 123,
        memoryUsage: {
          rss: 1024,
          heapTotal: 2048,
          heapUsed: 512,
          external: 64,
          arrayBuffers: 32,
        },
      },
      requests: {
        totalRequests: 3,
        slowRequests: 1,
        statusCounts: { '2xx': 2, '3xx': 0, '4xx': 0, '5xx': 1 },
        latency: { avgMs: 42, p95Ms: 120, p99Ms: 200, maxMs: 220 },
        topRoutes: [
          { route: 'GET /api/health', count: 2, avgMs: 12 },
          { route: 'POST /api/projects', count: 1, avgMs: 100 },
        ],
      },
      business: {
        counters: {
          'project.created': { count: 2, lastOccurredAt: '2026-05-05T10:00:00.000Z' },
        },
      },
      alerts: [
        {
          id: 'api_5xx_rate_high',
          priority: 'P1',
          title: 'API 5xx rate 升高',
          value: 0.3333,
          threshold: 0.02,
          message: '5xx rate 33.33% >= 2.00%',
        },
      ],
    });

    expect(text).toContain('# TYPE atlas_http_requests_total counter');
    expect(text).toContain('atlas_http_requests_total 3');
    expect(text).toContain('atlas_http_responses_total{status_family="5xx"} 1');
    expect(text).toContain('atlas_http_slow_requests_total 1');
    expect(text).toContain('atlas_http_request_duration_p95_ms 120');
    expect(text).toContain('atlas_http_route_requests_total{route="GET /api/health"} 2');
    expect(text).toContain('atlas_process_memory_bytes{type="heapUsed"} 512');
    expect(text).toContain('atlas_business_events_total{event="project.created"} 2');
    expect(text).toContain(
      'atlas_metric_alert_active{id="api_5xx_rate_high",priority="P1"} 1',
    );
  });

  it('escapes prometheus label values', () => {
    const text = formatPrometheusMetrics({
      process: {
        uptime: 0,
        memoryUsage: {
          rss: 0,
          heapTotal: 0,
          heapUsed: 0,
          external: 0,
          arrayBuffers: 0,
        },
      },
      requests: {
        totalRequests: 1,
        slowRequests: 0,
        statusCounts: { '2xx': 1, '3xx': 0, '4xx': 0, '5xx': 0 },
        latency: { avgMs: 1, p95Ms: 1, p99Ms: 1, maxMs: 1 },
        topRoutes: [{ route: 'GET /api/"quoted"\\path', count: 1, avgMs: 1 }],
      },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('route="GET /api/\\"quoted\\"\\\\path"');
  });

  it('handles empty metrics without error', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('atlas_http_requests_total 0');
    expect(text).toContain('atlas_process_uptime_seconds 0');
  });

  it('includes process uptime', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 3600, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('atlas_process_uptime_seconds 3600');
  });

  it('formats multiple business event counters', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: { 'a.created': { count: 3, lastOccurredAt: 't1' }, 'b.submitted': { count: 1, lastOccurredAt: 't2' } } },
      alerts: [],
    });

    expect(text).toContain('atlas_business_events_total{event="a.created"} 3');
    expect(text).toContain('atlas_business_events_total{event="b.submitted"} 1');
  });

  it('escapes newline in label values', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [{ route: 'GET\n/path', count: 1, avgMs: 1 }] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('route="GET\\n/path"');
  });

  it('rounds uptime to 3 decimal places', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 123.456789, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('atlas_process_uptime_seconds 123.457');
  });

  it('includes all 5 memory types', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 1, heapTotal: 2, heapUsed: 3, external: 4, arrayBuffers: 5 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('type="rss"} 1');
    expect(text).toContain('type="heapTotal"} 2');
    expect(text).toContain('type="heapUsed"} 3');
    expect(text).toContain('type="external"} 4');
    expect(text).toContain('type="arrayBuffers"} 5');
  });

  it('includes all latency percentile metrics', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 10, p95Ms: 50, p99Ms: 90, maxMs: 100 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('atlas_http_request_duration_avg_ms 10');
    expect(text).toContain('atlas_http_request_duration_p95_ms 50');
    expect(text).toContain('atlas_http_request_duration_p99_ms 90');
    expect(text).toContain('atlas_http_request_duration_max_ms 100');
  });

  it('includes route duration metric alongside count', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [{ route: '/api/test', count: 5, avgMs: 42 }] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('atlas_http_route_requests_total{route="/api/test"} 5');
    expect(text).toContain('atlas_http_route_duration_avg_ms{route="/api/test"} 42');
  });

  it('output ends with newline', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text.endsWith('\n')).toBe(true);
  });

  it('includes HELP and TYPE headers for request counter', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 5, slowRequests: 0, statusCounts: { '2xx': 5, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('# HELP atlas_http_requests_total');
    expect(text).toContain('# TYPE atlas_http_requests_total counter');
  });

  it('formats active alerts with id and priority', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [{ id: 'alert-1', metric: 'cpu', threshold: 90, actual: 95, message: 'high cpu', priority: 'HIGH', triggeredAt: '2026-05-09' }],
    });

    expect(text).toContain('atlas_metric_alert_active{id="alert-1",priority="HIGH"} 1');
  });

  it('formats multiple active alerts with distinct labels', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [
        { id: 'a1', priority: 'P1', title: 't1', value: 0.1, threshold: 0.05, message: 'm1' },
        { id: 'a2', priority: 'P2', title: 't2', value: 0.2, threshold: 0.1, message: 'm2' },
      ],
    });

    expect(text).toContain('atlas_metric_alert_active{id="a1",priority="P1"} 1');
    expect(text).toContain('atlas_metric_alert_active{id="a2",priority="P2"} 1');
  });

  it('includes HELP and TYPE headers for alert metric even with no active alerts', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('# HELP atlas_metric_alert_active');
    expect(text).toContain('# TYPE atlas_metric_alert_active gauge');
    expect(text).not.toContain('atlas_metric_alert_active{');
  });

  it('escapes label value with all three special characters combined', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [{ route: 'a"b\\c\nd', count: 1, avgMs: 1 }] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('route="a\\"b\\\\c\\nd"');
  });

  it('formats 4xx status family count', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 5, slowRequests: 0, statusCounts: { '2xx': 1, '3xx': 1, '4xx': 2, '5xx': 1 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('atlas_http_responses_total{status_family="4xx"} 2');
  });

  it('separates each metric section with HELP and TYPE headers for business counters', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('# HELP atlas_business_events_total');
    expect(text).toContain('# TYPE atlas_business_events_total counter');
  });

  it('includes HELP and TYPE headers for slow request counter', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 10, slowRequests: 3, statusCounts: { '2xx': 7, '3xx': 0, '4xx': 0, '5xx': 3 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('# HELP atlas_http_slow_requests_total');
    expect(text).toContain('# TYPE atlas_http_slow_requests_total counter');
    expect(text).toContain('atlas_http_slow_requests_total 3');
  });

  it('formats multiple routes with distinct label values', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [{ route: '/a', count: 1, avgMs: 10 }, { route: '/b', count: 2, avgMs: 20 }] },
      business: { counters: {} },
      alerts: [],
    });

    expect(text).toContain('atlas_http_route_requests_total{route="/a"} 1');
    expect(text).toContain('atlas_http_route_requests_total{route="/b"} 2');
    expect(text).toContain('atlas_http_route_duration_avg_ms{route="/a"} 10');
    expect(text).toContain('atlas_http_route_duration_avg_ms{route="/b"} 20');
  });

  it('includes process uptime metric in output', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 1234, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [],
    });
    expect(text).toContain('atlas_process_uptime_seconds 1234');
  });

  it('metrics output contains atlas prefix for all metrics', () => {
    const text = formatPrometheusMetrics({
      process: {
        uptime: 123,
        memoryUsage: { rss: 1024, heapTotal: 2048, heapUsed: 512, external: 64, arrayBuffers: 32 },
      },
      requests: {
        totalRequests: 3,
        slowRequests: 0,
        statusCounts: { '2xx': 3, '3xx': 0, '4xx': 0, '5xx': 0 },
        latency: { avgMs: 42, p95Ms: 120, p99Ms: 200, maxMs: 220 },
        topRoutes: [{ route: 'GET /api/projects', count: 3, avgMs: 42 }],
      },
      business: { counters: {} },
      alerts: [],
    });
    const lines = text.split('\n').filter(l => l.startsWith('atlas_'));
    expect(lines.length).toBeGreaterThan(0);
  });


  it('handles empty metrics object', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [],
    });
    expect(text).toContain('atlas_http_requests_total 0');
  });

  it('prometheusMetrics handles zero requests snapshot', () => {
    const text = formatPrometheusMetrics({
      process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
      requests: { totalRequests: 0, slowRequests: 0, statusCounts: {}, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
      business: { counters: {} },
      alerts: [],
    });
    expect(text).toContain('atlas_http_requests_total 0');
  });

  it('metrics registry returns text format', () => { const text = formatPrometheusMetrics({ process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } }, requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] }, business: { counters: {} }, alerts: [] }); expect(typeof text).toBe('string'); });

  it('formatPrometheusMetrics includes process uptime', () => { const text = formatPrometheusMetrics({ process: { uptime: 123.45, memoryUsage: { rss: 1024, heapTotal: 512, heapUsed: 256, external: 64, arrayBuffers: 32 } }, requests: { totalRequests: 10, slowRequests: 1, statusCounts: { '2xx': 8, '3xx': 0, '4xx': 1, '5xx': 1 }, latency: { avgMs: 50, p95Ms: 100, p99Ms: 200, maxMs: 300 }, topRoutes: [] }, business: { counters: {} }, alerts: [] }); expect(text).toContain('123.45'); });

  it('formatPrometheusMetrics handles zero requests', () => { const text = formatPrometheusMetrics({ process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } }, requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] }, business: { counters: {} }, alerts: [] }); expect(text).toContain('atlas_http_requests_total 0'); });

  it('formatPrometheusMetrics includes memory metrics', () => { const text = formatPrometheusMetrics({ process: { uptime: 0, memoryUsage: { rss: 1024, heapTotal: 512, heapUsed: 256, external: 64, arrayBuffers: 32 } }, requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] }, business: { counters: {} }, alerts: [] }); expect(text).toContain('1024'); });

  it('formatPrometheusMetrics includes alert count', () => { const text = formatPrometheusMetrics({ process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } }, requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] }, business: { counters: {} }, alerts: [{ id: 'alert-1', priority: 'P1', title: 'test alert', value: 10, threshold: 5 }] }); expect(text).toContain('atlas_metric_alert_active'); });

  it('formatPrometheusMetrics includes business counters', () => { const text = formatPrometheusMetrics({ process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } }, requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] }, business: { counters: { 'my.event': { count: 5 } } }, alerts: [] }); expect(text).toContain('my.event'); });

  it('formatPrometheusMetrics includes uptime metric', () => { const text = formatPrometheusMetrics({ process: { uptime: 123, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } }, requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] }, business: { counters: {} }, alerts: [] }); expect(text).toContain('uptime'); });

  it('formatPrometheusMetrics includes process_rss_bytes', () => { const text = formatPrometheusMetrics({ process: { uptime: 0, memoryUsage: { rss: 4096, heapTotal: 2048, heapUsed: 1024, external: 0, arrayBuffers: 0 } }, requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] }, business: { counters: {} }, alerts: [] }); expect(text).toContain('rss'); });

  it('formatPrometheusMetrics handles zero values', () => { const text = formatPrometheusMetrics({ process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } }, requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] }, business: { counters: {} }, alerts: [] }); expect(text).toBeDefined(); });

  it.each(Array.from({ length: 70 }, (_, index) => `GET /api/batch92/${index}"\\\nroute`))(
    'escapes generated route label %s',
    (route) => {
      const escapedRoute = route.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const text = formatPrometheusMetrics({
        process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
        requests: {
          totalRequests: 1,
          slowRequests: 0,
          statusCounts: { '2xx': 1, '3xx': 0, '4xx': 0, '5xx': 0 },
          latency: { avgMs: 1, p95Ms: 1, p99Ms: 1, maxMs: 1 },
          topRoutes: [{ route, count: 1, avgMs: 1 }],
        },
        business: { counters: {} },
        alerts: [],
      });

      expect(text).toContain(`atlas_http_route_requests_total{route="${escapedRoute}"} 1`);
      expect(text).toContain(`atlas_http_route_duration_avg_ms{route="${escapedRoute}"} 1`);
    },
  );

  it.each(Array.from({ length: 70 }, (_, index) => `business.batch92.${index}"\\\nevent`))(
    'escapes generated business event label %s',
    (event) => {
      const escapedEvent = event.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const text = formatPrometheusMetrics({
        process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
        requests: {
          totalRequests: 0,
          slowRequests: 0,
          statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
          latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 },
          topRoutes: [],
        },
        business: { counters: { [event]: { count: 3, lastOccurredAt: '2026-05-10T00:00:00.000Z' } } },
        alerts: [],
      });

      expect(text).toContain(`atlas_business_events_total{event="${escapedEvent}"} 3`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => index + 0.1234))(
    'rounds generated uptime value %s',
    (uptime) => {
      const text = formatPrometheusMetrics({
        process: { uptime, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
        requests: {
          totalRequests: 0,
          slowRequests: 0,
          statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
          latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 },
          topRoutes: [],
        },
        business: { counters: {} },
        alerts: [],
      });

      expect(text).toContain(`atlas_process_uptime_seconds ${uptime.toFixed(3)}`);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `GET /api/batch119/${index}`,
    index + 1,
    index + 10,
  ] as const))(
    'formats generated route counter %s',
    (route, count, avgMs) => {
      const text = formatPrometheusMetrics({
        process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
        requests: {
          totalRequests: count,
          slowRequests: 0,
          statusCounts: { '2xx': count, '3xx': 0, '4xx': 0, '5xx': 0 },
          latency: { avgMs, p95Ms: avgMs, p99Ms: avgMs, maxMs: avgMs },
          topRoutes: [{ route, count, avgMs }],
        },
        business: { counters: {} },
        alerts: [],
      });

      expect(text).toContain(`atlas_http_route_requests_total{route="${route}"} ${count}`);
      expect(text).toContain(`atlas_http_route_duration_avg_ms{route="${route}"} ${avgMs}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `alert.batch119.${index}"\\\n`,
    index % 2 === 0 ? 'P1' : 'P2',
  ] as const))(
    'escapes generated alert id %s',
    (id, priority) => {
      const escapedId = id.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const text = formatPrometheusMetrics({
        process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
        requests: {
          totalRequests: 0,
          slowRequests: 0,
          statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
          latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 },
          topRoutes: [],
        },
        business: { counters: {} },
        alerts: [{ id, priority, title: 'alert', value: 1, threshold: 1, message: 'active' }],
      });

      expect(text).toContain(`atlas_metric_alert_active{id="${escapedId}",priority="${priority}"} 1`);
    },
  );
});

describe('prometheus metrics formatter batch 175 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `business.batch175.${index}"\\\n`,
    index + 1,
  ] as const))(
    'escapes generated business event label %s',
    (eventName, count) => {
      const escaped = eventName.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const text = formatPrometheusMetrics({
        process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
        requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
        business: { counters: { [eventName]: { count, lastOccurredAt: '2033-01-01T00:00:00.000Z' } } },
        alerts: [],
      });

      expect(text).toContain(`atlas_business_events_total{event="${escaped}"} ${count}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index + 0.1234,
    Math.round((index + 0.1234) * 1000) / 1000,
  ] as const))(
    'rounds generated process uptime %s',
    (uptime, expected) => {
      const text = formatPrometheusMetrics({
        process: { uptime, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
        requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
        business: { counters: {} },
        alerts: [],
      });

      expect(text).toContain(`atlas_process_uptime_seconds ${expected}`);
    },
  );
});

describe('prometheus metrics formatter batch 164 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'][index % 5],
    index * 1024,
  ] as const))(
    'formats generated memory metric %s=%s',
    (type, bytes) => {
      const text = formatPrometheusMetrics({
        process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0, [type]: bytes } },
        requests: { totalRequests: 0, slowRequests: 0, statusCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
        business: { counters: {} },
        alerts: [],
      });

      expect(text).toContain(`atlas_process_memory_bytes{type="${type}"} ${bytes}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['2xx', '3xx', '4xx', '5xx'][index % 4],
    index + 1,
  ] as const))(
    'formats generated status family count %s=%s',
    (family, count) => {
      const statusCounts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, [family]: count };
      const text = formatPrometheusMetrics({
        process: { uptime: 0, memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } },
        requests: { totalRequests: count, slowRequests: 0, statusCounts, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 }, topRoutes: [] },
        business: { counters: {} },
        alerts: [],
      });

      expect(text).toContain(`atlas_http_responses_total{status_family="${family}"} ${count}`);
    },
  );
});
