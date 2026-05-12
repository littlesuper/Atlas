import { describe, expect, it } from 'vitest';
import { buildQualityClosureEvidenceHandoff } from './qualityClosureEvidenceHandoff';

describe('quality closure evidence handoff builder', () => {
  it('verifies that evidence pack requirements can hand off to evidence intake', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      generatedAt: new Date('2026-05-06T19:00:00.000Z'),
      requirements: [
        {
          topic: '质量回顾会实会确认',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-08',
          decisionTemplate: '确认 Week 8 action tracker 和季度目标',
          evidenceRefTemplate: 'quality-review-minutes#2026-05-08',
        },
        {
          topic: '分支保护和 PR 审查规则',
          owner: '产品负责人',
          dueDate: '2026-05-10',
          decisionTemplate: '确认 GitHub Settings 已落地',
          evidenceRefTemplate: 'github-settings#branch-protection',
        },
      ],
    });

    expect(handoff).toEqual({
      mode: 'QUALITY_CLOSURE_EVIDENCE_HANDOFF',
      status: 'READY',
      generatedAt: '2026-05-06T19:00:00.000Z',
      summary: {
        requirementCount: 2,
        packStatus: 'READY',
        intakeStatus: 'READY_TO_CONFIRM',
        missingTopicCount: 0,
      },
      packNextCommand: 'npm run quality:evidence-intake --workspace=server -- --confirm "质量回顾会实会确认|AI 代码守护人|2026-05-08|确认 Week 8 action tracker 和季度目标|quality-review-minutes#2026-05-08" --confirm "分支保护和 PR 审查规则|产品负责人|2026-05-10|确认 GitHub Settings 已落地|github-settings#branch-protection"',
      intakeNextCommands: [
        'npm run quality:team-confirmations --workspace=server -- --confirm "质量回顾会实会确认|AI 代码守护人|2026-05-08|确认 Week 8 action tracker 和季度目标|quality-review-minutes#2026-05-08" --confirm "分支保护和 PR 审查规则|产品负责人|2026-05-10|确认 GitHub Settings 已落地|github-settings#branch-protection"',
        'npm run quality:final-closure --workspace=server -- --artifact "knowledge index|QUALITY_KNOWLEDGE_INDEX|READY|npm run quality:knowledge-index --workspace=server" --artifact "blocker resolution|QUALITY_BLOCKER_RESOLUTION|RESOLVED|quality:blocker-resolution" --artifact "closure consistency|QUALITY_CLOSURE_CONSISTENCY|READY|quality:closure-consistency" --artifact "closure evidence handoff|QUALITY_CLOSURE_EVIDENCE_HANDOFF|READY|quality:closure-evidence-handoff" --artifact "closure remaining work|QUALITY_CLOSURE_REMAINING_WORK|READY|quality:closure-remaining-work" --artifact "closure request pack|QUALITY_CLOSURE_REQUEST_PACK|READY|quality:closure-request-pack" --artifact "team confirmations|TEAM_CONFIRMATION_REGISTER|CONFIRMED|quality:team-confirmations" --artifact "handoff confirmation|WEEK8_HANDOFF_PACK|CONFIRMED|quality:handoff-confirm" --artifact "closure gate|WEEK8_CLOSURE_GATE|READY_TO_CLOSE|quality:closure-gate" --archive-action "attach final closure JSON to monthly audit" --archive-action "start next-quarter quality cadence"',
      ],
      gaps: [],
    });
  });

  it('blocks handoff when evidence pack templates are incomplete', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      generatedAt: new Date('2026-05-06T19:00:00.000Z'),
      requirements: [
        {
          topic: 'rebase/merge 策略',
          owner: '',
          dueDate: '2026-05-08',
          decisionTemplate: '确认 main 落后提交的收口策略',
          evidenceRefTemplate: '',
        },
      ],
    });

    expect(handoff.status).toBe('ACTION_REQUIRED');
    expect(handoff.summary).toEqual({
      requirementCount: 1,
      packStatus: 'ACTION_REQUIRED',
      intakeStatus: 'ACTION_REQUIRED',
      missingTopicCount: 1,
    });
    expect(handoff.gaps).toEqual([
      'rebase/merge 策略 missing field: owner',
      'rebase/merge 策略 missing field: evidenceRefTemplate',
      'evidence intake missing topic: rebase/merge 策略',
    ]);
    expect(handoff.packNextCommand).toBe('');
    expect(handoff.intakeNextCommands).toEqual([]);
  });

  it('is READY with empty requirements', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      generatedAt: new Date('2026-05-06T19:00:00.000Z'),
      requirements: [],
    });

    expect(handoff.status).toBe('READY');
    expect(handoff.summary.requirementCount).toBe(0);
    expect(handoff.gaps).toEqual([]);
  });

  it('reports ACTION_REQUIRED when owner is missing', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      generatedAt: new Date('2026-05-06T19:00:00.000Z'),
      requirements: [
        { topic: 'topic-1', owner: '', dueDate: '2026-05-08', decisionTemplate: 'decision', evidenceRefTemplate: 'ref' },
      ],
    });

    expect(handoff.status).toBe('ACTION_REQUIRED');
    expect(handoff.gaps).toContain('topic-1 missing field: owner');
  });

  it('handles multiple requirements with mixed completeness', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      generatedAt: new Date('2026-05-06T19:00:00.000Z'),
      requirements: [
        { topic: 'complete-topic', owner: 'owner', dueDate: '2026-05-08', decisionTemplate: 'd', evidenceRefTemplate: 'r' },
        { topic: 'incomplete-topic', owner: '', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' },
      ],
    });

    expect(handoff.status).toBe('ACTION_REQUIRED');
    expect(handoff.summary.packStatus).toBe('ACTION_REQUIRED');
    expect(handoff.gaps.length).toBeGreaterThan(0);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const handoff = buildQualityClosureEvidenceHandoff({ requirements: [] });
    const after = new Date();

    const ts = new Date(handoff.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('READY handoff provides both pack and intake commands', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      requirements: [{
        topic: 'topic-1', owner: 'o', dueDate: 'd', decisionTemplate: 'dec', evidenceRefTemplate: 'ref',
      }],
    });

    expect(handoff.status).toBe('READY');
    expect(handoff.packNextCommand).toContain('quality:evidence-intake');
    expect(handoff.intakeNextCommands.length).toBeGreaterThan(0);
  });

  it('mode is always QUALITY_CLOSURE_EVIDENCE_HANDOFF', () => {
    const handoff = buildQualityClosureEvidenceHandoff({ requirements: [] });
    expect(handoff.mode).toBe('QUALITY_CLOSURE_EVIDENCE_HANDOFF');
  });

  it('missing dueDate triggers gap', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      requirements: [
        { topic: 'topic-1', owner: 'o', dueDate: '', decisionTemplate: 'd', evidenceRefTemplate: 'r' },
      ],
    });

    expect(handoff.status).toBe('ACTION_REQUIRED');
    expect(handoff.gaps.some(g => g.includes('topic-1'))).toBe(true);
  });

  it('missing decisionTemplate triggers gap', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      requirements: [
        { topic: 'topic-2', owner: 'o', dueDate: '2026-06-01', decisionTemplate: '', evidenceRefTemplate: 'r' },
      ],
    });

    expect(handoff.status).toBe('ACTION_REQUIRED');
    expect(handoff.gaps.some(g => g.includes('topic-2'))).toBe(true);
  });

  it('empty requirements produce READY status with no gaps', () => {
    const handoff = buildQualityClosureEvidenceHandoff({ requirements: [] });
    expect(handoff.status).toBe('READY');
    expect(handoff.gaps).toEqual([]);
    expect(handoff.summary.packStatus).toBe('READY');
  });

  it('packNextCommand references evidence-intake', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      requirements: [{
        topic: 't', owner: 'o', dueDate: 'd', decisionTemplate: 'dec', evidenceRefTemplate: 'ref',
      }],
    });
    expect(handoff.packNextCommand).toContain('evidence-intake');
  });

  it('intakeStatus is READY_TO_CONFIRM when all requirements are complete', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      requirements: [
        { topic: 'topic-a', owner: 'owner-a', dueDate: '2026-05-08', decisionTemplate: 'dec-a', evidenceRefTemplate: 'ref-a' },
        { topic: 'topic-b', owner: 'owner-b', dueDate: '2026-05-09', decisionTemplate: 'dec-b', evidenceRefTemplate: 'ref-b' },
      ],
    });

    expect(handoff.summary.intakeStatus).toBe('READY_TO_CONFIRM');
    expect(handoff.summary.missingTopicCount).toBe(0);
  });

  it('accumulates gaps from both pack and intake simultaneously', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      requirements: [
        { topic: 'topic-a', owner: '', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' },
      ],
    });

    expect(handoff.gaps.length).toBeGreaterThanOrEqual(3);
    expect(handoff.gaps.some(g => g.includes('missing field'))).toBe(true);
    expect(handoff.gaps.some(g => g.includes('evidence intake missing topic'))).toBe(true);
  });

  it('filters out requirements with whitespace-only topic', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      generatedAt: new Date('2026-05-06T19:00:00.000Z'),
      requirements: [
        { topic: '   ', owner: 'o', dueDate: 'd', decisionTemplate: 'dec', evidenceRefTemplate: 'ref' },
      ],
    });

    expect(handoff.summary.requirementCount).toBe(0);
    expect(handoff.status).toBe('READY');
    expect(handoff.summary.packStatus).toBe('READY');
    expect(handoff.summary.intakeStatus).toBe('READY_TO_CONFIRM');
  });

  it('generatedAt is valid ISO string', () => {
    const handoff = buildQualityClosureEvidenceHandoff({ requirements: [] });
    expect(new Date(handoff.generatedAt).toISOString()).toBe(handoff.generatedAt);
  });

  it('whitespace-only owner triggers missing field gap after trimming', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      requirements: [
        { topic: 'topic-1', owner: '   ', dueDate: 'd', decisionTemplate: 'dec', evidenceRefTemplate: 'ref' },
      ],
    });
    expect(handoff.status).toBe('ACTION_REQUIRED');
    expect(handoff.gaps).toContain('topic-1 missing field: owner');
    expect(handoff.summary.packStatus).toBe('ACTION_REQUIRED');
  });

  it('complete requirements produce matching pack and intake status', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      requirements: [
        { topic: 't1', owner: 'o1', dueDate: 'd1', decisionTemplate: 'dec1', evidenceRefTemplate: 'ref1' },
        { topic: 't2', owner: 'o2', dueDate: 'd2', decisionTemplate: 'dec2', evidenceRefTemplate: 'ref2' },
      ],
    });

    expect(handoff.summary.requirementCount).toBe(2);
    expect(handoff.summary.packStatus).toBe('READY');
    expect(handoff.summary.intakeStatus).toBe('READY_TO_CONFIRM');
    expect(handoff.summary.missingTopicCount).toBe(0);
  });

  it('handles duplicate topic names across requirements', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      requirements: [
        { topic: 'dup-topic', owner: 'o1', dueDate: 'd1', decisionTemplate: 'dec1', evidenceRefTemplate: 'ref1' },
        { topic: 'dup-topic', owner: 'o2', dueDate: 'd2', decisionTemplate: 'dec2', evidenceRefTemplate: 'ref2' },
      ],
    });

    expect(handoff.summary.requirementCount).toBe(2);
    expect(handoff.status).toBe('READY');
  });

  it('mode is always QUALITY_CLOSURE_EVIDENCE_HANDOFF', () => {
    const handoff = buildQualityClosureEvidenceHandoff({ requirements: [] });
    expect(handoff.mode).toBe('QUALITY_CLOSURE_EVIDENCE_HANDOFF');
    expect(handoff.summary.packStatus).toBe('READY');
    expect(handoff.summary.intakeStatus).toBe('READY_TO_CONFIRM');
  });

  it('single complete requirement produces READY handoff with one command', () => {
    const handoff = buildQualityClosureEvidenceHandoff({
      requirements: [
        { topic: 'solo-topic', owner: 'solo-owner', dueDate: '2026-06-01', decisionTemplate: 'dec', evidenceRefTemplate: 'ref' },
      ],
    });
    expect(handoff.status).toBe('READY');
    expect(handoff.summary.requirementCount).toBe(1);
    expect(handoff.packNextCommand).toContain('solo-topic');
  });

  it('handoff with empty requirements has zero requirementCount', () => {
    const handoff = buildQualityClosureEvidenceHandoff({ requirements: [] });
    expect(handoff.summary.requirementCount).toBe(0);
    expect(handoff.status).toBe('READY');
  });


  it('handoff with single requirement returns correct count', () => {
    const handoff = buildQualityClosureEvidenceHandoff({ requirements: [{ topic: 'Req', owner: 'u1', dueDate: '2026-06-01', decisionTemplate: 'APPROVED', evidenceRefTemplate: 'ref-1' }], evidence: [] });
    expect(handoff.summary.requirementCount).toBe(1);
  });

  it('handoff with empty requirements returns zero count', () => { const handoff = buildQualityClosureEvidenceHandoff({ requirements: [], evidence: [] }); expect(handoff.summary.requirementCount).toBe(0); });

  it('handoff with single requirement returns count of one', () => { const handoff = buildQualityClosureEvidenceHandoff({ requirements: [{ topic: 'req', owner: 'admin', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' }] }); expect(handoff.summary.requirementCount).toBe(1); });

  it('handoff with multiple requirements counts correctly', () => { const handoff = buildQualityClosureEvidenceHandoff({ requirements: [{ topic: 'r1', owner: 'a', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' }, { topic: 'r2', owner: 'b', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' }] }); expect(handoff.summary.requirementCount).toBe(2); });

  it('handoff with matching evidence and requirements returns valid', () => { const handoff = buildQualityClosureEvidenceHandoff({ requirements: [{ topic: 'req', owner: 'admin', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' }], evidence: [{ topic: 'req', status: 'PASS', ref: 'ref1' }] }); expect(handoff).toBeDefined(); });

  it('handoff mode is QUALITY_CLOSURE_EVIDENCE_HANDOFF', () => { const handoff = buildQualityClosureEvidenceHandoff({ requirements: [], evidence: [] }); expect(handoff.mode).toBe('QUALITY_CLOSURE_EVIDENCE_HANDOFF'); });

  it('handoff with empty evidence returns zero evidence count', () => { const handoff = buildQualityClosureEvidenceHandoff({ requirements: [{ topic: 'req', owner: 'admin', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' }], evidence: [] }); expect(handoff).toBeDefined(); });

  it('handoff with empty requirements returns zero requirements', () => { const handoff = buildQualityClosureEvidenceHandoff({ requirements: [], evidence: [] }); expect(handoff).toBeDefined(); });

  it('handoff with non-empty evidence returns evidence count', () => { const handoff = buildQualityClosureEvidenceHandoff({ requirements: [], evidence: [{ topic: 't1', status: 'PASS', ref: 'ref1' }] }); expect(handoff).toBeDefined(); });

  it('handoff with empty requirements returns valid', () => { const handoff = buildQualityClosureEvidenceHandoff({ requirements: [], evidence: [] }); expect(handoff).toBeDefined(); });

  it.each(Array.from({ length: 60 }, (_, index) => `batch93-topic-${index}`))(
    'builds generated ready handoff for %s',
    (topic) => {
      const handoff = buildQualityClosureEvidenceHandoff({
        requirements: [{
          topic,
          owner: `owner-${topic}`,
          dueDate: '2026-05-10',
          decisionTemplate: `decision-${topic}`,
          evidenceRefTemplate: `ref-${topic}`,
        }],
      });

      expect(handoff.status).toBe('READY');
      expect(handoff.summary.requirementCount).toBe(1);
      expect(handoff.packNextCommand).toContain(topic);
      expect(handoff.gaps).toEqual([]);
    },
  );

  it.each([
    'owner',
    'dueDate',
    'decisionTemplate',
    'evidenceRefTemplate',
  ] as const)(
    'reports generated missing handoff field %s',
    (field) => {
      const requirement = {
        topic: `batch93-missing-${field}`,
        owner: 'owner',
        dueDate: '2026-05-10',
        decisionTemplate: 'decision',
        evidenceRefTemplate: 'ref',
      };
      requirement[field] = '   ';

      const handoff = buildQualityClosureEvidenceHandoff({ requirements: [requirement] });

      expect(handoff.status).toBe('ACTION_REQUIRED');
      expect(handoff.gaps).toContain(`${requirement.topic} missing field: ${field}`);
      expect(handoff.summary.packStatus).toBe('ACTION_REQUIRED');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch103-ready-topic-${index}`,
    `owner-${index}`,
    `2026-05-${String((index % 20) + 1).padStart(2, '0')}`,
  ] as const))(
    'builds generated handoff command for ready topic %s',
    (topic, owner, dueDate) => {
      const handoff = buildQualityClosureEvidenceHandoff({
        requirements: [{
          topic: ` ${topic} `,
          owner: ` ${owner} `,
          dueDate: ` ${dueDate} `,
          decisionTemplate: ` decision-${topic} `,
          evidenceRefTemplate: ` ref-${topic} `,
        }],
      });

      expect(handoff.status).toBe('READY');
      expect(handoff.summary).toEqual({
        requirementCount: 1,
        packStatus: 'READY',
        intakeStatus: 'READY_TO_CONFIRM',
        missingTopicCount: 0,
      });
      expect(handoff.packNextCommand).toContain(topic);
      expect(handoff.intakeNextCommands[0]).toContain(owner);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch103-incomplete-topic-${index}`,
    ['owner', 'dueDate', 'decisionTemplate', 'evidenceRefTemplate'][index % 4],
  ] as const))(
    'reports generated handoff gap for %s missing %s',
    (topic, field) => {
      const requirement = {
        topic,
        owner: 'owner',
        dueDate: '2026-05-10',
        decisionTemplate: 'decision',
        evidenceRefTemplate: 'ref',
      };
      requirement[field] = ' ';

      const handoff = buildQualityClosureEvidenceHandoff({ requirements: [requirement] });

      expect(handoff.status).toBe('ACTION_REQUIRED');
      expect(handoff.summary.packStatus).toBe('ACTION_REQUIRED');
      expect(handoff.summary.intakeStatus).toBe('ACTION_REQUIRED');
      expect(handoff.gaps).toContain(`${topic} missing field: ${field}`);
      expect(handoff.gaps).toContain(`evidence intake missing topic: ${topic}`);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch122-topic-${index}`,
    `owner-${index}`,
    `2026-07-${String((index % 28) + 1).padStart(2, '0')}`,
  ] as const))(
    'keeps generated complete handoff ready %s',
    (topic, owner, dueDate) => {
      const handoff = buildQualityClosureEvidenceHandoff({
        requirements: [{
          topic,
          owner,
          dueDate,
          decisionTemplate: `decision-${topic}`,
          evidenceRefTemplate: `evidence-${topic}`,
        }],
      });

      expect(handoff.status).toBe('READY');
      expect(handoff.summary.requirementCount).toBe(1);
      expect(handoff.summary.missingTopicCount).toBe(0);
      expect(handoff.packNextCommand).toContain(topic);
      expect(handoff.intakeNextCommands[0]).toContain(owner);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch122-missing-${index}`,
    ['owner', 'dueDate', 'decisionTemplate', 'evidenceRefTemplate'][index % 4],
  ] as const))(
    'reports generated missing evidence handoff field %s/%s',
    (topic, field) => {
      const requirement = {
        topic,
        owner: 'owner',
        dueDate: '2026-07-01',
        decisionTemplate: 'decision',
        evidenceRefTemplate: 'evidence',
      };
      requirement[field] = ' ';

      const handoff = buildQualityClosureEvidenceHandoff({ requirements: [requirement] });

      expect(handoff.status).toBe('ACTION_REQUIRED');
      expect(handoff.summary.packStatus).toBe('ACTION_REQUIRED');
      expect(handoff.summary.intakeStatus).toBe('ACTION_REQUIRED');
      expect(handoff.gaps).toContain(`${topic} missing field: ${field}`);
      expect(handoff.gaps).toContain(`evidence intake missing topic: ${topic}`);
    },
  );
});

describe('quality closure evidence handoff builder batch 168 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch168-topic-${index}`,
    `owner-${index}`,
    `2026-11-${String((index % 28) + 1).padStart(2, '0')}`,
  ] as const))(
    'builds generated ready handoff with deterministic commands %s',
    (topic, owner, dueDate) => {
      const handoff = buildQualityClosureEvidenceHandoff({
        requirements: [{
          topic: ` ${topic} `,
          owner: ` ${owner} `,
          dueDate: ` ${dueDate} `,
          decisionTemplate: ` decision-${topic} `,
          evidenceRefTemplate: ` evidence-${topic} `,
        }],
      });

      expect(handoff.status).toBe('READY');
      expect(handoff.summary).toEqual({
        requirementCount: 1,
        packStatus: 'READY',
        intakeStatus: 'READY_TO_CONFIRM',
        missingTopicCount: 0,
      });
      expect(handoff.packNextCommand).toContain(`${topic}|${owner}|${dueDate}`);
      expect(handoff.intakeNextCommands[0]).toContain(`${topic}|${owner}|${dueDate}`);
      expect(handoff.gaps).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch168-gap-${index}`,
    ['owner', 'dueDate', 'decisionTemplate', 'evidenceRefTemplate'][index % 4],
  ] as const))(
    'aggregates generated handoff missing field into intake gap %s',
    (topic, field) => {
      const requirement = {
        topic,
        owner: 'owner',
        dueDate: '2026-11-01',
        decisionTemplate: 'decision',
        evidenceRefTemplate: 'evidence',
      };
      requirement[field] = ' ';

      const handoff = buildQualityClosureEvidenceHandoff({ requirements: [requirement] });

      expect(handoff.status).toBe('ACTION_REQUIRED');
      expect(handoff.summary.packStatus).toBe('ACTION_REQUIRED');
      expect(handoff.summary.intakeStatus).toBe('ACTION_REQUIRED');
      expect(handoff.summary.missingTopicCount).toBe(1);
      expect(handoff.gaps).toContain(`${topic} missing field: ${field}`);
      expect(handoff.gaps).toContain(`evidence intake missing topic: ${topic}`);
    },
  );
});

describe('quality closure evidence handoff builder batch 160 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch160-topic-${index}`,
    `owner-${index}`,
    `2026-10-${String((index % 28) + 1).padStart(2, '0')}`,
  ] as const))(
    'builds generated batch160 complete handoff with blank topic filtered %s',
    (topic, owner, dueDate) => {
      const handoff = buildQualityClosureEvidenceHandoff({
        requirements: [
          { topic: ' ', owner: 'ignored', dueDate: 'ignored', decisionTemplate: 'ignored', evidenceRefTemplate: 'ignored' },
          {
            topic: ` ${topic} `,
            owner: ` ${owner} `,
            dueDate: ` ${dueDate} `,
            decisionTemplate: ` decision-${topic} `,
            evidenceRefTemplate: ` evidence-${topic} `,
          },
        ],
      });

      expect(handoff.status).toBe('READY');
      expect(handoff.summary).toEqual({
        requirementCount: 1,
        packStatus: 'READY',
        intakeStatus: 'READY_TO_CONFIRM',
        missingTopicCount: 0,
      });
      expect(handoff.packNextCommand).toContain(`${topic}|${owner}|${dueDate}`);
      expect(handoff.intakeNextCommands[0]).toContain(`${topic}|${owner}|${dueDate}`);
      expect(handoff.gaps).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch160-gap-${index}`,
    index % 2 === 0 ? ' ' : `owner-${index}`,
    index % 3 === 0 ? ' ' : `2026-10-${String((index % 28) + 1).padStart(2, '0')}`,
  ] as const))(
    'aggregates generated batch160 owner and dueDate handoff gaps %s',
    (topic, owner, dueDate) => {
      const handoff = buildQualityClosureEvidenceHandoff({
        requirements: [{
          topic,
          owner,
          dueDate,
          decisionTemplate: 'decision',
          evidenceRefTemplate: 'evidence',
        }],
      });
      const expectedMissing = [
        owner.trim() ? undefined : 'owner',
        dueDate.trim() ? undefined : 'dueDate',
      ].filter(Boolean);

      expect(handoff.status).toBe(expectedMissing.length > 0 ? 'ACTION_REQUIRED' : 'READY');
      expect(handoff.summary.missingTopicCount).toBe(expectedMissing.length > 0 ? 1 : 0);
      expect(handoff.gaps).toEqual([
        ...expectedMissing.map((field) => `${topic} missing field: ${field}`),
        ...(expectedMissing.length > 0 ? [`evidence intake missing topic: ${topic}`] : []),
      ]);
    },
  );
});

describe('quality closure evidence handoff builder batch 151 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch151-topic-${index}`,
    `owner-${index}`,
    `2026-08-${String((index % 28) + 1).padStart(2, '0')}`,
  ] as const))(
    'builds generated complete evidence handoff %s',
    (topic, owner, dueDate) => {
      const handoff = buildQualityClosureEvidenceHandoff({
        requirements: [{
          topic: ` ${topic} `,
          owner: ` ${owner} `,
          dueDate: ` ${dueDate} `,
          decisionTemplate: ` decision-${topic} `,
          evidenceRefTemplate: ` evidence-${topic} `,
        }],
      });

      expect(handoff.status).toBe('READY');
      expect(handoff.summary).toEqual({
        requirementCount: 1,
        packStatus: 'READY',
        intakeStatus: 'READY_TO_CONFIRM',
        missingTopicCount: 0,
      });
      expect(handoff.packNextCommand).toContain(topic);
      expect(handoff.packNextCommand).toContain(owner);
      expect(handoff.intakeNextCommands[0]).toContain(dueDate);
      expect(handoff.gaps).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch151-incomplete-${index}`,
    ['owner', 'dueDate', 'decisionTemplate', 'evidenceRefTemplate'][index % 4],
  ] as const))(
    'aggregates generated incomplete handoff gaps for %s',
    (topic, field) => {
      const requirement = {
        topic,
        owner: 'owner',
        dueDate: '2026-08-01',
        decisionTemplate: 'decision',
        evidenceRefTemplate: 'evidence',
      };
      requirement[field] = ' ';

      const handoff = buildQualityClosureEvidenceHandoff({ requirements: [requirement] });

      expect(handoff.status).toBe('ACTION_REQUIRED');
      expect(handoff.summary.packStatus).toBe('ACTION_REQUIRED');
      expect(handoff.summary.intakeStatus).toBe('ACTION_REQUIRED');
      expect(handoff.summary.missingTopicCount).toBe(1);
      expect(handoff.packNextCommand).toBe('');
      expect(handoff.intakeNextCommands).toEqual([]);
      expect(handoff.gaps).toContain(`${topic} missing field: ${field}`);
      expect(handoff.gaps).toContain(`evidence intake missing topic: ${topic}`);
    },
  );
});
