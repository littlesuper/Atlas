import { QualityEvidenceStatus, buildMonthlyQualityAuditReport } from '../utils/monthlyQualityAudit';

type ParsedArgs = {
  month?: string;
  overallProgress?: number;
  currentFocus?: string;
  completedWeeks: string[];
  evidence: Array<{
    name: string;
    status: QualityEvidenceStatus;
    note?: string;
  }>;
  blockers: string[];
  recommendations: string[];
};

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    completedWeeks: [],
    evidence: [],
    blockers: [],
    recommendations: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    switch (arg) {
      case '--month':
        parsed.month = requireValue(arg, value);
        index += 1;
        break;
      case '--overall-progress':
        parsed.overallProgress = parseProgress(requireValue(arg, value));
        index += 1;
        break;
      case '--current-focus':
        parsed.currentFocus = requireValue(arg, value);
        index += 1;
        break;
      case '--completed-week':
        parsed.completedWeeks.push(...splitList(requireValue(arg, value)));
        index += 1;
        break;
      case '--evidence':
        parsed.evidence.push(parseEvidence(requireValue(arg, value)));
        index += 1;
        break;
      case '--blocker':
        parsed.blockers.push(...splitList(requireValue(arg, value)));
        index += 1;
        break;
      case '--recommendation':
        parsed.recommendations.push(...splitList(requireValue(arg, value)));
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

function parseProgress(value: string): number {
  const progress = Number(value);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new Error('--overall-progress must be a number between 0 and 100.');
  }

  return progress;
}

function parseEvidence(value: string): ParsedArgs['evidence'][number] {
  const [name, status, note] = value.split('|').map((item) => item.trim());

  if (!name || !status) {
    throw new Error('--evidence must use "name|PASS|optional note" format.');
  }

  return {
    name,
    status: parseEvidenceStatus(status),
    note: note || undefined,
  };
}

function parseEvidenceStatus(value: string): QualityEvidenceStatus {
  if (value === 'PASS' || value === 'WARN' || value === 'FAIL') {
    return value;
  }

  throw new Error('Evidence status must be PASS, WARN or FAIL.');
}

function splitList(value: string): string[] {
  return value.split('|').map((item) => item.trim()).filter(Boolean);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (!args.month || args.overallProgress === undefined || !args.currentFocus) {
    throw new Error('Missing required audit values. Provide --month, --overall-progress and --current-focus.');
  }

  const report = buildMonthlyQualityAuditReport({
    month: args.month,
    overallProgress: args.overallProgress,
    currentFocus: args.currentFocus,
    completedWeeks: args.completedWeeks,
    evidence: args.evidence,
    blockers: args.blockers,
    recommendations: args.recommendations,
  });

  console.log(JSON.stringify(report, null, 2));
}

main();
