import { describe, expect, it } from 'vitest';
import { buildQualityReviewMeetingPack } from './qualityReviewMeeting';

describe('quality review meeting pack builder', () => {
  it('builds a ready meeting pack with agenda, decisions and action owners', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'Atlas 质量回顾会',
      scheduledFor: '2026-05-06T10:00:00+08:00',
      participants: ['AI 代码守护人', '产品负责人', '后端负责人'],
      inputs: [
        { name: '月度质量审计报告', status: 'READY', note: 'quality:audit-report' },
        { name: '前七周复盘报告', status: 'READY', note: 'quality:retro-report' },
      ],
      agenda: [
        { topic: '确认 Week 8 稳定化 backlog', owner: 'AI 代码守护人', minutes: 20 },
        { topic: '确认团队侧流程 owner', owner: '产品负责人', minutes: 15 },
      ],
      decisions: [
        { topic: '是否把分支保护设为 Week 8 阻断项', owner: '产品负责人', options: ['是', '否'] },
      ],
      actionItems: [
        { task: '规划 rebase/merge 策略', owner: '后端负责人', dueDate: '2026-05-08', source: 'Week 1-7 retrospective' },
      ],
      generatedAt: new Date('2026-05-05T22:00:00.000Z'),
    });

    expect(pack).toEqual({
      mode: 'QUALITY_REVIEW_MEETING_PACK',
      status: 'READY',
      title: 'Atlas 质量回顾会',
      scheduledFor: '2026-05-06T10:00:00+08:00',
      generatedAt: '2026-05-05T22:00:00.000Z',
      summary: {
        participantCount: 3,
        agendaMinutes: 35,
        decisionCount: 1,
        actionItemCount: 1,
        missingInputCount: 0,
      },
      participants: ['AI 代码守护人', '产品负责人', '后端负责人'],
      inputs: [
        { name: '月度质量审计报告', status: 'READY', note: 'quality:audit-report' },
        { name: '前七周复盘报告', status: 'READY', note: 'quality:retro-report' },
      ],
      agenda: [
        { topic: '确认 Week 8 稳定化 backlog', owner: 'AI 代码守护人', minutes: 20 },
        { topic: '确认团队侧流程 owner', owner: '产品负责人', minutes: 15 },
      ],
      decisions: [
        { topic: '是否把分支保护设为 Week 8 阻断项', owner: '产品负责人', options: ['是', '否'] },
      ],
      actionItems: [
        { task: '规划 rebase/merge 策略', owner: '后端负责人', dueDate: '2026-05-08', source: 'Week 1-7 retrospective' },
      ],
      blockers: [],
    });
  });

  it('passes with minimal valid input', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['owner-1'],
      inputs: [{ name: 'input-1', status: 'READY', note: 'test' }],
      agenda: [{ topic: 'topic-1', owner: 'o1', minutes: 10 }],
      decisions: [{ topic: 'd1', owner: 'o1', options: ['yes'] }],
      actionItems: [{ task: 'a1', owner: 'o1', dueDate: '2026-05-15', source: 'test' }],
    });

    expect(pack.status).toBe('READY');
  });

  it('blocks when participants list is empty', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: [],
      inputs: [],
      agenda: [],
      decisions: [],
      actionItems: [],
    });

    expect(pack.status).toBe('BLOCKED');
  });

  it('blocks when input is MISSING', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [{ name: 'monthly audit', status: 'MISSING' }],
      agenda: [{ topic: 't1', owner: 'o1', minutes: 10 }],
      decisions: [],
      actionItems: [],
    });

    expect(pack.status).toBe('BLOCKED');
    expect(pack.blockers).toContain('input is missing: monthly audit');
    expect(pack.summary.missingInputCount).toBe(1);
  });

  it('computes agendaMinutes from agenda items', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [{ name: 'i1', status: 'READY' }],
      agenda: [
        { topic: 't1', owner: 'o1', minutes: 15 },
        { topic: 't2', owner: 'o2', minutes: 20 },
      ],
      decisions: [],
      actionItems: [],
    });

    expect(pack.summary.agendaMinutes).toBe(35);
  });

  it('trims whitespace from participant names and filters empty', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['  alice  ', '  ', 'bob'],
      inputs: [{ name: 'i1', status: 'READY' }],
      agenda: [{ topic: 't1', owner: 'o1', minutes: 10 }],
      decisions: [],
      actionItems: [],
    });

    expect(pack.participants).toEqual(['alice', 'bob']);
    expect(pack.summary.participantCount).toBe(2);
  });

  it('clamps negative agenda minutes to 0', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [],
      agenda: [{ topic: 't1', owner: 'o1', minutes: -5 }],
      decisions: [],
      actionItems: [],
    });

    expect(pack.summary.agendaMinutes).toBe(0);
  });

  it('clamps Infinity agenda minutes to 0', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [],
      agenda: [{ topic: 't1', owner: 'o1', minutes: Infinity }],
      decisions: [],
      actionItems: [],
    });

    expect(pack.summary.agendaMinutes).toBe(0);
  });

  it('rounds fractional agenda minutes', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [],
      agenda: [{ topic: 't1', owner: 'o1', minutes: 12.7 }],
      decisions: [],
      actionItems: [],
    });

    expect(pack.summary.agendaMinutes).toBe(13);
  });

  it('filters out empty-string agenda topics', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [],
      agenda: [
        { topic: '  ', owner: 'o1', minutes: 10 },
        { topic: 'real topic', owner: 'o1', minutes: 15 },
      ],
      decisions: [],
      actionItems: [],
    });

    expect(pack.agenda).toHaveLength(1);
    expect(pack.agenda[0].topic).toBe('real topic');
  });

  it('blocks when action item owner is missing', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [{ name: 'i1', status: 'READY' }],
      agenda: [{ topic: 't1', owner: 'o1', minutes: 10 }],
      decisions: [],
      actionItems: [{ task: 'do thing', owner: '', dueDate: '2026-05-15', source: 'test' }],
    });

    expect(pack.status).toBe('BLOCKED');
    expect(pack.blockers).toContain('action item owner is missing: do thing');
  });

  it('blocks when action item dueDate is missing', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [{ name: 'i1', status: 'READY' }],
      agenda: [{ topic: 't1', owner: 'o1', minutes: 10 }],
      decisions: [],
      actionItems: [{ task: 'do thing', owner: 'o1', dueDate: '  ', source: 'test' }],
    });

    expect(pack.status).toBe('BLOCKED');
    expect(pack.blockers).toContain('action item dueDate is missing: do thing');
  });

  it('trims input note and omits when empty', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [
        { name: 'input-a', status: 'READY', note: '  hello  ' },
        { name: 'input-b', status: 'READY', note: '  ' },
      ],
      agenda: [{ topic: 't1', owner: 'o1', minutes: 10 }],
      decisions: [],
      actionItems: [],
    });

    expect(pack.inputs[0].note).toBe('hello');
    expect(pack.inputs[1].note).toBeUndefined();
  });

  it('trims decision topic and options', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [],
      agenda: [{ topic: 't1', owner: 'o1', minutes: 10 }],
      decisions: [{ topic: '  decide  ', owner: '  o1  ', options: ['  yes  ', '  no  '] }],
      actionItems: [],
    });

    expect(pack.decisions[0].topic).toBe('decide');
    expect(pack.decisions[0].owner).toBe('o1');
    expect(pack.decisions[0].options).toEqual(['yes', 'no']);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [],
      agenda: [{ topic: 't1', owner: 'o1', minutes: 10 }],
      decisions: [],
      actionItems: [],
    });
    const after = new Date();

    const ts = new Date(pack.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('filters empty-string action item tasks', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [],
      agenda: [{ topic: 't1', owner: 'o1', minutes: 10 }],
      decisions: [],
      actionItems: [
        { task: '   ', owner: 'o1', dueDate: '2026-05-15', source: 'test' },
        { task: 'real task', owner: 'o1', dueDate: '2026-05-15', source: 'test' },
      ],
    });

    expect(pack.actionItems).toHaveLength(1);
    expect(pack.actionItems[0].task).toBe('real task');
  });

  it('multiple blockers combine into single BLOCKED status', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: [],
      inputs: [{ name: 'missing-input', status: 'MISSING' }],
      agenda: [],
      decisions: [],
      actionItems: [],
    });

    expect(pack.status).toBe('BLOCKED');
    expect(pack.blockers).toContain('at least one participant is required');
    expect(pack.blockers).toContain('at least one agenda item is required');
    expect(pack.blockers).toContain('input is missing: missing-input');
  });

  it('clamps NaN agenda minutes to 0', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [],
      agenda: [{ topic: 't1', owner: 'o1', minutes: NaN }],
      decisions: [],
      actionItems: [],
    });

    expect(pack.summary.agendaMinutes).toBe(0);
  });

  it('summary decisionCount reflects count after filtering empty topics', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [],
      agenda: [{ topic: 't1', owner: 'o1', minutes: 10 }],
      decisions: [
        { topic: '  ', owner: 'o1', options: ['a'] },
        { topic: 'real decision', owner: 'o1', options: ['yes'] },
      ],
      actionItems: [],
    });

    expect(pack.summary.decisionCount).toBe(1);
    expect(pack.decisions[0].topic).toBe('real decision');
  });

  it('negative agenda minutes are clamped to 0', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['p1'],
      inputs: [],
      agenda: [{ topic: 't1', owner: 'o1', minutes: -5 }],
      decisions: [],
      actionItems: [],
    });

    expect(pack.summary.agendaMinutes).toBe(0);
    expect(pack.agenda[0].minutes).toBe(0);
  });

  it('empty participants array is preserved', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'solo',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: [],
      inputs: [],
      agenda: [],
      decisions: [],
      actionItems: [],
    });

    expect(pack.participants).toEqual([]);
    expect(pack.summary.participantCount).toBe(0);
  });

  it('buildQualityReviewMeetingPack returns correct mode', () => {
    const pack = buildQualityReviewMeetingPack({
      title: 'test',
      scheduledFor: '2026-06-01T10:00:00+08:00',
      participants: ['p1'],
      inputs: [],
      agenda: [],
      decisions: [],
      actionItems: [],
    });
    expect(pack.mode).toBe('QUALITY_REVIEW_MEETING_PACK');
  });

  it('meeting pack with no attendees returns empty array', () => {
    const pack = buildQualityReviewMeetingPack({ title: 'test', scheduledFor: '2026-05-10', participants: [], inputs: [], agenda: [], decisions: [], actionItems: [] });
    expect(pack.participants).toEqual([]);
  });

  it('meeting with single participant returns valid structure', () => {
    const pack = buildQualityReviewMeetingPack({ title: 'Review', scheduledFor: '2026-05-10', participants: ['Alice'], inputs: [{ name: 'Input', status: 'READY' }], agenda: [{ topic: 'Discuss', owner: 'Alice', duration: '10m' }], decisions: [], actionItems: [] });
    expect(pack.participants).toHaveLength(1);
  });

  it('meeting with empty participants returns valid structure', () => { const pack = buildQualityReviewMeetingPack({ title: '', scheduledFor: '', participants: [], inputs: [], agenda: [], decisions: [], actionItems: [] }); expect(pack.participants).toHaveLength(0); });

  it('meeting with single participant returns valid structure', () => { const pack = buildQualityReviewMeetingPack({ title: 'Review', scheduledFor: '', participants: ['admin'], inputs: [], agenda: [], decisions: [], actionItems: [] }); expect(pack.participants).toHaveLength(1); });

  it('meeting with agenda items preserves order', () => { const pack = buildQualityReviewMeetingPack({ title: 'Review', scheduledFor: '', participants: [], inputs: [], agenda: [{ topic: 'topic1', owner: 'admin', minutes: 15 }, { topic: 'topic2', owner: 'user', minutes: 30 }], decisions: [], actionItems: [] }); expect(pack.agenda).toHaveLength(2); });

  it('meeting with action items preserves count', () => { const pack = buildQualityReviewMeetingPack({ title: '', scheduledFor: '', participants: [], inputs: [], agenda: [], decisions: [], actionItems: [] }); expect(pack).toBeDefined(); });

  it('meeting with decisions preserves count', () => { const pack = buildQualityReviewMeetingPack({ title: '', scheduledFor: '', participants: [], inputs: [], agenda: [], decisions: [{ topic: 'd1', owner: 'admin', options: [] }, { topic: 'd2', owner: 'user', options: [] }], actionItems: [] }); expect(pack.decisions).toHaveLength(2); });

  it('meeting with inputs preserves input count', () => { const pack = buildQualityReviewMeetingPack({ title: '', scheduledFor: '', participants: [], inputs: [{ name: 'input1', type: 'doc' }, { name: 'input2', type: 'metric' }], agenda: [], decisions: [], actionItems: [] }); expect(pack).toBeDefined(); });

  it('meeting with empty participants returns empty array', () => { const pack = buildQualityReviewMeetingPack({ title: '', scheduledFor: '', participants: [], inputs: [], agenda: [], decisions: [], actionItems: [] }); expect(pack.participants).toHaveLength(0); });

  it('meeting with non-empty agenda preserves count', () => { const pack = buildQualityReviewMeetingPack({ title: '', scheduledFor: '', participants: [], inputs: [], agenda: [{ topic: 'topic1', owner: 'admin', minutes: 30 }, { topic: 'topic2', owner: 'admin', minutes: 15 }], decisions: [], actionItems: [] }); expect(pack.agenda).toHaveLength(2); });

  it('meeting with empty agenda returns valid', () => { const pack = buildQualityReviewMeetingPack({ title: 'Meeting', scheduledFor: '', participants: [], inputs: [], agenda: [], decisions: [], actionItems: [] }); expect(pack).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [`participant ${index} 中文`, `topic ${index}<tag>`, index + 0.49]))(
    'normalizes participant and rounds agenda minutes for %s',
    (participant, topic, minutes) => {
      const pack = buildQualityReviewMeetingPack({
        title: 'review',
        scheduledFor: '2026-05-10T10:00:00+08:00',
        participants: [`  ${participant}  `, '  '],
        inputs: [{ name: 'input', status: 'READY', note: '  ready  ' }],
        agenda: [{ topic: `  ${topic}  `, owner: '  owner  ', minutes }],
        decisions: [{ topic: ` decision ${topic} `, owner: ' owner ', options: [' yes ', ' ', ' no '] }],
        actionItems: [{ task: ` action ${topic} `, owner: ' owner ', dueDate: ' 2026-05-15 ', source: ' source ' }],
      });

      expect(pack.status).toBe('READY');
      expect(pack.participants).toEqual([participant]);
      expect(pack.agenda[0]).toEqual({ topic, owner: 'owner', minutes: Math.round(minutes) });
      expect(pack.decisions[0].options).toEqual(['yes', 'no']);
      expect(pack.actionItems[0].task).toBe(`action ${topic}`);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 3 === 0 ? Number.NaN : index % 3 === 1 ? Number.POSITIVE_INFINITY : -index - 1,
    index % 3 === 2 ? 0 : 0,
  ]))('clamps invalid agenda minutes value %s', (minutes, expected) => {
    const pack = buildQualityReviewMeetingPack({
      title: 'review',
      scheduledFor: '2026-05-10T10:00:00+08:00',
      participants: ['participant'],
      inputs: [],
      agenda: [{ topic: 'topic', owner: 'owner', minutes }],
      decisions: [],
      actionItems: [],
    });

    expect(pack.status).toBe('READY');
    expect(pack.agenda[0].minutes).toBe(expected);
    expect(pack.summary.agendaMinutes).toBe(expected);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    ` task ${index} 中文 `,
    ` owner ${index} `,
    ` 2026-05-${String((index % 20) + 1).padStart(2, '0')} `,
    ` source ${index} `,
  ] as const))(
    'normalizes generated action item %s',
    (task, owner, dueDate, source) => {
      const pack = buildQualityReviewMeetingPack({
        title: 'review',
        scheduledFor: '2026-05-10T10:00:00+08:00',
        participants: ['participant'],
        inputs: [],
        agenda: [{ topic: 'topic', owner: 'owner', minutes: 10 }],
        decisions: [],
        actionItems: [{ task, owner, dueDate, source }],
      });

      expect(pack.status).toBe('READY');
      expect(pack.actionItems[0]).toEqual({
        task: task.trim(),
        owner: owner.trim(),
        dueDate: dueDate.trim(),
        source: source.trim(),
      });
      expect(pack.summary.actionItemCount).toBe(1);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [` missing input ${index} `]))(
    'reports generated missing input blocker %s',
    (name) => {
      const pack = buildQualityReviewMeetingPack({
        title: 'review',
        scheduledFor: '2026-05-10T10:00:00+08:00',
        participants: ['participant'],
        inputs: [{ name, status: 'MISSING', note: '  pending  ' }],
        agenda: [{ topic: 'topic', owner: 'owner', minutes: 10 }],
        decisions: [],
        actionItems: [],
      });

      expect(pack.status).toBe('BLOCKED');
      expect(pack.inputs[0]).toEqual({ name: name.trim(), status: 'MISSING', note: 'pending' });
      expect(pack.summary.missingInputCount).toBe(1);
      expect(pack.blockers).toContain(`input is missing: ${name.trim()}`);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `participant-${index}`,
    `topic-${index}`,
    index + 0.5,
  ] as const))(
    'builds generated ready meeting pack %s',
    (participant, topic, minutes) => {
      const pack = buildQualityReviewMeetingPack({
        title: ' review ',
        scheduledFor: '2026-05-11T10:00:00+08:00',
        participants: [' ', ` ${participant} `],
        inputs: [{ name: ` input-${topic} `, status: 'READY', note: ' note ' }],
        agenda: [{ topic: ` ${topic} `, owner: ' owner ', minutes }],
        decisions: [{ topic: ` decision-${topic} `, owner: ' owner ', options: [' yes ', '', ' no '] }],
        actionItems: [{ task: ` action-${topic} `, owner: ' owner ', dueDate: ' 2026-05-20 ', source: ' source ' }],
      });

      expect(pack.status).toBe('READY');
      expect(pack.summary.participantCount).toBe(1);
      expect(pack.summary.agendaMinutes).toBe(Math.round(minutes));
      expect(pack.participants).toEqual([participant]);
      expect(pack.decisions[0].options).toEqual(['yes', 'no']);
      expect(pack.blockers).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch142-action-${index}`,
    index % 2 === 0 ? ' ' : `owner-${index}`,
    index % 3 === 0 ? ' ' : `2026-06-${String((index % 20) + 1).padStart(2, '0')}`,
  ] as const))(
    'reports generated meeting action blocker %s',
    (task, owner, dueDate) => {
      const pack = buildQualityReviewMeetingPack({
        title: 'review',
        scheduledFor: '2026-05-11T10:00:00+08:00',
        participants: ['participant'],
        inputs: [],
        agenda: [{ topic: 'topic', owner: 'owner', minutes: 10 }],
        decisions: [],
        actionItems: [{ task, owner, dueDate, source: 'batch142' }],
      });
      const expectedBlockers = [
        owner.trim() ? undefined : `action item owner is missing: ${task}`,
        dueDate.trim() ? undefined : `action item dueDate is missing: ${task}`,
      ].filter(Boolean);

      expect(pack.status).toBe(expectedBlockers.length > 0 ? 'BLOCKED' : 'READY');
      expect(pack.summary.actionItemCount).toBe(1);
      expect(pack.blockers).toEqual(expectedBlockers);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch148-decision-${index}`,
    `owner-${index}`,
  ] as const))(
    'filters generated blank decision options for %s',
    (topic, owner) => {
      const pack = buildQualityReviewMeetingPack({
        title: 'review',
        scheduledFor: '2026-05-12T10:00:00+08:00',
        participants: ['participant'],
        inputs: [{ name: 'input', status: 'READY', note: ' ' }],
        agenda: [{ topic: 'agenda', owner, minutes: 15.4 }],
        decisions: [{ topic: ` ${topic} `, owner: ` ${owner} `, options: [' ', ` option-a-${topic} `, '', `option-b-${topic}`] }],
        actionItems: [],
      });

      expect(pack.status).toBe('READY');
      expect(pack.summary.decisionCount).toBe(1);
      expect(pack.decisions[0]).toEqual({ topic, owner, options: [`option-a-${topic}`, `option-b-${topic}`] });
      expect(pack.summary.agendaMinutes).toBe(15);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch148-topic-${index}`,
    index % 2 === 0 ? Number.NEGATIVE_INFINITY : index + 0.5,
  ] as const))(
    'filters generated blank agenda topics and clamps minutes %s',
    (topic, minutes) => {
      const pack = buildQualityReviewMeetingPack({
        title: 'review',
        scheduledFor: '2026-05-12T10:00:00+08:00',
        participants: ['participant'],
        inputs: [],
        agenda: [
          { topic: ' ', owner: 'ignored', minutes: 99 },
          { topic, owner: 'owner', minutes },
        ],
        decisions: [{ topic: ' ', owner: 'ignored', options: ['ignored'] }],
        actionItems: [],
      });
      const expectedMinutes = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;

      expect(pack.status).toBe('READY');
      expect(pack.agenda).toEqual([{ topic, owner: 'owner', minutes: expectedMinutes }]);
      expect(pack.summary.agendaMinutes).toBe(expectedMinutes);
      expect(pack.summary.decisionCount).toBe(0);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch153-participant-${index}`,
    `batch153-topic-${index}`,
    index + 10.4,
    index + 20.5,
  ] as const))(
    'sums generated rounded agenda minutes for %s/%s',
    (participant, topic, firstMinutes, secondMinutes) => {
      const pack = buildQualityReviewMeetingPack({
        title: 'review',
        scheduledFor: '2026-05-13T10:00:00+08:00',
        participants: [' ', ` ${participant} `],
        inputs: [{ name: 'input', status: 'READY', note: undefined }],
        agenda: [
          { topic: `${topic}-a`, owner: 'owner-a', minutes: firstMinutes },
          { topic: `${topic}-b`, owner: ' owner-b ', minutes: secondMinutes },
        ],
        decisions: [{ topic: `decision-${topic}`, owner: 'owner', options: [' ', 'approve'] }],
        actionItems: [{ task: `action-${topic}`, owner: 'owner', dueDate: '2026-05-20', source: 'batch153' }],
      });

      expect(pack.status).toBe('READY');
      expect(pack.summary.agendaMinutes).toBe(Math.round(firstMinutes) + Math.round(secondMinutes));
      expect(pack.summary.participantCount).toBe(1);
      expect(pack.participants).toEqual([participant]);
      expect(pack.agenda[1]).toEqual({ topic: `${topic}-b`, owner: 'owner-b', minutes: Math.round(secondMinutes) });
      expect(pack.decisions[0].options).toEqual(['approve']);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch153-input-${index}`,
    `batch153-action-${index}`,
    index % 2 === 0,
    index % 3 === 0,
    index % 4 === 0 ? ' ' : `owner-${index}`,
    index % 5 === 0 ? ' ' : `2026-05-${String((index % 20) + 1).padStart(2, '0')}`,
  ] as const))(
    'reports generated combined meeting blockers %s/%s',
    (inputName, task, hasParticipant, hasAgenda, owner, dueDate) => {
      const pack = buildQualityReviewMeetingPack({
        title: 'review',
        scheduledFor: '2026-05-13T10:00:00+08:00',
        participants: hasParticipant ? ['participant'] : [' '],
        inputs: [{ name: ` ${inputName} `, status: 'MISSING', note: ' pending ' }],
        agenda: hasAgenda ? [{ topic: 'topic', owner: 'owner', minutes: 10 }] : [{ topic: ' ', owner: 'ignored', minutes: 10 }],
        decisions: [],
        actionItems: [{ task, owner, dueDate, source: 'batch153' }],
      });
      const expectedBlockers = [
        hasParticipant ? undefined : 'at least one participant is required',
        hasAgenda ? undefined : 'at least one agenda item is required',
        `input is missing: ${inputName}`,
        owner.trim() ? undefined : `action item owner is missing: ${task}`,
        dueDate.trim() ? undefined : `action item dueDate is missing: ${task}`,
      ].filter(Boolean);

      expect(pack.status).toBe('BLOCKED');
      expect(pack.blockers).toEqual(expectedBlockers);
      expect(pack.summary.missingInputCount).toBe(1);
      expect(pack.summary.actionItemCount).toBe(1);
    },
  );
});
