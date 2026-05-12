import { collectIncidentContext } from '../utils/incidentContext';
import { evaluateReleaseReadiness } from '../utils/releaseReadiness';

function parseBaseUrl(args: string[]): string | undefined {
  const index = args.indexOf('--base-url');
  if (index === -1) return undefined;
  const baseUrl = args[index + 1];
  if (!baseUrl) {
    throw new Error('Usage: npm run release:precheck -- [--base-url <url>]');
  }

  return baseUrl;
}

async function main(): Promise<void> {
  const baseUrl =
    parseBaseUrl(process.argv.slice(2)) ??
    process.env.RELEASE_BASE_URL ??
    process.env.INCIDENT_BASE_URL ??
    `http://localhost:${process.env.PORT ?? '3000'}`;
  const context = await collectIncidentContext({
    baseUrl,
    metricsToken: process.env.METRICS_TOKEN,
    service: process.env.ALERT_SERVICE ?? 'atlas-api',
    environment: process.env.NODE_ENV ?? 'development',
  });
  const report = evaluateReleaseReadiness({
    health: context.health,
    metrics: context.metrics,
    featureFlags: context.featureFlags,
  });

  console.log(JSON.stringify({ baseUrl: context.baseUrl, ...report }, null, 2));

  if (report.status === 'NO_GO') {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
