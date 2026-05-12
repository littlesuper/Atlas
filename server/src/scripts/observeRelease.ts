import { collectIncidentContext } from '../utils/incidentContext';
import { evaluateReleaseReadiness } from '../utils/releaseReadiness';
import { ReleaseObservationSample, summarizeReleaseObservation } from '../utils/releaseObservation';

type ParsedArgs = {
  baseUrl?: string;
  checks: number;
  intervalMs: number;
  windowMinutes: number;
};

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    checks: 6,
    intervalMs: 5 * 60 * 1000,
    windowMinutes: 30,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    switch (arg) {
      case '--base-url':
        parsed.baseUrl = requireValue(arg, value);
        index += 1;
        break;
      case '--checks':
        parsed.checks = parsePositiveInteger(arg, requireValue(arg, value));
        index += 1;
        break;
      case '--interval-ms':
        parsed.intervalMs = parseNonNegativeInteger(arg, requireValue(arg, value));
        index += 1;
        break;
      case '--window-minutes':
        parsed.windowMinutes = parsePositiveInteger(arg, requireValue(arg, value));
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function parsePositiveInteger(flag: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }

  return parsed;
}

function parseNonNegativeInteger(flag: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }

  return parsed;
}

async function collectSample(baseUrl: string): Promise<ReleaseObservationSample> {
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

  return {
    checkedAt: report.evaluatedAt,
    status: report.status,
    failedChecks: report.checks
      .filter((check) => check.status === 'FAIL')
      .map((check) => check.id),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl =
    args.baseUrl ??
    process.env.RELEASE_BASE_URL ??
    process.env.INCIDENT_BASE_URL ??
    `http://localhost:${process.env.PORT ?? '3000'}`;
  const samples: ReleaseObservationSample[] = [];

  for (let index = 0; index < args.checks; index += 1) {
    samples.push(await collectSample(baseUrl));

    if (index < args.checks - 1) {
      await sleep(args.intervalMs);
    }
  }

  const summary = summarizeReleaseObservation({
    windowMinutes: args.windowMinutes,
    samples,
  });

  console.log(JSON.stringify({ baseUrl, ...summary }, null, 2));

  if (summary.status !== 'STABLE') {
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
