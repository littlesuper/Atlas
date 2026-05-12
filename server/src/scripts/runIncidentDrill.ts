import { buildIncidentDrillPlan, IncidentDrillScenarioId } from '../utils/incidentDrill';

type ParsedArgs = {
  scenario: IncidentDrillScenarioId;
  currentVersion?: string;
  targetVersion?: string;
  baseUrl?: string;
};

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = { scenario: 'api_5xx' };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    switch (arg) {
      case '--scenario':
        parsed.scenario = parseScenario(requireValue(arg, value));
        index += 1;
        break;
      case '--current-version':
        parsed.currentVersion = requireValue(arg, value);
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

function parseScenario(value: string): IncidentDrillScenarioId {
  if (value === 'api_5xx' || value === 'database_degraded') return value;
  throw new Error('Invalid --scenario. Use api_5xx or database_degraded.');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildIncidentDrillPlan({
    scenario: args.scenario,
    currentVersion: args.currentVersion ?? process.env.RELEASE_VERSION,
    targetVersion: args.targetVersion ?? process.env.ROLLBACK_TARGET_VERSION,
    baseUrl: args.baseUrl ?? process.env.RELEASE_BASE_URL ?? process.env.INCIDENT_BASE_URL,
  });

  console.log(JSON.stringify(plan, null, 2));

  if (plan.status !== 'READY') {
    process.exit(1);
  }
}

main();
