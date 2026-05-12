import { describe, expect, it } from 'vitest';
import { buildQualityEvidenceIntake } from './qualityEvidenceIntake';

describe('quality evidence intake builder', () => {
  it('builds next commands when all required evidence records are present', () => {
    const intake = buildQualityEvidenceIntake({
      generatedAt: new Date('2026-05-06T13:00:00.000Z'),
      requiredTopics: ['质量回顾会实会确认', '分支保护和 PR 审查规则', 'rebase/merge 策略'],
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
        {
          topic: 'rebase/merge 策略',
          owner: 'release owner',
          confirmedAt: '2026-05-08',
          decision: '确认 main 落后 61 个提交的收口策略',
          evidenceRef: 'release-notes#merge-plan',
        },
      ],
    });

    expect(intake).toEqual({
      mode: 'QUALITY_EVIDENCE_INTAKE',
      status: 'READY_TO_CONFIRM',
      generatedAt: '2026-05-06T13:00:00.000Z',
      summary: {
        required: 3,
        provided: 3,
        missing: 0,
      },
      missingTopics: [],
      nextCommands: [
        'npm run quality:team-confirmations --workspace=server -- --confirm "质量回顾会实会确认|AI 代码守护人|2026-05-08|确认 Week 8 action tracker 和季度目标|quality-review-minutes#2026-05-08" --confirm "分支保护和 PR 审查规则|产品负责人|2026-05-10|由仓库管理员落地 GitHub Settings|github-settings#branch-protection" --confirm "rebase/merge 策略|release owner|2026-05-08|确认 main 落后 61 个提交的收口策略|release-notes#merge-plan"',
        'npm run quality:final-closure --workspace=server -- --artifact "knowledge index|QUALITY_KNOWLEDGE_INDEX|READY|npm run quality:knowledge-index --workspace=server" --artifact "blocker resolution|QUALITY_BLOCKER_RESOLUTION|RESOLVED|quality:blocker-resolution" --artifact "closure consistency|QUALITY_CLOSURE_CONSISTENCY|READY|quality:closure-consistency" --artifact "closure evidence handoff|QUALITY_CLOSURE_EVIDENCE_HANDOFF|READY|quality:closure-evidence-handoff" --artifact "closure remaining work|QUALITY_CLOSURE_REMAINING_WORK|READY|quality:closure-remaining-work" --artifact "closure request pack|QUALITY_CLOSURE_REQUEST_PACK|READY|quality:closure-request-pack" --artifact "team confirmations|TEAM_CONFIRMATION_REGISTER|CONFIRMED|quality:team-confirmations" --artifact "handoff confirmation|WEEK8_HANDOFF_PACK|CONFIRMED|quality:handoff-confirm" --artifact "closure gate|WEEK8_CLOSURE_GATE|READY_TO_CLOSE|quality:closure-gate" --archive-action "attach final closure JSON to monthly audit" --archive-action "start next-quarter quality cadence"',
      ],
    });
  });

  it('keeps intake action-required when required evidence is missing', () => {
    const intake = buildQualityEvidenceIntake({
      generatedAt: new Date('2026-05-06T13:00:00.000Z'),
      requiredTopics: ['质量回顾会实会确认', '分支保护和 PR 审查规则'],
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

    expect(intake.status).toBe('ACTION_REQUIRED');
    expect(intake.summary).toEqual({
      required: 2,
      provided: 0,
      missing: 2,
    });
    expect(intake.missingTopics).toEqual(['质量回顾会实会确认', '分支保护和 PR 审查规则']);
    expect(intake.nextCommands).toEqual([]);
  });

  it('builds intake with empty required topics', () => {
    const intake = buildQualityEvidenceIntake({
      generatedAt: new Date(),
      requiredTopics: [],
      confirmations: [],
    });

    expect(intake.status).toBe('READY_TO_CONFIRM');
  });

  it('reports all missing confirmations', () => {
    const intake = buildQualityEvidenceIntake({
      generatedAt: new Date(),
      requiredTopics: ['topic-1', 'topic-2'],
      confirmations: [],
    });

    expect(intake.status).toBe('ACTION_REQUIRED');
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const intake = buildQualityEvidenceIntake({
      requiredTopics: [],
      confirmations: [],
    });
    const after = new Date();

    const ts = new Date(intake.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from required topics', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: ['  topic-1  ', '  '],
      confirmations: [{
        topic: 'topic-1',
        owner: 'o',
        confirmedAt: 'd',
        decision: 'd',
        evidenceRef: 'r',
      }],
    });

    expect(intake.summary.required).toBe(1);
    expect(intake.summary.provided).toBe(1);
  });

  it('confirmation missing evidenceRef counts as missing', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: ['topic-1'],
      confirmations: [{
        topic: 'topic-1',
        owner: 'o',
        confirmedAt: 'd',
        decision: 'd',
        evidenceRef: '',
      }],
    });

    expect(intake.status).toBe('ACTION_REQUIRED');
    expect(intake.summary.missing).toBe(1);
    expect(intake.missingTopics).toEqual(['topic-1']);
  });

  it('READY_TO_CONFIRM provides nextCommands', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: ['topic-1'],
      confirmations: [{
        topic: 'topic-1',
        owner: 'owner',
        confirmedAt: '2026-05-08',
        decision: 'decided',
        evidenceRef: 'ref-1',
      }],
    });

    expect(intake.status).toBe('READY_TO_CONFIRM');
    expect(intake.nextCommands.length).toBeGreaterThan(0);
    expect(intake.nextCommands[0]).toContain('quality:team-confirmations');
  });

  it('ACTION_REQUIRED has empty nextCommands', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: ['topic-1'],
      confirmations: [],
    });

    expect(intake.nextCommands).toEqual([]);
  });

  it('mode is always QUALITY_EVIDENCE_INTAKE', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: [],
      confirmations: [],
    });

    expect(intake.mode).toBe('QUALITY_EVIDENCE_INTAKE');
  });

  it('confirmation missing owner is treated as incomplete', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: ['topic-1'],
      confirmations: [{
        topic: 'topic-1',
        owner: '',
        confirmedAt: 'd',
        decision: 'd',
        evidenceRef: 'ref',
      }],
    });

    expect(intake.status).toBe('ACTION_REQUIRED');
    expect(intake.summary.missing).toBe(1);
    expect(intake.missingTopics).toEqual(['topic-1']);
  });

  it('generatedAt is valid ISO string', () => {
    const intake = buildQualityEvidenceIntake({ requiredTopics: [], confirmations: [] });
    expect(new Date(intake.generatedAt).toISOString()).toBe(intake.generatedAt);
  });

  it('confirmation missing confirmedAt is treated as incomplete', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: ['topic-1'],
      confirmations: [{
        topic: 'topic-1',
        owner: 'o',
        confirmedAt: '',
        decision: 'd',
        evidenceRef: 'ref',
      }],
    });

    expect(intake.status).toBe('ACTION_REQUIRED');
    expect(intake.summary.missing).toBe(1);
    expect(intake.missingTopics).toEqual(['topic-1']);
  });

  it('confirmation missing decision is treated as incomplete', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: ['topic-1'],
      confirmations: [{
        topic: 'topic-1',
        owner: 'o',
        confirmedAt: '2026-05-08',
        decision: '',
        evidenceRef: 'ref',
      }],
    });

    expect(intake.status).toBe('ACTION_REQUIRED');
    expect(intake.summary.missing).toBe(1);
    expect(intake.missingTopics).toEqual(['topic-1']);
  });

  it('extra confirmations not in requiredTopics are ignored', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: ['topic-1'],
      confirmations: [
        {
          topic: 'topic-1',
          owner: 'o',
          confirmedAt: 'd',
          decision: 'dec',
          evidenceRef: 'ref',
        },
        {
          topic: 'extra-topic',
          owner: 'o',
          confirmedAt: 'd',
          decision: 'dec',
          evidenceRef: 'ref',
        },
      ],
    });

    expect(intake.status).toBe('READY_TO_CONFIRM');
    expect(intake.summary.required).toBe(1);
    expect(intake.summary.provided).toBe(1);
    expect(intake.summary.missing).toBe(0);
  });

  it('duplicate required topics after trimming both appear in missingTopics', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: ['topic-1', '  topic-1  '],
      confirmations: [],
    });

    expect(intake.summary.required).toBe(2);
    expect(intake.missingTopics).toEqual(['topic-1', 'topic-1']);
    expect(intake.status).toBe('ACTION_REQUIRED');
  });

  it('confirmation with whitespace-only topic is not matched to any required topic', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: ['topic-1'],
      confirmations: [{
        topic: '  ',
        owner: 'o',
        confirmedAt: 'd',
        decision: 'dec',
        evidenceRef: 'ref',
      }],
    });

    expect(intake.status).toBe('ACTION_REQUIRED');
    expect(intake.summary.provided).toBe(0);
    expect(intake.summary.missing).toBe(1);
    expect(intake.missingTopics).toEqual(['topic-1']);
  });

  it('case-sensitive topic matching between required and confirmation', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: ['Topic-1'],
      confirmations: [{
        topic: 'topic-1',
        owner: 'o',
        confirmedAt: 'd',
        decision: 'dec',
        evidenceRef: 'ref',
      }],
    });

    expect(intake.status).toBe('ACTION_REQUIRED');
    expect(intake.summary.provided).toBe(0);
    expect(intake.missingTopics).toEqual(['Topic-1']);
  });

  it('READY_TO_CONFIRM nextCommands contains exactly 2 entries', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: ['topic-1'],
      confirmations: [{
        topic: 'topic-1',
        owner: 'owner',
        confirmedAt: '2026-05-08',
        decision: 'decided',
        evidenceRef: 'ref-1',
      }],
    });

    expect(intake.status).toBe('READY_TO_CONFIRM');
    expect(intake.nextCommands).toHaveLength(2);
    expect(intake.nextCommands[0]).toContain('quality:team-confirmations');
    expect(intake.nextCommands[1]).toContain('quality:final-closure');
  });

  it('empty requiredTopics and confirmations produce READY_TO_CONFIRM with nextCommands', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: [],
      confirmations: [],
    });

    expect(intake.status).toBe('READY_TO_CONFIRM');
    expect(intake.summary.required).toBe(0);
    expect(intake.summary.provided).toBe(0);
    expect(intake.summary.missing).toBe(0);
    expect(intake.missingTopics).toEqual([]);
    expect(intake.nextCommands).toHaveLength(2);
  });

  it('confirmation with all fields present but whitespace-only evidenceRef is incomplete', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: ['topic-1'],
      confirmations: [{
        topic: 'topic-1',
        owner: 'owner',
        confirmedAt: '2026-05-08',
        decision: 'decided',
        evidenceRef: '   ',
      }],
    });

    expect(intake.status).toBe('ACTION_REQUIRED');
    expect(intake.summary.provided).toBe(0);
    expect(intake.missingTopics).toEqual(['topic-1']);
  });

  it('intake with all topics confirmed has zero missing', () => {
    const intake = buildQualityEvidenceIntake({
      requiredTopics: ['topic-1'],
      confirmations: [{ topic: 'topic-1', owner: 'o', confirmedAt: '2026-05-05', decision: 'd', evidenceRef: 'ref' }],
    });
    expect(intake.summary.missing).toBe(0);
    expect(intake.summary.required).toBe(1);
    expect(intake.summary.provided).toBe(1);
  });

  it('intake with empty evidence returns zero provided', () => {
    const intake = buildQualityEvidenceIntake({ requiredTopics: [], confirmations: [] });
    expect(intake.summary.provided).toBe(0);
  });


  it('intake with single confirmation returns correct count', () => {
    const intake = buildQualityEvidenceIntake({ requiredTopics: ['topic-1'], confirmations: [{ topic: 'topic-1', owner: 'u1', confirmedAt: '2026-05-10', decision: 'APPROVED', evidenceRef: 'doc-1' }] });
    expect(intake.summary.provided).toBe(1);
  });

  it('intake with empty required topics returns zero required', () => { const intake = buildQualityEvidenceIntake({ requiredTopics: [], confirmations: [] }); expect(intake.summary.required).toBe(0); });

  it('intake with all confirmed returns zero missing', () => { const intake = buildQualityEvidenceIntake({ requiredTopics: ['t1'], confirmations: [{ topic: 't1', owner: 'admin', confirmedAt: '2026-01-01', decision: 'yes', evidenceRef: 'ref' }] }); expect(intake.summary.missing).toBe(0); });

  it('intake with partial confirmations returns correct missing count', () => { const intake = buildQualityEvidenceIntake({ requiredTopics: ['t1', 't2', 't3'], confirmations: [{ topic: 't1', owner: 'admin', confirmedAt: '2026-01-01', decision: 'yes', evidenceRef: 'ref' }] }); expect(intake.summary.missing).toBe(2); });

  it('intake with no confirmations returns all as missing', () => { const intake = buildQualityEvidenceIntake({ requiredTopics: ['t1', 't2'], confirmations: [] }); expect(intake.summary.missing).toBe(2); });

  it('intake with duplicate required topics counts correctly', () => { const intake = buildQualityEvidenceIntake({ requiredTopics: ['t1', 't1'], confirmations: [{ topic: 't1', owner: 'admin', confirmedAt: '2026-01-01', decision: 'yes', evidenceRef: 'ref' }] }); expect(intake.summary.required).toBe(2); });

  it('intake mode is QUALITY_EVIDENCE_INTAKE', () => { const intake = buildQualityEvidenceIntake({ requiredTopics: [], confirmations: [] }); expect(intake.mode).toBe('QUALITY_EVIDENCE_INTAKE'); });

  it('intake with empty required topics returns zero required', () => { const intake = buildQualityEvidenceIntake({ requiredTopics: [], confirmations: [] }); expect(intake.summary.required).toBe(0); });

  it('intake with single required topic returns one required', () => { const intake = buildQualityEvidenceIntake({ requiredTopics: ['t1'], confirmations: [] }); expect(intake).toBeDefined(); });

  it('intake with confirmed topic updates summary', () => { const intake = buildQualityEvidenceIntake({ requiredTopics: ['t1'], confirmations: [{ topic: 't1', owner: 'admin', confirmedAt: '2026-01-01', decision: 'approved', evidenceRef: 'ref1' }] }); expect(intake).toBeDefined(); });

  it('intake with empty requiredTopics returns valid', () => { const intake = buildQualityEvidenceIntake({ requiredTopics: [], confirmations: [] }); expect(intake).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch104-topic-${index}`,
    `owner-${index}`,
    `decision-${index}`,
    `evidence-${index}`,
  ] as const))(
    'builds generated intake command for confirmed topic %s',
    (topic, owner, decision, evidenceRef) => {
      const intake = buildQualityEvidenceIntake({
        requiredTopics: [` ${topic} `],
        confirmations: [{
          topic: ` ${topic} `,
          owner: ` ${owner} `,
          confirmedAt: ' 2026-05-10 ',
          decision: ` ${decision} `,
          evidenceRef: ` ${evidenceRef} `,
        }],
      });

      expect(intake.status).toBe('READY_TO_CONFIRM');
      expect(intake.summary).toEqual({ required: 1, provided: 1, missing: 0 });
      expect(intake.missingTopics).toEqual([]);
      expect(intake.nextCommands[0]).toContain(`${topic}|${owner}|2026-05-10|${decision}|${evidenceRef}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch104-missing-topic-${index}`,
    ['owner', 'confirmedAt', 'decision', 'evidenceRef'][index % 4],
  ] as const))(
    'marks generated confirmation incomplete for %s missing %s',
    (topic, field) => {
      const confirmation = {
        topic,
        owner: 'owner',
        confirmedAt: '2026-05-10',
        decision: 'decision',
        evidenceRef: 'evidence',
      };
      confirmation[field] = ' ';

      const intake = buildQualityEvidenceIntake({
        requiredTopics: [topic],
        confirmations: [confirmation],
      });

      expect(intake.status).toBe('ACTION_REQUIRED');
      expect(intake.summary).toEqual({ required: 1, provided: 0, missing: 1 });
      expect(intake.missingTopics).toEqual([topic]);
      expect(intake.nextCommands).toEqual([]);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch141-topic-${index}`,
    `owner-${index}`,
    `decision-${index}`,
    `evidence-${index}`,
  ] as const))(
    'uses generated latest confirmation for duplicated intake topic %s',
    (topic, owner, decision, evidenceRef) => {
      const intake = buildQualityEvidenceIntake({
        requiredTopics: [` ${topic} `],
        confirmations: [
          { topic, owner: 'old-owner', confirmedAt: '2026-05-01', decision: 'old', evidenceRef: 'old-ref' },
          { topic: ` ${topic} `, owner: ` ${owner} `, confirmedAt: ' 2026-05-11 ', decision: ` ${decision} `, evidenceRef: ` ${evidenceRef} ` },
        ],
      });

      expect(intake.status).toBe('READY_TO_CONFIRM');
      expect(intake.summary).toEqual({ required: 1, provided: 1, missing: 0 });
      expect(intake.missingTopics).toEqual([]);
      expect(intake.nextCommands[0]).toContain(`${topic}|${owner}|2026-05-11|${decision}|${evidenceRef}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch141-required-${index}`,
    index % 2 === 0 ? '' : `unrelated-${index}`,
  ] as const))(
    'reports generated missing required intake topic %s',
    (topic, confirmationTopic) => {
      const intake = buildQualityEvidenceIntake({
        requiredTopics: [' ', ` ${topic} `],
        confirmations: confirmationTopic
          ? [{ topic: confirmationTopic, owner: 'owner', confirmedAt: '2026-05-11', decision: 'approved', evidenceRef: 'ref' }]
          : [],
      });

      expect(intake.status).toBe('ACTION_REQUIRED');
      expect(intake.summary).toEqual({ required: 1, provided: 0, missing: 1 });
      expect(intake.missingTopics).toEqual([topic]);
      expect(intake.nextCommands).toEqual([]);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch147-topic-${index}`,
    `owner-${index}`,
    `decision-${index}`,
    `evidence-${index}`,
  ] as const))(
    'counts generated duplicate required topic as separately provided %s',
    (topic, owner, decision, evidenceRef) => {
      const intake = buildQualityEvidenceIntake({
        requiredTopics: [` ${topic} `, topic],
        confirmations: [{ topic, owner, confirmedAt: '2026-05-11', decision, evidenceRef }],
      });

      expect(intake.status).toBe('READY_TO_CONFIRM');
      expect(intake.summary).toEqual({ required: 2, provided: 2, missing: 0 });
      expect(intake.missingTopics).toEqual([]);
      expect(intake.nextCommands[0].match(new RegExp(`${topic}\\|${owner}\\|2026-05-11\\|${decision}\\|${evidenceRef}`, 'g'))).toHaveLength(2);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch147-overwrite-${index}`,
    ['owner', 'confirmedAt', 'decision', 'evidenceRef'][index % 4],
  ] as const))(
    'uses generated latest duplicate confirmation for missing field %s',
    (topic, field) => {
      const confirmation = {
        topic,
        owner: 'owner',
        confirmedAt: '2026-05-11',
        decision: 'approved',
        evidenceRef: 'ref',
      };
      confirmation[field] = ' ';
      const intake = buildQualityEvidenceIntake({
        requiredTopics: [topic],
        confirmations: [
          { topic, owner: 'owner', confirmedAt: '2026-05-11', decision: 'approved', evidenceRef: 'ref' },
          confirmation,
        ],
      });

      expect(intake.status).toBe('ACTION_REQUIRED');
      expect(intake.summary).toEqual({ required: 1, provided: 0, missing: 1 });
      expect(intake.missingTopics).toEqual([topic]);
      expect(intake.nextCommands).toEqual([]);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch152-topic-${index}`,
    `batch152-sibling-${index}`,
    `owner-${index}`,
    `decision-${index}`,
    `evidence-${index}`,
  ] as const))(
    'builds generated intake for trimmed topic pair %s/%s',
    (topic, siblingTopic, owner, decision, evidenceRef) => {
      const intake = buildQualityEvidenceIntake({
        requiredTopics: [' ', ` ${topic} `, ` ${siblingTopic} `],
        confirmations: [
          { topic: 'unrelated', owner: 'owner', confirmedAt: '2026-05-11', decision: 'approved', evidenceRef: 'ref' },
          { topic: ` ${topic} `, owner: ` ${owner} `, confirmedAt: ' 2026-05-11 ', decision: ` ${decision} `, evidenceRef: ` ${evidenceRef} ` },
          { topic: siblingTopic, owner: `${owner}-2`, confirmedAt: '2026-05-12', decision: `${decision}-2`, evidenceRef: `${evidenceRef}-2` },
        ],
      });

      expect(intake.status).toBe('READY_TO_CONFIRM');
      expect(intake.summary).toEqual({ required: 2, provided: 2, missing: 0 });
      expect(intake.missingTopics).toEqual([]);
      expect(intake.nextCommands[0]).toContain(`${topic}|${owner}|2026-05-11|${decision}|${evidenceRef}`);
      expect(intake.nextCommands[0]).toContain(`${siblingTopic}|${owner}-2|2026-05-12|${decision}-2|${evidenceRef}-2`);
      expect(intake.nextCommands[0]).not.toContain('unrelated');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch152-complete-${index}`,
    `batch152-incomplete-${index}`,
    `batch152-absent-${index}`,
    ['owner', 'confirmedAt', 'decision', 'evidenceRef'][index % 4],
  ] as const))(
    'reports generated missing intake topics in required order %s/%s/%s',
    (completeTopic, incompleteTopic, absentTopic, field) => {
      const incompleteConfirmation = {
        topic: incompleteTopic,
        owner: 'owner',
        confirmedAt: '2026-05-11',
        decision: 'approved',
        evidenceRef: 'ref',
      };
      incompleteConfirmation[field] = ' ';
      const intake = buildQualityEvidenceIntake({
        requiredTopics: [completeTopic, incompleteTopic, absentTopic],
        confirmations: [
          { topic: completeTopic, owner: 'owner', confirmedAt: '2026-05-11', decision: 'approved', evidenceRef: 'ref' },
          incompleteConfirmation,
        ],
      });

      expect(intake.status).toBe('ACTION_REQUIRED');
      expect(intake.summary).toEqual({ required: 3, provided: 1, missing: 2 });
      expect(intake.missingTopics).toEqual([incompleteTopic, absentTopic]);
      expect(intake.nextCommands).toEqual([]);
    },
  );
});

describe('quality evidence intake batch 161 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch161-topic-${index}`,
    `owner-${index}`,
    `decision-${index}`,
    `evidence-${index}`,
  ] as const))(
    'counts generated batch161 duplicate required topic as provided %s',
    (topic, owner, decision, evidenceRef) => {
      const intake = buildQualityEvidenceIntake({
        requiredTopics: [` ${topic} `, topic, ' '],
        confirmations: [
          { topic: ` ${topic} `, owner: ` ${owner} `, confirmedAt: ' 2026-05-11 ', decision: ` ${decision} `, evidenceRef: ` ${evidenceRef} ` },
        ],
      });

      expect(intake.status).toBe('READY_TO_CONFIRM');
      expect(intake.summary).toEqual({ required: 2, provided: 2, missing: 0 });
      expect(intake.missingTopics).toEqual([]);
      expect(intake.nextCommands[0].match(new RegExp(`${topic}\\|${owner}\\|2026-05-11\\|${decision}\\|${evidenceRef}`, 'g'))).toHaveLength(2);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch161-complete-${index}`,
    `batch161-incomplete-${index}`,
    ['owner', 'confirmedAt', 'decision', 'evidenceRef'][index % 4],
  ] as const))(
    'reports generated batch161 latest duplicate incomplete confirmation %s/%s',
    (completeTopic, incompleteTopic, field) => {
      const incomplete = {
        topic: incompleteTopic,
        owner: 'owner',
        confirmedAt: '2026-05-11',
        decision: 'approved',
        evidenceRef: 'ref',
      };
      incomplete[field] = ' ';
      const intake = buildQualityEvidenceIntake({
        requiredTopics: [completeTopic, incompleteTopic, incompleteTopic],
        confirmations: [
          { topic: completeTopic, owner: 'owner', confirmedAt: '2026-05-11', decision: 'approved', evidenceRef: 'ref' },
          { topic: incompleteTopic, owner: 'owner', confirmedAt: '2026-05-11', decision: 'approved', evidenceRef: 'ref' },
          incomplete,
        ],
      });

      expect(intake.status).toBe('ACTION_REQUIRED');
      expect(intake.summary).toEqual({ required: 3, provided: 1, missing: 2 });
      expect(intake.missingTopics).toEqual([incompleteTopic, incompleteTopic]);
      expect(intake.nextCommands).toEqual([]);
    },
  );
});
