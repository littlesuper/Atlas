import { notifyMetricAlerts } from '../utils/alertNotifier';
import type { MetricAlert } from '../utils/alertRules';

type MetricsResponse = {
  alerts?: MetricAlert[];
};

function getMetricsUrl(): string {
  if (process.env.METRICS_URL) {
    return process.env.METRICS_URL;
  }

  return `http://localhost:${process.env.PORT ?? '3000'}/api/metrics`;
}

async function main(): Promise<void> {
  const metricsUrl = getMetricsUrl();
  const headers: Record<string, string> = {};

  if (process.env.METRICS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.METRICS_TOKEN}`;
  }

  const metricsResponse = await fetch(metricsUrl, { headers });
  if (!metricsResponse.ok) {
    const responseText = await metricsResponse.text().catch(() => '');
    throw new Error(
      `Metrics fetch failed with status ${metricsResponse.status}${responseText ? `: ${responseText}` : ''}`,
    );
  }

  const metrics = (await metricsResponse.json()) as MetricsResponse;
  const alerts = Array.isArray(metrics.alerts) ? metrics.alerts : [];
  const result = await notifyMetricAlerts(alerts, {
    webhookUrl: process.env.ALERT_WEBHOOK_URL,
    service: process.env.ALERT_SERVICE ?? 'atlas-api',
    environment: process.env.NODE_ENV ?? 'development',
    metricsUrl,
  });

  console.log(JSON.stringify({ alertCount: alerts.length, ...result }));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
