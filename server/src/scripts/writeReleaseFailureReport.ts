import { ReleaseFailureStage, buildReleaseFailureReport } from '../utils/releaseFailureReport';

type ParsedArgs = {
  version?: string;
  targetVersion?: string;
  failedAt?: ReleaseFailureStage;
  triggeredGate?: string;
  mitigationActions: string[];
  owners: string[];
  followUps: string[];
  baseUrl?: string;
};

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    mitigationActions: [],
    owners: [],
    followUps: [],
  };

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
      case '--failed-at':
        parsed.failedAt = parseStage(requireValue(arg, value));
        index += 1;
        break;
      case '--triggered-gate':
        parsed.triggeredGate = requireValue(arg, value);
        index += 1;
        break;
      case '--mitigation':
        parsed.mitigationActions.push(...splitList(requireValue(arg, value)));
        index += 1;
        break;
      case '--owner':
        parsed.owners.push(...splitList(requireValue(arg, value)));
        index += 1;
        break;
      case '--follow-up':
        parsed.followUps.push(...splitList(requireValue(arg, value)));
        index += 1;
        break;
      case '--base-url':
        parsed.baseUrl = requireValue(arg, value);
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

function parseStage(value: string): ReleaseFailureStage {
  if (
    value === 'precheck' ||
    value === 'canary_5' ||
    value === 'canary_25' ||
    value === 'canary_50' ||
    value === 'full_rollout' ||
    value === 'observe' ||
    value === 'rollback'
  ) {
    return value;
  }

  throw new Error('Invalid --failed-at. Use precheck, canary_5, canary_25, canary_50, full_rollout, observe or rollback.');
}

function splitList(value: string): string[] {
  return value.split('|').map((item) => item.trim()).filter(Boolean);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const version = args.version ?? process.env.RELEASE_VERSION;

  if (!version || !args.failedAt || !args.triggeredGate) {
    throw new Error('Missing required release failure report values. Provide --version, --failed-at and --triggered-gate.');
  }

  const report = buildReleaseFailureReport({
    version,
    targetVersion: args.targetVersion ?? process.env.ROLLBACK_TARGET_VERSION,
    failedAt: args.failedAt,
    triggeredGate: args.triggeredGate,
    mitigationActions: args.mitigationActions,
    owners: args.owners,
    followUps: args.followUps,
    baseUrl: args.baseUrl ?? process.env.RELEASE_BASE_URL ?? process.env.INCIDENT_BASE_URL,
  });

  console.log(JSON.stringify(report, null, 2));

  if (report.status !== 'ACTION_REQUIRED') {
    process.exit(1);
  }
}

main();
