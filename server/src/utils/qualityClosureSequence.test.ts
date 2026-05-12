import { describe, expect, it } from 'vitest';
import { buildDefaultQualityClosureSequence, buildQualityClosureSequence } from './qualityClosureSequence';

describe('quality closure sequence builder', () => {
  it('orders the remaining closure workflow and identifies the active waiting step', () => {
    const sequence = buildQualityClosureSequence({
      generatedAt: new Date('2026-05-06T14:00:00.000Z'),
      steps: [
        { name: 'owner assignments', command: 'npm run quality:owner-assignments --workspace=server', status: 'ACTION_REQUIRED', expectedNextStatus: 'ACTION_REQUIRED', owner: 'AI 代码守护人' },
        { name: 'blocker resolution', command: 'npm run quality:blocker-resolution --workspace=server', status: 'ACTION_REQUIRED', expectedNextStatus: 'RESOLVED', owner: 'AI 代码守护人' },
        { name: 'closure evidence pack', command: 'npm run quality:closure-evidence-pack --workspace=server', status: 'ACTION_REQUIRED', expectedNextStatus: 'READY', owner: 'AI 代码守护人' },
        { name: 'closure evidence handoff', command: 'npm run quality:closure-evidence-handoff --workspace=server', status: 'ACTION_REQUIRED', expectedNextStatus: 'READY', owner: 'AI 代码守护人' },
        { name: 'evidence intake', command: 'npm run quality:evidence-intake --workspace=server -- --confirm ...', status: 'ACTION_REQUIRED', expectedNextStatus: 'READY_TO_CONFIRM', owner: 'AI 代码守护人' },
        { name: 'team confirmations', command: 'npm run quality:team-confirmations --workspace=server -- --confirm ...', status: 'PENDING', expectedNextStatus: 'CONFIRMED', owner: 'AI 代码守护人' },
        { name: 'final closure', command: 'npm run quality:final-closure --workspace=server -- --artifact ...', status: 'PENDING', expectedNextStatus: 'READY_TO_ARCHIVE', owner: 'AI 代码守护人' },
      ],
    });

    expect(sequence).toEqual({
      mode: 'QUALITY_CLOSURE_SEQUENCE',
      status: 'WAITING_FOR_EVIDENCE',
      generatedAt: '2026-05-06T14:00:00.000Z',
      summary: {
        total: 7,
        ready: 0,
        actionRequired: 5,
        pending: 2,
      },
      activeStep: {
        order: 2,
        name: 'blocker resolution',
        command: 'npm run quality:blocker-resolution --workspace=server',
        status: 'ACTION_REQUIRED',
        expectedNextStatus: 'RESOLVED',
        owner: 'AI 代码守护人',
      },
      steps: [
        { order: 1, name: 'owner assignments', command: 'npm run quality:owner-assignments --workspace=server', status: 'ACTION_REQUIRED', expectedNextStatus: 'ACTION_REQUIRED', owner: 'AI 代码守护人' },
        { order: 2, name: 'blocker resolution', command: 'npm run quality:blocker-resolution --workspace=server', status: 'ACTION_REQUIRED', expectedNextStatus: 'RESOLVED', owner: 'AI 代码守护人' },
        { order: 3, name: 'closure evidence pack', command: 'npm run quality:closure-evidence-pack --workspace=server', status: 'ACTION_REQUIRED', expectedNextStatus: 'READY', owner: 'AI 代码守护人' },
        { order: 4, name: 'closure evidence handoff', command: 'npm run quality:closure-evidence-handoff --workspace=server', status: 'ACTION_REQUIRED', expectedNextStatus: 'READY', owner: 'AI 代码守护人' },
        { order: 5, name: 'evidence intake', command: 'npm run quality:evidence-intake --workspace=server -- --confirm ...', status: 'ACTION_REQUIRED', expectedNextStatus: 'READY_TO_CONFIRM', owner: 'AI 代码守护人' },
        { order: 6, name: 'team confirmations', command: 'npm run quality:team-confirmations --workspace=server -- --confirm ...', status: 'PENDING', expectedNextStatus: 'CONFIRMED', owner: 'AI 代码守护人' },
        { order: 7, name: 'final closure', command: 'npm run quality:final-closure --workspace=server -- --artifact ...', status: 'PENDING', expectedNextStatus: 'READY_TO_ARCHIVE', owner: 'AI 代码守护人' },
      ],
    });
  });

  it('marks the sequence ready to archive when all steps are green', () => {
    const sequence = buildQualityClosureSequence({
      generatedAt: new Date('2026-05-06T14:00:00.000Z'),
      steps: [
        { name: 'blocker resolution', command: 'npm run quality:blocker-resolution --workspace=server', status: 'RESOLVED', expectedNextStatus: 'RESOLVED', owner: 'AI 代码守护人' },
        { name: 'closure evidence pack', command: 'npm run quality:closure-evidence-pack --workspace=server', status: 'READY', expectedNextStatus: 'READY', owner: 'AI 代码守护人' },
        { name: 'closure evidence handoff', command: 'npm run quality:closure-evidence-handoff --workspace=server', status: 'READY', expectedNextStatus: 'READY', owner: 'AI 代码守护人' },
        { name: 'evidence intake', command: 'npm run quality:evidence-intake --workspace=server -- --confirm ...', status: 'READY_TO_CONFIRM', expectedNextStatus: 'READY_TO_CONFIRM', owner: 'AI 代码守护人' },
        { name: 'team confirmations', command: 'npm run quality:team-confirmations --workspace=server -- --confirm ...', status: 'CONFIRMED', expectedNextStatus: 'CONFIRMED', owner: 'AI 代码守护人' },
        { name: 'final closure', command: 'npm run quality:final-closure --workspace=server -- --artifact ...', status: 'READY_TO_ARCHIVE', expectedNextStatus: 'READY_TO_ARCHIVE', owner: 'AI 代码守护人' },
      ],
    });

    expect(sequence.status).toBe('READY_TO_ARCHIVE');
    expect(sequence.activeStep).toBeUndefined();
    expect(sequence.summary.ready).toBe(6);
  });

  it('uses current machine-proven steps in the default sequence', () => {
    const sequence = buildDefaultQualityClosureSequence({
      generatedAt: new Date('2026-05-06T14:00:00.000Z'),
    });

    expect(sequence.summary).toEqual({
      total: 10,
      ready: 2,
      actionRequired: 5,
      pending: 3,
    });
    expect(sequence.steps.map((step) => step.name)).toEqual([
      'owner assignments',
      'blocker resolution',
      'closure evidence pack',
      'closure evidence handoff',
      'closure remaining work',
      'closure request pack',
      'evidence intake',
      'team confirmations',
      'final closure',
      'progress guard',
    ]);
    expect(sequence.steps[2]).toMatchObject({
      name: 'closure evidence pack',
      status: 'READY',
      expectedNextStatus: 'READY',
    });
    expect(sequence.steps[3]).toMatchObject({
      name: 'closure evidence handoff',
      status: 'READY',
      expectedNextStatus: 'READY',
    });
    expect(sequence.steps[4]).toMatchObject({
      name: 'closure remaining work',
      command: 'npm run quality:closure-remaining-work --workspace=server',
      status: 'ACTION_REQUIRED',
      expectedNextStatus: 'READY',
    });
    expect(sequence.steps[5]).toMatchObject({
      name: 'closure request pack',
      command: 'npm run quality:closure-request-pack --workspace=server',
      status: 'ACTION_REQUIRED',
      expectedNextStatus: 'READY',
    });
    expect(sequence.activeStep?.name).toBe('blocker resolution');
  });

  it('filters out steps with empty names', () => {
    const sequence = buildQualityClosureSequence({
      generatedAt: new Date('2026-05-06T14:00:00.000Z'),
      steps: [
        { name: '  ', command: 'c', status: 'PENDING', expectedNextStatus: 'READY', owner: 'o' },
        { name: 'valid step', command: 'c', status: 'RESOLVED', expectedNextStatus: 'RESOLVED', owner: 'o' },
      ],
    });

    expect(sequence.summary.total).toBe(1);
    expect(sequence.steps[0].name).toBe('valid step');
  });

  it('is READY_TO_ARCHIVE with empty steps', () => {
    const sequence = buildQualityClosureSequence({
      generatedAt: new Date('2026-05-06T14:00:00.000Z'),
      steps: [],
    });

    expect(sequence.status).toBe('READY_TO_ARCHIVE');
    expect(sequence.activeStep).toBeUndefined();
    expect(sequence.summary.total).toBe(0);
  });

  it('assigns correct order numbers', () => {
    const sequence = buildQualityClosureSequence({
      generatedAt: new Date('2026-05-06T14:00:00.000Z'),
      steps: [
        { name: 'a', command: 'c', status: 'RESOLVED', expectedNextStatus: 'RESOLVED', owner: 'o' },
        { name: 'b', command: 'c', status: 'RESOLVED', expectedNextStatus: 'RESOLVED', owner: 'o' },
        { name: 'c', command: 'c', status: 'RESOLVED', expectedNextStatus: 'RESOLVED', owner: 'o' },
      ],
    });

    expect(sequence.steps.map((s) => s.order)).toEqual([1, 2, 3]);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const sequence = buildQualityClosureSequence({ steps: [] });
    const after = new Date();

    const ts = new Date(sequence.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from step name, command, and owner', () => {
    const sequence = buildQualityClosureSequence({
      steps: [
        { name: '  step-a  ', command: '  cmd  ', status: 'RESOLVED', expectedNextStatus: 'RESOLVED', owner: '  owner  ' },
      ],
    });

    expect(sequence.steps[0].name).toBe('step-a');
    expect(sequence.steps[0].command).toBe('cmd');
    expect(sequence.steps[0].owner).toBe('owner');
  });

  it('recognizes all green statuses as ready', () => {
    const greenStatuses = ['READY', 'READY_TO_CONFIRM', 'CONFIRMED', 'READY_TO_ARCHIVE', 'RESOLVED'] as const;

    for (const status of greenStatuses) {
      const sequence = buildQualityClosureSequence({
        steps: [
          { name: `step-${status}`, command: 'c', status, expectedNextStatus: status, owner: 'o' },
        ],
      });

      expect(sequence.summary.ready).toBe(1);
      expect(sequence.activeStep).toBeUndefined();
      expect(sequence.status).toBe('READY_TO_ARCHIVE');
    }
  });

  it('ACTION_REQUIRED status is not green and counted separately', () => {
    const sequence = buildQualityClosureSequence({
      steps: [
        { name: 'blocked-step', command: 'c', status: 'ACTION_REQUIRED', expectedNextStatus: 'RESOLVED', owner: 'o' },
      ],
    });

    expect(sequence.summary.ready).toBe(0);
    expect(sequence.summary.actionRequired).toBe(1);
    expect(sequence.activeStep).toBeDefined();
    expect(sequence.status).toBe('WAITING_FOR_EVIDENCE');
  });

  it('PENDING status is not green and counted separately', () => {
    const sequence = buildQualityClosureSequence({
      steps: [
        { name: 'pending-step', command: 'c', status: 'PENDING', expectedNextStatus: 'READY', owner: 'o' },
      ],
    });

    expect(sequence.summary.ready).toBe(0);
    expect(sequence.summary.pending).toBe(1);
    expect(sequence.activeStep).toBeDefined();
    expect(sequence.status).toBe('WAITING_FOR_EVIDENCE');
  });

  it('activeStep is the first step where status !== expectedNextStatus', () => {
    const sequence = buildQualityClosureSequence({
      steps: [
        { name: 'good', command: 'c', status: 'RESOLVED', expectedNextStatus: 'RESOLVED', owner: 'o' },
        { name: 'bad', command: 'c', status: 'ACTION_REQUIRED', expectedNextStatus: 'RESOLVED', owner: 'o' },
        { name: 'also-bad', command: 'c', status: 'PENDING', expectedNextStatus: 'READY', owner: 'o' },
      ],
    });

    expect(sequence.activeStep?.name).toBe('bad');
    expect(sequence.activeStep?.order).toBe(2);
  });

  it('default sequence has exactly 10 steps', () => {
    const sequence = buildDefaultQualityClosureSequence();
    expect(sequence.steps).toHaveLength(10);
  });

  it('trims whitespace from step fields', () => {
    const sequence = buildQualityClosureSequence({
      steps: [
        { name: '  step-a  ', command: '  cmd  ', status: 'READY', expectedNextStatus: 'READY', owner: '  owner  ' },
      ],
    });

    expect(sequence.steps[0].name).toBe('step-a');
    expect(sequence.steps[0].command).toBe('cmd');
    expect(sequence.steps[0].owner).toBe('owner');
  });

  it('filters out steps with empty names', () => {
    const sequence = buildQualityClosureSequence({
      steps: [
        { name: '  ', command: 'c', status: 'READY', expectedNextStatus: 'READY', owner: 'o' },
        { name: 'valid', command: 'c', status: 'READY', expectedNextStatus: 'READY', owner: 'o' },
      ],
    });

    expect(sequence.steps).toHaveLength(1);
    expect(sequence.summary.total).toBe(1);
  });

  it('assigns correct order numbers', () => {
    const sequence = buildQualityClosureSequence({
      steps: [
        { name: 'first', command: 'c', status: 'READY', expectedNextStatus: 'READY', owner: 'o' },
        { name: 'second', command: 'c', status: 'READY', expectedNextStatus: 'READY', owner: 'o' },
        { name: 'third', command: 'c', status: 'READY', expectedNextStatus: 'READY', owner: 'o' },
      ],
    });

    expect(sequence.steps[0].order).toBe(1);
    expect(sequence.steps[1].order).toBe(2);
    expect(sequence.steps[2].order).toBe(3);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const sequence = buildQualityClosureSequence({ steps: [] });
    const after = new Date();

    const ts = new Date(sequence.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('empty steps produce READY_TO_ARCHIVE', () => {
    const sequence = buildQualityClosureSequence({ steps: [] });

    expect(sequence.status).toBe('READY_TO_ARCHIVE');
    expect(sequence.activeStep).toBeUndefined();
    expect(sequence.summary.total).toBe(0);
  });

  it('is READY_TO_ARCHIVE when all statuses match expectedNextStatus even if non-green', () => {
    const sequence = buildQualityClosureSequence({
      steps: [
        { name: 'a', command: 'c', status: 'ACTION_REQUIRED', expectedNextStatus: 'ACTION_REQUIRED', owner: 'o' },
        { name: 'b', command: 'c', status: 'PENDING', expectedNextStatus: 'PENDING', owner: 'o' },
      ],
    });

    expect(sequence.activeStep).toBeUndefined();
    expect(sequence.status).toBe('READY_TO_ARCHIVE');
    expect(sequence.summary.ready).toBe(0);
    expect(sequence.summary.actionRequired).toBe(1);
    expect(sequence.summary.pending).toBe(1);
  });

  it('default sequence includes progress guard as last step', () => {
    const sequence = buildDefaultQualityClosureSequence();
    const lastStep = sequence.steps[sequence.steps.length - 1];
    expect(lastStep.name).toBe('progress guard');
    expect(lastStep.status).toBe('PENDING');
    expect(lastStep.expectedNextStatus).toBe('READY');
  });

  it('step with status matching expectedNextStatus but not in green set is not counted as ready', () => {
    const sequence = buildQualityClosureSequence({
      steps: [
        { name: 'a', command: 'c', status: 'ACTION_REQUIRED', expectedNextStatus: 'ACTION_REQUIRED', owner: 'o' },
      ],
    });

    expect(sequence.summary.ready).toBe(0);
    expect(sequence.summary.actionRequired).toBe(1);
    expect(sequence.activeStep).toBeUndefined();
    expect(sequence.status).toBe('READY_TO_ARCHIVE');
  });

  it('sequence mode is QUALITY_CLOSURE_SEQUENCE', () => {
    const sequence = buildQualityClosureSequence({
      generatedAt: new Date('2026-05-06T14:00:00.000Z'),
      steps: [{ name: 'test', command: 'cmd', status: 'ACTION_REQUIRED', expectedNextStatus: 'READY', owner: 'owner' }],
    });
    expect(sequence.mode).toBe('QUALITY_CLOSURE_SEQUENCE');
  });

  it('sequence with empty steps returns empty array', () => {
    const sequence = buildQualityClosureSequence({ steps: [] });
    expect(sequence.steps).toEqual([]);
  });


  it('sequence with single step returns valid structure', () => {
    const sequence = buildQualityClosureSequence({ steps: [{ name: 'Step', command: 'npm test', status: 'PENDING', expectedNextStatus: 'CONFIRMED', owner: 'u1' }] });
    expect(sequence.steps).toHaveLength(1);
  });

  it('sequence with empty steps returns valid structure', () => { const sequence = buildQualityClosureSequence({ steps: [] }); expect(sequence.steps).toHaveLength(0); });

  it('sequence with single step returns valid structure', () => { const sequence = buildQualityClosureSequence({ steps: [{ name: 'step1', command: 'cmd', status: 'PENDING', expectedNextStatus: 'READY', owner: 'admin' }] }); expect(sequence.steps).toHaveLength(1); });

  it('sequence with multiple steps preserves order', () => { const sequence = buildQualityClosureSequence({ steps: [{ name: 's1', command: 'a', status: 'DONE', expectedNextStatus: 'READY', owner: 'x' }, { name: 's2', command: 'b', status: 'PENDING', expectedNextStatus: 'READY', owner: 'y' }] }); expect(sequence.steps[0].name).toBe('s1'); expect(sequence.steps[1].name).toBe('s2'); });

  it('sequence with DONE step preserves status', () => { const sequence = buildQualityClosureSequence({ steps: [{ name: 's1', command: 'cmd', status: 'DONE', expectedNextStatus: 'READY', owner: 'admin' }] }); expect(sequence.steps[0].status).toBe('DONE'); });

  it('sequence with PENDING step preserves status', () => { const sequence = buildQualityClosureSequence({ steps: [{ name: 's1', command: 'cmd', status: 'PENDING', expectedNextStatus: 'READY', owner: 'admin' }] }); expect(sequence.steps[0].status).toBe('PENDING'); });

  it('sequence mode is QUALITY_CLOSURE_SEQUENCE', () => { const sequence = buildQualityClosureSequence({ steps: [] }); expect(sequence.mode).toBe('QUALITY_CLOSURE_SEQUENCE'); });

  it('sequence with empty steps returns empty array', () => { const sequence = buildQualityClosureSequence({ steps: [] }); expect(sequence.steps).toHaveLength(0); });

  it('sequence with single step returns one step', () => { const sequence = buildQualityClosureSequence({ steps: [{ name: 'step1', command: 'cmd', status: 'PENDING', expectedNextStatus: 'PASS', owner: 'admin', nextAction: '' }] }); expect(sequence.steps).toHaveLength(1); });

  it('sequence with multiple steps preserves count', () => { const sequence = buildQualityClosureSequence({ steps: [{ name: 's1', command: 'c1', status: 'PASS', expectedNextStatus: 'PASS', owner: 'admin', nextAction: '' }, { name: 's2', command: 'c2', status: 'PENDING', expectedNextStatus: 'PASS', owner: 'admin', nextAction: '' }] }); expect(sequence.steps).toHaveLength(2); });

  it('sequence with empty steps returns valid', () => { const sequence = buildQualityClosureSequence({ steps: [] }); expect(sequence).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => {
    const statuses = ['READY', 'READY_TO_CONFIRM', 'CONFIRMED', 'READY_TO_ARCHIVE', 'RESOLVED'] as const;
    const status = statuses[index % statuses.length];
    return [`sequence-ready-${index}`, status] as const;
  }))('counts green sequence status for %s as ready', (name, status) => {
    const sequence = buildQualityClosureSequence({
      steps: [{
        name: ` ${name} `,
        command: ` npm run ${name} `,
        status,
        expectedNextStatus: status,
        owner: ` owner-${name} `,
      }],
    });

    expect(sequence.status).toBe('READY_TO_ARCHIVE');
    expect(sequence.summary.ready).toBe(1);
    expect(sequence.summary.actionRequired).toBe(0);
    expect(sequence.summary.pending).toBe(0);
    expect(sequence.steps[0]).toMatchObject({ order: 1, name, command: `npm run ${name}`, owner: `owner-${name}` });
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    `sequence-active-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'PENDING',
    index % 2 === 0 ? 'RESOLVED' : 'CONFIRMED',
  ] as const))('marks non-matching sequence step %s as active', (name, status, expectedNextStatus) => {
    const sequence = buildQualityClosureSequence({
      steps: [
        { name: 'ready-before', command: 'cmd-ready', status: 'READY', expectedNextStatus: 'READY', owner: 'owner' },
        { name, command: `cmd-${name}`, status, expectedNextStatus, owner: `owner-${name}` },
      ],
    });

    expect(sequence.status).toBe('WAITING_FOR_EVIDENCE');
    expect(sequence.activeStep).toMatchObject({ order: 2, name, status, expectedNextStatus });
    expect(sequence.summary.actionRequired).toBe(status === 'ACTION_REQUIRED' ? 1 : 0);
    expect(sequence.summary.pending).toBe(status === 'PENDING' ? 1 : 0);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch139-step-${index}`,
    index % 3 === 0 ? 'READY' : index % 3 === 1 ? 'READY_TO_CONFIRM' : 'RESOLVED',
    index + 1,
  ] as const))(
    'orders generated green sequence step %s',
    (name, status, order) => {
      const steps = Array.from({ length: order }, (_, index) => ({
        name: ` ${name}-${index} `,
        command: ` npm run ${name}-${index} `,
        status,
        expectedNextStatus: status,
        owner: ` owner-${index} `,
      }));
      const sequence = buildQualityClosureSequence({ steps });

      expect(sequence.status).toBe('READY_TO_ARCHIVE');
      expect(sequence.summary.total).toBe(order);
      expect(sequence.summary.ready).toBe(order);
      expect(sequence.activeStep).toBeUndefined();
      expect(sequence.steps[order - 1]).toMatchObject({ order, name: `${name}-${order - 1}`, owner: `owner-${order - 1}` });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch139-filtered-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'PENDING',
  ] as const))(
    'filters generated blank sequence names before ordering %s',
    (name, status) => {
      const sequence = buildQualityClosureSequence({
        steps: [
          { name: ' ', command: 'ignored', status: 'READY', expectedNextStatus: 'READY', owner: 'ignored' },
          { name: ` ${name} `, command: ` cmd-${name} `, status, expectedNextStatus: status, owner: ` owner-${name} ` },
        ],
      });

      expect(sequence.status).toBe('READY_TO_ARCHIVE');
      expect(sequence.summary.total).toBe(1);
      expect(sequence.steps).toHaveLength(1);
      expect(sequence.steps[0]).toMatchObject({ order: 1, name, command: `cmd-${name}`, owner: `owner-${name}` });
      expect(sequence.summary.actionRequired).toBe(status === 'ACTION_REQUIRED' ? 1 : 0);
      expect(sequence.summary.pending).toBe(status === 'PENDING' ? 1 : 0);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch145-step-${index}`,
    ['READY', 'READY_TO_CONFIRM', 'CONFIRMED', 'READY_TO_ARCHIVE', 'RESOLVED'][index % 5],
    new Date(Date.UTC(2026, 4, 11, 6, index % 60, index % 60)),
  ] as const))(
    'preserves generated green sequence timestamp %s',
    (name, status, generatedAt) => {
      const sequence = buildQualityClosureSequence({
        generatedAt,
        steps: [
          { name: ` ${name} `, command: ` cmd-${name} `, status, expectedNextStatus: status, owner: ` owner-${name} ` },
        ],
      });

      expect(sequence.generatedAt).toBe(generatedAt.toISOString());
      expect(sequence.status).toBe('READY_TO_ARCHIVE');
      expect(sequence.summary).toEqual({ total: 1, ready: 1, actionRequired: 0, pending: 0 });
      expect(sequence.activeStep).toBeUndefined();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch145-active-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'PENDING',
    index % 2 === 0 ? 'READY' : 'CONFIRMED',
  ] as const))(
    'marks generated first mismatched sequence step %s',
    (name, status, expectedNextStatus) => {
      const sequence = buildQualityClosureSequence({
        steps: [
          { name, command: `cmd-${name}`, status, expectedNextStatus, owner: `owner-${name}` },
          { name: `${name}-ready`, command: 'cmd-ready', status: 'READY', expectedNextStatus: 'READY', owner: 'owner-ready' },
        ],
      });

      expect(sequence.status).toBe('WAITING_FOR_EVIDENCE');
      expect(sequence.activeStep).toMatchObject({ order: 1, name, status, expectedNextStatus });
      expect(sequence.summary.actionRequired).toBe(status === 'ACTION_REQUIRED' ? 1 : 0);
      expect(sequence.summary.pending).toBe(status === 'PENDING' ? 1 : 0);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch154-step-${index}`,
    ['READY', 'READY_TO_CONFIRM', 'CONFIRMED', 'READY_TO_ARCHIVE', 'RESOLVED'][index % 5],
  ] as const))(
    'orders generated green sequence pair %s',
    (name, status) => {
      const sequence = buildQualityClosureSequence({
        steps: [
          { name: ' ', command: 'ignored', status: 'PENDING', expectedNextStatus: 'PENDING', owner: 'ignored' },
          { name: ` ${name}-a `, command: ` cmd-${name}-a `, status, expectedNextStatus: status, owner: ' owner-a ' },
          { name: `${name}-b`, command: `cmd-${name}-b`, status: 'READY', expectedNextStatus: 'READY', owner: 'owner-b' },
        ],
      });

      expect(sequence.status).toBe('READY_TO_ARCHIVE');
      expect(sequence.summary).toEqual({ total: 2, ready: 2, actionRequired: 0, pending: 0 });
      expect(sequence.activeStep).toBeUndefined();
      expect(sequence.steps.map((step) => step.order)).toEqual([1, 2]);
      expect(sequence.steps.map((step) => step.name)).toEqual([`${name}-a`, `${name}-b`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch154-active-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'PENDING',
    index % 2 === 0 ? 'READY' : 'CONFIRMED',
  ] as const))(
    'keeps generated active sequence step after ready prefix %s',
    (name, status, expectedNextStatus) => {
      const sequence = buildQualityClosureSequence({
        steps: [
          { name: 'ready-a', command: 'cmd-ready-a', status: 'READY', expectedNextStatus: 'READY', owner: 'owner-a' },
          { name: ` ${name} `, command: ` cmd-${name} `, status, expectedNextStatus, owner: ` owner-${name} ` },
          { name: `${name}-later`, command: 'cmd-later', status: 'PENDING', expectedNextStatus: 'CONFIRMED', owner: 'owner-later' },
        ],
      });

      expect(sequence.status).toBe('WAITING_FOR_EVIDENCE');
      expect(sequence.activeStep).toMatchObject({ order: 2, name, command: `cmd-${name}`, status, expectedNextStatus, owner: `owner-${name}` });
      expect(sequence.summary.ready).toBe(1);
      expect(sequence.summary.actionRequired).toBe(status === 'ACTION_REQUIRED' ? 1 : 0);
      expect(sequence.summary.pending).toBe(status === 'PENDING' ? 2 : 1);
    },
  );
});

describe('quality closure sequence batch 159 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch159-green-${index}`,
    ['READY', 'READY_TO_CONFIRM', 'CONFIRMED', 'READY_TO_ARCHIVE', 'RESOLVED'][index % 5],
  ] as const))(
    'keeps generated batch159 green sequence ready %s',
    (name, status) => {
      const sequence = buildQualityClosureSequence({
        steps: [
          { name: ' ', command: 'ignored', status: 'PENDING', expectedNextStatus: 'PENDING', owner: 'ignored' },
          { name: ` ${name}-a `, command: ` cmd-${name}-a `, status, expectedNextStatus: status, owner: ' owner-a ' },
          { name: `${name}-b`, command: `cmd-${name}-b`, status: 'RESOLVED', expectedNextStatus: 'RESOLVED', owner: 'owner-b' },
        ],
      });

      expect(sequence.status).toBe('READY_TO_ARCHIVE');
      expect(sequence.summary).toEqual({ total: 2, ready: 2, actionRequired: 0, pending: 0 });
      expect(sequence.activeStep).toBeUndefined();
      expect(sequence.steps.map((step) => step.order)).toEqual([1, 2]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch159-equal-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'PENDING',
  ] as const))(
    'counts generated batch159 non-green matched statuses without active step %s',
    (name, status) => {
      const sequence = buildQualityClosureSequence({
        steps: [
          { name: ` ${name} `, command: ` cmd-${name} `, status, expectedNextStatus: status, owner: ` owner-${name} ` },
          { name: `${name}-ready`, command: 'cmd-ready', status: 'READY', expectedNextStatus: 'READY', owner: 'owner-ready' },
        ],
      });

      expect(sequence.status).toBe('READY_TO_ARCHIVE');
      expect(sequence.activeStep).toBeUndefined();
      expect(sequence.summary.ready).toBe(1);
      expect(sequence.summary.actionRequired).toBe(status === 'ACTION_REQUIRED' ? 1 : 0);
      expect(sequence.summary.pending).toBe(status === 'PENDING' ? 1 : 0);
    },
  );
});

describe('quality closure sequence batch 176 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch176-sequence-${index}`,
    ['READY', 'READY_TO_CONFIRM', 'CONFIRMED', 'READY_TO_ARCHIVE', 'RESOLVED'][index % 5],
    new Date(Date.UTC(2026, 4, 11, 9, index % 60, index % 60)),
  ] as const))(
    'keeps generated batch176 green sequence normalized and archived %s',
    (name, status, generatedAt) => {
      const sequence = buildQualityClosureSequence({
        generatedAt,
        steps: [
          { name: ' ', command: 'ignored', status: 'PENDING', expectedNextStatus: 'PENDING', owner: 'ignored' },
          { name: ` ${name} `, command: ` cmd-${name} `, status, expectedNextStatus: status, owner: ` owner-${name} ` },
          { name: `${name}-resolved`, command: `cmd-${name}-resolved`, status: 'RESOLVED', expectedNextStatus: 'RESOLVED', owner: 'owner-resolved' },
        ],
      });

      expect(sequence.generatedAt).toBe(generatedAt.toISOString());
      expect(sequence.status).toBe('READY_TO_ARCHIVE');
      expect(sequence.summary).toEqual({ total: 2, ready: 2, actionRequired: 0, pending: 0 });
      expect(sequence.activeStep).toBeUndefined();
      expect(sequence.steps[0]).toMatchObject({ order: 1, name, command: `cmd-${name}`, status, owner: `owner-${name}` });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch176-active-${index}`,
    index % 2 === 0 ? 'ACTION_REQUIRED' : 'PENDING',
    index % 2 === 0 ? 'READY' : 'CONFIRMED',
  ] as const))(
    'keeps generated batch176 first mismatched sequence active %s',
    (name, status, expectedNextStatus) => {
      const sequence = buildQualityClosureSequence({
        steps: [
          { name: 'ready-before', command: 'cmd-ready', status: 'READY', expectedNextStatus: 'READY', owner: 'owner-ready' },
          { name: ` ${name} `, command: ` cmd-${name} `, status, expectedNextStatus, owner: ` owner-${name} ` },
          { name: `${name}-later`, command: 'cmd-later', status: 'PENDING', expectedNextStatus: 'READY', owner: 'owner-later' },
        ],
      });

      expect(sequence.status).toBe('WAITING_FOR_EVIDENCE');
      expect(sequence.activeStep).toMatchObject({ order: 2, name, command: `cmd-${name}`, status, expectedNextStatus, owner: `owner-${name}` });
      expect(sequence.summary.ready).toBe(1);
      expect(sequence.summary.actionRequired).toBe(status === 'ACTION_REQUIRED' ? 1 : 0);
      expect(sequence.summary.pending).toBe(status === 'PENDING' ? 2 : 1);
    },
  );
});
