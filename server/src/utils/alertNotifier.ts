import type { MetricAlert } from './alertRules';

export type AlertNotificationOptions = {
  webhookUrl?: string;
  service?: string;
  environment?: string;
  metricsUrl?: string;
  occurredAt?: Date;
};

export type AlertWebhookPayload = {
  service: string;
  environment: string;
  occurredAt: string;
  title: string;
  alerts: MetricAlert[];
  metricsUrl?: string;
};

export type AlertNotificationResult =
  | { sent: true; skipped: false; status: number }
  | { sent: false; skipped: true; reason: 'no_alerts' | 'missing_webhook_url' };

export function buildAlertWebhookPayload(
  alerts: MetricAlert[],
  options: AlertNotificationOptions = {},
): AlertWebhookPayload {
  return {
    service: options.service ?? 'atlas-api',
    environment: options.environment ?? process.env.NODE_ENV ?? 'development',
    occurredAt: (options.occurredAt ?? new Date()).toISOString(),
    title: `Atlas metrics alerts: ${alerts.length} active`,
    alerts,
    ...(options.metricsUrl ? { metricsUrl: options.metricsUrl } : {}),
  };
}

export async function notifyMetricAlerts(
  alerts: MetricAlert[],
  options: AlertNotificationOptions = {},
): Promise<AlertNotificationResult> {
  if (alerts.length === 0) {
    return { sent: false, skipped: true, reason: 'no_alerts' };
  }

  if (!options.webhookUrl) {
    return { sent: false, skipped: true, reason: 'missing_webhook_url' };
  }

  const response = await fetch(options.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildAlertWebhookPayload(alerts, options)),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    throw new Error(
      `Alert webhook failed with status ${response.status}${responseText ? `: ${responseText}` : ''}`,
    );
  }

  return { sent: true, skipped: false, status: response.status };
}
