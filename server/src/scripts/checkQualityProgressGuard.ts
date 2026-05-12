import { readFileSync } from 'node:fs';
import { buildQualityProgressGuard } from '../utils/qualityProgressGuard';

function parseArgs(args: string[]): {
  filePath: string;
  requiredDate: string;
  minWeek8Progress: number;
  evidenceMarkers: string[];
  changelogMarkers: string[];
} {
  const evidenceMarkers: string[] = [];
  const changelogMarkers: string[] = [];
  const evidenceMarkerSet = new Set<string>();
  const changelogMarkerSet = new Set<string>();
  let filePath = '../atlas-quality-system/PROJECT_PROGRESS.md';
  let requiredDate = todayInShanghai();
  let minWeek8Progress = 99;
  let fileSeen = false;
  let dateSeen = false;
  let minWeek8ProgressSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--file' || arg.startsWith('--file=')) {
      if (fileSeen) {
        throw new Error('--file can only be provided once. Use --help for usage.');
      }

      fileSeen = true;
      filePath = parseFilePath(optionValue(args, index, '--file'));
      if (arg === '--file') {
        index += 1;
      }
      continue;
    }

    if (arg === '--date' || arg.startsWith('--date=')) {
      if (dateSeen) {
        throw new Error('--date can only be provided once. Use --help for usage.');
      }

      dateSeen = true;
      requiredDate = parseDate(optionValue(args, index, '--date'));
      if (arg === '--date') {
        index += 1;
      }
      continue;
    }

    if (arg === '--min-week8-progress' || arg.startsWith('--min-week8-progress=')) {
      if (minWeek8ProgressSeen) {
        throw new Error('--min-week8-progress can only be provided once. Use --help for usage.');
      }

      minWeek8ProgressSeen = true;
      minWeek8Progress = parseProgress(optionValue(args, index, '--min-week8-progress'));
      if (arg === '--min-week8-progress') {
        index += 1;
      }
      continue;
    }

    if (arg === '--evidence' || arg.startsWith('--evidence=')) {
      const marker = optionValue(args, index, '--evidence');
      rejectDuplicateMarker('--evidence', marker, evidenceMarkerSet);
      evidenceMarkers.push(marker);
      if (arg === '--evidence') {
        index += 1;
      }
      continue;
    }

    if (arg === '--changelog' || arg.startsWith('--changelog=')) {
      const marker = optionValue(args, index, '--changelog');
      rejectDuplicateMarker('--changelog', marker, changelogMarkerSet);
      changelogMarkers.push(marker);
      if (arg === '--changelog') {
        index += 1;
      }
      continue;
    }

    throw new Error(`Unknown argument: ${arg}. Use --help for usage.`);
  }

  return {
    filePath,
    requiredDate,
    minWeek8Progress,
    evidenceMarkers: evidenceMarkers.length > 0 ? evidenceMarkers : ['quality:progress-guard'],
    changelogMarkers: changelogMarkers.length > 0 ? changelogMarkers : ['quality:progress-guard'],
  };
}

function rejectDuplicateMarker(flag: '--evidence' | '--changelog', marker: string, seen: Set<string>): void {
  const normalizedMarker = marker.trim();
  if (!normalizedMarker) {
    throw new Error(`${flag} marker must not be blank. Use --help for usage.`);
  }

  if (seen.has(normalizedMarker)) {
    throw new Error(`${flag} marker is duplicated: ${normalizedMarker}. Use --help for usage.`);
  }

  seen.add(normalizedMarker);
}

function optionValue(args: string[], index: number, flag: string): string {
  const arg = args[index];
  if (arg.startsWith(`${flag}=`)) {
    return requireInlineValue(flag, arg.slice(flag.length + 1));
  }

  return requireValue(flag, args[index + 1]);
}

function requireInlineValue(flag: string, value: string): string {
  if (!value) {
    throw new Error(`Missing value for ${flag}. Use --help for usage.`);
  }

  return value;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}. Use --help for usage.`);
  }

  return value;
}

function parseProgress(value: string): number {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    throw new Error('--min-week8-progress must not be blank. Use --help for usage.');
  }

  const progress = Number(normalizedValue);

  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw new Error('--min-week8-progress must be an integer between 0 and 100. Use --help for usage.');
  }

  return progress;
}

function parseFilePath(value: string): string {
  const filePath = value.trim();
  if (!filePath) {
    throw new Error('--file must not be blank. Use --help for usage.');
  }

  return filePath;
}

function parseDate(value: string): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    throw new Error('--date must not be blank. Use --help for usage.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    throw new Error('--date must use YYYY-MM-DD format. Use --help for usage.');
  }

  const [year, month, day] = normalizedValue.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new Error('--date must be a real calendar date. Use --help for usage.');
  }

  return normalizedValue;
}

function todayInShanghai(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function main(): void {
  const rawArgs = process.argv.slice(2);
  const helpRequested = rawArgs.includes('--help') || rawArgs.includes('-h');
  if (helpRequested) {
    if (rawArgs.length !== 1) {
      throw new Error('--help must be used by itself.');
    }

    console.log(helpText());
    return;
  }

  const args = parseArgs(rawArgs);
  const content = readFileSync(args.filePath, 'utf8');
  const guard = buildQualityProgressGuard({
    content,
    requiredDate: args.requiredDate,
    minWeek8Progress: args.minWeek8Progress,
    requiredEvidenceMarkers: args.evidenceMarkers,
    requiredChangelogMarkers: args.changelogMarkers,
  });

  console.log(JSON.stringify(guard, null, 2));

  if (guard.status !== 'READY') {
    process.exit(1);
  }
}

function helpText(): string {
  return [
    'Usage: npm run quality:progress-guard -- [options]',
    '',
    'Options:',
    '  --file path',
    '  --file=path',
    '  --date YYYY-MM-DD',
    '  --date=YYYY-MM-DD',
    '  --min-week8-progress integer',
    '  --min-week8-progress=integer',
    '  --evidence marker',
    '  --evidence=marker',
    '  --changelog marker',
    '  --changelog=marker',
    '  -h, --help',
    '',
    'Notes:',
    '  default file: ../atlas-quality-system/PROJECT_PROGRESS.md',
    '  default date: today in Asia/Shanghai',
    '  default min-week8-progress: 99',
    '  min-week8-progress range: integer 0-100',
    '  default evidence/changelog marker: quality:progress-guard',
    '  single-use options: --file, --date, --min-week8-progress',
    '  repeat --evidence and --changelog for multiple required markers',
    '  use equals syntax when a marker starts with --',
    '',
    'Examples:',
    '  npm run quality:progress-guard -- --min-week8-progress=100 --evidence="5 个测试通过" --changelog="CLI help 输出"',
    '  npm run quality:progress-guard -- --evidence=--update="risk|status|evidenceRef|blocker" --changelog="CLI help 等号 update 示例"',
  ].join('\n');
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
