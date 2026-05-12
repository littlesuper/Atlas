import type { MetricAlert } from './alertRules';

type MemoryUsage = {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
};

type RequestMetricsSnapshot = {
  totalRequests: number;
  slowRequests: number;
  statusCounts: { '2xx': number; '3xx': number; '4xx': number; '5xx': number };
  latency: { avgMs: number; p95Ms: number; p99Ms: number; maxMs: number };
  topRoutes: Array<{ route: string; count: number; avgMs: number }>;
};

type BusinessMetricsSnapshot = {
  counters: Record<string, { count: number; lastOccurredAt: string | null }>;
};

export type PrometheusMetricsSnapshot = {
  process: {
    uptime: number;
    memoryUsage: MemoryUsage;
  };
  requests: RequestMetricsSnapshot;
  business: BusinessMetricsSnapshot;
  alerts: MetricAlert[];
};

export function formatPrometheusMetrics(snapshot: PrometheusMetricsSnapshot): string {
  const lines: string[] = [];
  const { requests } = snapshot;

  metricHelp(lines, 'atlas_http_requests_total', 'Total HTTP requests observed by Atlas API.');
  metricType(lines, 'atlas_http_requests_total', 'counter');
  lines.push(`atlas_http_requests_total ${requests.totalRequests}`);

  metricHelp(lines, 'atlas_http_responses_total', 'HTTP responses by status code family.');
  metricType(lines, 'atlas_http_responses_total', 'counter');
  for (const [family, count] of Object.entries(requests.statusCounts)) {
    lines.push(`atlas_http_responses_total{status_family="${escapeLabelValue(family)}"} ${count}`);
  }

  metricHelp(lines, 'atlas_http_slow_requests_total', 'HTTP requests slower than configured threshold.');
  metricType(lines, 'atlas_http_slow_requests_total', 'counter');
  lines.push(`atlas_http_slow_requests_total ${requests.slowRequests}`);

  metricHelp(lines, 'atlas_http_request_duration_avg_ms', 'Average HTTP request duration in milliseconds.');
  metricType(lines, 'atlas_http_request_duration_avg_ms', 'gauge');
  lines.push(`atlas_http_request_duration_avg_ms ${requests.latency.avgMs}`);
  lines.push(`atlas_http_request_duration_p95_ms ${requests.latency.p95Ms}`);
  lines.push(`atlas_http_request_duration_p99_ms ${requests.latency.p99Ms}`);
  lines.push(`atlas_http_request_duration_max_ms ${requests.latency.maxMs}`);

  metricHelp(lines, 'atlas_http_route_requests_total', 'Top HTTP route request counts.');
  metricType(lines, 'atlas_http_route_requests_total', 'counter');
  for (const route of requests.topRoutes) {
    lines.push(
      `atlas_http_route_requests_total{route="${escapeLabelValue(route.route)}"} ${route.count}`,
    );
    lines.push(
      `atlas_http_route_duration_avg_ms{route="${escapeLabelValue(route.route)}"} ${route.avgMs}`,
    );
  }

  metricHelp(lines, 'atlas_process_uptime_seconds', 'Atlas API process uptime in seconds.');
  metricType(lines, 'atlas_process_uptime_seconds', 'gauge');
  lines.push(`atlas_process_uptime_seconds ${round(snapshot.process.uptime)}`);

  metricHelp(lines, 'atlas_process_memory_bytes', 'Atlas API process memory usage in bytes.');
  metricType(lines, 'atlas_process_memory_bytes', 'gauge');
  for (const [type, bytes] of Object.entries(snapshot.process.memoryUsage)) {
    lines.push(`atlas_process_memory_bytes{type="${escapeLabelValue(type)}"} ${bytes}`);
  }

  metricHelp(lines, 'atlas_business_events_total', 'Business event counters observed by Atlas API.');
  metricType(lines, 'atlas_business_events_total', 'counter');
  for (const [event, value] of Object.entries(snapshot.business.counters)) {
    lines.push(`atlas_business_events_total{event="${escapeLabelValue(event)}"} ${value.count}`);
  }

  metricHelp(lines, 'atlas_metric_alert_active', 'Active Atlas metric alerts.');
  metricType(lines, 'atlas_metric_alert_active', 'gauge');
  for (const alert of snapshot.alerts) {
    lines.push(
      `atlas_metric_alert_active{id="${escapeLabelValue(alert.id)}",priority="${escapeLabelValue(alert.priority)}"} 1`,
    );
  }

  return `${lines.join('\n')}\n`;
}

function metricHelp(lines: string[], name: string, help: string) {
  lines.push(`# HELP ${name} ${help}`);
}

function metricType(lines: string[], name: string, type: 'counter' | 'gauge') {
  lines.push(`# TYPE ${name} ${type}`);
}

function escapeLabelValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
