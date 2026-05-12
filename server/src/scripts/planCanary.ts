import { buildCanaryPlan } from '../utils/canaryPlan';

type ParsedArgs = {
  version?: string;
  targetVersion?: string;
  baseUrl?: string;
};

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

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

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildCanaryPlan({
    version: args.version ?? process.env.RELEASE_VERSION,
    targetVersion: args.targetVersion ?? process.env.ROLLBACK_TARGET_VERSION,
    baseUrl: args.baseUrl ?? process.env.RELEASE_BASE_URL ?? process.env.INCIDENT_BASE_URL,
  });

  console.log(JSON.stringify(plan, null, 2));

  if (plan.status !== 'READY') {
    process.exit(1);
  }
}

main();
