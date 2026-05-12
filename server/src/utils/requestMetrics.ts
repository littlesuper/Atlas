export type RequestMetricInput = {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
};

export type RequestMetrics = {
  slowRequestThresholdMs: number;
  totalRequests: number;
  slowRequests: number;
  statusCounts: Record<'2xx' | '3xx' | '4xx' | '5xx', number>;
  durations: number[];
  routes: Map<string, { count: number; totalDurationMs: number }>;
};

export function createRequestMetrics(options?: { slowRequestThresholdMs?: number }): RequestMetrics {
  return {
    slowRequestThresholdMs: options?.slowRequestThresholdMs ?? 1000,
    totalRequests: 0,
    slowRequests: 0,
    statusCounts: {
      '2xx': 0,
      '3xx': 0,
      '4xx': 0,
      '5xx': 0,
    },
    durations: [],
    routes: new Map(),
  };
}

export function recordRequestMetric(metrics: RequestMetrics, input: RequestMetricInput) {
  metrics.totalRequests += 1;
  metrics.durations.push(input.durationMs);

  if (input.durationMs >= metrics.slowRequestThresholdMs) {
    metrics.slowRequests += 1;
  }

  const family = statusFamily(input.statusCode);
  if (family) {
    metrics.statusCounts[family] += 1;
  }

  const route = `${input.method.toUpperCase()} ${input.path}`;
  const current = metrics.routes.get(route) ?? { count: 0, totalDurationMs: 0 };
  metrics.routes.set(route, {
    count: current.count + 1,
    totalDurationMs: current.totalDurationMs + input.durationMs,
  });
}

export function snapshotRequestMetrics(metrics: RequestMetrics) {
  const sortedDurations = [...metrics.durations].sort((a, b) => a - b);
  const durationTotal = sortedDurations.reduce((sum, duration) => sum + duration, 0);

  return {
    totalRequests: metrics.totalRequests,
    slowRequests: metrics.slowRequests,
    statusCounts: { ...metrics.statusCounts },
    latency: {
      avgMs: metrics.totalRequests === 0 ? 0 : Math.round(durationTotal / metrics.totalRequests),
      p95Ms: percentile(sortedDurations, 95),
      p99Ms: percentile(sortedDurations, 99),
      maxMs: sortedDurations.at(-1) ?? 0,
    },
    topRoutes: [...metrics.routes.entries()]
      .map(([route, value]) => ({
        route,
        count: value.count,
        avgMs: Math.round(value.totalDurationMs / value.count),
      }))
      .sort((a, b) => b.count - a.count || b.avgMs - a.avgMs)
      .slice(0, 10),
  };
}

export function isMetricsRequestAuthorized(
  headers: Record<string, string | string[] | undefined>,
  nodeEnv: string | undefined,
  token: string | undefined,
) {
  if (nodeEnv !== 'production') return true;
  if (!token) return false;

  const authorization = headerValue(headers.authorization);
  const metricsToken = headerValue(headers['x-metrics-token']);

  return authorization === `Bearer ${token}` || metricsToken === token;
}

function statusFamily(statusCode: number): '2xx' | '3xx' | '4xx' | '5xx' | null {
  if (statusCode >= 200 && statusCode < 300) return '2xx';
  if (statusCode >= 300 && statusCode < 400) return '3xx';
  if (statusCode >= 400 && statusCode < 500) return '4xx';
  if (statusCode >= 500 && statusCode < 600) return '5xx';
  return null;
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.min(Math.max(index, 0), sortedValues.length - 1)];
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
