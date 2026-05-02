import client from 'prom-client';

export interface HttpMetricInput {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

const PREFIX = 'atlas_';

const registry = new client.Registry();
registry.setDefaultLabels({ service: 'atlas' });

client.collectDefaultMetrics({
  register: registry,
  prefix: PREFIX,
});

const httpRequestsTotal = new client.Counter({
  name: `${PREFIX}http_requests_total`,
  help: 'Total Atlas HTTP requests.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: `${PREFIX}http_request_duration_seconds`,
  help: 'Atlas HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

const businessEventsTotal = new client.Counter({
  name: `${PREFIX}business_events_total`,
  help: 'Total Atlas business events.',
  labelNames: ['event', 'result'],
  registers: [registry],
});

export const recordHttpRequest = ({ method, route, statusCode, durationMs }: HttpMetricInput): void => {
  const labels = {
    method,
    route,
    status_code: String(statusCode),
  };

  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, durationMs / 1000);
};

export const recordBusinessEvent = (event: string, result: string): void => {
  businessEventsTotal.inc({ event, result });
};

export const getMetrics = async (): Promise<string> => registry.metrics();

export const getMetricsContentType = (): string => registry.contentType;

export const resetMetricsForTests = (): void => {
  httpRequestsTotal.reset();
  httpRequestDurationSeconds.reset();
  businessEventsTotal.reset();
};
