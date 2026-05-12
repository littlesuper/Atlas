import { describe, expect, it } from 'vitest';
import { buildConfirmedWeek8HandoffPack, buildWeek8HandoffPack } from './week8HandoffPack';

describe('week 8 handoff pack builder', () => {
  it('packages remaining team confirmations with owners and due dates', () => {
    const pack = buildWeek8HandoffPack({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      items: [
        { topic: '质量回顾会实会确认', owner: 'AI 代码守护人', dueDate: '2026-05-08', status: 'PENDING', decisionRequired: '确认 Week 8 action tracker 和季度目标' },
        { topic: '分支保护和 PR 审查规则', owner: '产品负责人', dueDate: '2026-05-10', status: 'BLOCKED', decisionRequired: '确认仓库管理员执行人', blocker: '需要仓库管理员权限' },
        { topic: 'rebase/merge 策略', owner: 'release owner', dueDate: '2026-05-08', status: 'PENDING', decisionRequired: '确认 main 落后 61 个提交的收口策略' },
      ],
    });

    expect(pack).toEqual({
      mode: 'WEEK8_HANDOFF_PACK',
      status: 'ACTION_REQUIRED',
      generatedAt: '2026-05-06T05:00:00.000Z',
      summary: {
        total: 3,
        pending: 2,
        blocked: 1,
        confirmed: 0,
        missingOwner: 0,
        missingDueDate: 0,
      },
      items: [
        { topic: '质量回顾会实会确认', owner: 'AI 代码守护人', dueDate: '2026-05-08', status: 'PENDING', decisionRequired: '确认 Week 8 action tracker 和季度目标' },
        { topic: '分支保护和 PR 审查规则', owner: '产品负责人', dueDate: '2026-05-10', status: 'BLOCKED', decisionRequired: '确认仓库管理员执行人', blocker: '需要仓库管理员权限' },
        { topic: 'rebase/merge 策略', owner: 'release owner', dueDate: '2026-05-08', status: 'PENDING', decisionRequired: '确认 main 落后 61 个提交的收口策略' },
      ],
      blockers: ['分支保护和 PR 审查规则: 需要仓库管理员权限'],
    });
  });

  it('blocks the handoff pack when owner or due date is missing', () => {
    const pack = buildWeek8HandoffPack({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      items: [
        { topic: '质量回顾会实会确认', owner: '', dueDate: '', status: 'PENDING', decisionRequired: '确认 owner' },
      ],
    });

    expect(pack.status).toBe('BLOCKED');
    expect(pack.blockers).toEqual([
      'handoff owner is missing: 质量回顾会实会确认',
      'handoff dueDate is missing: 质量回顾会实会确认',
    ]);
  });

  it('builds a confirmed handoff pack after team decisions are recorded', () => {
    const pack = buildConfirmedWeek8HandoffPack({
      generatedAt: new Date('2026-05-06T06:00:00.000Z'),
      confirmations: [
        { topic: '质量回顾会实会确认', owner: 'AI 代码守护人', confirmedAt: '2026-05-08', decision: '确认 Week 8 action tracker 和季度目标' },
        { topic: '分支保护和 PR 审查规则', owner: '产品负责人', confirmedAt: '2026-05-10', decision: '由仓库管理员落地 GitHub Settings' },
      ],
    });

    expect(pack.status).toBe('CONFIRMED');
    expect(pack.summary.confirmed).toBe(2);
    expect(pack.items).toEqual([
      {
        topic: '质量回顾会实会确认',
        owner: 'AI 代码守护人',
        dueDate: '2026-05-08',
        status: 'CONFIRMED',
        decisionRequired: '确认 Week 8 action tracker 和季度目标',
      },
      {
        topic: '分支保护和 PR 审查规则',
        owner: '产品负责人',
        dueDate: '2026-05-10',
        status: 'CONFIRMED',
        decisionRequired: '由仓库管理员落地 GitHub Settings',
      },
    ]);
  });

  it('returns CONFIRMED when all items are confirmed', () => {
    const pack = buildWeek8HandoffPack({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      items: [
        { topic: 'topic-1', owner: 'o1', dueDate: '2026-05-08', status: 'CONFIRMED', decisionRequired: 'd1' },
        { topic: 'topic-2', owner: 'o2', dueDate: '2026-05-10', status: 'CONFIRMED', decisionRequired: 'd2' },
      ],
    });

    expect(pack.status).toBe('CONFIRMED');
    expect(pack.summary.confirmed).toBe(2);
    expect(pack.blockers).toEqual([]);
  });

  it('is CONFIRMED with empty items', () => {
    const pack = buildWeek8HandoffPack({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      items: [],
    });

    expect(pack.status).toBe('CONFIRMED');
    expect(pack.summary.total).toBe(0);
  });

  it('filters out items with empty topics', () => {
    const pack = buildWeek8HandoffPack({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      items: [
        { topic: '  ', owner: 'o', dueDate: 'd', status: 'CONFIRMED', decisionRequired: 'dec' },
        { topic: 'valid', owner: 'o', dueDate: 'd', status: 'CONFIRMED', decisionRequired: 'dec' },
      ],
    });

    expect(pack.summary.total).toBe(1);
    expect(pack.items[0].topic).toBe('valid');
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const pack = buildWeek8HandoffPack({ items: [] });
    const after = new Date();

    const ts = new Date(pack.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from item fields', () => {
    const pack = buildWeek8HandoffPack({
      items: [{
        topic: '  topic-1  ',
        owner: '  owner  ',
        dueDate: '  date  ',
        status: 'PENDING',
        decisionRequired: '  decision  ',
        blocker: '  reason  ',
      }],
    });

    expect(pack.items[0].topic).toBe('topic-1');
    expect(pack.items[0].owner).toBe('owner');
    expect(pack.items[0].decisionRequired).toBe('decision');
    expect(pack.items[0].blocker).toBe('reason');
  });

  it('BLOCKED takes priority over ACTION_REQUIRED', () => {
    const pack = buildWeek8HandoffPack({
      items: [{
        topic: 't', owner: '', dueDate: 'd', status: 'PENDING', decisionRequired: 'dec',
      }],
    });

    expect(pack.status).toBe('BLOCKED');
  });

  it('buildConfirmedWeek8HandoffPack maps confirmations correctly', () => {
    const pack = buildConfirmedWeek8HandoffPack({
      confirmations: [
        { topic: 'topic-a', owner: 'owner-a', confirmedAt: '2026-05-08', decision: 'decided' },
      ],
    });

    expect(pack.items[0].status).toBe('CONFIRMED');
    expect(pack.items[0].dueDate).toBe('2026-05-08');
    expect(pack.items[0].decisionRequired).toBe('decided');
    expect(pack.status).toBe('CONFIRMED');
  });

  it('omits blocker when empty after trim', () => {
    const pack = buildWeek8HandoffPack({
      items: [{
        topic: 't', owner: 'o', dueDate: 'd', status: 'BLOCKED', decisionRequired: 'dec', blocker: '  ',
      }],
    });

    expect(pack.items[0].blocker).toBeUndefined();
  });

  it('mode is always WEEK8_HANDOFF_PACK', () => {
    const pack = buildWeek8HandoffPack({ items: [] });
    expect(pack.mode).toBe('WEEK8_HANDOFF_PACK');
  });

  it('empty items produce CONFIRMED status', () => {
    const pack = buildWeek8HandoffPack({ items: [] });
    expect(pack.status).toBe('CONFIRMED');
    expect(pack.summary.total).toBe(0);
    expect(pack.blockers).toEqual([]);
  });

  it('buildConfirmedWeek8HandoffPack maps confirmations to CONFIRMED items', () => {
    const pack = buildConfirmedWeek8HandoffPack({
      confirmations: [
        { topic: 'topic-a', owner: 'owner-a', confirmedAt: '2026-05-08', decision: 'approved' },
        { topic: 'topic-b', owner: 'owner-b', confirmedAt: '2026-05-09', decision: 'deferred' },
      ],
    });

    expect(pack.status).toBe('CONFIRMED');
    expect(pack.summary.confirmed).toBe(2);
    expect(pack.items[0].decisionRequired).toBe('approved');
  });

  it('blocks when owner is missing but dueDate is present', () => {
    const pack = buildWeek8HandoffPack({
      items: [{
        topic: 't', owner: '', dueDate: '2026-05-10', status: 'CONFIRMED', decisionRequired: 'dec',
      }],
    });

    expect(pack.status).toBe('BLOCKED');
    expect(pack.summary.missingOwner).toBe(1);
    expect(pack.summary.missingDueDate).toBe(0);
    expect(pack.blockers).toEqual(['handoff owner is missing: t']);
  });

  it('blocks when dueDate is missing but owner is present', () => {
    const pack = buildWeek8HandoffPack({
      items: [{
        topic: 't', owner: 'owner-x', dueDate: '', status: 'CONFIRMED', decisionRequired: 'dec',
      }],
    });

    expect(pack.status).toBe('BLOCKED');
    expect(pack.summary.missingDueDate).toBe(1);
    expect(pack.summary.missingOwner).toBe(0);
    expect(pack.blockers).toEqual(['handoff dueDate is missing: t']);
  });

  it('buildConfirmedWeek8HandoffPack with empty confirmations returns CONFIRMED with zero items', () => {
    const pack = buildConfirmedWeek8HandoffPack({ confirmations: [] });

    expect(pack.status).toBe('CONFIRMED');
    expect(pack.summary.total).toBe(0);
    expect(pack.summary.confirmed).toBe(0);
    expect(pack.items).toEqual([]);
    expect(pack.blockers).toEqual([]);
  });

  it('BLOCKED item without blocker field does not add explicit blocker', () => {
    const pack = buildWeek8HandoffPack({
      items: [{
        topic: 't', owner: 'o', dueDate: 'd', status: 'BLOCKED', decisionRequired: 'dec',
      }],
    });

    expect(pack.status).toBe('ACTION_REQUIRED');
    expect(pack.summary.blocked).toBe(1);
    expect(pack.blockers).toEqual([]);
  });

  it('CONFIRMED item with whitespace-only owner triggers BLOCKED status', () => {
    const pack = buildWeek8HandoffPack({
      items: [{
        topic: 't', owner: '   ', dueDate: '2026-05-10', status: 'CONFIRMED', decisionRequired: 'dec',
      }],
    });

    expect(pack.status).toBe('BLOCKED');
    expect(pack.summary.missingOwner).toBe(1);
    expect(pack.blockers).toEqual(['handoff owner is missing: t']);
  });

  it('buildConfirmedWeek8HandoffPack creates CONFIRMED items from confirmations', () => {
    const pack = buildConfirmedWeek8HandoffPack({
      confirmations: [
        { topic: 'topic-a', owner: 'owner-a', confirmedAt: '2026-05-08', decision: 'approved' },
      ],
    });

    expect(pack.status).toBe('CONFIRMED');
    expect(pack.items).toHaveLength(1);
    expect(pack.items[0].status).toBe('CONFIRMED');
    expect(pack.items[0].topic).toBe('topic-a');
  });

  it('buildConfirmedWeek8HandoffPack with empty confirmations produces CONFIRMED status', () => {
    const pack = buildConfirmedWeek8HandoffPack({ confirmations: [] });
    expect(pack.status).toBe('CONFIRMED');
    expect(pack.items).toEqual([]);
  });

  it('handoff pack mode is WEEK8_HANDOFF_PACK', () => {
    const pack = buildConfirmedWeek8HandoffPack({ confirmations: [] });
    expect(pack.mode).toBe('WEEK8_HANDOFF_PACK');
  });

  it('pack with no deliverables returns empty array', () => {
    const pack = buildWeek8HandoffPack({ items: [] });
    expect(pack.summary.total).toBe(0);
  });

  it('pack with single item returns correct total', () => {
    const pack = buildWeek8HandoffPack({ items: [{ topic: 'Item', owner: 'u1', dueDate: '2026-06-01', status: 'CONFIRMED', decisionRequired: 'approve' }] });
    expect(pack.summary.total).toBe(1);
  });

  it('pack with empty items returns zero total', () => { const pack = buildWeek8HandoffPack({ items: [] }); expect(pack.summary.total).toBe(0); });

  it('pack with single item returns count of one', () => { const pack = buildWeek8HandoffPack({ items: [{ topic: 'item1', owner: 'admin', dueDate: '', status: 'PENDING', decisionRequired: '' }] }); expect(pack.summary.total).toBe(1); });

  it('pack with CONFIRMED items counts correctly', () => { const pack = buildWeek8HandoffPack({ items: [{ topic: 'item1', owner: 'admin', dueDate: '', status: 'CONFIRMED', decisionRequired: '' }, { topic: 'item2', owner: 'admin', dueDate: '', status: 'PENDING', decisionRequired: '' }] }); expect(pack.summary.confirmed).toBe(1); expect(pack.summary.total).toBe(2); });

  it('pack with all confirmed items has zero pending', () => { const pack = buildWeek8HandoffPack({ items: [{ topic: 't1', owner: 'admin', dueDate: '', status: 'CONFIRMED', decisionRequired: '' }] }); expect(pack.summary.confirmed).toBe(1); expect(pack.summary.pending).toBe(0); });

  it('pack with all pending items has zero confirmed', () => { const pack = buildWeek8HandoffPack({ items: [{ topic: 't1', owner: 'admin', dueDate: '', status: 'PENDING', decisionRequired: '' }] }); expect(pack.summary.pending).toBe(1); expect(pack.summary.confirmed).toBe(0); });

  it('pack mode is WEEK8_HANDOFF_PACK', () => { const pack = buildWeek8HandoffPack({ items: [] }); expect(pack.mode).toBe('WEEK8_HANDOFF_PACK'); });

  it('pack with empty items has zero total', () => { const pack = buildWeek8HandoffPack({ items: [] }); expect(pack.summary.total).toBe(0); });

  it('pack with single item has total one', () => { const pack = buildWeek8HandoffPack({ items: [{ topic: 't1', owner: 'admin', dueDate: '2026-01-01', status: 'PENDING', decisionRequired: 'approve' }] }); expect(pack.summary.total).toBe(1); });

  it('pack with multiple items preserves count', () => { const pack = buildWeek8HandoffPack({ items: [{ topic: 't1', owner: 'admin', dueDate: '2026-01-01', status: 'PENDING', decisionRequired: 'approve' }, { topic: 't2', owner: 'user', dueDate: '2026-01-02', status: 'DONE', decisionRequired: '' }] }); expect(pack.summary.total).toBe(2); });

  it('pack with empty items returns valid', () => { const pack = buildWeek8HandoffPack({ items: [] }); expect(pack.summary.total).toBe(0); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `topic-${index}`,
    `owner-${index}`,
    `2026-05-${String((index % 28) + 1).padStart(2, '0')}`,
    `decision-${index}`,
  ]))('maps confirmed handoff confirmation %s into a confirmed item', (topic, owner, confirmedAt, decision) => {
    const pack = buildConfirmedWeek8HandoffPack({
      confirmations: [{ topic: ` ${topic} `, owner: ` ${owner} `, confirmedAt: ` ${confirmedAt} `, decision: ` ${decision} ` }],
    });

    expect(pack.status).toBe('CONFIRMED');
    expect(pack.summary.confirmed).toBe(1);
    expect(pack.blockers).toEqual([]);
    expect(pack.items[0]).toEqual({
      topic,
      owner,
      dueDate: confirmedAt,
      status: 'CONFIRMED',
      decisionRequired: decision,
    });
  });

  it.each(Array.from({ length: 60 }, (_, index) => {
    const missingOwner = index % 3 !== 1;
    const missingDueDate = index % 3 !== 2;
    return [
      `handoff-${index}`,
      missingOwner ? '   ' : `owner-${index}`,
      missingDueDate ? '   ' : `2026-06-${String((index % 28) + 1).padStart(2, '0')}`,
      missingOwner,
      missingDueDate,
    ] as const;
  }))('blocks handoff item %s when owner or due date is missing', (topic, owner, dueDate, missingOwner, missingDueDate) => {
    const pack = buildWeek8HandoffPack({
      items: [{ topic, owner, dueDate, status: 'CONFIRMED', decisionRequired: 'decision' }],
    });
    const expectedBlockers = [
      missingOwner ? `handoff owner is missing: ${topic}` : undefined,
      missingDueDate ? `handoff dueDate is missing: ${topic}` : undefined,
    ].filter(Boolean);

    expect(pack.status).toBe('BLOCKED');
    expect(pack.summary.missingOwner).toBe(missingOwner ? 1 : 0);
    expect(pack.summary.missingDueDate).toBe(missingDueDate ? 1 : 0);
    expect(pack.blockers).toEqual(expectedBlockers);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch143-topic-${index}`,
    ['PENDING', 'BLOCKED', 'CONFIRMED'][index % 3],
    index % 3 === 1 ? ` blocker-${index} ` : ' ',
  ] as const))(
    'summarizes generated handoff status %s as %s',
    (topic, status, blocker) => {
      const pack = buildWeek8HandoffPack({
        items: [{
          topic: ` ${topic} `,
          owner: ' owner ',
          dueDate: ' 2026-05-20 ',
          status,
          decisionRequired: ' decision ',
          blocker,
        }],
      });

      expect(pack.summary.total).toBe(1);
      expect(pack.summary.pending).toBe(status === 'PENDING' ? 1 : 0);
      expect(pack.summary.blocked).toBe(status === 'BLOCKED' ? 1 : 0);
      expect(pack.summary.confirmed).toBe(status === 'CONFIRMED' ? 1 : 0);
      expect(pack.items[0].topic).toBe(topic);
      expect(pack.status).toBe(status === 'CONFIRMED' ? 'CONFIRMED' : 'ACTION_REQUIRED');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch143-blocker-${index}`,
    `owner-${index}`,
    `2026-06-${String((index % 20) + 1).padStart(2, '0')}`,
    `waiting-${index}`,
  ] as const))(
    'records generated explicit handoff blocker %s',
    (topic, owner, dueDate, blocker) => {
      const pack = buildWeek8HandoffPack({
        items: [{ topic, owner, dueDate, status: 'BLOCKED', decisionRequired: 'decision', blocker: ` ${blocker} ` }],
      });

      expect(pack.status).toBe('ACTION_REQUIRED');
      expect(pack.summary.blocked).toBe(1);
      expect(pack.blockers).toEqual([`${topic}: ${blocker}`]);
      expect(pack.items[0].blocker).toBe(blocker);
    },
  );
});
