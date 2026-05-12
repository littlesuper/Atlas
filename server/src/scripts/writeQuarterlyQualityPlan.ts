import {
  QuarterlyGoalPriority,
  QuarterlyMilestone,
  QuarterlyQualityGoal,
  buildQuarterlyQualityPlan,
} from '../utils/quarterlyQualityPlan';

type ParsedArgs = {
  quarter?: string;
  themes: string[];
  goals: QuarterlyQualityGoal[];
  milestones: QuarterlyMilestone[];
  risks: string[];
  successMetrics: string[];
};

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    themes: [],
    goals: [],
    milestones: [],
    risks: [],
    successMetrics: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    switch (arg) {
      case '--quarter':
        parsed.quarter = requireValue(arg, value);
        index += 1;
        break;
      case '--theme':
        parsed.themes.push(...splitPipe(requireValue(arg, value)));
        index += 1;
        break;
      case '--goal':
        parsed.goals.push(parseGoal(requireValue(arg, value)));
        index += 1;
        break;
      case '--milestone':
        parsed.milestones.push(parseMilestone(requireValue(arg, value)));
        index += 1;
        break;
      case '--risk':
        parsed.risks.push(...splitPipe(requireValue(arg, value)));
        index += 1;
        break;
      case '--success-metric':
        parsed.successMetrics.push(...splitPipe(requireValue(arg, value)));
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

function parseGoal(value: string): QuarterlyQualityGoal {
  const [title, owner, priority, source = ''] = value.split('|').map((item) => item.trim());
  if (!title || !priority) {
    throw new Error('--goal must use "title|owner|P0/P1/P2|source" format.');
  }

  return {
    title,
    owner: owner ?? '',
    priority: parsePriority(priority),
    source,
  };
}

function parseMilestone(value: string): QuarterlyMilestone {
  const [month, focus, deliverables = ''] = value.split('|').map((item) => item.trim());
  if (!month || !focus) {
    throw new Error('--milestone must use "month|focus|deliverable1,deliverable2" format.');
  }

  return {
    month,
    focus,
    deliverables: splitCsv(deliverables),
  };
}

function parsePriority(value: string): QuarterlyGoalPriority {
  if (value === 'P0' || value === 'P1' || value === 'P2') {
    return value;
  }

  throw new Error('Goal priority must be P0, P1 or P2.');
}

function splitPipe(value: string): string[] {
  return value.split('|').map((item) => item.trim()).filter(Boolean);
}

function splitCsv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (!args.quarter) {
    throw new Error('Missing quarterly plan values. Provide --quarter.');
  }

  const plan = buildQuarterlyQualityPlan({
    quarter: args.quarter,
    themes: args.themes,
    goals: args.goals,
    milestones: args.milestones,
    risks: args.risks,
    successMetrics: args.successMetrics,
  });

  console.log(JSON.stringify(plan, null, 2));

  if (plan.status !== 'READY') {
    process.exit(1);
  }
}

main();
