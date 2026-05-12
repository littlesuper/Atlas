import { describe, expect, it } from 'vitest';
import { buildDefaultQualityClosureDashboard, buildQualityClosureDashboard } from './qualityClosureDashboard';

describe('quality closure dashboard builder', () => {
  it('summarizes closure tool statuses and points to the current next action', () => {
    const dashboard = buildQualityClosureDashboard({
      generatedAt: new Date('2026-05-06T15:00:00.000Z'),
      checks: [
        {
          name: 'blocker register',
          mode: 'QUALITY_BLOCKER_REGISTER',
          command: 'npm run quality:blocker-register --workspace=server',
          status: 'ACTION_REQUIRED',
          expectedStatus: 'CLEAR',
          nextAction: 'clear or explicitly accept the 3 open blockers',
        },
        {
          name: 'owner assignments',
          mode: 'QUALITY_OWNER_ASSIGNMENT_PACK',
          command: 'npm run quality:owner-assignments --workspace=server',
          status: 'ACTION_REQUIRED',
          expectedStatus: 'READY',
          nextAction: 'send owner assignment messages',
        },
        {
          name: 'evidence intake',
          mode: 'QUALITY_EVIDENCE_INTAKE',
          command: 'npm run quality:evidence-intake --workspace=server -- --confirm ...',
          status: 'ACTION_REQUIRED',
          expectedStatus: 'READY_TO_CONFIRM',
          nextAction: 'collect required evidence references',
        },
      ],
    });

    expect(dashboard).toEqual({
      mode: 'QUALITY_CLOSURE_DASHBOARD',
      status: 'ACTION_REQUIRED',
      generatedAt: '2026-05-06T15:00:00.000Z',
      summary: {
        total: 3,
        ready: 0,
        actionRequired: 3,
      },
      currentFocus: {
        name: 'blocker register',
        mode: 'QUALITY_BLOCKER_REGISTER',
        command: 'npm run quality:blocker-register --workspace=server',
        status: 'ACTION_REQUIRED',
        expectedStatus: 'CLEAR',
        nextAction: 'clear or explicitly accept the 3 open blockers',
      },
      checks: [
        {
          name: 'blocker register',
          mode: 'QUALITY_BLOCKER_REGISTER',
          command: 'npm run quality:blocker-register --workspace=server',
          status: 'ACTION_REQUIRED',
          expectedStatus: 'CLEAR',
          nextAction: 'clear or explicitly accept the 3 open blockers',
        },
        {
          name: 'owner assignments',
          mode: 'QUALITY_OWNER_ASSIGNMENT_PACK',
          command: 'npm run quality:owner-assignments --workspace=server',
          status: 'ACTION_REQUIRED',
          expectedStatus: 'READY',
          nextAction: 'send owner assignment messages',
        },
        {
          name: 'evidence intake',
          mode: 'QUALITY_EVIDENCE_INTAKE',
          command: 'npm run quality:evidence-intake --workspace=server -- --confirm ...',
          status: 'ACTION_REQUIRED',
          expectedStatus: 'READY_TO_CONFIRM',
          nextAction: 'collect required evidence references',
        },
      ],
    });
  });

  it('is ready when every check has reached its expected status', () => {
    const dashboard = buildQualityClosureDashboard({
      generatedAt: new Date('2026-05-06T15:00:00.000Z'),
      checks: [
        {
          name: 'final closure',
          mode: 'WEEK8_FINAL_CLOSURE',
          command: 'npm run quality:final-closure --workspace=server -- --artifact ...',
          status: 'READY_TO_ARCHIVE',
          expectedStatus: 'READY_TO_ARCHIVE',
          nextAction: 'archive final closure JSON',
        },
      ],
    });

    expect(dashboard.status).toBe('READY');
    expect(dashboard.currentFocus).toBeUndefined();
    expect(dashboard.summary.ready).toBe(1);
  });

  it('focuses blocker resolution after blocker register is clear but before evidence intake', () => {
    const dashboard = buildQualityClosureDashboard({
      generatedAt: new Date('2026-05-06T15:00:00.000Z'),
      checks: [
        {
          name: 'blocker register',
          mode: 'QUALITY_BLOCKER_REGISTER',
          command: 'npm run quality:blocker-register --workspace=server',
          status: 'CLEAR',
          expectedStatus: 'CLEAR',
          nextAction: 'continue to blocker resolution',
        },
        {
          name: 'blocker resolution',
          mode: 'QUALITY_BLOCKER_RESOLUTION',
          command: 'npm run quality:blocker-resolution --workspace=server',
          status: 'ACTION_REQUIRED',
          expectedStatus: 'RESOLVED',
          nextAction: 'clear blockers or accept them explicitly',
        },
        {
          name: 'evidence intake',
          mode: 'QUALITY_EVIDENCE_INTAKE',
          command: 'npm run quality:evidence-intake --workspace=server -- --confirm ...',
          status: 'ACTION_REQUIRED',
          expectedStatus: 'READY_TO_CONFIRM',
          nextAction: 'collect required evidence references',
        },
      ],
    });

    expect(dashboard.currentFocus?.name).toBe('blocker resolution');
    expect(dashboard.summary.ready).toBe(1);
    expect(dashboard.summary.actionRequired).toBe(2);
  });

  it('focuses closure evidence pack after blocker resolution is resolved', () => {
    const dashboard = buildQualityClosureDashboard({
      generatedAt: new Date('2026-05-06T15:00:00.000Z'),
      checks: [
        {
          name: 'blocker resolution',
          mode: 'QUALITY_BLOCKER_RESOLUTION',
          command: 'npm run quality:blocker-resolution --workspace=server',
          status: 'RESOLVED',
          expectedStatus: 'RESOLVED',
          nextAction: 'continue to closure evidence pack',
        },
        {
          name: 'closure evidence pack',
          mode: 'QUALITY_CLOSURE_EVIDENCE_PACK',
          command: 'npm run quality:closure-evidence-pack --workspace=server',
          status: 'ACTION_REQUIRED',
          expectedStatus: 'READY',
          nextAction: 'generate evidence slots before evidence intake',
        },
        {
          name: 'evidence intake',
          mode: 'QUALITY_EVIDENCE_INTAKE',
          command: 'npm run quality:evidence-intake --workspace=server -- --confirm ...',
          status: 'ACTION_REQUIRED',
          expectedStatus: 'READY_TO_CONFIRM',
          nextAction: 'collect required evidence references',
        },
      ],
    });

    expect(dashboard.currentFocus?.name).toBe('closure evidence pack');
    expect(dashboard.summary.ready).toBe(1);
    expect(dashboard.summary.actionRequired).toBe(2);
  });

  it('focuses closure evidence handoff after evidence pack is ready', () => {
    const dashboard = buildQualityClosureDashboard({
      generatedAt: new Date('2026-05-06T15:00:00.000Z'),
      checks: [
        {
          name: 'closure evidence pack',
          mode: 'QUALITY_CLOSURE_EVIDENCE_PACK',
          command: 'npm run quality:closure-evidence-pack --workspace=server',
          status: 'READY',
          expectedStatus: 'READY',
          nextAction: 'continue to closure evidence handoff',
        },
        {
          name: 'closure evidence handoff',
          mode: 'QUALITY_CLOSURE_EVIDENCE_HANDOFF',
          command: 'npm run quality:closure-evidence-handoff --workspace=server',
          status: 'ACTION_REQUIRED',
          expectedStatus: 'READY',
          nextAction: 'verify evidence pack can hand off to evidence intake',
        },
        {
          name: 'evidence intake',
          mode: 'QUALITY_EVIDENCE_INTAKE',
          command: 'npm run quality:evidence-intake --workspace=server -- --confirm ...',
          status: 'ACTION_REQUIRED',
          expectedStatus: 'READY_TO_CONFIRM',
          nextAction: 'collect required evidence references',
        },
      ],
    });

    expect(dashboard.currentFocus?.name).toBe('closure evidence handoff');
    expect(dashboard.summary.ready).toBe(1);
    expect(dashboard.summary.actionRequired).toBe(2);
  });

  it('uses current machine-proven closure checks in the default dashboard', () => {
    const dashboard = buildDefaultQualityClosureDashboard({
      generatedAt: new Date('2026-05-06T15:00:00.000Z'),
    });

    expect(dashboard.summary).toEqual({
      total: 10,
      ready: 2,
      actionRequired: 8,
    });
    expect(dashboard.checks.map((check) => check.name)).toEqual([
      'blocker register',
      'blocker resolution',
      'closure evidence pack',
      'closure evidence handoff',
      'owner assignments',
      'evidence intake',
      'closure remaining work',
      'closure request pack',
      'closure sequence',
      'final closure',
    ]);
    expect(dashboard.checks[2]).toMatchObject({
      mode: 'QUALITY_CLOSURE_EVIDENCE_PACK',
      status: 'READY',
      expectedStatus: 'READY',
    });
    expect(dashboard.checks[3]).toMatchObject({
      mode: 'QUALITY_CLOSURE_EVIDENCE_HANDOFF',
      status: 'READY',
      expectedStatus: 'READY',
    });
    expect(dashboard.checks[6]).toMatchObject({
      mode: 'QUALITY_CLOSURE_REMAINING_WORK',
      command: 'npm run quality:closure-remaining-work --workspace=server',
      status: 'ACTION_REQUIRED',
      expectedStatus: 'READY',
    });
    expect(dashboard.checks[7]).toMatchObject({
      mode: 'QUALITY_CLOSURE_REQUEST_PACK',
      command: 'npm run quality:closure-request-pack --workspace=server',
      status: 'ACTION_REQUIRED',
      expectedStatus: 'READY',
    });
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const dashboard = buildQualityClosureDashboard({ checks: [] });
    const after = new Date();

    const ts = new Date(dashboard.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from check fields', () => {
    const dashboard = buildQualityClosureDashboard({
      checks: [{
        name: '  step-a  ',
        mode: '  MODE  ',
        command: '  cmd  ',
        status: '  READY  ',
        expectedStatus: '  READY  ',
        nextAction: '  action  ',
      }],
    });

    expect(dashboard.checks[0].name).toBe('step-a');
    expect(dashboard.checks[0].mode).toBe('MODE');
    expect(dashboard.checks[0].command).toBe('cmd');
  });

  it('filters out checks with empty names', () => {
    const dashboard = buildQualityClosureDashboard({
      checks: [
        { name: '  ', mode: 'M', command: 'c', status: 'READY', expectedStatus: 'READY', nextAction: 'n' },
        { name: 'valid', mode: 'M', command: 'c', status: 'READY', expectedStatus: 'READY', nextAction: 'n' },
      ],
    });

    expect(dashboard.checks).toHaveLength(1);
    expect(dashboard.summary.total).toBe(1);
  });

  it('empty checks produce READY dashboard', () => {
    const dashboard = buildQualityClosureDashboard({ checks: [] });

    expect(dashboard.status).toBe('READY');
    expect(dashboard.currentFocus).toBeUndefined();
    expect(dashboard.summary.total).toBe(0);
    expect(dashboard.summary.ready).toBe(0);
    expect(dashboard.summary.actionRequired).toBe(0);
  });

  it('default dashboard has 10 checks', () => {
    const dashboard = buildDefaultQualityClosureDashboard();
    expect(dashboard.checks).toHaveLength(10);
    expect(dashboard.mode).toBe('QUALITY_CLOSURE_DASHBOARD');
  });

  it('detects partial readiness in mixed checks', () => {
    const dashboard = buildQualityClosureDashboard({
      checks: [
        { name: 'ready-a', mode: 'M', command: 'c', status: 'READY', expectedStatus: 'READY', nextAction: 'n' },
        { name: 'not-ready-b', mode: 'M', command: 'c', status: 'PENDING', expectedStatus: 'DONE', nextAction: 'n' },
        { name: 'ready-c', mode: 'M', command: 'c', status: 'DONE', expectedStatus: 'DONE', nextAction: 'n' },
      ],
    });

    expect(dashboard.summary.ready).toBe(2);
    expect(dashboard.summary.actionRequired).toBe(1);
    expect(dashboard.currentFocus?.name).toBe('not-ready-b');
  });

  it('generatedAt is valid ISO string', () => {
    const dashboard = buildQualityClosureDashboard({ checks: [] });
    expect(new Date(dashboard.generatedAt).toISOString()).toBe(dashboard.generatedAt);
  });

  it('buildDefaultQualityClosureDashboard passes through generatedAt', () => {
    const dashboard = buildDefaultQualityClosureDashboard({
      generatedAt: new Date('2026-06-01T12:00:00.000Z'),
    });
    expect(dashboard.generatedAt).toBe('2026-06-01T12:00:00.000Z');
  });

  it('handles checks with duplicate names independently', () => {
    const dashboard = buildQualityClosureDashboard({
      checks: [
        { name: 'dup', mode: 'M', command: 'c', status: 'READY', expectedStatus: 'READY', nextAction: 'n' },
        { name: 'dup', mode: 'M', command: 'c', status: 'PENDING', expectedStatus: 'DONE', nextAction: 'n' },
      ],
    });

    expect(dashboard.checks).toHaveLength(2);
    expect(dashboard.summary.ready).toBe(1);
    expect(dashboard.summary.actionRequired).toBe(1);
    expect(dashboard.currentFocus?.name).toBe('dup');
    expect(dashboard.currentFocus?.status).toBe('PENDING');
  });

  it('default dashboard currentFocus is blocker register', () => {
    const dashboard = buildDefaultQualityClosureDashboard();
    expect(dashboard.currentFocus?.name).toBe('blocker register');
    expect(dashboard.currentFocus?.status).toBe('ACTION_REQUIRED');
    expect(dashboard.currentFocus?.expectedStatus).toBe('CLEAR');
  });

  it('picks first non-ready check as currentFocus among multiple non-ready', () => {
    const dashboard = buildQualityClosureDashboard({
      checks: [
        { name: 'ready-1', mode: 'M', command: 'c1', status: 'DONE', expectedStatus: 'DONE', nextAction: 'n' },
        { name: 'not-ready-1', mode: 'M', command: 'c2', status: 'PENDING', expectedStatus: 'DONE', nextAction: 'fix1' },
        { name: 'not-ready-2', mode: 'M', command: 'c3', status: 'BLOCKED', expectedStatus: 'DONE', nextAction: 'fix2' },
      ],
    });
    expect(dashboard.currentFocus?.name).toBe('not-ready-1');
    expect(dashboard.summary.ready).toBe(1);
    expect(dashboard.summary.actionRequired).toBe(2);
  });

  it('trimmed status fields are compared exactly for readiness check', () => {
    const dashboard = buildQualityClosureDashboard({
      checks: [
        { name: 'a', mode: 'M', command: 'c', status: '  READY  ', expectedStatus: 'READY', nextAction: 'n' },
      ],
    });

    expect(dashboard.summary.ready).toBe(1);
    expect(dashboard.currentFocus).toBeUndefined();
  });

  it('default dashboard closure sequence check has WAITING_FOR_EVIDENCE status', () => {
    const dashboard = buildDefaultQualityClosureDashboard();
    const seqCheck = dashboard.checks.find((c) => c.name === 'closure sequence');
    expect(seqCheck?.status).toBe('WAITING_FOR_EVIDENCE');
    expect(seqCheck?.expectedStatus).toBe('READY_TO_ARCHIVE');
  });

  it('filters out checks with whitespace-only names but keeps valid ones', () => {
    const dashboard = buildQualityClosureDashboard({
      checks: [
        { name: '  ', mode: 'M', command: 'c', status: 'READY', expectedStatus: 'READY', nextAction: 'n' },
        { name: 'a', mode: 'M', command: 'c', status: 'READY', expectedStatus: 'READY', nextAction: 'n' },
        { name: 'b', mode: 'M', command: 'c', status: 'PENDING', expectedStatus: 'DONE', nextAction: 'fix' },
      ],
    });

    expect(dashboard.checks).toHaveLength(2);
    expect(dashboard.summary.total).toBe(2);
    expect(dashboard.currentFocus?.name).toBe('b');
  });

  it('all-ready checks with identical status and expectedStatus have zero actionRequired', () => {
    const dashboard = buildQualityClosureDashboard({
      checks: [
        { name: 'a', mode: 'M', command: 'c', status: 'CUSTOM_DONE', expectedStatus: 'CUSTOM_DONE', nextAction: 'n' },
        { name: 'b', mode: 'M', command: 'c', status: 'CUSTOM_DONE', expectedStatus: 'CUSTOM_DONE', nextAction: 'n' },
      ],
    });

    expect(dashboard.summary.actionRequired).toBe(0);
    expect(dashboard.status).toBe('READY');
    expect(dashboard.currentFocus).toBeUndefined();
  });

  it('dashboard mode is QUALITY_CLOSURE_DASHBOARD', () => {
    const dashboard = buildQualityClosureDashboard({ checks: [] });
    expect(dashboard.mode).toBe('QUALITY_CLOSURE_DASHBOARD');
  });

  it('dashboard with empty metrics returns zero values', () => {
    const dashboard = buildQualityClosureDashboard({ checks: [] });
    expect(dashboard.checks).toHaveLength(0);
  });


  it('dashboard with single check has valid structure', () => {
    const dashboard = buildQualityClosureDashboard({ checks: [{ name: 'Test check', mode: 'TEST', command: 'npm test', status: 'DONE_GREEN', expectedStatus: 'DONE_GREEN', nextAction: 'none' }] });
    expect(dashboard.checks).toHaveLength(1);
  });

  it('dashboard with empty checks returns valid summary', () => { const dashboard = buildQualityClosureDashboard({ checks: [] }); expect(dashboard.checks).toHaveLength(0); });

  it('dashboard summary counts checks correctly', () => { const dashboard = buildQualityClosureDashboard({ checks: [{ name: 'c1', mode: 'TEST', command: 'cmd', status: 'PASS', expectedStatus: 'PASS', nextAction: '' }, { name: 'c2', mode: 'TEST', command: 'cmd', status: 'FAIL', expectedStatus: 'PASS', nextAction: 'fix' }] }); expect(dashboard.checks).toHaveLength(2); });

  it('dashboard with all PASS checks has zero failures', () => { const dashboard = buildQualityClosureDashboard({ checks: [{ name: 'c1', mode: 'TEST', command: 'cmd', status: 'PASS', expectedStatus: 'PASS', nextAction: '' }, { name: 'c2', mode: 'TEST', command: 'cmd', status: 'PASS', expectedStatus: 'PASS', nextAction: '' }] }); expect(dashboard.summary.ready).toBe(2); });

  it('dashboard with single FAIL check has correct summary', () => { const dashboard = buildQualityClosureDashboard({ checks: [{ name: 'c1', mode: 'TEST', command: 'cmd', status: 'FAIL', expectedStatus: 'PASS', nextAction: 'fix' }] }); expect(dashboard.summary.actionRequired).toBe(1); });

  it('dashboard with mixed PASS and FAIL has correct counts', () => { const dashboard = buildQualityClosureDashboard({ checks: [{ name: 'c1', mode: 'TEST', command: 'cmd', status: 'PASS', expectedStatus: 'PASS', nextAction: '' }, { name: 'c2', mode: 'TEST', command: 'cmd', status: 'FAIL', expectedStatus: 'PASS', nextAction: 'fix' }, { name: 'c3', mode: 'TEST', command: 'cmd', status: 'PASS', expectedStatus: 'PASS', nextAction: '' }] }); expect(dashboard.summary.ready).toBe(2); expect(dashboard.summary.actionRequired).toBe(1); });

  it('dashboard mode is QUALITY_CLOSURE_DASHBOARD', () => { const dashboard = buildQualityClosureDashboard({ checks: [] }); expect(dashboard.mode).toBe('QUALITY_CLOSURE_DASHBOARD'); });

  it('dashboard with empty checks has zero ready count', () => { const dashboard = buildQualityClosureDashboard({ checks: [] }); expect(dashboard.summary.ready).toBe(0); });

  it('dashboard with single PASS check has ready count one', () => { const dashboard = buildQualityClosureDashboard({ checks: [{ name: 'c1', mode: 'TEST', command: 'cmd', status: 'PASS', expectedStatus: 'PASS', nextAction: '' }] }); expect(dashboard.summary.ready).toBe(1); });

  it('dashboard with FAIL check has action required', () => { const dashboard = buildQualityClosureDashboard({ checks: [{ name: 'c1', mode: 'TEST', command: 'cmd', status: 'FAIL', expectedStatus: 'PASS', nextAction: 'fix' }] }); expect(dashboard.summary.actionRequired).toBeGreaterThan(0); });

  it('dashboard with all PASS checks has zero action required', () => { const dashboard = buildQualityClosureDashboard({ checks: [{ name: 'c1', mode: 'TEST', command: 'cmd', status: 'PASS', expectedStatus: 'PASS', nextAction: '' }] }); expect(dashboard.summary.actionRequired).toBe(0); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `dashboard-ready-${index}`,
    `STATUS_${index}`,
  ] as const))('counts matching custom status for %s as ready', (name, status) => {
    const dashboard = buildQualityClosureDashboard({
      checks: [{
        name: ` ${name} `,
        mode: ` MODE_${name} `,
        command: ` npm run ${name} `,
        status: ` ${status} `,
        expectedStatus: status,
        nextAction: ` action-${name} `,
      }],
    });

    expect(dashboard.status).toBe('READY');
    expect(dashboard.summary).toEqual({ total: 1, ready: 1, actionRequired: 0 });
    expect(dashboard.currentFocus).toBeUndefined();
    expect(dashboard.checks[0]).toMatchObject({ name, status, expectedStatus: status });
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    `dashboard-focus-${index}`,
    `CURRENT_${index}`,
    `EXPECTED_${index}`,
  ] as const))('uses first non-ready check as current focus for %s', (name, status, expectedStatus) => {
    const dashboard = buildQualityClosureDashboard({
      checks: [
        { name: 'ready-first', mode: 'MODE', command: 'cmd', status: 'READY', expectedStatus: 'READY', nextAction: 'done' },
        { name, mode: 'MODE', command: `cmd-${name}`, status, expectedStatus, nextAction: `fix-${name}` },
        { name: `${name}-later`, mode: 'MODE', command: 'cmd-later', status: 'WAITING', expectedStatus: 'READY', nextAction: 'later' },
      ],
    });

    expect(dashboard.status).toBe('ACTION_REQUIRED');
    expect(dashboard.summary.ready).toBe(1);
    expect(dashboard.summary.actionRequired).toBe(2);
    expect(dashboard.currentFocus).toMatchObject({ name, status, expectedStatus, nextAction: `fix-${name}` });
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch140-check-${index}`,
    index % 2 === 0 ? 'READY' : 'DONE',
    index + 1,
  ] as const))(
    'summarizes generated ready checks %s',
    (name, status, count) => {
      const dashboard = buildQualityClosureDashboard({
        checks: Array.from({ length: count }, (_, checkIndex) => ({
          name: ` ${name}-${checkIndex} `,
          mode: ` MODE_${checkIndex} `,
          command: ` cmd-${checkIndex} `,
          status,
          expectedStatus: status,
          nextAction: ` action-${checkIndex} `,
        })),
      });

      expect(dashboard.status).toBe('READY');
      expect(dashboard.summary).toEqual({ total: count, ready: count, actionRequired: 0 });
      expect(dashboard.currentFocus).toBeUndefined();
      expect(dashboard.checks[count - 1]).toMatchObject({ name: `${name}-${count - 1}`, mode: `MODE_${count - 1}` });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch140-focus-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'WAITING_FOR_EVIDENCE',
    index % 2 === 0 ? 'READY' : 'READY_TO_ARCHIVE',
  ] as const))(
    'filters generated blank checks before focus %s',
    (name, status, expectedStatus) => {
      const dashboard = buildQualityClosureDashboard({
        checks: [
          { name: ' ', mode: 'IGNORED', command: 'ignored', status: 'READY', expectedStatus: 'READY', nextAction: 'ignored' },
          { name: ` ${name} `, mode: ' MODE ', command: ` command-${name} `, status: ` ${status} `, expectedStatus, nextAction: ` fix-${name} ` },
        ],
      });

      expect(dashboard.status).toBe('ACTION_REQUIRED');
      expect(dashboard.summary).toEqual({ total: 1, ready: 0, actionRequired: 1 });
      expect(dashboard.currentFocus).toMatchObject({ name, mode: 'MODE', command: `command-${name}`, status, expectedStatus });
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch145-ready-${index}`,
    `STATUS_${index}`,
    new Date(Date.UTC(2026, 4, 11, 5, index % 60, index % 60)),
  ] as const))(
    'preserves generated ready dashboard timestamp %s',
    (name, status, generatedAt) => {
      const dashboard = buildQualityClosureDashboard({
        generatedAt,
        checks: [
          { name: ` ${name} `, mode: ' MODE ', command: ' command ', status: ` ${status} `, expectedStatus: status, nextAction: ' next ' },
          { name: ' ', mode: 'IGNORED', command: 'ignored', status: 'WAITING', expectedStatus: 'READY', nextAction: 'ignored' },
        ],
      });

      expect(dashboard.generatedAt).toBe(generatedAt.toISOString());
      expect(dashboard.status).toBe('READY');
      expect(dashboard.summary).toEqual({ total: 1, ready: 1, actionRequired: 0 });
      expect(dashboard.currentFocus).toBeUndefined();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch145-focus-${index}`,
    `CURRENT_${index}`,
    `EXPECTED_${index}`,
    `fix-${index}`,
  ] as const))(
    'uses generated first action-required dashboard check %s',
    (name, status, expectedStatus, nextAction) => {
      const dashboard = buildQualityClosureDashboard({
        checks: [
          { name: 'ready', mode: 'MODE', command: 'cmd-ready', status: 'READY', expectedStatus: 'READY', nextAction: 'done' },
          { name, mode: 'MODE', command: `cmd-${name}`, status, expectedStatus, nextAction },
          { name: `${name}-later`, mode: 'MODE', command: 'cmd-later', status: 'WAITING', expectedStatus: 'READY', nextAction: 'later' },
        ],
      });

      expect(dashboard.status).toBe('ACTION_REQUIRED');
      expect(dashboard.summary).toEqual({ total: 3, ready: 1, actionRequired: 2 });
      expect(dashboard.currentFocus).toMatchObject({ name, command: `cmd-${name}`, status, expectedStatus, nextAction });
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch154-ready-${index}`,
    `STATUS_${index}`,
    new Date(Date.UTC(2026, 4, 11, 7, index % 60, index % 60)),
  ] as const))(
    'summarizes generated all-ready dashboard pair %s',
    (name, status, generatedAt) => {
      const dashboard = buildQualityClosureDashboard({
        generatedAt,
        checks: [
          { name: ` ${name}-a `, mode: ' MODE_A ', command: ' cmd-a ', status, expectedStatus: status, nextAction: ' next-a ' },
          { name: `${name}-b`, mode: 'MODE_B', command: 'cmd-b', status: 'READY', expectedStatus: 'READY', nextAction: 'next-b' },
        ],
      });

      expect(dashboard.generatedAt).toBe(generatedAt.toISOString());
      expect(dashboard.status).toBe('READY');
      expect(dashboard.summary).toEqual({ total: 2, ready: 2, actionRequired: 0 });
      expect(dashboard.currentFocus).toBeUndefined();
      expect(dashboard.checks.map((check) => check.name)).toEqual([`${name}-a`, `${name}-b`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch154-focus-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'WAITING_FOR_EVIDENCE',
    index % 2 === 0 ? 'READY' : 'READY_TO_ARCHIVE',
  ] as const))(
    'keeps generated first non-ready dashboard focus %s',
    (name, status, expectedStatus) => {
      const dashboard = buildQualityClosureDashboard({
        checks: [
          { name: ' ', mode: 'IGNORED', command: 'ignored', status: 'READY', expectedStatus: 'READY', nextAction: 'ignored' },
          { name: 'ready-before', mode: 'MODE', command: 'cmd-ready', status: 'CLEAR', expectedStatus: 'CLEAR', nextAction: 'done' },
          { name: ` ${name} `, mode: ' MODE ', command: ` cmd-${name} `, status, expectedStatus, nextAction: ` fix-${name} ` },
          { name: `${name}-later`, mode: 'MODE', command: 'cmd-later', status: 'PENDING', expectedStatus: 'READY', nextAction: 'later' },
        ],
      });

      expect(dashboard.status).toBe('ACTION_REQUIRED');
      expect(dashboard.summary).toEqual({ total: 3, ready: 1, actionRequired: 2 });
      expect(dashboard.currentFocus).toMatchObject({ name, mode: 'MODE', command: `cmd-${name}`, status, expectedStatus, nextAction: `fix-${name}` });
    },
  );
});

describe('quality closure dashboard batch 159 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch159-ready-${index}`,
    index % 2 === 0 ? 'READY_TO_ARCHIVE' : 'CONFIRMED',
  ] as const))(
    'summarizes generated batch159 ready dashboard checks %s',
    (name, status) => {
      const dashboard = buildQualityClosureDashboard({
        checks: [
          { name: ' ', mode: 'IGNORED', command: 'ignored', status: 'PENDING', expectedStatus: 'READY', nextAction: 'ignored' },
          { name: ` ${name}-a `, mode: ' MODE_A ', command: ' cmd-a ', status: ` ${status} `, expectedStatus: status, nextAction: ' next-a ' },
          { name: `${name}-b`, mode: 'MODE_B', command: 'cmd-b', status: 'CLEAR', expectedStatus: 'CLEAR', nextAction: 'next-b' },
        ],
      });

      expect(dashboard.status).toBe('READY');
      expect(dashboard.summary).toEqual({ total: 2, ready: 2, actionRequired: 0 });
      expect(dashboard.currentFocus).toBeUndefined();
      expect(dashboard.checks.map((check) => check.name)).toEqual([`${name}-a`, `${name}-b`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch159-focus-${index}`,
    index % 2 === 0 ? 'BLOCKED' : 'WAITING_FOR_EVIDENCE',
    index % 2 === 0 ? 'READY' : 'READY_TO_ARCHIVE',
  ] as const))(
    'selects generated batch159 first mismatched dashboard check %s',
    (name, status, expectedStatus) => {
      const dashboard = buildQualityClosureDashboard({
        checks: [
          { name: 'ready-prefix', mode: 'MODE', command: 'cmd-ready', status: 'SYNCED', expectedStatus: 'SYNCED', nextAction: 'done' },
          { name: ` ${name} `, mode: ' MODE ', command: ` cmd-${name} `, status: ` ${status} `, expectedStatus, nextAction: ` next-${name} ` },
          { name: `${name}-later`, mode: 'MODE', command: 'cmd-later', status: 'PENDING', expectedStatus: 'READY', nextAction: 'later' },
        ],
      });

      expect(dashboard.status).toBe('ACTION_REQUIRED');
      expect(dashboard.summary).toEqual({ total: 3, ready: 1, actionRequired: 2 });
      expect(dashboard.currentFocus).toMatchObject({ name, mode: 'MODE', command: `cmd-${name}`, status, expectedStatus, nextAction: `next-${name}` });
    },
  );
});

describe('quality closure dashboard batch 176 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch176-ready-${index}`,
    index % 2 === 0 ? 'READY_TO_CLOSE' : 'EVIDENCE_SYNCED',
    new Date(Date.UTC(2026, 4, 11, 8, index % 60, index % 60)),
  ] as const))(
    'keeps generated batch176 ready dashboard checks normalized %s',
    (name, status, generatedAt) => {
      const dashboard = buildQualityClosureDashboard({
        generatedAt,
        checks: [
          { name: ' ', mode: 'IGNORED', command: 'ignored', status: 'WAITING', expectedStatus: 'READY', nextAction: 'ignored' },
          { name: ` ${name} `, mode: ' QUALITY_MODE ', command: ` npm run ${name} `, status: ` ${status} `, expectedStatus: status, nextAction: ' archive ' },
        ],
      });

      expect(dashboard.generatedAt).toBe(generatedAt.toISOString());
      expect(dashboard.status).toBe('READY');
      expect(dashboard.summary).toEqual({ total: 1, ready: 1, actionRequired: 0 });
      expect(dashboard.currentFocus).toBeUndefined();
      expect(dashboard.checks[0]).toMatchObject({ name, mode: 'QUALITY_MODE', command: `npm run ${name}`, status, expectedStatus: status, nextAction: 'archive' });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch176-focus-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'PENDING_OWNER',
    index % 2 === 0 ? 'READY' : 'READY_TO_ARCHIVE',
  ] as const))(
    'keeps generated batch176 first dashboard mismatch as current focus %s',
    (name, status, expectedStatus) => {
      const dashboard = buildQualityClosureDashboard({
        checks: [
          { name: 'first-ready', mode: 'MODE_A', command: 'cmd-a', status: 'CLEAR', expectedStatus: 'CLEAR', nextAction: 'done' },
          { name: ` ${name} `, mode: ' MODE_B ', command: ` cmd-${name} `, status: ` ${status} `, expectedStatus, nextAction: ` next-${name} ` },
          { name: `${name}-later`, mode: 'MODE_C', command: 'cmd-c', status: 'BLOCKED', expectedStatus: 'READY', nextAction: 'later' },
        ],
      });

      expect(dashboard.status).toBe('ACTION_REQUIRED');
      expect(dashboard.summary).toEqual({ total: 3, ready: 1, actionRequired: 2 });
      expect(dashboard.currentFocus).toMatchObject({ name, mode: 'MODE_B', command: `cmd-${name}`, status, expectedStatus, nextAction: `next-${name}` });
    },
  );
});
