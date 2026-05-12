import { describe, expect, it } from 'vitest';
import { buildQualityActionTracker } from './qualityActionTracker';

describe('quality action tracker builder', () => {
  it('tracks open and blocked quality follow-up actions with owners', () => {
    const tracker = buildQualityActionTracker({
      generatedAt: new Date('2026-05-06T03:00:00.000Z'),
      actions: [
        { task: '安排质量回顾会并确认团队 owner', owner: 'AI 代码守护人', dueDate: '2026-05-08', source: 'monthly audit run', status: 'OPEN' },
        { task: '规划 rebase/merge 策略', owner: 'release owner', dueDate: '2026-05-08', source: 'monthly audit run', status: 'OPEN' },
        { task: '确认分支保护和 PR 审查规则', owner: '产品负责人', dueDate: '2026-05-10', source: 'monthly audit run', status: 'BLOCKED', blocker: '需要仓库管理员权限' },
      ],
    });

    expect(tracker).toEqual({
      mode: 'QUALITY_ACTION_TRACKER',
      status: 'ACTION_REQUIRED',
      generatedAt: '2026-05-06T03:00:00.000Z',
      summary: {
        total: 3,
        open: 2,
        blocked: 1,
        done: 0,
        missingOwner: 0,
        missingDueDate: 0,
      },
      actions: [
        { task: '安排质量回顾会并确认团队 owner', owner: 'AI 代码守护人', dueDate: '2026-05-08', source: 'monthly audit run', status: 'OPEN' },
        { task: '规划 rebase/merge 策略', owner: 'release owner', dueDate: '2026-05-08', source: 'monthly audit run', status: 'OPEN' },
        { task: '确认分支保护和 PR 审查规则', owner: '产品负责人', dueDate: '2026-05-10', source: 'monthly audit run', status: 'BLOCKED', blocker: '需要仓库管理员权限' },
      ],
      blockers: ['确认分支保护和 PR 审查规则: 需要仓库管理员权限'],
    });
  });

  it('blocks the tracker when action owners or due dates are missing', () => {
    const tracker = buildQualityActionTracker({
      generatedAt: new Date('2026-05-06T03:00:00.000Z'),
      actions: [
        { task: '安排质量回顾会', owner: '', dueDate: '', source: 'monthly audit run', status: 'OPEN' },
      ],
    });

    expect(tracker.status).toBe('BLOCKED');
    expect(tracker.summary.missingOwner).toBe(1);
    expect(tracker.summary.missingDueDate).toBe(1);
    expect(tracker.blockers).toEqual([
      'action owner is missing: 安排质量回顾会',
      'action dueDate is missing: 安排质量回顾会',
    ]);
  });

  it('marks tracker DONE when all actions are done', () => {
    const tracker = buildQualityActionTracker({
      generatedAt: new Date('2026-05-06T03:00:00.000Z'),
      actions: [
        { task: '已完成回顾会', owner: 'AI 代码守护人', dueDate: '2026-05-08', source: 'audit', status: 'DONE' },
        { task: '已完成分支保护', owner: '产品负责人', dueDate: '2026-05-10', source: 'audit', status: 'DONE' },
      ],
    });

    expect(tracker.status).toBe('DONE');
    expect(tracker.summary.done).toBe(2);
    expect(tracker.summary.open).toBe(0);
    expect(tracker.summary.blocked).toBe(0);
    expect(tracker.blockers).toEqual([]);
  });

  it('filters out actions with empty task names', () => {
    const tracker = buildQualityActionTracker({
      generatedAt: new Date('2026-05-06T03:00:00.000Z'),
      actions: [
        { task: '  ', owner: 'o', dueDate: 'd', source: 's', status: 'OPEN' },
        { task: 'valid task', owner: 'o', dueDate: 'd', source: 's', status: 'DONE' },
      ],
    });

    expect(tracker.summary.total).toBe(1);
    expect(tracker.actions[0].task).toBe('valid task');
  });

  it('collects explicit blockers from BLOCKED actions', () => {
    const tracker = buildQualityActionTracker({
      generatedAt: new Date('2026-05-06T03:00:00.000Z'),
      actions: [
        { task: 'blocked task', owner: 'o', dueDate: 'd', source: 's', status: 'BLOCKED', blocker: '需要权限' },
      ],
    });

    expect(tracker.blockers).toEqual(['blocked task: 需要权限']);
    expect(tracker.summary.blocked).toBe(1);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const tracker = buildQualityActionTracker({ actions: [] });
    const after = new Date();

    const ts = new Date(tracker.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from action fields', () => {
    const tracker = buildQualityActionTracker({
      actions: [{
        task: '  task-1  ',
        owner: '  owner  ',
        dueDate: '  date  ',
        source: '  source  ',
        status: 'OPEN',
        blocker: '  reason  ',
      }],
    });

    expect(tracker.actions[0].task).toBe('task-1');
    expect(tracker.actions[0].owner).toBe('owner');
    expect(tracker.actions[0].source).toBe('source');
  });

  it('BLOCKED status takes priority over ACTION_REQUIRED', () => {
    const tracker = buildQualityActionTracker({
      actions: [{
        task: 'task-1', owner: '', dueDate: 'd', source: 's', status: 'OPEN',
      }],
    });

    expect(tracker.status).toBe('BLOCKED');
  });

  it('ACTION_REQUIRED when actions are OPEN with valid fields', () => {
    const tracker = buildQualityActionTracker({
      actions: [{
        task: 'task-1', owner: 'o', dueDate: 'd', source: 's', status: 'OPEN',
      }],
    });

    expect(tracker.status).toBe('ACTION_REQUIRED');
  });

  it('omits blocker field when empty after trim', () => {
    const tracker = buildQualityActionTracker({
      actions: [{
        task: 'task-1', owner: 'o', dueDate: 'd', source: 's', status: 'BLOCKED', blocker: '  ',
      }],
    });

    expect(tracker.actions[0].blocker).toBeUndefined();
  });

  it('mode is always QUALITY_ACTION_TRACKER', () => {
    const tracker = buildQualityActionTracker({ actions: [] });
    expect(tracker.mode).toBe('QUALITY_ACTION_TRACKER');
  });

  it('DONE actions are not blockers', () => {
    const tracker = buildQualityActionTracker({
      actions: [{
        task: 'task-1', owner: 'o', dueDate: 'd', source: 's', status: 'DONE',
      }],
    });

    expect(tracker.status).toBe('DONE');
    expect(tracker.summary.done).toBe(1);
    expect(tracker.blockers).toEqual([]);
  });

  it('generatedAt is valid ISO string', () => {
    const tracker = buildQualityActionTracker({ actions: [] });
    expect(new Date(tracker.generatedAt).toISOString()).toBe(tracker.generatedAt);
  });

  it('empty actions list returns DONE with zero summary', () => {
    const tracker = buildQualityActionTracker({ actions: [] });
    expect(tracker.status).toBe('DONE');
    expect(tracker.summary.total).toBe(0);
    expect(tracker.summary.open).toBe(0);
    expect(tracker.summary.blocked).toBe(0);
    expect(tracker.summary.done).toBe(0);
    expect(tracker.actions).toEqual([]);
  });

  it('collects blockers from missing owner and explicit blocker for same action', () => {
    const tracker = buildQualityActionTracker({
      actions: [{
        task: 'task-1', owner: '', dueDate: 'd', source: 's', status: 'BLOCKED', blocker: 'need access',
      }],
    });
    expect(tracker.blockers).toEqual([
      'action owner is missing: task-1',
      'task-1: need access',
    ]);
    expect(tracker.status).toBe('BLOCKED');
  });

  it('BLOCKED action without blocker message counts in summary but adds no explicit blocker', () => {
    const tracker = buildQualityActionTracker({
      actions: [{
        task: 'task-1', owner: 'o', dueDate: 'd', source: 's', status: 'BLOCKED',
      }],
    });

    expect(tracker.summary.blocked).toBe(1);
    expect(tracker.blockers).toEqual([]);
    expect(tracker.status).toBe('ACTION_REQUIRED');
  });

  it('trims blocker field to undefined when whitespace-only', () => {
    const tracker = buildQualityActionTracker({
      actions: [{
        task: 'task-1', owner: 'o', dueDate: 'd', source: 's', status: 'BLOCKED', blocker: '   ',
      }],
    });

    expect(tracker.actions[0].blocker).toBeUndefined();
    expect(tracker.blockers).toEqual([]);
  });

  it('ACTION_REQUIRED when all actions are BLOCKED with valid fields and blocker message', () => {
    const tracker = buildQualityActionTracker({
      actions: [{
        task: 'task-1', owner: 'o', dueDate: 'd', source: 's', status: 'BLOCKED', blocker: 'waiting on approval',
      }],
    });

    expect(tracker.status).toBe('ACTION_REQUIRED');
    expect(tracker.summary.blocked).toBe(1);
    expect(tracker.blockers).toEqual(['task-1: waiting on approval']);
  });

  it('preserves source field after trimming', () => {
    const tracker = buildQualityActionTracker({
      actions: [{
        task: 'task-1', owner: 'o', dueDate: 'd', source: '  audit-run  ', status: 'DONE',
      }],
    });

    expect(tracker.actions[0].source).toBe('audit-run');
    expect(tracker.status).toBe('DONE');
  });

  it('action with undefined blocker field does not appear in blockers', () => {
    const tracker = buildQualityActionTracker({
      actions: [{
        task: 'task-1', owner: 'o', dueDate: 'd', source: 's', status: 'BLOCKED',
      }],
    });

    expect(tracker.actions[0].blocker).toBeUndefined();
    expect(tracker.blockers).toEqual([]);
    expect(tracker.summary.blocked).toBe(1);
  });

  it('tracker with open actions has ACTION_REQUIRED status', () => {
    const tracker = buildQualityActionTracker({
      actions: [{ task: 't', owner: 'o', dueDate: 'd', source: 's', status: 'OPEN' }],
    });
    expect(tracker.status).toBe('ACTION_REQUIRED');
    expect(tracker.summary.total).toBe(1);
    expect(tracker.summary.open).toBe(1);
  });

  it('tracker returns empty summary for no actions', () => {
    const tracker = buildQualityActionTracker({ actions: [] });
    expect(tracker.summary.total).toBe(0);
    expect(tracker.summary.open).toBe(0);
  });


  it('tracker with single action returns correct counts', () => {
    const tracker = buildQualityActionTracker({ actions: [{ task: 'Test action', owner: 'u1', dueDate: '2026-06-01', source: 'manual', status: 'OPEN' }] });
    expect(tracker.summary.total).toBe(1);
    expect(tracker.summary.open).toBe(1);
  });

  it('buildQualityActionTracker handles empty actions array', () => { const tracker = buildQualityActionTracker({ actions: [] }); expect(tracker.summary.total).toBe(0); });

  it('buildQualityActionTracker handles single action', () => { const tracker = buildQualityActionTracker({ actions: [{ task: 'test', owner: 'admin', dueDate: '', source: '', status: 'OPEN' }] }); expect(tracker.summary.total).toBe(1); });

  it('buildQualityActionTracker counts BLOCKED actions', () => { const tracker = buildQualityActionTracker({ actions: [{ task: 'a', owner: 'x', dueDate: '', source: '', status: 'BLOCKED' }] }); expect(tracker.summary.blocked).toBe(1); });

  it('buildQualityActionTracker counts OPEN actions', () => { const tracker = buildQualityActionTracker({ actions: [{ task: 'a', owner: 'x', dueDate: '', source: '', status: 'OPEN' }] }); expect(tracker.summary.open).toBe(1); });

  it('buildQualityActionTracker counts DONE actions', () => { const tracker = buildQualityActionTracker({ actions: [{ task: 'a', owner: 'x', dueDate: '', source: '', status: 'DONE' }] }); expect(tracker.summary.done).toBe(1); });

  it('buildQualityActionTracker handles mixed status actions', () => { const tracker = buildQualityActionTracker({ actions: [{ task: 'a', owner: 'x', dueDate: '', source: '', status: 'OPEN' }, { task: 'b', owner: 'y', dueDate: '', source: '', status: 'DONE' }, { task: 'c', owner: 'z', dueDate: '', source: '', status: 'BLOCKED' }] }); expect(tracker.summary.total).toBe(3); });

  it('buildQualityActionTracker handles empty actions array', () => { const tracker = buildQualityActionTracker({ actions: [] }); expect(tracker.summary.total).toBe(0); });

  it('buildQualityActionTracker counts OPEN actions correctly', () => { const tracker = buildQualityActionTracker({ actions: [{ task: 'a', owner: 'x', dueDate: '', source: '', status: 'OPEN' }, { task: 'b', owner: 'y', dueDate: '', source: '', status: 'OPEN' }] }); expect(tracker.summary.total).toBe(2); });

  it('buildQualityActionTracker counts DONE actions correctly', () => { const tracker = buildQualityActionTracker({ actions: [{ task: 'a', owner: 'x', dueDate: '', source: '', status: 'DONE' }] }); expect(tracker.summary.total).toBe(1); });

  it('buildQualityActionTracker handles empty actions array', () => { const tracker = buildQualityActionTracker({ actions: [] }); expect(tracker.summary.total).toBe(0); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch95-task-${index}`,
    index % 3 === 0 ? 'OPEN' : index % 3 === 1 ? 'BLOCKED' : 'DONE',
  ] as const))(
    'summarizes generated action %s with status %s',
    (task, status) => {
      const tracker = buildQualityActionTracker({
        actions: [{
          task: ` ${task} `,
          owner: ' owner ',
          dueDate: ' 2026-05-10 ',
          source: ' batch95 ',
          status,
          blocker: status === 'BLOCKED' ? ' waiting ' : undefined,
        }],
      });

      expect(tracker.summary.total).toBe(1);
      expect(tracker.actions[0].task).toBe(task);
      expect(tracker.actions[0].owner).toBe('owner');
      expect(tracker.status).toBe(status === 'DONE' ? 'DONE' : 'ACTION_REQUIRED');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `batch95-missing-${index}`))(
    'blocks generated action with missing owner and due date %s',
    (task) => {
      const tracker = buildQualityActionTracker({
        actions: [{ task, owner: ' ', dueDate: ' ', source: 's', status: 'OPEN' }],
      });

      expect(tracker.status).toBe('BLOCKED');
      expect(tracker.summary.missingOwner).toBe(1);
      expect(tracker.summary.missingDueDate).toBe(1);
      expect(tracker.blockers).toEqual([
        `action owner is missing: ${task}`,
        `action dueDate is missing: ${task}`,
      ]);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch123-action-${index}`,
    ['OPEN', 'BLOCKED', 'DONE'][index % 3],
  ] as const))(
    'summarizes generated complete action %s as %s',
    (task, status) => {
      const tracker = buildQualityActionTracker({
        actions: [{
          task: ` ${task} `,
          owner: ` owner-${task} `,
          dueDate: ' 2026-05-12 ',
          source: ' batch123 ',
          status,
          blocker: status === 'BLOCKED' ? ` blocker-${task} ` : undefined,
        }],
      });

      expect(tracker.summary.total).toBe(1);
      expect(tracker.summary.open).toBe(status === 'OPEN' ? 1 : 0);
      expect(tracker.summary.blocked).toBe(status === 'BLOCKED' ? 1 : 0);
      expect(tracker.summary.done).toBe(status === 'DONE' ? 1 : 0);
      expect(tracker.actions[0].task).toBe(task);
      expect(tracker.actions[0].source).toBe('batch123');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch123-blocked-${index}`,
    index % 2 === 0 ? 'owner' : ' ',
  ] as const))(
    'reports generated blocked action metadata %s',
    (task, owner) => {
      const tracker = buildQualityActionTracker({
        actions: [{
          task,
          owner,
          dueDate: '2026-05-12',
          source: 'batch123',
          status: 'BLOCKED',
          blocker: `reason-${task}`,
        }],
      });

      expect(tracker.summary.blocked).toBe(1);
      expect(tracker.blockers).toContain(`${task}: reason-${task}`);
      expect(tracker.status).toBe(owner.trim() ? 'ACTION_REQUIRED' : 'BLOCKED');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch142-done-${index}`,
    `owner-${index}`,
    `2026-06-${String((index % 20) + 1).padStart(2, '0')}`,
  ] as const))(
    'summarizes generated done action %s',
    (task, owner, dueDate) => {
      const tracker = buildQualityActionTracker({
        actions: [
          { task: ` ${task} `, owner: ` ${owner} `, dueDate: ` ${dueDate} `, source: ' batch142 ', status: 'DONE' },
          { task: ' ', owner: 'ignored', dueDate: 'ignored', source: 'ignored', status: 'OPEN' },
        ],
      });

      expect(tracker.status).toBe('DONE');
      expect(tracker.summary).toEqual({ total: 1, open: 0, blocked: 0, done: 1, missingOwner: 0, missingDueDate: 0 });
      expect(tracker.actions[0]).toMatchObject({ task, owner, dueDate, source: 'batch142' });
      expect(tracker.blockers).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch142-metadata-${index}`,
    index % 2 === 0 ? ' ' : `owner-${index}`,
    index % 3 === 0 ? ' ' : `2026-07-${String((index % 20) + 1).padStart(2, '0')}`,
    index % 4 === 0 ? ` blocker-${index} ` : ' ',
  ] as const))(
    'reports generated metadata blockers for %s',
    (task, owner, dueDate, blocker) => {
      const tracker = buildQualityActionTracker({
        actions: [{ task, owner, dueDate, source: 'batch142', status: 'BLOCKED', blocker }],
      });
      const expectedBlockers = [
        owner.trim() ? undefined : `action owner is missing: ${task}`,
        dueDate.trim() ? undefined : `action dueDate is missing: ${task}`,
        blocker.trim() ? `${task}: ${blocker.trim()}` : undefined,
      ].filter(Boolean);

      expect(tracker.status).toBe(owner.trim() && dueDate.trim() ? 'ACTION_REQUIRED' : 'BLOCKED');
      expect(tracker.summary.blocked).toBe(1);
      expect(tracker.blockers).toEqual(expectedBlockers);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch148-open-${index}`,
    `batch148-done-${index}`,
  ] as const))(
    'prioritizes generated open action over done status %s',
    (openTask, doneTask) => {
      const tracker = buildQualityActionTracker({
        actions: [
          { task: ` ${openTask} `, owner: ' owner ', dueDate: ' 2026-08-01 ', source: ' batch148 ', status: 'OPEN' },
          { task: doneTask, owner: 'owner', dueDate: '2026-08-02', source: 'batch148', status: 'DONE' },
          { task: ' ', owner: 'ignored', dueDate: 'ignored', source: 'ignored', status: 'BLOCKED' },
        ],
      });

      expect(tracker.status).toBe('ACTION_REQUIRED');
      expect(tracker.summary).toEqual({ total: 2, open: 1, blocked: 0, done: 1, missingOwner: 0, missingDueDate: 0 });
      expect(tracker.actions.map((action) => action.task)).toEqual([openTask, doneTask]);
      expect(tracker.blockers).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch148-blocked-${index}`,
    index % 2 === 0 ? ` blocker-${index} ` : undefined,
  ] as const))(
    'keeps generated blocked action without explicit blocker text %s',
    (task, blocker) => {
      const tracker = buildQualityActionTracker({
        actions: [{ task, owner: 'owner', dueDate: '2026-08-01', source: 'batch148', status: 'BLOCKED', blocker }],
      });

      expect(tracker.status).toBe('ACTION_REQUIRED');
      expect(tracker.summary.blocked).toBe(1);
      expect(tracker.blockers).toEqual(blocker ? [`${task}: ${blocker.trim()}`] : []);
      expect(tracker.actions[0].blocker).toBe(blocker?.trim() || undefined);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch153-open-${index}`,
    `batch153-blocked-${index}`,
    `batch153-done-${index}`,
  ] as const))(
    'summarizes generated mixed action set %s/%s/%s',
    (openTask, blockedTask, doneTask) => {
      const tracker = buildQualityActionTracker({
        actions: [
          { task: ' ', owner: 'ignored', dueDate: 'ignored', source: 'ignored', status: 'OPEN' },
          { task: openTask, owner: 'owner-open', dueDate: '2026-09-01', source: 'batch153', status: 'OPEN' },
          { task: blockedTask, owner: 'owner-blocked', dueDate: '2026-09-02', source: 'batch153', status: 'BLOCKED', blocker: ' waiting ' },
          { task: doneTask, owner: 'owner-done', dueDate: '2026-09-03', source: 'batch153', status: 'DONE' },
        ],
      });

      expect(tracker.status).toBe('ACTION_REQUIRED');
      expect(tracker.summary).toEqual({ total: 3, open: 1, blocked: 1, done: 1, missingOwner: 0, missingDueDate: 0 });
      expect(tracker.actions.map((action) => action.task)).toEqual([openTask, blockedTask, doneTask]);
      expect(tracker.blockers).toEqual([`${blockedTask}: waiting`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch153-gap-${index}`,
    index % 2 === 0 ? ' ' : `owner-${index}`,
    index % 3 === 0 ? ' ' : `2026-09-${String((index % 20) + 1).padStart(2, '0')}`,
    index % 4 === 0 ? ` blocker-${index} ` : undefined,
  ] as const))(
    'keeps generated action blocker order for %s',
    (task, owner, dueDate, blocker) => {
      const tracker = buildQualityActionTracker({
        actions: [{ task: ` ${task} `, owner, dueDate, source: ' batch153 ', status: 'BLOCKED', blocker }],
      });
      const expectedBlockers = [
        owner.trim() ? undefined : `action owner is missing: ${task}`,
        dueDate.trim() ? undefined : `action dueDate is missing: ${task}`,
        blocker ? `${task}: ${blocker.trim()}` : undefined,
      ].filter(Boolean);

      expect(tracker.actions[0]).toMatchObject({ task, owner: owner.trim(), dueDate: dueDate.trim(), source: 'batch153' });
      expect(tracker.status).toBe(owner.trim() && dueDate.trim() ? 'ACTION_REQUIRED' : 'BLOCKED');
      expect(tracker.blockers).toEqual(expectedBlockers);
      expect(tracker.summary.missingOwner).toBe(owner.trim() ? 0 : 1);
      expect(tracker.summary.missingDueDate).toBe(dueDate.trim() ? 0 : 1);
    },
  );
});

describe('quality action tracker builder batch 168 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch168-done-${index}`,
    `owner-${index}`,
    `2026-10-${String((index % 28) + 1).padStart(2, '0')}`,
  ] as const))(
    'keeps generated single done action complete %s',
    (task, owner, dueDate) => {
      const tracker = buildQualityActionTracker({
        actions: [
          { task: ' ', owner: 'ignored', dueDate: 'ignored', source: 'ignored', status: 'OPEN' },
          { task: ` ${task} `, owner: ` ${owner} `, dueDate: ` ${dueDate} `, source: ' batch168 ', status: 'DONE' },
        ],
      });

      expect(tracker.status).toBe('DONE');
      expect(tracker.summary).toEqual({
        total: 1,
        open: 0,
        blocked: 0,
        done: 1,
        missingOwner: 0,
        missingDueDate: 0,
      });
      expect(tracker.actions[0]).toMatchObject({ task, owner, dueDate, source: 'batch168' });
      expect(tracker.blockers).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch168-blocked-${index}`,
    index % 2 === 0 ? ' ' : `owner-${index}`,
    index % 3 === 0 ? ' ' : `2026-10-${String((index % 28) + 1).padStart(2, '0')}`,
    index % 4 === 0 ? ` blocker-${index} ` : undefined,
  ] as const))(
    'reports generated blocked action metadata in stable order %s',
    (task, owner, dueDate, blocker) => {
      const tracker = buildQualityActionTracker({
        actions: [{ task, owner, dueDate, source: ' batch168 ', status: 'BLOCKED', blocker }],
      });
      const expectedBlockers = [
        owner.trim() ? undefined : `action owner is missing: ${task}`,
        dueDate.trim() ? undefined : `action dueDate is missing: ${task}`,
        blocker ? `${task}: ${blocker.trim()}` : undefined,
      ].filter(Boolean);

      expect(tracker.status).toBe(owner.trim() && dueDate.trim() ? 'ACTION_REQUIRED' : 'BLOCKED');
      expect(tracker.summary.blocked).toBe(1);
      expect(tracker.blockers).toEqual(expectedBlockers);
      expect(tracker.actions[0].source).toBe('batch168');
    },
  );
});
