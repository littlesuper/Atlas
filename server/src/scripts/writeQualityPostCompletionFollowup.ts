import {
  QualityPostCompletionFollowupStatus,
  QualityPostCompletionFollowupUpdate,
  buildDefaultQualityPostCompletionFollowup,
  renderQualityPostCompletionFollowupMarkdown,
} from '../utils/qualityPostCompletionFollowup';

function main(): void {
  const rawArgs = process.argv.slice(2);
  if (hasHelpFlag(rawArgs)) {
    console.log(helpText());
    return;
  }

  const args = parseArgs(rawArgs);
  if (args.help) {
    console.log(helpText());
    return;
  }

  const followup = buildDefaultQualityPostCompletionFollowup({
    updates: args.updates,
  });

  console.log(args.format === 'markdown' ? renderQualityPostCompletionFollowupMarkdown(followup) : JSON.stringify(followup, null, 2));

  if (followup.status === 'BLOCKED') {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function parseArgs(args: string[]): {
  format: 'json' | 'markdown';
  help: boolean;
  updates: QualityPostCompletionFollowupUpdate[];
} {
  const updates: QualityPostCompletionFollowupUpdate[] = [];
  const updateRisks = new Set<string>();
  let format: 'json' | 'markdown' = 'json';
  let formatSeen = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

    if (arg === '--update' || arg.startsWith('--update=')) {
      const update = parseUpdate(optionValue(args, index, '--update'));
      if (updateRisks.has(update.risk)) {
        throw new Error(`--update risk can only be provided once: ${update.risk}`);
      }

      updateRisks.add(update.risk);
      updates.push(update);
      if (arg === '--update') {
        index += 1;
      }
      continue;
    }

    if (arg === '--format' || arg.startsWith('--format=')) {
      if (formatSeen) {
        throw new Error('--format can only be provided once.');
      }

      formatSeen = true;
      format = parseFormat(optionValue(args, index, '--format'));
      if (arg === '--format') {
        index += 1;
      }
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}. Use --help for usage.`);
  }

  return { format, help, updates };
}

function helpText(): string {
  return [
    'Usage: npm run quality:post-completion-followup -- [options]',
    '',
    'Options:',
    '  --format json|markdown',
    '  --format=json|markdown',
    '  --update "risk|status|evidenceRef|blocker"',
    '  --update="risk|status|evidenceRef|blocker"',
    '  -h, --help',
    '',
    'Notes:',
    '  default format: json',
    '  format and status values are case-insensitive',
    '  status values: OPEN|BLOCKED|DONE',
    '  single-use options: --format',
    '  repeat --update for multiple follow-ups',
    '  each --update risk can appear only once',
    '  quote --update values because | is a shell pipe',
    '',
    'Examples:',
    '  npm run quality:post-completion-followup -- --format markdown',
    '  npm run quality:post-completion-followup -- --format=markdown',
    '  npm run quality:post-completion-followup -- --update "rebase/merge 策略|DONE|merge-plan#2026-05-10"',
    '  npm run quality:post-completion-followup -- --update "rebase/merge 策略|DONE|merge-plan#2026-05-10" --update "质量回顾会实会确认|BLOCKED||meeting-minutes pending"',
  ].join('\n');
}

function hasHelpFlag(args: string[]): boolean {
  return args.includes('--help') || args.includes('-h');
}

function optionValue(args: string[], index: number, option: string): string {
  const arg = args[index];
  if (arg.startsWith(`${option}=`)) {
    return requireValue(option, arg.slice(option.length + 1));
  }

  return requireValue(option, args[index + 1]);
}

function parseFormat(value: string): 'json' | 'markdown' {
  const normalizedFormat = value.toLowerCase();

  if (normalizedFormat === 'json' || normalizedFormat === 'markdown') {
    return normalizedFormat;
  }

  throw new Error(`Unsupported format: ${value}. Expected json|markdown.`);
}

function parseUpdate(value: string): QualityPostCompletionFollowupUpdate {
  const parts = value.split('|').map((part) => part.trim());
  if (parts.length < 2 || parts.length > 4) {
    throw new Error('--update must use "risk|status|evidenceRef|blocker" format with 2 to 4 fields.');
  }

  const [risk, status, evidenceRef, blocker] = parts;
  if (!risk) {
    throw new Error('--update risk is required.');
  }

  if (!status) {
    throw new Error('--update status is required.');
  }

  return {
    risk,
    status: parseStatus(status),
    evidenceRef: evidenceRef || undefined,
    blocker: blocker || undefined,
  };
}

function parseStatus(value: string): QualityPostCompletionFollowupStatus {
  const normalizedStatus = value.toUpperCase();

  if (normalizedStatus === 'OPEN' || normalizedStatus === 'BLOCKED' || normalizedStatus === 'DONE') {
    return normalizedStatus;
  }

  throw new Error(`Unsupported follow-up status: ${value}. Expected OPEN|BLOCKED|DONE.`);
}

function requireValue(arg: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`${arg} requires a value. Use --help for usage.`);
  }

  return value;
}
