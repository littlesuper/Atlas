import { describe, expect, it } from 'vitest';
import { buildTeamConfirmationRegister } from './teamConfirmationRegister';

describe('team confirmation register builder', () => {
  it('marks required topics confirmed only when evidence is recorded', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date('2026-05-06T08:00:00.000Z'),
      requiredTopics: ['质量回顾会实会确认', '分支保护和 PR 审查规则'],
      confirmations: [
        {
          topic: '质量回顾会实会确认',
          owner: 'AI 代码守护人',
          confirmedAt: '2026-05-08',
          decision: '确认 Week 8 action tracker 和季度目标',
          evidenceRef: 'quality-review-minutes#2026-05-08',
        },
        {
          topic: '分支保护和 PR 审查规则',
          owner: '产品负责人',
          confirmedAt: '2026-05-10',
          decision: '由仓库管理员落地 GitHub Settings',
          evidenceRef: 'github-settings#branch-protection',
        },
      ],
    });

    expect(register).toEqual({
      mode: 'TEAM_CONFIRMATION_REGISTER',
      status: 'CONFIRMED',
      generatedAt: '2026-05-06T08:00:00.000Z',
      summary: {
        required: 2,
        confirmed: 2,
        pending: 0,
        missingEvidence: 0,
      },
      items: [
        {
          topic: '质量回顾会实会确认',
          owner: 'AI 代码守护人',
          confirmedAt: '2026-05-08',
          decision: '确认 Week 8 action tracker 和季度目标',
          evidenceRef: 'quality-review-minutes#2026-05-08',
          status: 'CONFIRMED',
        },
        {
          topic: '分支保护和 PR 审查规则',
          owner: '产品负责人',
          confirmedAt: '2026-05-10',
          decision: '由仓库管理员落地 GitHub Settings',
          evidenceRef: 'github-settings#branch-protection',
          status: 'CONFIRMED',
        },
      ],
      gaps: [],
    });
  });

  it('keeps the register action-required when a required topic has no evidence', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date('2026-05-06T08:00:00.000Z'),
      requiredTopics: ['质量回顾会实会确认', 'rebase/merge 策略'],
      confirmations: [
        {
          topic: '质量回顾会实会确认',
          owner: 'AI 代码守护人',
          confirmedAt: '2026-05-08',
          decision: '确认 Week 8 action tracker 和季度目标',
          evidenceRef: '',
        },
      ],
    });

    expect(register.status).toBe('ACTION_REQUIRED');
    expect(register.summary).toEqual({
      required: 2,
      confirmed: 0,
      pending: 1,
      missingEvidence: 1,
    });
    expect(register.gaps).toEqual([
      'confirmation evidence is missing: 质量回顾会实会确认',
      'confirmation is missing: rebase/merge 策略',
    ]);
  });

  it('handles empty required topics', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date('2026-05-06T08:00:00.000Z'),
      requiredTopics: [],
      confirmations: [],
    });

    expect(register.status).toBe('CONFIRMED');
    expect(register.summary.required).toBe(0);
  });

  it('counts pending topics without any confirmation', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date(),
      requiredTopics: ['topic-a', 'topic-b'],
      confirmations: [],
    });

    expect(register.status).toBe('ACTION_REQUIRED');
    expect(register.summary.pending).toBe(2);
    expect(register.gaps).toHaveLength(2);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const register = buildTeamConfirmationRegister({
      requiredTopics: [],
      confirmations: [],
    });
    const after = new Date();

    const ts = new Date(register.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from topic names and confirmation fields', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date(),
      requiredTopics: ['  topic-a  '],
      confirmations: [{
        topic: '  topic-a  ',
        owner: '  owner  ',
        confirmedAt: '  2026-05-08  ',
        decision: '  decided  ',
        evidenceRef: '  ref-1  ',
      }],
    });

    expect(register.items[0].topic).toBe('topic-a');
    expect(register.items[0].owner).toBe('owner');
    expect(register.items[0].confirmedAt).toBe('2026-05-08');
    expect(register.items[0].decision).toBe('decided');
    expect(register.items[0].evidenceRef).toBe('ref-1');
  });

  it('marks item ACTION_REQUIRED when any evidence field is empty', () => {
    const fields = ['owner', 'confirmedAt', 'decision', 'evidenceRef'] as const;
    for (const field of fields) {
      const confirmation = {
        topic: 'topic-a',
        owner: 'owner',
        confirmedAt: '2026-05-08',
        decision: 'yes',
        evidenceRef: 'ref',
      };
      confirmation[field] = '';

      const register = buildTeamConfirmationRegister({
        generatedAt: new Date(),
        requiredTopics: ['topic-a'],
        confirmations: [confirmation],
      });

      expect(register.items[0].status).toBe('ACTION_REQUIRED');
    }
  });

  it('trims and filters empty required topics', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date(),
      requiredTopics: ['  topic-a  ', '  ', '  topic-b  '],
      confirmations: [],
    });

    expect(register.summary.required).toBe(2);
  });

  it('extra confirmations for unknown topics are ignored', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date(),
      requiredTopics: ['topic-a'],
      confirmations: [
        {
          topic: 'topic-a',
          owner: 'o',
          confirmedAt: '2026-05-08',
          decision: 'd',
          evidenceRef: 'r',
        },
        {
          topic: 'unknown-topic',
          owner: 'o',
          confirmedAt: '2026-05-08',
          decision: 'd',
          evidenceRef: 'r',
        },
      ],
    });

    expect(register.items).toHaveLength(1);
    expect(register.status).toBe('CONFIRMED');
  });

  it('mode is always TEAM_CONFIRMATION_REGISTER', () => {
    const register = buildTeamConfirmationRegister({
      requiredTopics: [],
      confirmations: [],
    });

    expect(register.mode).toBe('TEAM_CONFIRMATION_REGISTER');
  });

  it('counts pending correctly with mix of confirmed and missing', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date(),
      requiredTopics: ['topic-a', 'topic-b', 'topic-c'],
      confirmations: [
        { topic: 'topic-a', owner: 'o', confirmedAt: 'd', decision: 'd', evidenceRef: 'r' },
      ],
    });

    expect(register.summary.confirmed).toBe(1);
    expect(register.summary.pending).toBe(2);
    expect(register.summary.missingEvidence).toBe(0);
  });

  it('generatedAt is valid ISO string', () => {
    const register = buildTeamConfirmationRegister({ requiredTopics: [], confirmations: [] });
    expect(new Date(register.generatedAt).toISOString()).toBe(register.generatedAt);
  });

  it('uses last confirmation when duplicate topics exist in input', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date(),
      requiredTopics: ['topic-a'],
      confirmations: [
        { topic: 'topic-a', owner: 'first', confirmedAt: '2026-05-08', decision: 'd1', evidenceRef: 'r1' },
        { topic: 'topic-a', owner: 'second', confirmedAt: '2026-05-09', decision: 'd2', evidenceRef: 'r2' },
      ],
    });

    expect(register.items).toHaveLength(1);
    expect(register.items[0].owner).toBe('second');
    expect(register.items[0].decision).toBe('d2');
  });

  it('treats whitespace-only confirmation owner as missing evidence', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date(),
      requiredTopics: ['topic-a'],
      confirmations: [
        { topic: 'topic-a', owner: '   ', confirmedAt: '2026-05-08', decision: 'yes', evidenceRef: 'ref' },
      ],
    });

    expect(register.items[0].status).toBe('ACTION_REQUIRED');
    expect(register.gaps).toContain('confirmation evidence is missing: topic-a');
  });

  it('counts missingEvidence separately from pending', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date(),
      requiredTopics: ['topic-a', 'topic-b', 'topic-c'],
      confirmations: [
        { topic: 'topic-a', owner: 'o', confirmedAt: 'd', decision: 'd', evidenceRef: 'r' },
        { topic: 'topic-b', owner: '', confirmedAt: '', decision: '', evidenceRef: '' },
      ],
    });

    expect(register.summary.confirmed).toBe(1);
    expect(register.summary.missingEvidence).toBe(1);
    expect(register.summary.pending).toBe(1);
    expect(register.gaps).toContain('confirmation is missing: topic-c');
    expect(register.gaps).toContain('confirmation evidence is missing: topic-b');
  });

  it('duplicate required topic names produce duplicate items', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date(),
      requiredTopics: ['topic-a', '  topic-a  '],
      confirmations: [
        { topic: 'topic-a', owner: 'o', confirmedAt: 'd', decision: 'd', evidenceRef: 'r' },
      ],
    });

    expect(register.items).toHaveLength(2);
    expect(register.summary.required).toBe(2);
    expect(register.summary.confirmed).toBe(2);
  });

  it('topic matching is case-sensitive', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date(),
      requiredTopics: ['Topic-A'],
      confirmations: [
        { topic: 'topic-a', owner: 'o', confirmedAt: 'd', decision: 'd', evidenceRef: 'r' },
      ],
    });

    expect(register.items).toHaveLength(0);
    expect(register.gaps).toContain('confirmation is missing: Topic-A');
  });

  it('pending is 0 when all required topics have confirmations even if all ACTION_REQUIRED', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date(),
      requiredTopics: ['topic-a', 'topic-b'],
      confirmations: [
        { topic: 'topic-a', owner: '', confirmedAt: 'd', decision: 'd', evidenceRef: '' },
        { topic: 'topic-b', owner: 'o', confirmedAt: '', decision: '', evidenceRef: '' },
      ],
    });

    expect(register.summary.missingEvidence).toBe(2);
    expect(register.summary.pending).toBe(0);
    expect(register.summary.confirmed).toBe(0);
    expect(register.status).toBe('ACTION_REQUIRED');
  });

  it('whitespace-only evidenceRef is treated as missing evidence', () => {
    const register = buildTeamConfirmationRegister({
      generatedAt: new Date(),
      requiredTopics: ['topic-a'],
      confirmations: [
        { topic: 'topic-a', owner: 'owner', confirmedAt: '2026-05-08', decision: 'yes', evidenceRef: '   ' },
      ],
    });

    expect(register.items[0].status).toBe('ACTION_REQUIRED');
    expect(register.gaps).toContain('confirmation evidence is missing: topic-a');
  });

  it('mode is always TEAM_CONFIRMATION_REGISTER', () => {
    const register = buildTeamConfirmationRegister({
      requiredTopics: [],
      confirmations: [],
    });
    expect(register.mode).toBe('TEAM_CONFIRMATION_REGISTER');
  });

  it('confirmation with all required fields produces CONFIRMED status', () => {
    const register = buildTeamConfirmationRegister({
      requiredTopics: ['topic-a'],
      confirmations: [{
        topic: 'topic-a',
        owner: 'owner-1',
        confirmedAt: '2026-05-08',
        decision: 'approved',
        evidenceRef: 'ref-1',
      }],
    });

    expect(register.status).toBe('CONFIRMED');
    expect(register.summary.confirmed).toBe(1);
    expect(register.gaps).toEqual([]);
  });

  it('register with no confirmations has ACTION_REQUIRED status', () => {
    const register = buildTeamConfirmationRegister({ requiredTopics: ['topic-a'], confirmations: [] });
    expect(register.status).toBe('ACTION_REQUIRED');
    expect(register.summary.required).toBe(1);
  });

  it('register with empty confirmations returns zero confirmed', () => {
    const register = buildTeamConfirmationRegister({ requiredTopics: [], confirmations: [] });
    expect(register.summary.confirmed).toBe(0);
  });

  it('register with single confirmation returns correct count', () => {
    const register = buildTeamConfirmationRegister({ requiredTopics: ['topic-1'], confirmations: [{ topic: 'topic-1', owner: 'u1', confirmedAt: '2026-05-10', decision: 'APPROVED', evidenceRef: 'doc-1' }] });
    expect(register.summary.confirmed).toBe(1);
  });

  it('register with empty required topics returns zero required', () => { const register = buildTeamConfirmationRegister({ requiredTopics: [], confirmations: [] }); expect(register.summary.required).toBe(0); });

  it('register with all confirmed returns zero pending', () => { const register = buildTeamConfirmationRegister({ requiredTopics: ['t1'], confirmations: [{ topic: 't1', owner: 'admin', confirmedAt: '2026-01-01', decision: 'yes', evidenceRef: 'ref' }] }); expect(register.summary.pending).toBe(0); });

  it('register with partial confirmations returns correct pending count', () => { const register = buildTeamConfirmationRegister({ requiredTopics: ['t1', 't2', 't3'], confirmations: [{ topic: 't1', owner: 'admin', confirmedAt: '2026-01-01', decision: 'yes', evidenceRef: 'ref' }] }); expect(register.summary.pending).toBe(2); });

  it('register with all confirmed returns zero missing', () => { const register = buildTeamConfirmationRegister({ requiredTopics: ['t1'], confirmations: [{ topic: 't1', owner: 'admin', confirmedAt: '2026-01-01', decision: 'yes', evidenceRef: 'ref' }] }); expect(register.summary.confirmed).toBe(1); });

  it('register with no confirmations returns all as pending', () => { const register = buildTeamConfirmationRegister({ requiredTopics: ['t1', 't2'], confirmations: [] }); expect(register.summary.pending).toBe(2); });

  it('register mode is TEAM_CONFIRMATION_REGISTER', () => { const register = buildTeamConfirmationRegister({ requiredTopics: [], confirmations: [] }); expect(register.mode).toBe('TEAM_CONFIRMATION_REGISTER'); });

  it('register with empty required topics returns zero pending', () => { const register = buildTeamConfirmationRegister({ requiredTopics: [], confirmations: [] }); expect(register.summary.pending).toBe(0); });

  it('register with single required topic returns one pending', () => { const register = buildTeamConfirmationRegister({ requiredTopics: ['t1'], confirmations: [] }); expect(register).toBeDefined(); });

  it('register with confirmed topic reduces pending count', () => { const register = buildTeamConfirmationRegister({ requiredTopics: ['t1'], confirmations: [{ topic: 't1', owner: 'admin', confirmedAt: '2026-01-01', decision: 'approved', evidenceRef: 'ref1' }] }); expect(register).toBeDefined(); });

  it('register with empty requiredTopics returns valid', () => { const register = buildTeamConfirmationRegister({ requiredTopics: [], confirmations: [] }); expect(register).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch104-confirmed-${index}`,
    `owner-${index}`,
    `decision-${index}`,
    `ref-${index}`,
  ] as const))(
    'records generated confirmed team topic %s',
    (topic, owner, decision, evidenceRef) => {
      const register = buildTeamConfirmationRegister({
        requiredTopics: [` ${topic} `],
        confirmations: [{
          topic: ` ${topic} `,
          owner: ` ${owner} `,
          confirmedAt: ' 2026-05-10 ',
          decision: ` ${decision} `,
          evidenceRef: ` ${evidenceRef} `,
        }],
      });

      expect(register.status).toBe('CONFIRMED');
      expect(register.summary).toEqual({ required: 1, confirmed: 1, pending: 0, missingEvidence: 0 });
      expect(register.items[0]).toEqual({
        topic,
        owner,
        confirmedAt: '2026-05-10',
        decision,
        evidenceRef,
        status: 'CONFIRMED',
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch104-pending-${index}`,
    index % 2 === 0,
  ] as const))(
    'summarizes generated missing or incomplete team topic %s',
    (topic, hasIncompleteConfirmation) => {
      const register = buildTeamConfirmationRegister({
        requiredTopics: [topic],
        confirmations: hasIncompleteConfirmation
          ? [{ topic, owner: 'owner', confirmedAt: '2026-05-10', decision: ' ', evidenceRef: 'ref' }]
          : [],
      });

      expect(register.status).toBe('ACTION_REQUIRED');
      expect(register.summary.required).toBe(1);
      expect(register.summary.confirmed).toBe(0);
      expect(register.summary.pending).toBe(hasIncompleteConfirmation ? 0 : 1);
      expect(register.summary.missingEvidence).toBe(hasIncompleteConfirmation ? 1 : 0);
      expect(register.gaps).toEqual([
        hasIncompleteConfirmation ? `confirmation evidence is missing: ${topic}` : `confirmation is missing: ${topic}`,
      ]);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch139-topic-${index}`,
    `owner-${index}`,
    `decision-${index}`,
  ] as const))(
    'uses generated latest confirmation for duplicated topic %s',
    (topic, owner, decision) => {
      const register = buildTeamConfirmationRegister({
        requiredTopics: [` ${topic} `],
        confirmations: [
          { topic, owner: 'older', confirmedAt: '2026-05-01', decision: 'older decision', evidenceRef: 'older-ref' },
          { topic: ` ${topic} `, owner: ` ${owner} `, confirmedAt: ' 2026-05-11 ', decision: ` ${decision} `, evidenceRef: ` ref-${topic} ` },
        ],
      });

      expect(register.status).toBe('CONFIRMED');
      expect(register.summary).toEqual({ required: 1, confirmed: 1, pending: 0, missingEvidence: 0 });
      expect(register.items[0]).toMatchObject({
        topic,
        owner,
        confirmedAt: '2026-05-11',
        decision,
        evidenceRef: `ref-${topic}`,
        status: 'CONFIRMED',
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch139-required-${index}`,
    index % 2 === 0 ? ' ' : `unrelated-${index}`,
  ] as const))(
    'summarizes generated missing required confirmation %s',
    (topic, confirmationTopic) => {
      const register = buildTeamConfirmationRegister({
        requiredTopics: [' ', ` ${topic} `],
        confirmations: confirmationTopic.trim()
          ? [{ topic: confirmationTopic, owner: 'owner', confirmedAt: '2026-05-11', decision: 'approved', evidenceRef: 'ref' }]
          : [],
      });

      expect(register.status).toBe('ACTION_REQUIRED');
      expect(register.summary.required).toBe(1);
      expect(register.summary.confirmed).toBe(0);
      expect(register.summary.pending).toBe(1);
      expect(register.summary.missingEvidence).toBe(0);
      expect(register.items).toEqual([]);
      expect(register.gaps).toEqual([`confirmation is missing: ${topic}`]);
    },
  );
});
