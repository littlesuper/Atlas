import { collectIncidentContext } from '../utils/incidentContext';

type CliOptions = {
  baseUrl?: string;
  requestId?: string;
  logRoots: string[];
};

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { logRoots: [] };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--base-url' && next) {
      options.baseUrl = next;
      index += 1;
      continue;
    }

    if (arg === '--request-id' && next) {
      options.requestId = next;
      index += 1;
      continue;
    }

    if (arg === '--logs' && next) {
      options.logRoots.push(next);
      index += 1;
      continue;
    }

    throw new Error(
      'Usage: npm run incident:collect -- [--base-url <url>] [--request-id <id>] [--logs <dirOrFile> ...]',
    );
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const baseUrl =
    options.baseUrl ?? process.env.INCIDENT_BASE_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`;
  const context = await collectIncidentContext({
    baseUrl,
    metricsToken: process.env.METRICS_TOKEN,
    service: process.env.ALERT_SERVICE ?? 'atlas-api',
    environment: process.env.NODE_ENV ?? 'development',
    requestId: options.requestId ?? process.env.INCIDENT_REQUEST_ID,
    logRoots: options.logRoots.length > 0 ? options.logRoots : undefined,
  });

  console.log(JSON.stringify(context, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
