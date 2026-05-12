import { CanaryStageResult, buildCanaryReport } from '../utils/canaryReport';

type ParsedArgs = {
  version?: string;
  targetVersion?: string;
  baseUrl?: string;
  startedAt?: string;
  endedAt?: string;
  stages: CanaryStageResult[];
};

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = { stages: [] };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    switch (arg) {
      case '--version':
        parsed.version = requireValue(arg, value);
        index += 1;
        break;
      case '--target-version':
        parsed.targetVersion = requireValue(arg, value);
        index += 1;
        break;
      case '--base-url':
        parsed.baseUrl = requireValue(arg, value);
        index += 1;
        break;
      case '--started-at':
        parsed.startedAt = requireValue(arg, value);
        index += 1;
        break;
      case '--ended-at':
        parsed.endedAt = requireValue(arg, value);
        index += 1;
        break;
      case '--stage':
        parsed.stages.push(parseStage(requireValue(arg, value)));
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

function parseStage(value: string): CanaryStageResult {
  const [id, status, note] = value.split(':');
  if (!isStageId(id)) throw new Error(`Invalid canary stage id: ${id}`);
  if (status !== 'PASS' && status !== 'FAIL' && status !== 'SKIPPED') {
    throw new Error(`Invalid canary stage status: ${status}`);
  }

  return { id, status, ...(note ? { note } : {}) };
}

function isStageId(value: string): value is CanaryStageResult['id'] {
  return value === 'preflight' ||
    value === 'canary_5' ||
    value === 'canary_25' ||
    value === 'canary_50' ||
    value === 'full_rollout';
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const version = args.version ?? process.env.RELEASE_VERSION;
  const targetVersion = args.targetVersion ?? process.env.ROLLBACK_TARGET_VERSION;
  const startedAt = args.startedAt ?? process.env.CANARY_STARTED_AT;
  const endedAt = args.endedAt ?? process.env.CANARY_ENDED_AT;

  if (!version || !targetVersion || !startedAt || !endedAt) {
    throw new Error('Missing required canary report values. Provide --version, --target-version, --started-at and --ended-at.');
  }

  const report = buildCanaryReport({
    version,
    targetVersion,
    baseUrl: args.baseUrl ?? process.env.RELEASE_BASE_URL ?? process.env.INCIDENT_BASE_URL,
    startedAt,
    endedAt,
    stages: args.stages,
  });

  console.log(JSON.stringify(report, null, 2));

  if (report.status !== 'COMPLETED') {
    process.exit(1);
  }
}

main();
