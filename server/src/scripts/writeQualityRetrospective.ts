import { RetrospectiveWeek, buildQualityRetrospectiveReport } from '../utils/qualityRetrospective';

type ParsedArgs = {
  period?: string;
  weeks: RetrospectiveWeek[];
  risks: string[];
  nextActions: string[];
};

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    weeks: [],
    risks: [],
    nextActions: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    switch (arg) {
      case '--period':
        parsed.period = requireValue(arg, value);
        index += 1;
        break;
      case '--week':
        parsed.weeks.push(parseWeek(requireValue(arg, value)));
        index += 1;
        break;
      case '--risk':
        parsed.risks.push(...splitList(requireValue(arg, value)));
        index += 1;
        break;
      case '--next-action':
        parsed.nextActions.push(...splitList(requireValue(arg, value)));
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

function parseWeek(value: string): RetrospectiveWeek {
  const [week, focus, progress, wins = '', gaps = ''] = value.split('|').map((item) => item.trim());

  if (!week || !focus || !progress) {
    throw new Error('--week must use "week|focus|progress|win1,win2|gap1,gap2" format.');
  }

  return {
    week,
    focus,
    progress: parseProgress(progress),
    wins: splitCsv(wins),
    gaps: splitCsv(gaps),
  };
}

function parseProgress(value: string): number {
  const progress = Number(value);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new Error('Week progress must be a number between 0 and 100.');
  }

  return progress;
}

function splitList(value: string): string[] {
  return value.split('|').map((item) => item.trim()).filter(Boolean);
}

function splitCsv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (!args.period || args.weeks.length === 0) {
    throw new Error('Missing retrospective values. Provide --period and at least one --week.');
  }

  const report = buildQualityRetrospectiveReport({
    period: args.period,
    weeks: args.weeks,
    risks: args.risks,
    nextActions: args.nextActions,
  });

  console.log(JSON.stringify(report, null, 2));
}

main();
