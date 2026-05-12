import { IncidentDrillScenarioId } from '../utils/incidentDrill';
import { buildIncidentDrillReport } from '../utils/incidentDrillReport';

type ParsedArgs = {
  scenario: IncidentDrillScenarioId;
  startedAt?: string;
  endedAt?: string;
  achievedCriteria: string[];
  issues: string[];
  followUps: string[];
};

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    scenario: 'api_5xx',
    achievedCriteria: [],
    issues: [],
    followUps: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    switch (arg) {
      case '--scenario':
        parsed.scenario = parseScenario(requireValue(arg, value));
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
      case '--achieved':
        parsed.achievedCriteria.push(...splitList(requireValue(arg, value)));
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

function parseScenario(value: string): IncidentDrillScenarioId {
  if (value === 'api_5xx' || value === 'database_degraded') return value;
  throw new Error('Invalid --scenario. Use api_5xx or database_degraded.');
}

function splitList(value: string): string[] {
  return value.split('|').map((item) => item.trim()).filter(Boolean);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = args.startedAt ?? process.env.DRILL_STARTED_AT;
  const endedAt = args.endedAt ?? process.env.DRILL_ENDED_AT;

  if (!startedAt || !endedAt) {
    throw new Error('Missing drill timestamps. Provide --started-at and --ended-at.');
  }

  const report = buildIncidentDrillReport({
    scenario: args.scenario,
    startedAt,
    endedAt,
    achievedCriteria: args.achievedCriteria,
    issues: args.issues,
    followUps: args.followUps,
  });

  console.log(JSON.stringify(report, null, 2));

  if (report.status !== 'PASSED') {
    process.exit(1);
  }
}

main();
