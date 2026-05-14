import { describe, expect, it } from 'vitest';
import { buildQualityProgressGuard } from './qualityProgressGuard';

const completeProgressContent = `
# Atlas 品质提升项目进度看板

## 1. 总览

**当前日期**：2026-05-06

\`\`\`text
Week 8   [####################] 99%  体系巩固
\`\`\`

## 2. 当前里程碑

## 5. 最近验证证据

| 时间 | 命令 | 结果 | 说明 |
| --- | --- | --- | --- |
| 2026-05-06 | \`npm run quality:final-closure --workspace=server -- --artifact ...\` | PASS | 输出 \`WEEK8_FINAL_CLOSURE\` / \`READY_TO_ARCHIVE\` |

## 6. 下一步执行顺序

## 7. 变更日志

| 日期 | 完成事项 | 进度影响 |
| --- | --- | --- |
| 2026-05-06 | 新增 \`quality:final-closure\` Week 8 最终收口包和 \`docs/21-Week8最终收口包.md\` | Week 8 体系巩固推进到 99% |
`;

describe('quality progress guard builder', () => {
  it('returns stable gaps when the builder input is not an object', () => {
    const guard = buildQualityProgressGuard(undefined as never);

    expect(guard.status).toBe('BLOCKED');
    expect(guard.gaps).toEqual([
      'progress board input is invalid',
      'progress board content is invalid',
      'progress board overview section is missing',
      'progress board verification evidence section is missing',
      'progress board next execution section is missing',
      'progress board changelog section is missing',
      'progress board required date is invalid',
      'progress board date line is missing',
      'Week 8 progress line is missing',
      'Week 8 required progress threshold is invalid: non-number',
      'verification evidence markers are invalid',
      'changelog markers are invalid',
    ]);
  });

  it('returns a stable gap when the progress board content is not a string', () => {
    const guard = buildQualityProgressGuard({
      content: undefined as never,
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: [],
      requiredChangelogMarkers: [],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.gaps).toEqual([
      'progress board content is invalid',
      'progress board overview section is missing',
      'progress board verification evidence section is missing',
      'progress board next execution section is missing',
      'progress board changelog section is missing',
      'progress board date line is missing',
      'Week 8 progress line is missing',
    ]);
  });

  it('returns a stable gap when generatedAt is not a Date', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent,
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: [],
      requiredChangelogMarkers: [],
      generatedAt: '2026-05-06T10:00:00.000Z' as never,
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(guard.gaps).toEqual(['progress board generatedAt is invalid']);
  });

  it('returns a stable gap when generatedAt is a Date with an invalid value', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent,
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: [],
      requiredChangelogMarkers: [],
      generatedAt: new Date('not a date'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(guard.gaps).toEqual(['progress board generatedAt is invalid']);
  });

  it('passes when the progress board has date, evidence, changelog and progress updates', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent,
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard).toEqual({
      mode: 'QUALITY_PROGRESS_GUARD',
      status: 'READY',
      generatedAt: '2026-05-06T10:00:00.000Z',
      summary: {
        dateMatched: true,
        week8Progress: 99,
        requiredEvidence: 1,
        matchedEvidence: 1,
        requiredChangelog: 1,
        matchedChangelog: 1,
      },
      gaps: [],
    });
  });

  it('accepts markdown headings with up to three leading spaces', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent
        .replace('## 1. 总览', '   ## 1. 总览')
        .replace('## 2. 当前里程碑', '  ## 2. 当前里程碑')
        .replace('## 5. 最近验证证据', ' ## 5. 最近验证证据')
        .replace('## 6. 下一步执行顺序', '   ## 6. 下一步执行顺序')
        .replace('## 7. 变更日志', '  ## 7. 变更日志'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('accepts a UTF-8 BOM before the first required heading', () => {
    const guard = buildQualityProgressGuard({
      content: `\uFEFF${completeProgressContent.slice(completeProgressContent.indexOf('## 1. 总览'))}`,
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.dateMatched).toBe(true);
    expect(guard.summary.week8Progress).toBe(99);
    expect(guard.gaps).toEqual([]);
  });

  it('accepts UTF-8 BOM characters before later required headings', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent
        .replace('## 5. 最近验证证据', '\uFEFF## 5. 最近验证证据')
        .replace('## 6. 下一步执行顺序', '\uFEFF## 6. 下一步执行顺序')
        .replace('## 7. 变更日志', '\uFEFF## 7. 变更日志'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('accepts exact markdown headings with closing hashes', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent
        .replace('## 1. 总览', '## 1. 总览 ##')
        .replace('## 5. 最近验证证据', '## 5. 最近验证证据 ###')
        .replace('## 6. 下一步执行顺序', '## 6. 下一步执行顺序 ##')
        .replace('## 7. 变更日志', '## 7. 变更日志 ###'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('does not treat attached hashes as closing hashes for exact headings', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('## 7. 变更日志', '## 7. 变更日志###'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.gaps).toEqual([
      'progress board changelog section is missing',
      'changelog marker is missing: quality:final-closure',
    ]);
  });

  it('blocks when the overview section has no next heading boundary', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('## 2. 当前里程碑', ''),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(true);
    expect(guard.summary.week8Progress).toBe(99);
    expect(guard.gaps).toEqual(['progress board overview section boundary is missing']);
  });

  it('blocks when the overview section is missing', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('## 1. 总览', ''),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(false);
    expect(guard.summary.week8Progress).toBe(0);
    expect(guard.gaps).toEqual([
      'progress board overview section is missing',
      'progress board date line is missing',
      'Week 8 progress line is missing',
    ]);
  });

  it('blocks when evidence or changelog updates are missing', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('quality:final-closure', 'quality:other-task'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 100,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary).toEqual({
      dateMatched: true,
      week8Progress: 99,
      requiredEvidence: 1,
      matchedEvidence: 0,
      requiredChangelog: 1,
      matchedChangelog: 1,
    });
    expect(guard.gaps).toEqual([
      'Week 8 progress is below required threshold: 99 < 100',
      'verification evidence marker is missing: quality:final-closure',
    ]);
  });

  it('does not count EXPECTED_FAIL evidence rows as matched evidence', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('| PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |', '| EXPECTED_FAIL | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(0);
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual(['verification evidence marker is missing: quality:final-closure']);
  });

  it('accepts PASS evidence rows when the result cell has extra whitespace', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('| PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |', '|  PASS  | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('accepts PASS evidence rows when earlier cells contain escaped table pipes', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '`npm run quality:final-closure --workspace=server -- --artifact ...`',
        '`npm run quality:final-closure --workspace=server -- --artifact ...` A\\|B',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('accepts PASS evidence rows when the command cell contains a pipe inside inline code', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '`npm run quality:final-closure --workspace=server -- --artifact ...`',
        '`npm run quality:final-closure | tee output.log`',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('accepts PASS evidence rows when the command cell uses double backtick inline code with a pipe', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '`npm run quality:final-closure --workspace=server -- --artifact ...`',
        '``npm run quality:final-closure | tee output.log``',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('accepts lowercase pass evidence rows from manually edited tables', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('| PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |', '| pass | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('accepts PASS evidence rows without a trailing table pipe', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |', '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE`'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('accepts PASS evidence rows without a leading table pipe', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |', '2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('does not count prose lines shaped like PASS evidence rows', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        '备注：字段说明 | quality:final-closure | PASS | 这不是验证证据表格行',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(0);
    expect(guard.gaps).toEqual(['verification evidence marker is missing: quality:final-closure']);
  });

  it('does not count PASS evidence rows with impossible date values', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('| 2026-05-06 |', '| 2026-13-40 |'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(0);
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual(['verification evidence marker is missing: quality:final-closure']);
  });

  it('does not count PASS evidence rows from a different date', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('| 2026-05-06 |', '| 2026-05-05 |'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(0);
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual(['verification evidence marker is missing: quality:final-closure']);
  });

  it('does not count incomplete PASS evidence table rows', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(0);
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual(['verification evidence marker is missing: quality:final-closure']);
  });

  it('does not count PASS evidence rows with a blank command cell', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        '| 2026-05-06 |   | PASS | 输出 `quality:final-closure` |',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(0);
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual(['verification evidence marker is missing: quality:final-closure']);
  });

  it('does not count PASS evidence rows with a code-formatted placeholder explanation cell', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | `-` |',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(0);
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual(['verification evidence marker is missing: quality:final-closure']);
  });

  it.each([
    'N/A',
    'NA',
    'N.A.',
    'NONE',
    'NOT APPLICABLE',
    'NOT AVAILABLE',
    'TBD',
    'TODO',
    'PENDING',
  ] as const)('does not count PASS evidence rows with a %s explanation cell', (placeholder) => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        `| 2026-05-06 | \`npm run quality:final-closure --workspace=server -- --artifact ...\` | PASS | ${placeholder} |`,
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(0);
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual(['verification evidence marker is missing: quality:final-closure']);
  });

  it('does not count PASS evidence rows with a placeholder command cell', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        '| 2026-05-06 | - | PASS | 输出 `quality:final-closure` |',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(0);
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual(['verification evidence marker is missing: quality:final-closure']);
  });

  it('does not count PASS evidence rows with a code-formatted placeholder command cell', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        '| 2026-05-06 | `-` | PASS | 输出 `quality:final-closure` |',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(0);
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual(['verification evidence marker is missing: quality:final-closure']);
  });

  it('does not count PASS evidence rows when the command cell is not code-formatted', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        '| 2026-05-06 | npm run quality:final-closure --workspace=server -- --artifact ... | PASS | 输出 `quality:final-closure` |',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(0);
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual(['verification evidence marker is missing: quality:final-closure']);
  });

  it('finds headings and passes when the content does not end with a trailing newline', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.trimEnd(),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('does not count changelog rows from a different date', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | 新增 `quality:final-closure` Week 8 最终收口包和 `docs/21-Week8最终收口包.md` | Week 8 体系巩固推进到 99% |',
        '| 2026-05-05 | 新增 `quality:final-closure` Week 8 最终收口包和 `docs/21-Week8最终收口包.md` | Week 8 体系巩固推进到 99% |',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.summary.matchedChangelog).toBe(0);
    expect(guard.gaps).toEqual(['changelog marker is missing: quality:final-closure']);
  });

  it('does not count changelog rows with impossible date values', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | 新增 `quality:final-closure` Week 8 最终收口包和 `docs/21-Week8最终收口包.md` | Week 8 体系巩固推进到 99% |',
        '| 2026-13-40 | 新增 `quality:final-closure` Week 8 最终收口包和 `docs/21-Week8最终收口包.md` | Week 8 体系巩固推进到 99% |',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedChangelog).toBe(0);
    expect(guard.gaps).toEqual(['changelog marker is missing: quality:final-closure']);
  });

  it('does not count incomplete changelog table rows', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | 新增 `quality:final-closure` Week 8 最终收口包和 `docs/21-Week8最终收口包.md` | Week 8 体系巩固推进到 99% |',
        '| 2026-05-06 | 提到 `quality:final-closure` 但缺少进度影响列',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.summary.matchedChangelog).toBe(0);
    expect(guard.gaps).toEqual(['changelog marker is missing: quality:final-closure']);
  });

  it('does not count changelog rows with a blank completed item cell', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | 新增 `quality:final-closure` Week 8 最终收口包和 `docs/21-Week8最终收口包.md` | Week 8 体系巩固推进到 99% |',
        '| 2026-05-06 |   | Week 8 体系巩固推进到 99%，包含 `quality:final-closure` |',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.summary.matchedChangelog).toBe(0);
    expect(guard.gaps).toEqual(['changelog marker is missing: quality:final-closure']);
  });

  it('does not count changelog rows with placeholder completed item cells', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | 新增 `quality:final-closure` Week 8 最终收口包和 `docs/21-Week8最终收口包.md` | Week 8 体系巩固推进到 99% |',
        '| 2026-05-06 | - | Week 8 体系巩固推进到 99%，包含 `quality:final-closure` |',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.summary.matchedChangelog).toBe(0);
    expect(guard.gaps).toEqual(['changelog marker is missing: quality:final-closure']);
  });

  it('does not count changelog rows with NOT AVAILABLE completed item cells', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | 新增 `quality:final-closure` Week 8 最终收口包和 `docs/21-Week8最终收口包.md` | Week 8 体系巩固推进到 99% |',
        '| 2026-05-06 | NOT AVAILABLE | Week 8 体系巩固推进到 99%，包含 `quality:final-closure` |',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.summary.matchedChangelog).toBe(0);
    expect(guard.gaps).toEqual(['changelog marker is missing: quality:final-closure']);
  });

  it('does not count changelog rows with NOT AVAILABLE progress impact cells', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | 新增 `quality:final-closure` Week 8 最终收口包和 `docs/21-Week8最终收口包.md` | Week 8 体系巩固推进到 99% |',
        '| 2026-05-06 | 新增 `quality:final-closure`，包含 `quality:final-closure` | NOT AVAILABLE |',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.summary.matchedChangelog).toBe(0);
    expect(guard.gaps).toEqual(['changelog marker is missing: quality:final-closure']);
  });

  it('does not count prose lines shaped like changelog rows', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | 新增 `quality:final-closure` Week 8 最终收口包和 `docs/21-Week8最终收口包.md` | Week 8 体系巩固推进到 99% |',
        '备注：2026-05-06 | `quality:final-closure` | 这不是变更日志表格行',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.summary.matchedChangelog).toBe(0);
    expect(guard.gaps).toEqual(['changelog marker is missing: quality:final-closure']);
  });

  it('blocks when the changelog section is missing', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('## 7. 变更日志', '## 7. 历史变更'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.gaps).toEqual([
      'progress board changelog section is missing',
      'changelog marker is missing: quality:final-closure',
    ]);
  });

  it('does not treat heading prefixes as the required changelog section', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('## 7. 变更日志', '## 7. 变更日志附录'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.gaps).toEqual([
      'progress board changelog section is missing',
      'changelog marker is missing: quality:final-closure',
    ]);
  });

  it('does not treat headings with extra title text as the required changelog section', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('## 7. 变更日志', '## 7. 变更日志 草稿'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.gaps).toEqual([
      'progress board changelog section is missing',
      'changelog marker is missing: quality:final-closure',
    ]);
  });

  it('blocks when the changelog section is duplicated', () => {
    const guard = buildQualityProgressGuard({
      content: `${completeProgressContent}\n## 7. 变更日志\n\n| 2026-05-06 | duplicate quality:final-closure | should block |\n`,
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual(['progress board changelog section is duplicated']);
  });

  it('blocks when the verification evidence section is missing', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('## 5. 最近验证证据', '## 5. 历史验证证据'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.gaps).toEqual([
      'progress board verification evidence section is missing',
      'verification evidence marker is missing: quality:final-closure',
    ]);
  });

  it('blocks when the verification evidence section is duplicated', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '## 6. 下一步执行顺序',
        '## 5. 最近验证证据\n\n| 2026-05-06 | duplicate quality:final-closure | should block |\n\n## 6. 下一步执行顺序',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual(['progress board verification evidence section is duplicated']);
  });

  it('blocks when a later section duplicates the verification evidence heading', () => {
    const guard = buildQualityProgressGuard({
      content: `${completeProgressContent}\n## 5. 最近验证证据\n\n| 2026-05-06 | duplicate quality:final-closure | should block |\n`,
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual(['progress board verification evidence section is duplicated']);
  });

  it('blocks when the verification evidence section has no next heading boundary', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('## 6. 下一步执行顺序', ''),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([
      'progress board verification evidence section boundary is missing',
      'progress board next execution section is missing',
    ]);
  });

  it('does not treat inline heading text inside evidence rows as a section boundary', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure',
        '| 2026-05-06 | mentions `## 6. 下一步执行顺序` before `npm run quality:final-closure',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: [],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedChangelog).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('does not treat fenced code headings as section boundaries', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        [
          '```text',
          '## 6. 下一步执行顺序',
          '```',
          '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        ].join('\n'),
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('does not close backtick fences with tilde fence examples before section headings', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        [
          '```text',
          '~~~markdown',
          '## 6. 下一步执行顺序',
          '~~~',
          '```',
          '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        ].join('\n'),
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('does not close longer backtick fences with shorter backtick examples before section headings', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        [
          '````text',
          '```markdown',
          '## 6. 下一步执行顺序',
          '```',
          '````',
          '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        ].join('\n'),
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('does not treat indented code block fences as active fences before section headings', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        [
          '    ```text',
          '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        ].join('\n'),
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('does not close fences when the closing marker has trailing text before section headings', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        [
          '```text',
          '``` still part of the code sample',
          '## 6. 下一步执行顺序',
          '```',
          '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        ].join('\n'),
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('does not open backtick fences when the info string contains backticks before section headings', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        [
          '``` invalid `info` string',
          '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        ].join('\n'),
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('does not treat headings inside tilde-only fenced code blocks as section boundaries', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        [
          '~~~text',
          '## 6. 下一步执行顺序',
          '~~~',
          '| 2026-05-06 | `npm run quality:final-closure --workspace=server -- --artifact ...` | PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        ].join('\n'),
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.matchedEvidence).toBe(1);
    expect(guard.gaps).toEqual([]);
  });

  it('blocks when the evidence section start marker repeats with no end boundary', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent
        .replace('## 6. 下一步执行顺序', '## 5. 最近验证证据\n\n| extra | row |')
        .replace('## 7. 变更日志', ''),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.gaps).toContain('progress board verification evidence section is duplicated');
  });

  it('does not count PASS evidence rows when the command cell has whitespace-only inline code', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '`npm run quality:final-closure --workspace=server -- --artifact ...`',
        '` `',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(0);
    expect(guard.gaps).toContain('verification evidence marker is missing: quality:final-closure');
  });

  it('does not treat a heading without space after the section number as an end boundary', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('## 2. 当前里程碑', '## 2.SomeText'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.gaps).toContain('progress board overview section boundary is missing');
  });

  it('does not count PASS evidence rows with a double-backtick placeholder explanation cell', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '| PASS | 输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE` |',
        '| PASS | ``N/A`` |',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.matchedEvidence).toBe(0);
    expect(guard.gaps).toContain('verification evidence marker is missing: quality:final-closure');
  });

  it('blocks when the next execution section is missing', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('## 6. 下一步执行顺序', '## 6. 后续安排'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.gaps).toEqual(['progress board next execution section is missing']);
  });

  it('normalizes blank and duplicate required markers before counting matches', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent,
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: [' quality:final-closure ', 'quality:final-closure', '   '],
      requiredChangelogMarkers: [' quality:final-closure ', 'quality:final-closure', '   '],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary).toEqual({
      dateMatched: true,
      week8Progress: 99,
      requiredEvidence: 1,
      matchedEvidence: 1,
      requiredChangelog: 1,
      matchedChangelog: 1,
    });
    expect(guard.gaps).toEqual([]);
  });

  it('blocks non-array required marker lists from programmatic callers', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent,
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: undefined as never,
      requiredChangelogMarkers: 'quality:final-closure' as never,
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.requiredEvidence).toBe(0);
    expect(guard.summary.requiredChangelog).toBe(0);
    expect(guard.gaps).toEqual([
      'verification evidence markers are invalid',
      'changelog markers are invalid',
    ]);
  });

  it('blocks non-string required marker items from programmatic callers', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent,
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure', 123 as never],
      requiredChangelogMarkers: [false as never, 'quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary).toEqual({
      dateMatched: true,
      week8Progress: 99,
      requiredEvidence: 1,
      matchedEvidence: 1,
      requiredChangelog: 1,
      matchedChangelog: 1,
    });
    expect(guard.gaps).toEqual([
      'verification evidence marker is invalid',
      'changelog marker is invalid',
    ]);
  });

  it('blocks blank required dates instead of matching the date label prefix', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent,
      requiredDate: '   ',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(false);
    expect(guard.gaps).toEqual(['progress board required date is blank']);
  });

  it('blocks non-string required dates from programmatic callers', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent,
      requiredDate: undefined as never,
      minWeek8Progress: 99,
      requiredEvidenceMarkers: [],
      requiredChangelogMarkers: [],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(false);
    expect(guard.gaps).toEqual(['progress board required date is invalid']);
  });

  it('keeps progress board date gaps visible when the required date is blank', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '**当前日期**：2026-05-06',
        '**当前日期**：2026-05-06\n**当前日期**：2026-05-05',
      ),
      requiredDate: '   ',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(false);
    expect(guard.gaps).toEqual([
      'progress board required date is blank',
      'progress board date line is duplicated',
    ]);
  });

  it('does not mark dates as matched when the required date is blank and the board date is blank', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('**当前日期**：2026-05-06', '**当前日期**：'),
      requiredDate: '   ',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: [],
      requiredChangelogMarkers: [],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(false);
    expect(guard.gaps).toEqual([
      'progress board required date is blank',
      'progress board date value is missing',
    ]);
  });

  it('blocks when only historical evidence mentions the required date label', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '**当前日期**：2026-05-06',
        '**当前日期**：2026-05-05\n\n## 历史备注\n\n旧日志提到 **当前日期**：2026-05-06',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(false);
    expect(guard.gaps).toEqual(['progress board date is not updated: 2026-05-06']);
  });

  it('blocks when only a later section has the required date on its own line', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent
        .replace('**当前日期**：2026-05-06', '**当前日期**：2026-05-05')
        .replace('## 5. 最近验证证据', '## 历史备注\n\n**当前日期**：2026-05-06\n\n## 5. 最近验证证据'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(false);
    expect(guard.gaps).toEqual(['progress board date is not updated: 2026-05-06']);
  });

  it('blocks when the overview current date line is missing', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('**当前日期**：2026-05-06', ''),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(false);
    expect(guard.gaps).toEqual(['progress board date line is missing']);
  });

  it('blocks when the overview current date value is missing', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('**当前日期**：2026-05-06', '**当前日期**：'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(false);
    expect(guard.gaps).toEqual(['progress board date value is missing']);
  });

  it('blocks when the overview has duplicate current date lines', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '**当前日期**：2026-05-06',
        '**当前日期**：2026-05-06\n**当前日期**：2026-05-05',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(true);
    expect(guard.gaps).toEqual(['progress board date line is duplicated']);
  });

  it('blocks when the overview mixes valid and malformed current date lines', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '**当前日期**：2026-05-06',
        '**当前日期**：2026-05-06\n**当前日期**：DONE',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(true);
    expect(guard.gaps).toEqual([
      'progress board date line is duplicated',
      'progress board date format is invalid: DONE',
    ]);
  });

  it('blocks malformed current date values in the overview', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('**当前日期**：2026-05-06', '**当前日期**：DONE'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(false);
    expect(guard.gaps).toEqual(['progress board date format is invalid: DONE']);
  });

  it('blocks impossible current date values in the overview', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('**当前日期**：2026-05-06', '**当前日期**：2026-13-40'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(false);
    expect(guard.gaps).toEqual(['progress board date value is invalid: 2026-13-40']);
  });

  it('accepts overview current date lines with up to three leading spaces', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('**当前日期**：2026-05-06', '   **当前日期**：2026-05-06'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.dateMatched).toBe(true);
    expect(guard.gaps).toEqual([]);
  });

  it('accepts a UTF-8 BOM before the overview current date line', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('**当前日期**：2026-05-06', '\uFEFF**当前日期**：2026-05-06'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.dateMatched).toBe(true);
    expect(guard.gaps).toEqual([]);
  });

  it('accepts whitespace around the overview current date value', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('**当前日期**：2026-05-06', '**当前日期**： 2026-05-06   '),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.dateMatched).toBe(true);
    expect(guard.gaps).toEqual([]);
  });

  it('blocks invalid required date formats from programmatic callers', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent,
      requiredDate: '2026/05/06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(false);
    expect(guard.gaps).toEqual(['progress board required date format is invalid: 2026/05/06']);
  });

  it('keeps progress board date gaps visible when the required date is invalid', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        '**当前日期**：2026-05-06',
        '**当前日期**：2026-05-06\n**当前日期**：2026-05-05',
      ),
      requiredDate: '2026/05/06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(false);
    expect(guard.gaps).toEqual([
      'progress board required date format is invalid: 2026/05/06',
      'progress board date line is duplicated',
    ]);
  });

  it('blocks impossible required date values from programmatic callers', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent,
      requiredDate: '2026-13-40',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.dateMatched).toBe(false);
    expect(guard.gaps).toEqual(['progress board required date value is invalid: 2026-13-40']);
  });

  it('blocks invalid minimum progress thresholds from programmatic callers', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent,
      requiredDate: '2026-05-06',
      minWeek8Progress: -1,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.gaps).toEqual(['Week 8 required progress threshold is invalid: -1']);
  });

  it('keeps invalid minimum progress threshold gaps visible when the Week 8 line is missing', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('Week 8   [####################] 99%  体系巩固', ''),
      requiredDate: '2026-05-06',
      minWeek8Progress: 101,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.gaps).toEqual([
      'Week 8 progress line is missing',
      'Week 8 required progress threshold is invalid: 101',
    ]);
  });

  it('blocks fractional minimum progress thresholds from programmatic callers', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent,
      requiredDate: '2026-05-06',
      minWeek8Progress: 99.5,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.gaps).toEqual(['Week 8 required progress threshold is invalid: 99.5']);
  });

  it('blocks non-number minimum progress thresholds from programmatic callers with a stable gap', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent,
      requiredDate: '2026-05-06',
      minWeek8Progress: {} as never,
      requiredEvidenceMarkers: [],
      requiredChangelogMarkers: [],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.gaps).toEqual(['Week 8 required progress threshold is invalid: non-number']);
  });

  it('blocks invalid progress values parsed from the progress board', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('99%  体系巩固', '101%  体系巩固'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 100,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(101);
    expect(guard.gaps).toEqual(['Week 8 progress value is invalid: 101']);
  });

  it('blocks negative progress values parsed from the progress board', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('99%  体系巩固', '-1%  体系巩固'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 0,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(-1);
    expect(guard.gaps).toEqual(['Week 8 progress value is invalid: -1']);
  });

  it('blocks fractional progress values parsed from the progress board', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('99%  体系巩固', '99.5%  体系巩固'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(99.5);
    expect(guard.gaps).toEqual(['Week 8 progress value is invalid: 99.5']);
  });

  it('blocks decimal integer-looking progress values parsed from the progress board', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('99%  体系巩固', '99.0%  体系巩固'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(99);
    expect(guard.gaps).toEqual(['Week 8 progress value is invalid: 99.0']);
  });

  it('blocks progress values with leading zeroes parsed from the progress board', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('99%  体系巩固', '099%  体系巩固'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(99);
    expect(guard.gaps).toEqual(['Week 8 progress value is invalid: 099']);
  });

  it('accepts Week 8 progress lines with up to three leading spaces', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('Week 8   [####################] 99%  体系巩固', '   Week 8   [####################] 99%  体系巩固'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.week8Progress).toBe(99);
    expect(guard.gaps).toEqual([]);
  });

  it('accepts a UTF-8 BOM before the Week 8 progress line', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('Week 8   [####################] 99%  体系巩固', '\uFEFFWeek 8   [####################] 99%  体系巩固'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('READY');
    expect(guard.summary.week8Progress).toBe(99);
    expect(guard.gaps).toEqual([]);
  });

  it('blocks when the Week 8 progress line is missing', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('Week 8   [####################] 99%  体系巩固', ''),
      requiredDate: '2026-05-06',
      minWeek8Progress: 0,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(0);
    expect(guard.gaps).toEqual(['Week 8 progress line is missing']);
  });

  it('blocks when only historical evidence mentions the Week 8 progress line', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent
        .replace('Week 8   [####################] 99%  体系巩固', '')
        .replace(
          '输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE`',
          '输出 `WEEK8_FINAL_CLOSURE` / `READY_TO_ARCHIVE`；历史快照 `Week 8   [####################] 99%  体系巩固`',
        ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 0,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(0);
    expect(guard.gaps).toEqual(['Week 8 progress line is missing']);
  });

  it('blocks when only inline overview text mentions the Week 8 progress line', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent
        .replace('Week 8   [####################] 99%  体系巩固', '')
        .replace(
          '**当前日期**：2026-05-06',
          '**当前日期**：2026-05-06\n\n历史快照 `Week 8   [####################] 99%  体系巩固`',
        ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 0,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(0);
    expect(guard.gaps).toEqual(['Week 8 progress line is missing']);
  });

  it('blocks when the Week 8 progress line has no parseable percentage', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('99%  体系巩固', 'DONE  体系巩固'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 0,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(0);
    expect(guard.gaps).toEqual(['Week 8 progress value is missing']);
  });

  it('blocks malformed Week 8 progress lines instead of treating them as missing', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('Week 8   [####################] 99%  体系巩固', 'Week 8[####################] 99%  体系巩固'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 0,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(0);
    expect(guard.gaps).toEqual(['Week 8 progress value is missing']);
  });

  it('blocks when the Week 8 progress bar is missing', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('[####################]', '[]'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(99);
    expect(guard.gaps).toEqual(['Week 8 progress bar is missing']);
  });

  it('blocks when the Week 8 progress percentage has no trailing boundary', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('99%  体系巩固', '99%DONE  体系巩固'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(0);
    expect(guard.gaps).toEqual(['Week 8 progress value is missing']);
  });

  it('blocks when the Week 8 progress bar contains invalid characters', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('[####################]', '[DONE----------------]'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(99);
    expect(guard.gaps).toEqual(['Week 8 progress bar is invalid']);
  });

  it('blocks when the Week 8 progress bar has the wrong length', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace('[####################]', '[#]'),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(99);
    expect(guard.gaps).toEqual(['Week 8 progress bar length is invalid: 1']);
  });

  it('blocks when the overview has duplicate Week 8 progress lines', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        'Week 8   [####################] 99%  体系巩固',
        'Week 8   [####################] 99%  体系巩固\nWeek 8   [####################] 100%  体系巩固',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(99);
    expect(guard.gaps).toEqual(['Week 8 progress line is duplicated']);
  });

  it('keeps invalid first Week 8 progress gaps visible when progress lines are duplicated', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        'Week 8   [####################] 99%  体系巩固',
        'Week 8   [####################] 101%  体系巩固\nWeek 8   [####################] 100%  体系巩固',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(101);
    expect(guard.gaps).toEqual([
      'Week 8 progress line is duplicated',
      'Week 8 progress value is invalid: 101',
    ]);
  });

  it('keeps later malformed Week 8 progress gaps visible when progress lines are duplicated', () => {
    const guard = buildQualityProgressGuard({
      content: completeProgressContent.replace(
        'Week 8   [####################] 99%  体系巩固',
        'Week 8   [####################] 99%  体系巩固\nWeek 8   [####################] DONE  体系巩固',
      ),
      requiredDate: '2026-05-06',
      minWeek8Progress: 99,
      requiredEvidenceMarkers: ['quality:final-closure'],
      requiredChangelogMarkers: ['quality:final-closure'],
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(guard.status).toBe('BLOCKED');
    expect(guard.summary.week8Progress).toBe(99);
    expect(guard.gaps).toEqual([
      'Week 8 progress line is duplicated',
      'Week 8 progress value is missing',
    ]);
  });

  it('evaluates guard with valid markdown table', () => {
    const input = {
      content: '# Progress\n\n| Week | Progress |\n|------|----------|\n| Week 8 | 100% |\n',
      week8Progress: 100,
    };
    const guard = buildQualityProgressGuard(input as unknown as Parameters<typeof buildQualityProgressGuard>[0]);
    expect(guard).toBeDefined();
  });
});
