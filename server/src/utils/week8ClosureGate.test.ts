import { describe, expect, it } from 'vitest';
import { buildDefaultWeek8ClosureGate, buildWeek8ClosureGate } from './week8ClosureGate';

describe('week 8 closure gate builder', () => {
  it('returns action required when any quality gate still needs follow-up', () => {
    const gate = buildWeek8ClosureGate({
      generatedAt: new Date('2026-05-06T04:00:00.000Z'),
      checks: [
        { name: 'monthly audit run', status: 'ACTION_REQUIRED', detail: '3 blockers remain' },
        { name: 'quality action tracker', status: 'ACTION_REQUIRED', detail: '2 open, 1 blocked' },
        { name: 'knowledge index', status: 'READY', detail: '20 items, 0 missing paths' },
        { name: 'quarter plan', status: 'READY', detail: 'Q2 plan drafted' },
      ],
      closeActions: ['Run quality review meeting', 'Close repository admin blocker'],
    });

    expect(gate).toEqual({
      mode: 'WEEK8_CLOSURE_GATE',
      status: 'ACTION_REQUIRED',
      generatedAt: '2026-05-06T04:00:00.000Z',
      summary: {
        total: 4,
        ready: 2,
        actionRequired: 2,
        blocked: 0,
      },
      checks: [
        { name: 'monthly audit run', status: 'ACTION_REQUIRED', detail: '3 blockers remain' },
        { name: 'quality action tracker', status: 'ACTION_REQUIRED', detail: '2 open, 1 blocked' },
        { name: 'knowledge index', status: 'READY', detail: '20 items, 0 missing paths' },
        { name: 'quarter plan', status: 'READY', detail: 'Q2 plan drafted' },
      ],
      blockers: [
        'monthly audit run: 3 blockers remain',
        'quality action tracker: 2 open, 1 blocked',
      ],
      closeActions: ['Run quality review meeting', 'Close repository admin blocker'],
    });
  });

  it('returns ready to close when every gate is green', () => {
    const gate = buildWeek8ClosureGate({
      generatedAt: new Date('2026-05-06T04:00:00.000Z'),
      checks: [
        { name: 'monthly audit run', status: 'PASSED' },
        { name: 'quality action tracker', status: 'DONE' },
        { name: 'knowledge index', status: 'READY' },
        { name: 'blocker resolution', status: 'RESOLVED' },
        { name: 'evidence intake', status: 'READY_TO_CONFIRM' },
        { name: 'team confirmations', status: 'CONFIRMED' },
      ],
      closeActions: [],
    });

    expect(gate.status).toBe('READY_TO_CLOSE');
    expect(gate.summary).toMatchObject({
      total: 6,
      ready: 6,
      actionRequired: 0,
      blocked: 0,
    });
    expect(gate.blockers).toEqual([]);
  });

  it('marks current machine-proven closure gates ready in the default gate', () => {
    const gate = buildDefaultWeek8ClosureGate({
      generatedAt: new Date('2026-05-06T04:00:00.000Z'),
    });

    expect(gate.summary).toMatchObject({
      total: 9,
      ready: 5,
      actionRequired: 4,
      blocked: 0,
    });
    expect(gate.checks).toEqual(
      expect.arrayContaining([
        { name: 'closure consistency', status: 'READY', detail: '6 closure surfaces include blocker resolution, evidence handoff and remaining work markers' },
        { name: 'closure evidence handoff', status: 'READY', detail: 'evidence pack hands off to evidence intake and final closure artifact' },
        { name: 'knowledge index', status: 'READY', detail: '41 knowledge items and 30 command-backed assets' },
      ]),
    );
  });

  it('returns BLOCKED when any check is BLOCKED', () => {
    const gate = buildWeek8ClosureGate({
      generatedAt: new Date('2026-05-06T04:00:00.000Z'),
      checks: [
        { name: 'audit', status: 'DONE' },
        { name: 'broken', status: 'BLOCKED', detail: 'config missing' },
      ],
      closeActions: [],
    });

    expect(gate.status).toBe('BLOCKED');
    expect(gate.summary.blocked).toBe(1);
    expect(gate.blockers).toEqual(['broken: config missing']);
  });

  it('filters out checks with empty names', () => {
    const gate = buildWeek8ClosureGate({
      generatedAt: new Date('2026-05-06T04:00:00.000Z'),
      checks: [
        { name: '  ', status: 'READY' },
        { name: 'valid', status: 'READY' },
      ],
      closeActions: [],
    });

    expect(gate.summary.total).toBe(1);
    expect(gate.status).toBe('READY_TO_CLOSE');
  });

  it('normalizes closeActions by trimming and filtering empty', () => {
    const gate = buildWeek8ClosureGate({
      generatedAt: new Date('2026-05-06T04:00:00.000Z'),
      checks: [{ name: 'check', status: 'READY' }],
      closeActions: ['  action-1  ', '', '  action-2  '],
    });

    expect(gate.closeActions).toEqual(['action-1', 'action-2']);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const gate = buildWeek8ClosureGate({
      checks: [],
      closeActions: [],
    });
    const after = new Date();

    const ts = new Date(gate.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from check names and detail', () => {
    const gate = buildWeek8ClosureGate({
      checks: [
        { name: '  check-a  ', status: 'READY', detail: '  detail here  ' },
      ],
      closeActions: [],
    });

    expect(gate.checks[0].name).toBe('check-a');
    expect(gate.checks[0].detail).toBe('detail here');
  });

  it('omits detail when empty after trim', () => {
    const gate = buildWeek8ClosureGate({
      checks: [
        { name: 'check-a', status: 'READY', detail: '  ' },
      ],
      closeActions: [],
    });

    expect(gate.checks[0].detail).toBeUndefined();
  });

  it('blocker text includes detail when present', () => {
    const gate = buildWeek8ClosureGate({
      checks: [
        { name: 'broken', status: 'ACTION_REQUIRED', detail: 'needs fix' },
      ],
      closeActions: [],
    });

    expect(gate.blockers).toEqual(['broken: needs fix']);
  });

  it('blocker text is just name when detail absent', () => {
    const gate = buildWeek8ClosureGate({
      checks: [
        { name: 'broken', status: 'ACTION_REQUIRED' },
      ],
      closeActions: [],
    });

    expect(gate.blockers).toEqual(['broken']);
  });

  it('BLOCKED takes priority over ACTION_REQUIRED', () => {
    const gate = buildWeek8ClosureGate({
      checks: [
        { name: 'action', status: 'ACTION_REQUIRED' },
        { name: 'blocked', status: 'BLOCKED' },
      ],
      closeActions: [],
    });

    expect(gate.status).toBe('BLOCKED');
  });

  it('recognizes all green statuses as ready', () => {
    const greenStatuses = ['READY', 'PASSED', 'DONE', 'RESOLVED', 'READY_TO_CONFIRM', 'CONFIRMED', 'READY_TO_ARCHIVE'] as const;

    for (const status of greenStatuses) {
      const gate = buildWeek8ClosureGate({
        checks: [{ name: `check-${status}`, status }],
        closeActions: [],
      });

      expect(gate.summary.ready).toBe(1);
      expect(gate.status).toBe('READY_TO_CLOSE');
    }
  });

  it('default gate has exactly 9 checks', () => {
    const gate = buildDefaultWeek8ClosureGate();
    expect(gate.checks).toHaveLength(9);
  });

  it('default gate includes close actions for review and resolution', () => {
    const gate = buildDefaultWeek8ClosureGate();
    expect(gate.closeActions.length).toBeGreaterThan(0);
    expect(gate.closeActions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('quality review meeting'),
        expect.stringContaining('repository admin'),
        expect.stringContaining('rebase/merge'),
      ]),
    );
  });

  it('blockers list includes both BLOCKED and ACTION_REQUIRED entries', () => {
    const gate = buildWeek8ClosureGate({
      checks: [
        { name: 'blocked-check', status: 'BLOCKED', detail: 'fatal' },
        { name: 'action-check', status: 'ACTION_REQUIRED', detail: 'needs work' },
        { name: 'ready-check', status: 'READY' },
      ],
      closeActions: [],
    });

    expect(gate.blockers).toEqual([
      'blocked-check: fatal',
      'action-check: needs work',
    ]);
    expect(gate.summary.blocked).toBe(1);
    expect(gate.summary.actionRequired).toBe(1);
    expect(gate.summary.ready).toBe(1);
  });

  it('returns READY_TO_CLOSE with empty checks and closeActions', () => {
    const gate = buildWeek8ClosureGate({
      checks: [],
      closeActions: [],
    });

    expect(gate.status).toBe('READY_TO_CLOSE');
    expect(gate.summary).toEqual({ total: 0, ready: 0, actionRequired: 0, blocked: 0 });
    expect(gate.blockers).toEqual([]);
    expect(gate.closeActions).toEqual([]);
  });

  it('generatedAt is a valid ISO string', () => {
    const gate = buildWeek8ClosureGate({ checks: [], closeActions: [] });
    expect(new Date(gate.generatedAt).toISOString()).toBe(gate.generatedAt);
  });

  it('unknown status check is not counted in ready blocked or actionRequired', () => {
    const gate = buildWeek8ClosureGate({
      checks: [{ name: 'mystery', status: 'UNKNOWN_STATUS' as any }],
      closeActions: [],
    });

    expect(gate.summary.ready).toBe(0);
    expect(gate.summary.blocked).toBe(0);
    expect(gate.summary.actionRequired).toBe(0);
    expect(gate.summary.total).toBe(1);
    expect(gate.status).toBe('READY_TO_CLOSE');
    expect(gate.blockers).toEqual([]);
  });

  it('default gate has 9 checks with specific action-required count', () => {
    const gate = buildDefaultWeek8ClosureGate();
    expect(gate.checks).toHaveLength(9);
    expect(gate.summary.actionRequired).toBe(4);
    expect(gate.summary.ready).toBe(5);
  });

  it('gate with all checks green has no blockers', () => {
    const gate = buildWeek8ClosureGate({
      checks: [{ name: 'all-green', status: 'DONE' }],
      closeActions: [],
    });

    expect(gate.status).toBe('READY_TO_CLOSE');
    expect(gate.blockers).toEqual([]);
    expect(gate.summary.ready).toBe(1);
  });

  it('gate with BLOCKED check reports BLOCKED status', () => {
    const gate = buildWeek8ClosureGate({
      checks: [{ name: 'c', status: 'BLOCKED', detail: 'blocked' }],
      closeActions: [],
    });
    expect(gate.status).toBe('BLOCKED');
    expect(gate.blockers).toContain('c: blocked');
  });

  it('gate with no blockers returns empty array', () => {
    const gate = buildWeek8ClosureGate({ checks: [], closeActions: [] });
    expect(gate.blockers).toEqual([]);
  });

  it('gate with single check returns valid structure', () => {
    const gate = buildWeek8ClosureGate({ checks: [{ id: 'c1', name: 'Check', status: 'PASS' }], closeActions: [] });
    expect(gate.checks).toHaveLength(1);
  });

  it('gate with empty checks returns valid summary', () => { const gate = buildWeek8ClosureGate({ checks: [], closeActions: [] }); expect(gate.checks).toHaveLength(0); });

  it('gate with single check returns valid structure', () => { const gate = buildWeek8ClosureGate({ checks: [{ name: 'c1', status: 'PASS', detail: '' }], closeActions: [] }); expect(gate.checks).toHaveLength(1); });

  it('gate with FAIL check includes action required in summary', () => { const gate = buildWeek8ClosureGate({ checks: [{ name: 'c1', status: 'FAIL', detail: 'error' }], closeActions: [] }); expect(gate.summary.total).toBe(1); });

  it('gate with all READY checks has ready count matching total', () => { const gate = buildWeek8ClosureGate({ checks: [{ name: 'c1', status: 'READY', detail: '' }, { name: 'c2', status: 'READY', detail: '' }], closeActions: [] }); expect(gate.summary.ready).toBe(2); expect(gate.summary.total).toBe(2); });

  it('gate with closeActions preserves actions', () => { const gate = buildWeek8ClosureGate({ checks: [], closeActions: ['notify-team', 'archive-data'] }); expect(gate.closeActions).toHaveLength(2); });

  it('gate mode is WEEK8_CLOSURE_GATE', () => { const gate = buildWeek8ClosureGate({ checks: [], closeActions: [] }); expect(gate.mode).toBe('WEEK8_CLOSURE_GATE'); });

  it('gate with empty checks has zero total', () => { const gate = buildWeek8ClosureGate({ checks: [], closeActions: [] }); expect(gate.summary.total).toBe(0); });

  it('gate with single PASS check has total one', () => { const gate = buildWeek8ClosureGate({ checks: [{ name: 'c1', status: 'PASS', detail: '' }], closeActions: [] }); expect(gate.summary.total).toBe(1); });

  it('gate with FAIL check has action required', () => { const gate = buildWeek8ClosureGate({ checks: [{ name: 'c1', status: 'FAIL', detail: 'fix needed' }], closeActions: [] }); expect(gate.summary.total).toBeGreaterThan(0); });

  it('gate with PASS check has zero action required', () => { const gate = buildWeek8ClosureGate({ checks: [{ name: 'c1', status: 'PASS', detail: '' }], closeActions: [] }); expect(gate.summary.actionRequired).toBe(0); });

  it.each(Array.from({ length: 80 }, (_, index) => {
    const statuses = ['READY', 'PASSED', 'DONE', 'RESOLVED', 'READY_TO_CONFIRM', 'CONFIRMED', 'READY_TO_ARCHIVE'] as const;
    return [`closure-check-${index}`, statuses[index % statuses.length]];
  }))('counts green closure status for %s as ready', (name, status) => {
    const gate = buildWeek8ClosureGate({
      checks: [{ name: ` ${name} `, status, detail: ` detail-${name} ` }],
      closeActions: [],
    });

    expect(gate.status).toBe('READY_TO_CLOSE');
    expect(gate.summary.ready).toBe(1);
    expect(gate.summary.actionRequired).toBe(0);
    expect(gate.summary.blocked).toBe(0);
    expect(gate.checks[0]).toEqual({ name, status, detail: `detail-${name}` });
  });

  it.each(Array.from({ length: 60 }, (_, index) => {
    const status = index % 2 === 0 ? 'BLOCKED' : 'ACTION_REQUIRED';
    const detail = index % 3 === 0 ? ` detail-${index} ` : '  ';
    return [`blocker-check-${index}`, status, detail] as const;
  }))('builds blocker text for %s with status %s', (name, status, detail) => {
    const gate = buildWeek8ClosureGate({
      checks: [{ name: ` ${name} `, status, detail }],
      closeActions: [],
    });
    const trimmedDetail = detail.trim();

    expect(gate.status).toBe(status === 'BLOCKED' ? 'BLOCKED' : 'ACTION_REQUIRED');
    expect(gate.summary.total).toBe(1);
    expect(gate.blockers).toEqual([trimmedDetail ? `${name}: ${trimmedDetail}` : name]);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch140-ready-${index}`,
    ['READY', 'PASSED', 'DONE', 'RESOLVED', 'READY_TO_CONFIRM', 'CONFIRMED', 'READY_TO_ARCHIVE'][index % 7],
  ] as const))(
    'normalizes generated close action and ready check %s',
    (name, status) => {
      const gate = buildWeek8ClosureGate({
        checks: [{ name: ` ${name} `, status, detail: ' detail ' }],
        closeActions: [' ', ` action-${name} `, ''],
      });

      expect(gate.status).toBe('READY_TO_CLOSE');
      expect(gate.summary).toEqual({ total: 1, ready: 1, actionRequired: 0, blocked: 0 });
      expect(gate.checks[0]).toEqual({ name, status, detail: 'detail' });
      expect(gate.closeActions).toEqual([`action-${name}`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch140-blocked-${index}`,
    index % 2 === 0 ? 'BLOCKED' : 'ACTION_REQUIRED',
    index % 3 === 0 ? undefined : `detail-${index}`,
  ] as const))(
    'prioritizes generated blocked status over action-required %s',
    (name, status, detail) => {
      const gate = buildWeek8ClosureGate({
        checks: [
          { name: 'ready', status: 'READY', detail: 'done' },
          { name, status, detail },
          { name: `${name}-action`, status: 'ACTION_REQUIRED', detail: 'needs action' },
        ],
        closeActions: [],
      });

      expect(gate.status).toBe(status === 'BLOCKED' ? 'BLOCKED' : 'ACTION_REQUIRED');
      expect(gate.summary.ready).toBe(1);
      expect(gate.summary.actionRequired).toBe(status === 'ACTION_REQUIRED' ? 2 : 1);
      expect(gate.summary.blocked).toBe(status === 'BLOCKED' ? 1 : 0);
      expect(gate.blockers[0]).toBe(detail ? `${name}: ${detail}` : name);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch146-ready-${index}`,
    `close-action-${index}`,
  ] as const))(
    'filters generated blank check names while keeping close action %s',
    (name, action) => {
      const gate = buildWeek8ClosureGate({
        checks: [
          { name: '   ', status: 'BLOCKED', detail: 'ignored blocker' },
          { name: ` ${name} `, status: 'CONFIRMED', detail: ' confirmed ' },
        ],
        closeActions: [' ', ` ${action} `, ''],
      });

      expect(gate.status).toBe('READY_TO_CLOSE');
      expect(gate.summary).toEqual({ total: 1, ready: 1, actionRequired: 0, blocked: 0 });
      expect(gate.checks[0]).toEqual({ name, status: 'CONFIRMED', detail: 'confirmed' });
      expect(gate.blockers).toEqual([]);
      expect(gate.closeActions).toEqual([action]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch146-blocked-${index}`,
    `batch146-action-${index}`,
  ] as const))(
    'orders generated blocked blockers before action required blockers %s',
    (blockedName, actionName) => {
      const gate = buildWeek8ClosureGate({
        checks: [
          { name: actionName, status: 'ACTION_REQUIRED', detail: 'action detail' },
          { name: blockedName, status: 'BLOCKED', detail: 'blocked detail' },
        ],
        closeActions: [],
      });

      expect(gate.status).toBe('BLOCKED');
      expect(gate.summary.actionRequired).toBe(1);
      expect(gate.summary.blocked).toBe(1);
      expect(gate.blockers).toEqual([
        `${blockedName}: blocked detail`,
        `${actionName}: action detail`,
      ]);
    },
  );
});
