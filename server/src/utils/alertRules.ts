type RequestMetricsSnapshot = {
  totalRequests: number;
  slowRequests: number;
  statusCounts: { '2xx': number; '3xx': number; '4xx': number; '5xx': number };
  latency: { avgMs: number; p95Ms: number; p99Ms: number; maxMs: number };
  topRoutes: Array<{ route: string; count: number; avgMs: number }>;
};

type MetricsSnapshot = {
  requests: RequestMetricsSnapshot;
};

export type MetricAlert = {
  id: string;
  priority: 'P1' | 'P2';
  title: string;
  value: number;
  threshold: number;
  message: string;
};

const API_5XX_RATE_THRESHOLD = 0.02;
const SLOW_REQUEST_RATIO_THRESHOLD = 0.1;
const SLOW_REQUEST_P95_THRESHOLD_MS = 2000;

export function evaluateMetricAlerts(snapshot: MetricsSnapshot): MetricAlert[] {
  const alerts: MetricAlert[] = [];
  const { requests } = snapshot;
  if (requests.totalRequests <= 0) return alerts;

  const api5xxRate = requests.statusCounts['5xx'] / requests.totalRequests;
  if (api5xxRate >= API_5XX_RATE_THRESHOLD) {
    alerts.push({
      id: 'api_5xx_rate_high',
      priority: 'P1',
      title: 'API 5xx rate 升高',
      value: roundRatio(api5xxRate),
      threshold: API_5XX_RATE_THRESHOLD,
      message: `5xx rate ${formatPercent(api5xxRate)} >= ${formatPercent(API_5XX_RATE_THRESHOLD)}`,
    });
  }

  const slowRequestRatio = requests.slowRequests / requests.totalRequests;
  if (
    slowRequestRatio >= SLOW_REQUEST_RATIO_THRESHOLD ||
    requests.latency.p95Ms >= SLOW_REQUEST_P95_THRESHOLD_MS
  ) {
    alerts.push({
      id: 'slow_request_ratio_high',
      priority: 'P2',
      title: '慢请求占比升高',
      value: roundRatio(slowRequestRatio),
      threshold: SLOW_REQUEST_RATIO_THRESHOLD,
      message: `slow request ratio ${formatPercent(slowRequestRatio)} >= ${formatPercent(SLOW_REQUEST_RATIO_THRESHOLD)}; p95=${requests.latency.p95Ms}ms`,
    });
  }

  return alerts;
}

function roundRatio(value: number) {
  return Math.round(value * 10000) / 10000;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}
