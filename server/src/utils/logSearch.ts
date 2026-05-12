import { createReadStream, existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { createInterface } from 'readline';

const logFilePattern = /\.(log|jsonl|txt)$/i;

export type LogSearchMatch = {
  file: string;
  lineNo: number;
  line: string;
};

export type LogSearchResult = {
  requestId: string;
  filesScanned: number;
  totalMatches: number;
  matches: LogSearchMatch[];
};

export function collectLogFiles(roots: string[], cwd = process.cwd()): string[] {
  return roots.flatMap((target) => collectFiles(target, cwd)).sort();
}

export async function searchRequestIdInFiles(
  requestId: string,
  files: string[],
): Promise<LogSearchResult> {
  const matches: LogSearchMatch[] = [];

  for (const file of files) {
    matches.push(...(await scanFileForRequestId(requestId, file)));
  }

  return {
    requestId,
    filesScanned: files.length,
    totalMatches: matches.length,
    matches,
  };
}

async function scanFileForRequestId(requestId: string, file: string): Promise<LogSearchMatch[]> {
  const stream = createReadStream(file, { encoding: 'utf-8' });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  const matches: LogSearchMatch[] = [];
  let lineNo = 0;

  for await (const line of reader) {
    lineNo += 1;
    if (line.includes(requestId)) {
      matches.push({ file, lineNo, line });
    }
  }

  return matches;
}

function collectFiles(target: string, cwd: string): string[] {
  const fullPath = path.resolve(cwd, target);
  if (!existsSync(fullPath)) return [];

  const stat = statSync(fullPath);
  if (stat.isFile()) return logFilePattern.test(fullPath) ? [fullPath] : [];
  if (!stat.isDirectory()) return [];

  return readdirSync(fullPath).flatMap((entry) => collectFiles(path.join(fullPath, entry), cwd));
}
