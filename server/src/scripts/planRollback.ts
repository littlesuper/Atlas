import { buildRollbackDryRunPlan, RollbackDatabaseStrategy } from '../utils/rollbackPlan';

type ParsedArgs = {
  currentVersion?: string;
  targetVersion?: string;
  reason?: string;
  featureFlagsToDisable: string[];
  databaseStrategy?: RollbackDatabaseStrategy;
  baseUrl?: string;
};

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = { featureFlagsToDisable: [] };

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
      case '--disable-flag':
        parsed.featureFlagsToDisable.push(...requireValue(arg, value).split(','));
        index += 1;
        break;
      case '--database-strategy':
        parsed.databaseStrategy = parseDatabaseStrategy(requireValue(arg, value));
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

function parseDatabaseStrategy(value: string): RollbackDatabaseStrategy {
  if (value === 'none' || value === 'forward-fix' || value === 'backup-restore') return value;
  throw new Error('Invalid --database-strategy. Use none, forward-fix or backup-restore.');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildRollbackDryRunPlan({
    currentVersion: args.currentVersion ?? process.env.RELEASE_VERSION,
    targetVersion: args.targetVersion ?? process.env.ROLLBACK_TARGET_VERSION,
    reason: args.reason ?? process.env.ROLLBACK_REASON,
    featureFlagsToDisable: args.featureFlagsToDisable,
    databaseStrategy: args.databaseStrategy,
    baseUrl: args.baseUrl ?? process.env.RELEASE_BASE_URL ?? process.env.INCIDENT_BASE_URL,
  });

  console.log(JSON.stringify(plan, null, 2));

  if (plan.status !== 'READY_FOR_REHEARSAL') {
    process.exit(1);
  }
}

main();
