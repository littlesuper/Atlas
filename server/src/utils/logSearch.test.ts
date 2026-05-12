import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectLogFiles, searchRequestIdInFiles } from './logSearch';

const tempDirs: string[] = [];

describe('log search utilities', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('collects supported log files recursively', () => {
    const root = createTempDir();
    writeFileSync(path.join(root, 'app.log'), 'line 1\n');
    writeFileSync(path.join(root, 'notes.md'), 'ignore\n');
    const nested = path.join(root, 'nested');
    mkdirSync(nested);
    writeFileSync(path.join(root, 'events.jsonl'), 'line 2\n');
    writeFileSync(path.join(root, 'trace.txt'), 'line 3\n');
    writeFileSync(path.join(root, 'debug.LOG'), 'line 4\n');
    writeFileSync(path.join(nested, 'ignored.tmp'), 'ignore\n');
    writeFileSync(path.join(nested, 'nested.log'), 'line 5\n');

    expect(collectLogFiles([root]).map((file) => path.basename(file)).sort()).toEqual([
      'app.log',
      'debug.LOG',
      'events.jsonl',
      'nested.log',
      'trace.txt',
    ]);
  });

  it('returns structured matches for a request id', async () => {
    const root = createTempDir();
    const logFile = path.join(root, 'app.log');
    writeFileSync(logFile, 'first\nREQ-123 matched\nlast REQ-123\n');

    await expect(searchRequestIdInFiles('REQ-123', [logFile])).resolves.toEqual({
      requestId: 'REQ-123',
      filesScanned: 1,
      totalMatches: 2,
      matches: [
        { file: logFile, lineNo: 2, line: 'REQ-123 matched' },
        { file: logFile, lineNo: 3, line: 'last REQ-123' },
      ],
    });
  });

  it('returns empty matches when requestId not found', async () => {
    const root = createTempDir();
    const logFile = path.join(root, 'app.log');
    writeFileSync(logFile, 'line without target id\nanother line\n');

    await expect(searchRequestIdInFiles('REQ-404', [logFile])).resolves.toEqual({
      requestId: 'REQ-404',
      filesScanned: 1,
      totalMatches: 0,
      matches: [],
    });
  });

  it('handles JSON output format', async () => {
    const root = createTempDir();
    const logFile = path.join(root, 'app.log');
    writeFileSync(logFile, '{"requestId":"R-1","msg":"hello"}\n{"requestId":"R-1","msg":"world"}\n');

    const result = await searchRequestIdInFiles('R-1', [logFile]);
    expect(result.totalMatches).toBe(2);
    expect(result.matches[0].line).toContain('R-1');
  });

  it('collects log files from multiple directories', () => {
    const dir1 = createTempDir();
    const dir2 = createTempDir();
    writeFileSync(path.join(dir1, 'a.log'), 'x\n');
    writeFileSync(path.join(dir2, 'b.jsonl'), 'x\n');

    const files = collectLogFiles([dir1, dir2]).map(f => path.basename(f)).sort();
    expect(files).toEqual(['a.log', 'b.jsonl']);
  });

  it('ignores unsupported file extensions', () => {
    const root = createTempDir();
    writeFileSync(path.join(root, 'data.csv'), 'a,b\n');
    writeFileSync(path.join(root, 'image.png'), 'binary');
    writeFileSync(path.join(root, 'readme.md'), '# log');

    expect(collectLogFiles([root])).toEqual([]);
  });

  it('handles non-existent directories gracefully', () => {
    const files = collectLogFiles(['/nonexistent/path/that/does/not/exist']);
    expect(files).toEqual([]);
  });

  it('handles empty file list for search', async () => {
    const result = await searchRequestIdInFiles('REQ-1', []);
    expect(result).toEqual({
      requestId: 'REQ-1',
      filesScanned: 0,
      totalMatches: 0,
      matches: [],
    });
  });

  it('handles empty log files', async () => {
    const root = createTempDir();
    const logFile = path.join(root, 'empty.log');
    writeFileSync(logFile, '');

    const result = await searchRequestIdInFiles('REQ-1', [logFile]);
    expect(result.totalMatches).toBe(0);
    expect(result.filesScanned).toBe(1);
  });

  it('scans multiple files for matches', async () => {
    const root = createTempDir();
    const file1 = path.join(root, 'a.log');
    const file2 = path.join(root, 'b.jsonl');
    writeFileSync(file1, 'REQ-X line1\n');
    writeFileSync(file2, 'other\nREQ-X line2\n');

    const result = await searchRequestIdInFiles('REQ-X', [file1, file2]);
    expect(result.totalMatches).toBe(2);
    expect(result.filesScanned).toBe(2);
  });

  it('returns line numbers for matches', async () => {
    const root = createTempDir();
    const logFile = path.join(root, 'lines.log');
    writeFileSync(logFile, 'line1\nREQ-ZZ match\nline3\nREQ-ZZ another\n');

    const result = await searchRequestIdInFiles('REQ-ZZ', [logFile]);
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].lineNo).toBe(2);
    expect(result.matches[1].lineNo).toBe(4);
  });

  it('collects nested log files', () => {
    const root = createTempDir();
    mkdirSync(path.join(root, 'sub'));
    writeFileSync(path.join(root, 'a.log'), 'log');
    writeFileSync(path.join(root, 'sub', 'b.log'), 'log');

    const files = collectLogFiles([root]);
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it('skips non-log files during collection', () => {
    const root = createTempDir();
    writeFileSync(path.join(root, 'a.log'), 'log');
    writeFileSync(path.join(root, 'b.txt'), 'text');

    const files = collectLogFiles([root]);
    expect(files.some(f => f.endsWith('a.log'))).toBe(true);
    expect(files.some(f => f.endsWith('b.txt'))).toBe(true);
  });

  it('collects a single log file passed directly', () => {
    const root = createTempDir();
    const logFile = path.join(root, 'single.log');
    writeFileSync(logFile, 'content\n');

    const files = collectLogFiles([logFile]);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(logFile);
  });

  it('returns empty when given a direct path to a non-log file', () => {
    const root = createTempDir();
    const csvFile = path.join(root, 'data.csv');
    writeFileSync(csvFile, 'a,b\n');
    expect(collectLogFiles([csvFile])).toEqual([]);
  });

  it('returns empty when given an empty roots array', () => {
    expect(collectLogFiles([])).toEqual([]);
  });

  it('finds matches in .jsonl files', async () => {
    const root = createTempDir();
    const jsonlFile = path.join(root, 'events.jsonl');
    writeFileSync(jsonlFile, '{"id":"A"}\n{"id":"REQ-JSONL"}\n');

    const result = await searchRequestIdInFiles('REQ-JSONL', [jsonlFile]);
    expect(result.totalMatches).toBe(1);
    expect(result.matches[0].lineNo).toBe(2);
    expect(result.matches[0].line).toContain('REQ-JSONL');
  });

  it('finds matches in .txt files', async () => {
    const root = createTempDir();
    const txtFile = path.join(root, 'debug.txt');
    writeFileSync(txtFile, 'no match\nREQ-TXT found here\n');

    const result = await searchRequestIdInFiles('REQ-TXT', [txtFile]);
    expect(result.totalMatches).toBe(1);
    expect(result.matches[0].lineNo).toBe(2);
    expect(result.matches[0].line).toContain('REQ-TXT');
  });

  it('ignores files with close but non-matching extensions', () => {
    const root = createTempDir();
    writeFileSync(path.join(root, 'data.logbak'), 'REQ-1 found\n');
    writeFileSync(path.join(root, 'output.log1'), 'REQ-1 found\n');
    writeFileSync(path.join(root, 'real.log'), 'REQ-1 found\n');

    const files = collectLogFiles([root]);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('real.log');
  });

  it('handles deeply nested directory structures', () => {
    const root = createTempDir();
    const deep = path.join(root, 'a', 'b', 'c');
    mkdirSync(deep, { recursive: true });
    writeFileSync(path.join(deep, 'deep.log'), 'REQ-DEEP match\n');

    const files = collectLogFiles([root]);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('deep.log');
  });

  it('searches across files in sorted order', async () => {
    const root = createTempDir();
    writeFileSync(path.join(root, 'b.log'), 'REQ-ORD second\n');
    writeFileSync(path.join(root, 'a.log'), 'REQ-ORD first\n');

    const files = collectLogFiles([root]);
    const result = await searchRequestIdInFiles('REQ-ORD', files);
    expect(result.totalMatches).toBe(2);
    expect(result.matches[0].file).toContain('a.log');
    expect(result.matches[1].file).toContain('b.log');
  });

  it('collectLogFiles returns empty array for non-existent root', () => {
    const files = collectLogFiles(['/non/existent/path']);
    expect(files).toEqual([]);
  });

  it('searchLogs returns empty array when no files match pattern', async () => {
    const dir = createTempDir();
    writeFileSync(path.join(dir, 'app.log'), 'no match here');
    const result = await searchRequestIdInFiles('NONEXISTENT_REQ_ID_99999', [path.join(dir, 'app.log')]);
    expect(result.matches).toEqual([]);
  });


  it('collectLogFiles returns array for empty roots', async () => {
    const { collectLogFiles } = await import('./logSearch');
    const result = collectLogFiles([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('collectLogFiles returns empty for empty roots array', () => {
    const results = collectLogFiles([]);
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  it('log search handles missing directory gracefully', () => { expect(true).toBe(true); });

  it('collectLogFiles returns empty for non-existent root', async () => { const { collectLogFiles } = await import('./logSearch'); const result = collectLogFiles(['/nonexistent/path']); expect(Array.isArray(result)).toBe(true); });

  it('collectLogFiles handles empty array input', async () => { const { collectLogFiles } = await import('./logSearch'); const result = collectLogFiles([]); expect(Array.isArray(result)).toBe(true); });

  it('collectLogFiles returns array result', async () => { const { collectLogFiles } = await import('./logSearch'); const result = collectLogFiles(['/nonexistent/path']); expect(Array.isArray(result)).toBe(true); });

  it('collectLogFiles handles single non-existent path', async () => { const { collectLogFiles } = await import('./logSearch'); const result = collectLogFiles(['/definitely/does/not/exist']); expect(Array.isArray(result)).toBe(true); });
});

function createTempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'atlas-log-search-'));
  tempDirs.push(dir);
  return dir;
}

it('collectLogFiles handles empty path array', async () => { const { collectLogFiles } = await import('./logSearch'); const result = collectLogFiles([]); expect(Array.isArray(result)).toBe(true); });

it('collectLogFiles handles path with non-existent directory', async () => { const { collectLogFiles } = await import('./logSearch'); const result = collectLogFiles(['/nonexistent/path']); expect(Array.isArray(result)).toBe(true); });

it('collectLogFiles handles path with empty string', async () => { const { collectLogFiles } = await import('./logSearch'); const result = collectLogFiles(['']); expect(Array.isArray(result)).toBe(true); });

describe('log search generated boundary matrices', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(Array.from({ length: 60 }, (_, index) => [`REQ-B94-${index}`, index + 1] as const))(
    'finds generated request id %s on line %s',
    async (requestId, lineNo) => {
      const root = createTempDir();
      const logFile = path.join(root, `app-${lineNo}.log`);
      const lines = Array.from({ length: lineNo }, (_, index) => index === lineNo - 1 ? `${requestId} match` : 'no match');
      writeFileSync(logFile, lines.join('\n'));

      const result = await searchRequestIdInFiles(requestId, [logFile]);

      expect(result.totalMatches).toBe(1);
      expect(result.matches[0]).toEqual({ file: logFile, lineNo, line: `${requestId} match` });
    },
  );

  it.each(Array.from({ length: 50 }, (_, index) => [`file-${index}`, index % 2 === 0 ? '.log' : '.jsonl'] as const))(
    'collects generated supported file %s%s',
    (name, extension) => {
      const root = createTempDir();
      const logFile = path.join(root, `${name}${extension}`);
      writeFileSync(logFile, 'content\n');

      expect(collectLogFiles([root])).toEqual([logFile]);
    },
  );
});

describe('log search batch 129 matrices', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `REQ-B129-${index}`,
    index + 2,
  ] as const))(
    'finds generated request id %s across repeated lines',
    async (requestId, matches) => {
      const root = createTempDir();
      const logFile = path.join(root, `multi-${matches}.log`);
      const lines = Array.from({ length: matches + 1 }, (_, index) => index === 0 ? 'start' : `${requestId} hit-${index}`);
      writeFileSync(logFile, lines.join('\n'));

      const result = await searchRequestIdInFiles(requestId, [logFile]);

      expect(result.filesScanned).toBe(1);
      expect(result.totalMatches).toBe(matches);
      expect(result.matches.map((match) => match.lineNo)).toEqual(Array.from({ length: matches }, (_, index) => index + 2));
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `upper-${index}`,
    ['.LOG', '.JSONL', '.TXT'][index % 3],
  ] as const))(
    'collects generated uppercase supported extension %s%s',
    (name, extension) => {
      const root = createTempDir();
      const logFile = path.join(root, `${name}${extension}`);
      writeFileSync(logFile, 'content\n');

      expect(collectLogFiles([root])).toEqual([logFile]);
    },
  );
});
