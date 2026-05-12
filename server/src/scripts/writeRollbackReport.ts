import { buildRollbackReport } from '../utils/rollbackReport';

type ParsedArgs = {
  currentVersion?: string;
  targetVersion?: string;
  reason?: string;
  startedAt?: string;
  endedAt?: string;
  targetConfirmed: boolean;
  databaseStrategyConfirmed: boolean;
  postRollbackPrecheckStatus?: 'GO' | 'NO_GO';
  issues: string[];
  followUps: string[];
};

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    targetConfirmed: false,
    databaseStrategyConfirmed: false,
    issues: [],
    followUps: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    switch (arg) {
      case '--current-version':
        parsed.currentVersion = requireValue(arg, value);
        index += 1;
        break;
      case '--target-version':
        parsed.targetVersion = requireValue(arg, value);
        index += 1;
        break;
      case '--reason':
        parsed.reason = requireValue(arg, value);
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
      case '--target-confirmed':
        parsed.targetConfirmed = true;
        break;
      case '--database-strategy-confirmed':
        parsed.databaseStrategyConfirmed = true;
        break;
      case '--post-rollback-precheck':
        parsed.postRollbackPrecheckStatus = parsePrecheckStatus(requireValue(arg, value));
        index += 1;
        break;
      case '--issue':
        parsed.issues.push(...splitList(requireValue(arg, value)));
        index += 1;
        break;
      case '--follow-up':
        parsed.followUps.push(...splitList(requireValue(arg, value)));
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

function parsePrecheckStatus(value: string): 'GO' | 'NO_GO' {
  if (value === 'GO' || value === 'NO_GO') return value;
  throw new Error('Invalid --post-rollback-precheck. Use GO or NO_GO.');
}

function splitList(value: string): string[] {
  return value.split('|').map((item) => item.trim()).filter(Boolean);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const currentVersion = args.currentVersion ?? process.env.RELEASE_VERSION;
  const targetVersion = args.targetVersion ?? process.env.ROLLBACK_TARGET_VERSION;
  const reason = args.reason ?? process.env.ROLLBACK_REASON ?? 'rollback_rehearsal';
  const startedAt = args.startedAt ?? process.env.ROLLBACK_STARTED_AT;
  const endedAt = args.endedAt ?? process.env.ROLLBACK_ENDED_AT;

  if (!currentVersion || !targetVersion || !startedAt || !endedAt || !args.postRollbackPrecheckStatus) {
    throw new Error('Missing required rollback report values. Provide versions, timestamps and --post-rollback-precheck.');
  }

  const report = buildRollbackReport({
    currentVersion,
    targetVersion,
    reason,
    startedAt,
    endedAt,
    targetConfirmed: args.targetConfirmed,
    databaseStrategyConfirmed: args.databaseStrategyConfirmed,
    postRollbackPrecheckStatus: args.postRollbackPrecheckStatus,
    issues: args.issues,
    followUps: args.followUps,
  });

  console.log(JSON.stringify(report, null, 2));

  if (report.status !== 'PASSED') {
    process.exit(1);
  }
}

main();
