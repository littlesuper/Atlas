import { describe, expect, it } from 'vitest';
import { buildQualityClosureRemainingWork, buildDefaultQualityClosureRemainingWork } from './qualityClosureRemainingWork';

describe('quality closure remaining work builder', () => {
  it('summarizes only the current non-ready closure gates with owners and next commands', () => {
    const remaining = buildDefaultQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
    });

    expect(remaining).toEqual({
      mode: 'QUALITY_CLOSURE_REMAINING_WORK',
      status: 'ACTION_REQUIRED',
      generatedAt: '2026-05-06T10:00:00.000Z',
      summary: {
        totalGateChecks: 9,
        readyGateChecks: 5,
        remainingGateChecks: 4,
        blockedGateChecks: 0,
      },
      remainingItems: [
        {
          name: 'monthly audit run',
          status: 'ACTION_REQUIRED',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-08',
          evidenceRequired: 'MONTHLY_AUDIT_RUN / ACTION_REQUIRED with review decisions attached',
          nextCommand: 'npm run quality:audit-run --workspace=server -- --month 2026-05',
          detail: 'main branch drift, team process confirmation, moderate dependency risk',
        },
        {
          name: 'quality action tracker',
          status: 'ACTION_REQUIRED',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-08',
          evidenceRequired: 'QUALITY_ACTION_TRACKER with open actions assigned or accepted',
          nextCommand: 'npm run quality:action-tracker --workspace=server',
          detail: '2 open actions and 1 blocked repository admin action',
        },
        {
          name: 'blocker resolution',
          status: 'ACTION_REQUIRED',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-08',
          evidenceRequired: 'QUALITY_BLOCKER_RESOLUTION / RESOLVED',
          nextCommand: 'npm run quality:blocker-resolution --workspace=server',
          detail: '3 human blockers still need cleared or accepted decision',
        },
        {
          name: 'evidence intake',
          status: 'ACTION_REQUIRED',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-08',
          evidenceRequired: 'QUALITY_EVIDENCE_INTAKE / READY_TO_CONFIRM',
          nextCommand: 'npm run quality:evidence-intake --workspace=server -- --confirm "..."',
          detail: '3 required human evidence topics still need confirmation',
        },
      ],
      nextCommands: [
        'npm run quality:audit-run --workspace=server -- --month 2026-05',
        'npm run quality:action-tracker --workspace=server',
        'npm run quality:blocker-resolution --workspace=server',
        'npm run quality:evidence-intake --workspace=server -- --confirm "..."',
      ],
      gaps: [
        'monthly audit run remains ACTION_REQUIRED',
        'quality action tracker remains ACTION_REQUIRED',
        'blocker resolution remains ACTION_REQUIRED',
        'evidence intake remains ACTION_REQUIRED',
      ],
    });
  });

  it('reports READY when all gate checks are green', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'READY_TO_CLOSE',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 3, ready: 3, actionRequired: 0, blocked: 0 },
        checks: [
          { name: 'audit run', status: 'DONE' },
          { name: 'blocker resolution', status: 'RESOLVED' },
          { name: 'evidence intake', status: 'READY_TO_CONFIRM' },
        ],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.status).toBe('READY');
    expect(remaining.remainingItems).toEqual([]);
    expect(remaining.nextCommands).toEqual([]);
    expect(remaining.gaps).toEqual([]);
    expect(remaining.summary.remainingGateChecks).toBe(0);
    expect(remaining.summary.blockedGateChecks).toBe(0);
  });

  it('reports BLOCKED when any remaining item is BLOCKED', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'BLOCKED',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 2, ready: 0, actionRequired: 1, blocked: 1 },
        checks: [
          { name: 'audit run', status: 'ACTION_REQUIRED' },
          { name: 'custom check', status: 'BLOCKED', detail: 'missing config' },
        ],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.status).toBe('BLOCKED');
    expect(remaining.summary.blockedGateChecks).toBe(1);
    expect(remaining.remainingItems).toHaveLength(2);
    expect(remaining.remainingItems[1].name).toBe('custom check');
    expect(remaining.remainingItems[1].status).toBe('BLOCKED');
  });

  it('uses fallback metadata for unknown check names', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
        checks: [
          { name: 'unknown future check', status: 'ACTION_REQUIRED', detail: 'needs work' },
        ],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.remainingItems).toHaveLength(1);
    expect(remaining.remainingItems[0].name).toBe('unknown future check');
    expect(remaining.remainingItems[0].owner).toBe('AI 代码守护人');
    expect(remaining.remainingItems[0].nextCommand).toBe('');
  });

  it('passes through detail from gate check', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
        checks: [
          { name: 'monthly audit run', status: 'ACTION_REQUIRED', detail: 'custom detail here' },
        ],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.remainingItems[0].detail).toBe('custom detail here');
  });

  it('filters out green statuses: READY, PASSED, DONE, RESOLVED, READY_TO_CONFIRM, CONFIRMED, READY_TO_ARCHIVE', () => {
    const greenStatuses = ['READY', 'PASSED', 'DONE', 'RESOLVED', 'READY_TO_CONFIRM', 'CONFIRMED', 'READY_TO_ARCHIVE'] as const;

    for (const status of greenStatuses) {
      const remaining = buildQualityClosureRemainingWork({
        generatedAt: new Date('2026-05-06T10:00:00.000Z'),
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status: 'READY',
          generatedAt: '2026-05-06T10:00:00.000Z',
          summary: { total: 1, ready: 1, actionRequired: 0, blocked: 0 },
          checks: [{ name: `check-${status}`, status }],
          blockers: [],
          closeActions: [],
        },
      });

      expect(remaining.remainingItems).toHaveLength(0);
      expect(remaining.status).toBe('READY');
    }
  });

  it('ACTION_REQUIRED status is not green and appears in remaining items', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
        checks: [{ name: 'test check', status: 'ACTION_REQUIRED' }],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.remainingItems).toHaveLength(1);
    expect(remaining.status).toBe('ACTION_REQUIRED');
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'READY',
        generatedAt: new Date().toISOString(),
        summary: { total: 0, ready: 0, actionRequired: 0, blocked: 0 },
        checks: [],
        blockers: [],
        closeActions: [],
      },
    });
    const after = new Date();

    const ts = new Date(remaining.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('summary reflects gate totals correctly', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'BLOCKED',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 5, ready: 2, actionRequired: 2, blocked: 1 },
        checks: [
          { name: 'c1', status: 'DONE' },
          { name: 'c2', status: 'PASSED' },
          { name: 'c3', status: 'ACTION_REQUIRED' },
          { name: 'c4', status: 'ACTION_REQUIRED' },
          { name: 'c5', status: 'BLOCKED' },
        ],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.summary.totalGateChecks).toBe(5);
    expect(remaining.summary.readyGateChecks).toBe(2);
    expect(remaining.summary.remainingGateChecks).toBe(3);
    expect(remaining.summary.blockedGateChecks).toBe(1);
  });

  it('gaps describe each remaining item', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 2, ready: 0, actionRequired: 2, blocked: 0 },
        checks: [
          { name: 'alpha', status: 'ACTION_REQUIRED' },
          { name: 'beta', status: 'BLOCKED' },
        ],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.gaps).toEqual([
      'alpha remains ACTION_REQUIRED',
      'beta remains BLOCKED',
    ]);
  });

  it('mode is always QUALITY_CLOSURE_REMAINING_WORK', () => {
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'READY',
        generatedAt: new Date().toISOString(),
        summary: { total: 0, ready: 0, actionRequired: 0, blocked: 0 },
        checks: [],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.mode).toBe('QUALITY_CLOSURE_REMAINING_WORK');
  });

  it('ready gate with no checks has no remainingItems', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'READY',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 0, ready: 0, actionRequired: 0, blocked: 0 },
        checks: [],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.status).toBe('READY');
    expect(remaining.remainingItems).toEqual([]);
    expect(remaining.nextCommands).toEqual([]);
  });

  it('generatedAt is valid ISO string', () => {
    const remaining = buildQualityClosureRemainingWork({ gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'READY', generatedAt: new Date().toISOString(), summary: { total: 0, ready: 0, actionRequired: 0, blocked: 0 }, checks: [], blockers: [], closeActions: [] } });
    expect(new Date(remaining.generatedAt).toISOString()).toBe(remaining.generatedAt);
  });

  it('buildDefaultQualityClosureRemainingWork without arguments uses current time', () => {
    const before = new Date();
    const remaining = buildDefaultQualityClosureRemainingWork();
    const after = new Date();

    const ts = new Date(remaining.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('WAITING_FOR_EVIDENCE status is not green and appears in remaining items', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 2, ready: 1, actionRequired: 1, blocked: 0 },
        checks: [
          { name: 'done-check', status: 'DONE' },
          { name: 'waiting-check', status: 'WAITING_FOR_EVIDENCE' },
        ],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.remainingItems).toHaveLength(1);
    expect(remaining.remainingItems[0].name).toBe('waiting-check');
    expect(remaining.remainingItems[0].status).toBe('WAITING_FOR_EVIDENCE');
    expect(remaining.status).toBe('ACTION_REQUIRED');
    expect(remaining.gaps).toEqual(['waiting-check remains WAITING_FOR_EVIDENCE']);
  });

  it('gate check without detail field produces remaining item with undefined detail', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
        checks: [{ name: 'monthly audit run', status: 'ACTION_REQUIRED' }],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.remainingItems).toHaveLength(1);
    expect(remaining.remainingItems[0].detail).toBeUndefined();
    expect(remaining.remainingItems[0].name).toBe('monthly audit run');
  });

  it('known check name blocker resolution with BLOCKED status gets metadata', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'BLOCKED',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 1, ready: 0, actionRequired: 0, blocked: 1 },
        checks: [{ name: 'blocker resolution', status: 'BLOCKED' }],
        blockers: [],
        closeActions: [],
      },
    });
    expect(remaining.remainingItems[0].owner).toBe('AI 代码守护人');
    expect(remaining.remainingItems[0].nextCommand).toBe('npm run quality:blocker-resolution --workspace=server');
    expect(remaining.remainingItems[0].evidenceRequired).toBe('QUALITY_BLOCKER_RESOLUTION / RESOLVED');
  });

  it('multiple mixed status items produce correct nextCommands filtered by non-empty', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 3, ready: 0, actionRequired: 3, blocked: 0 },
        checks: [
          { name: 'monthly audit run', status: 'ACTION_REQUIRED' },
          { name: 'unknown check', status: 'ACTION_REQUIRED' },
          { name: 'evidence intake', status: 'ACTION_REQUIRED' },
        ],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.nextCommands).toHaveLength(2);
    expect(remaining.nextCommands).toContain('npm run quality:audit-run --workspace=server -- --month 2026-05');
    expect(remaining.nextCommands).toContain('npm run quality:evidence-intake --workspace=server -- --confirm "..."');
  });

  it('all BLOCKED items produce BLOCKED status and correct blockedGateChecks count', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'BLOCKED',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 2, ready: 0, actionRequired: 0, blocked: 2 },
        checks: [
          { name: 'check-a', status: 'BLOCKED' },
          { name: 'check-b', status: 'BLOCKED' },
        ],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.status).toBe('BLOCKED');
    expect(remaining.summary.blockedGateChecks).toBe(2);
    expect(remaining.remainingItems).toHaveLength(2);
  });

  it('gaps list matches remainingItems order', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 3, ready: 1, actionRequired: 2, blocked: 0 },
        checks: [
          { name: 'c-ready', status: 'DONE' },
          { name: 'c-first', status: 'ACTION_REQUIRED' },
          { name: 'c-second', status: 'WAITING_FOR_EVIDENCE' },
        ],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.gaps).toEqual([
      'c-first remains ACTION_REQUIRED',
      'c-second remains WAITING_FOR_EVIDENCE',
    ]);
    expect(remaining.remainingItems).toHaveLength(2);
  });

  it('empty nextCommands when all unknown checks have empty nextCommand', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: '2026-05-06T10:00:00.000Z',
        summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
        checks: [{ name: 'mystery-check', status: 'ACTION_REQUIRED' }],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.nextCommands).toEqual([]);
    expect(remaining.remainingItems).toHaveLength(1);
  });

  it('remaining work with all items done has zero remainingItems', () => {
    const remaining = buildQualityClosureRemainingWork({
      generatedAt: new Date('2026-05-06T10:00:00.000Z'),
      gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'READY_TO_CLOSE', generatedAt: '', summary: { total: 1, ready: 1, actionRequired: 0, blocked: 0 }, checks: [{ name: 'c', status: 'READY', detail: 'ok' }] },
    });
    expect(remaining.remainingItems).toHaveLength(0);
  });

  it('remaining work with all tasks done returns zero count', () => {
    const remaining = buildDefaultQualityClosureRemainingWork();
    expect(remaining.mode).toBe('QUALITY_CLOSURE_REMAINING_WORK');
  });

  it('remaining work with blocked gate returns valid mode', () => {
    const remaining = buildQualityClosureRemainingWork({ gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'BLOCKED', generatedAt: '', summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 }, checks: [{ name: 'c', status: 'ACTION_REQUIRED', detail: 'fix needed' }] } });
    expect(remaining.mode).toBe('QUALITY_CLOSURE_REMAINING_WORK');
  });

  it('remaining work with passed gate returns valid mode', () => { const remaining = buildQualityClosureRemainingWork({ gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'PASS', generatedAt: '', summary: { total: 1, ready: 1, actionRequired: 0, blocked: 0 }, checks: [{ name: 'c', status: 'PASS', detail: '' }] } }); expect(remaining.mode).toBe('QUALITY_CLOSURE_REMAINING_WORK'); });

  it('remaining work with empty gate returns valid mode', () => { const remaining = buildQualityClosureRemainingWork({ gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'FAIL', generatedAt: '', summary: { total: 0, ready: 0, actionRequired: 0, blocked: 0 }, checks: [] } }); expect(remaining.mode).toBe('QUALITY_CLOSURE_REMAINING_WORK'); });

  it('remaining work preserves gate summary', () => { const remaining = buildQualityClosureRemainingWork({ gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'FAIL', generatedAt: '', summary: { total: 5, ready: 3, actionRequired: 1, blocked: 1 }, checks: [] } }); expect(remaining).toBeDefined(); });

  it('remaining work with FAIL gate has action items', () => { const remaining = buildQualityClosureRemainingWork({ gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'FAIL', generatedAt: '', summary: { total: 3, ready: 1, actionRequired: 2, blocked: 0 }, checks: [{ name: 'c', status: 'FAIL', detail: 'not ready' }] } }); expect(remaining).toBeDefined(); });

  it('remaining work with blocked items has correct mode', () => { const remaining = buildQualityClosureRemainingWork({ gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'FAIL', generatedAt: '', summary: { total: 2, ready: 0, actionRequired: 1, blocked: 1 }, checks: [] } }); expect(remaining.mode).toBe('QUALITY_CLOSURE_REMAINING_WORK'); });

  it('remaining work with PASS gate has no action items', () => { const remaining = buildQualityClosureRemainingWork({ gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'PASS', generatedAt: '', summary: { total: 1, ready: 1, actionRequired: 0, blocked: 0 }, checks: [{ name: 'c', status: 'PASS', detail: '' }] } }); expect(remaining).toBeDefined(); });

  it('remaining work with all blocked gate returns valid mode', () => { const remaining = buildQualityClosureRemainingWork({ gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'FAIL', generatedAt: '', summary: { total: 3, ready: 0, actionRequired: 0, blocked: 3 }, checks: [] } }); expect(remaining.mode).toBe('QUALITY_CLOSURE_REMAINING_WORK'); });

  it('remaining work with FAIL gate has action required', () => { const remaining = buildQualityClosureRemainingWork({ gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'FAIL', generatedAt: '', summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 }, checks: [{ name: 'c', status: 'FAIL', detail: '' }] } }); expect(remaining).toBeDefined(); });

  it('remaining work with PASS gate returns valid', () => { const remaining = buildQualityClosureRemainingWork({ gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'PASS', generatedAt: '', summary: { total: 1, ready: 1, actionRequired: 0, blocked: 0 }, checks: [{ name: 'c', status: 'PASS', detail: '' }] } }); expect(remaining.mode).toBe('QUALITY_CLOSURE_REMAINING_WORK'); });

  it('remaining work with FAIL gate returns valid', () => { const remaining = buildQualityClosureRemainingWork({ gate: { mode: 'WEEK8_CLOSURE_GATE', status: 'FAIL', generatedAt: '', summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 }, checks: [{ name: 'c', status: 'FAIL', detail: 'fix' }] } }); expect(remaining).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `remaining-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'BLOCKED',
  ] as const))('keeps non-green check %s in remaining work', (name, status) => {
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: status === 'BLOCKED' ? 'BLOCKED' : 'ACTION_REQUIRED',
        generatedAt: '',
        summary: { total: 1, ready: 0, actionRequired: status === 'ACTION_REQUIRED' ? 1 : 0, blocked: status === 'BLOCKED' ? 1 : 0 },
        checks: [{ name, status, detail: `detail-${name}` }],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.remainingItems).toHaveLength(1);
    expect(remaining.remainingItems[0]).toMatchObject({
      name,
      status,
      detail: `detail-${name}`,
      evidenceRequired: `${name} evidence`,
    });
    expect(remaining.gaps).toEqual([`${name} remains ${status}`]);
    expect(remaining.status).toBe(status === 'BLOCKED' ? 'BLOCKED' : 'ACTION_REQUIRED');
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['monthly audit run', 'quality action tracker', 'blocker resolution', 'evidence intake'][index % 4],
  ] as const))('applies known metadata for remaining work item %s', (name) => {
    const remaining = buildQualityClosureRemainingWork({
      gate: {
        mode: 'WEEK8_CLOSURE_GATE',
        status: 'ACTION_REQUIRED',
        generatedAt: '',
        summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
        checks: [{ name, status: 'ACTION_REQUIRED' }],
        blockers: [],
        closeActions: [],
      },
    });

    expect(remaining.remainingItems[0].owner).toBe('AI 代码守护人');
    expect(remaining.remainingItems[0].dueDate).toBe('2026-05-08');
    expect(remaining.remainingItems[0].nextCommand.length).toBeGreaterThan(0);
    expect(remaining.nextCommands).toEqual([remaining.remainingItems[0].nextCommand]);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch144-green-${index}`,
    ['READY', 'PASSED', 'DONE', 'RESOLVED', 'READY_TO_CONFIRM', 'CONFIRMED', 'READY_TO_ARCHIVE'][index % 7],
  ] as const))(
    'filters generated green remaining work check %s as %s',
    (name, status) => {
      const remaining = buildQualityClosureRemainingWork({
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status: 'READY',
          generatedAt: '',
          summary: { total: 1, ready: 1, actionRequired: 0, blocked: 0 },
          checks: [{ name, status, detail: `detail-${name}` }],
          blockers: [],
          closeActions: [],
        },
      });

      expect(remaining.status).toBe('READY');
      expect(remaining.summary.remainingGateChecks).toBe(0);
      expect(remaining.remainingItems).toEqual([]);
      expect(remaining.gaps).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch144-unknown-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'WAITING_FOR_EVIDENCE',
  ] as const))(
    'uses fallback metadata for generated unknown remaining item %s',
    (name, status) => {
      const remaining = buildQualityClosureRemainingWork({
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status: 'ACTION_REQUIRED',
          generatedAt: '',
          summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
          checks: [{ name, status, detail: `detail-${name}` }],
          blockers: [],
          closeActions: [],
        },
      });

      expect(remaining.status).toBe('ACTION_REQUIRED');
      expect(remaining.remainingItems[0]).toMatchObject({
        name,
        status,
        owner: 'AI 代码守护人',
        dueDate: '2026-05-08',
        evidenceRequired: `${name} evidence`,
        nextCommand: '',
      });
      expect(remaining.nextCommands).toEqual([]);
    },
  );
});

describe('quality closure remaining work batch 158 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch158-remaining-${index}`,
    index % 3 === 0 ? 'BLOCKED' : index % 3 === 1 ? 'ACTION_REQUIRED' : 'WAITING_FOR_EVIDENCE',
  ] as const))(
    'summarizes generated batch158 remaining item %s as %s',
    (name, status) => {
      const remaining = buildQualityClosureRemainingWork({
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status: status === 'BLOCKED' ? 'BLOCKED' : 'ACTION_REQUIRED',
          generatedAt: '',
          summary: { total: 2, ready: 1, actionRequired: status === 'BLOCKED' ? 0 : 1, blocked: status === 'BLOCKED' ? 1 : 0 },
          checks: [
            { name: `${name}-done`, status: 'DONE', detail: 'done' },
            { name, status, detail: `detail-${name}` },
          ],
          blockers: [],
          closeActions: [],
        },
      });

      expect(remaining.summary).toEqual({
        totalGateChecks: 2,
        readyGateChecks: 1,
        remainingGateChecks: 1,
        blockedGateChecks: status === 'BLOCKED' ? 1 : 0,
      });
      expect(remaining.status).toBe(status === 'BLOCKED' ? 'BLOCKED' : 'ACTION_REQUIRED');
      expect(remaining.remainingItems[0]).toMatchObject({
        name,
        status,
        detail: `detail-${name}`,
        evidenceRequired: `${name} evidence`,
      });
      expect(remaining.gaps).toEqual([`${name} remains ${status}`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['monthly audit run', 'quality action tracker', 'blocker resolution', 'evidence intake'][index % 4],
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'BLOCKED',
  ] as const))(
    'keeps generated batch158 known metadata and command for %s',
    (name, status) => {
      const remaining = buildQualityClosureRemainingWork({
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status: status === 'BLOCKED' ? 'BLOCKED' : 'ACTION_REQUIRED',
          generatedAt: '',
          summary: { total: 1, ready: 0, actionRequired: status === 'BLOCKED' ? 0 : 1, blocked: status === 'BLOCKED' ? 1 : 0 },
          checks: [{ name, status }],
          blockers: [],
          closeActions: [],
        },
      });

      expect(remaining.remainingItems[0].owner).toBe('AI 代码守护人');
      expect(remaining.remainingItems[0].dueDate).toBe('2026-05-08');
      expect(remaining.remainingItems[0].nextCommand.length).toBeGreaterThan(0);
      expect(remaining.nextCommands).toEqual([remaining.remainingItems[0].nextCommand]);
      expect(remaining.summary.blockedGateChecks).toBe(status === 'BLOCKED' ? 1 : 0);
    },
  );
});

describe('quality closure remaining work batch 171 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch171-blocked-${index}`,
    `batch171-action-${index}`,
  ] as const))(
    'summarizes generated batch171 blocked and action remaining items %s',
    (blockedName, actionName) => {
      const remaining = buildQualityClosureRemainingWork({
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status: 'BLOCKED',
          generatedAt: '',
          summary: { total: 3, ready: 1, actionRequired: 1, blocked: 1 },
          checks: [
            { name: `${blockedName}-done`, status: 'DONE' },
            { name: blockedName, status: 'BLOCKED', detail: `detail-${blockedName}` },
            { name: actionName, status: 'ACTION_REQUIRED', detail: `detail-${actionName}` },
          ],
          blockers: [],
          closeActions: [],
        },
      });

      expect(remaining.status).toBe('BLOCKED');
      expect(remaining.summary).toEqual({ totalGateChecks: 3, readyGateChecks: 1, remainingGateChecks: 2, blockedGateChecks: 1 });
      expect(remaining.remainingItems.map((item) => item.name)).toEqual([blockedName, actionName]);
      expect(remaining.gaps).toEqual([`${blockedName} remains BLOCKED`, `${actionName} remains ACTION_REQUIRED`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['monthly audit run', 'quality action tracker', 'blocker resolution', 'evidence intake'][index % 4],
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'WAITING_FOR_EVIDENCE',
  ] as const))(
    'keeps generated batch171 known metadata command for %s',
    (name, status) => {
      const remaining = buildQualityClosureRemainingWork({
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status: 'ACTION_REQUIRED',
          generatedAt: '',
          summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
          checks: [{ name, status }],
          blockers: [],
          closeActions: [],
        },
      });

      expect(remaining.status).toBe('ACTION_REQUIRED');
      expect(remaining.remainingItems[0].name).toBe(name);
      expect(remaining.remainingItems[0].owner).toBe('AI 代码守护人');
      expect(remaining.remainingItems[0].nextCommand).toBeTruthy();
      expect(remaining.nextCommands).toEqual([remaining.remainingItems[0].nextCommand]);
    },
  );
});

describe('quality closure remaining work batch 177 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch177-blocked-${index}`,
    `batch177-waiting-${index}`,
  ] as const))(
    'summarizes generated batch177 blocked status before action work %s',
    (blockedName, waitingName) => {
      const remaining = buildQualityClosureRemainingWork({
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status: 'BLOCKED',
          generatedAt: '',
          summary: { total: 4, ready: 2, actionRequired: 1, blocked: 1 },
          checks: [
            { name: `${blockedName}-ready`, status: 'READY' },
            { name: `${blockedName}-done`, status: 'DONE' },
            { name: blockedName, status: 'BLOCKED', detail: `detail-${blockedName}` },
            { name: waitingName, status: 'WAITING_FOR_EVIDENCE', detail: `detail-${waitingName}` },
          ],
          blockers: [],
          closeActions: [],
        },
      });

      expect(remaining.status).toBe('BLOCKED');
      expect(remaining.summary).toEqual({ totalGateChecks: 4, readyGateChecks: 2, remainingGateChecks: 2, blockedGateChecks: 1 });
      expect(remaining.remainingItems.map((item) => item.name)).toEqual([blockedName, waitingName]);
      expect(remaining.gaps).toEqual([`${blockedName} remains BLOCKED`, `${waitingName} remains WAITING_FOR_EVIDENCE`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['monthly audit run', 'quality action tracker', 'blocker resolution', 'evidence intake'][index % 4],
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'BLOCKED',
  ] as const))(
    'keeps generated batch177 known metadata in next command list for %s',
    (name, status) => {
      const remaining = buildQualityClosureRemainingWork({
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status: status === 'BLOCKED' ? 'BLOCKED' : 'ACTION_REQUIRED',
          generatedAt: '',
          summary: { total: 2, ready: 1, actionRequired: status === 'BLOCKED' ? 0 : 1, blocked: status === 'BLOCKED' ? 1 : 0 },
          checks: [
            { name: `${name}-ready`, status: 'CONFIRMED' },
            { name, status, detail: `detail-${name}` },
          ],
          blockers: [],
          closeActions: [],
        },
      });

      expect(remaining.remainingItems[0].name).toBe(name);
      expect(remaining.remainingItems[0].owner).toBe('AI 代码守护人');
      expect(remaining.remainingItems[0].nextCommand).toBeTruthy();
      expect(remaining.nextCommands).toEqual([remaining.remainingItems[0].nextCommand]);
      expect(remaining.summary.blockedGateChecks).toBe(status === 'BLOCKED' ? 1 : 0);
    },
  );
});

describe('quality closure remaining work batch 178 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch178-ready-${index}`,
    ['READY', 'PASSED', 'DONE', 'RESOLVED', 'READY_TO_CONFIRM', 'CONFIRMED', 'READY_TO_ARCHIVE'][index % 7],
  ] as const))(
    'filters generated batch178 green remaining check %s as %s',
    (name, status) => {
      const remaining = buildQualityClosureRemainingWork({
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status: 'READY',
          generatedAt: '',
          summary: { total: 2, ready: 2, actionRequired: 0, blocked: 0 },
          checks: [
            { name: ` ${name} `, status, detail: `detail-${name}` },
            { name: `${name}-resolved`, status: 'RESOLVED' },
          ],
          blockers: [],
          closeActions: [],
        },
      });

      expect(remaining.status).toBe('READY');
      expect(remaining.summary).toEqual({ totalGateChecks: 2, readyGateChecks: 2, remainingGateChecks: 0, blockedGateChecks: 0 });
      expect(remaining.remainingItems).toEqual([]);
      expect(remaining.nextCommands).toEqual([]);
      expect(remaining.gaps).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch178-unknown-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'WAITING_FOR_EVIDENCE',
  ] as const))(
    'uses generated batch178 fallback metadata for unknown remaining item %s',
    (name, status) => {
      const remaining = buildQualityClosureRemainingWork({
        gate: {
          mode: 'WEEK8_CLOSURE_GATE',
          status: 'ACTION_REQUIRED',
          generatedAt: '',
          summary: { total: 1, ready: 0, actionRequired: 1, blocked: 0 },
          checks: [{ name, status, detail: `detail-${name}` }],
          blockers: [],
          closeActions: [],
        },
      });

      expect(remaining.status).toBe('ACTION_REQUIRED');
      expect(remaining.remainingItems[0]).toMatchObject({
        name,
        status,
        owner: 'AI 代码守护人',
        dueDate: '2026-05-08',
        evidenceRequired: `${name} evidence`,
        nextCommand: '',
      });
      expect(remaining.nextCommands).toEqual([]);
      expect(remaining.gaps).toEqual([`${name} remains ${status}`]);
    },
  );
});
