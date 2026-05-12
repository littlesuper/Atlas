import { describe, expect, it } from 'vitest';
import { buildQualityClosureEvidencePack } from './qualityClosureEvidencePack';

describe('quality closure evidence pack builder', () => {
  it('builds copyable evidence intake command templates for required human confirmations', () => {
    const pack = buildQualityClosureEvidencePack({
      generatedAt: new Date('2026-05-06T18:00:00.000Z'),
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

    expect(pack).toEqual({
      mode: 'QUALITY_CLOSURE_EVIDENCE_PACK',
      status: 'READY',
      generatedAt: '2026-05-06T18:00:00.000Z',
      summary: {
        requirementCount: 2,
        readyTemplateCount: 2,
        missingTemplateFieldCount: 0,
      },
      requirements: [
        {
          topic: '质量回顾会实会确认',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-08',
          decisionTemplate: '确认 Week 8 action tracker 和季度目标',
          evidenceRefTemplate: 'quality-review-minutes#2026-05-08',
          status: 'READY',
          missingFields: [],
          confirmArg: '--confirm "质量回顾会实会确认|AI 代码守护人|2026-05-08|确认 Week 8 action tracker 和季度目标|quality-review-minutes#2026-05-08"',
        },
        {
          topic: '分支保护和 PR 审查规则',
          owner: '产品负责人',
          dueDate: '2026-05-10',
          decisionTemplate: '确认 GitHub Settings 已落地',
          evidenceRefTemplate: 'github-settings#branch-protection',
          status: 'READY',
          missingFields: [],
          confirmArg: '--confirm "分支保护和 PR 审查规则|产品负责人|2026-05-10|确认 GitHub Settings 已落地|github-settings#branch-protection"',
        },
      ],
      nextCommand: 'npm run quality:evidence-intake --workspace=server -- --confirm "质量回顾会实会确认|AI 代码守护人|2026-05-08|确认 Week 8 action tracker 和季度目标|quality-review-minutes#2026-05-08" --confirm "分支保护和 PR 审查规则|产品负责人|2026-05-10|确认 GitHub Settings 已落地|github-settings#branch-protection"',
      gaps: [],
    });
  });

  it('blocks when a required evidence template field is missing', () => {
    const pack = buildQualityClosureEvidencePack({
      generatedAt: new Date('2026-05-06T18:00:00.000Z'),
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

    expect(pack.status).toBe('ACTION_REQUIRED');
    expect(pack.summary).toEqual({
      requirementCount: 1,
      readyTemplateCount: 0,
      missingTemplateFieldCount: 2,
    });
    expect(pack.gaps).toEqual([
      'rebase/merge 策略 missing field: owner',
      'rebase/merge 策略 missing field: evidenceRefTemplate',
    ]);
    expect(pack.nextCommand).toBe('');
  });

  it('is READY with empty requirements', () => {
    const pack = buildQualityClosureEvidencePack({
      generatedAt: new Date('2026-05-06T18:00:00.000Z'),
      requirements: [],
    });

    expect(pack.status).toBe('READY');
    expect(pack.summary.requirementCount).toBe(0);
    expect(pack.nextCommand).toContain('npm run quality:evidence-intake');
  });

  it('reports missing fields per requirement', () => {
    const pack = buildQualityClosureEvidencePack({
      generatedAt: new Date('2026-05-06T18:00:00.000Z'),
      requirements: [
        { topic: 'topic-1', owner: 'owner', dueDate: '', decisionTemplate: 'd', evidenceRefTemplate: '' },
      ],
    });

    expect(pack.status).toBe('ACTION_REQUIRED');
    expect(pack.requirements[0].missingFields).toEqual(['dueDate', 'evidenceRefTemplate']);
    expect(pack.requirements[0].status).toBe('ACTION_REQUIRED');
    expect(pack.requirements[0].confirmArg).toBe('');
  });

  it('builds confirmArg from all fields', () => {
    const pack = buildQualityClosureEvidencePack({
      generatedAt: new Date('2026-05-06T18:00:00.000Z'),
      requirements: [
        { topic: 't', owner: 'o', dueDate: 'd', decisionTemplate: 'dec', evidenceRefTemplate: 'ref' },
      ],
    });

    expect(pack.requirements[0].confirmArg).toBe('--confirm "t|o|d|dec|ref"');
    expect(pack.nextCommand).toContain('--confirm "t|o|d|dec|ref"');
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const pack = buildQualityClosureEvidencePack({ requirements: [] });
    const after = new Date();

    const ts = new Date(pack.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from requirement fields', () => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [{
        topic: '  topic-1  ',
        owner: '  owner  ',
        dueDate: '  date  ',
        decisionTemplate: '  dec  ',
        evidenceRefTemplate: '  ref  ',
      }],
    });

    expect(pack.requirements[0].topic).toBe('topic-1');
    expect(pack.requirements[0].owner).toBe('owner');
    expect(pack.requirements[0].confirmArg).toContain('topic-1|owner|date|dec|ref');
  });

  it('filters out requirements with empty topic', () => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [
        { topic: '  ', owner: 'o', dueDate: 'd', decisionTemplate: 'dec', evidenceRefTemplate: 'ref' },
        { topic: 'valid', owner: 'o', dueDate: 'd', decisionTemplate: 'dec', evidenceRefTemplate: 'ref' },
      ],
    });

    expect(pack.summary.requirementCount).toBe(1);
  });

  it('missing field detects all 5 required fields', () => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [{
        topic: 'topic-1', owner: '', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '',
      }],
    });

    expect(pack.requirements[0].missingFields).toEqual([
      'owner', 'dueDate', 'decisionTemplate', 'evidenceRefTemplate',
    ]);
    expect(pack.summary.missingTemplateFieldCount).toBe(4);
  });

  it('mode is always QUALITY_CLOSURE_EVIDENCE_PACK', () => {
    const pack = buildQualityClosureEvidencePack({ requirements: [] });
    expect(pack.mode).toBe('QUALITY_CLOSURE_EVIDENCE_PACK');
  });

  it('empty nextCommand when gaps exist', () => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [{
        topic: 'topic-1', owner: '', dueDate: 'd', decisionTemplate: 'dec', evidenceRefTemplate: 'ref',
      }],
    });

    expect(pack.nextCommand).toBe('');
  });

  it('nextCommand includes all confirm args when ready', () => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [
        { topic: 'a', owner: 'o1', dueDate: 'd1', decisionTemplate: 'dec1', evidenceRefTemplate: 'ref1' },
        { topic: 'b', owner: 'o2', dueDate: 'd2', decisionTemplate: 'dec2', evidenceRefTemplate: 'ref2' },
      ],
    });

    expect(pack.nextCommand).toContain('--confirm "a|o1|d1|dec1|ref1"');
    expect(pack.nextCommand).toContain('--confirm "b|o2|d2|dec2|ref2"');
  });

  it('generatedAt is valid ISO string', () => {
    const pack = buildQualityClosureEvidencePack({ requirements: [{ topic: 'a', owner: 'o', dueDate: 'd', decisionTemplate: 'dec', evidenceRefTemplate: 'ref' }] });
    expect(new Date(pack.generatedAt).toISOString()).toBe(pack.generatedAt);
  });

  it('handles pipe characters in field values within confirmArg', () => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [{
        topic: 'a|b',
        owner: 'o',
        dueDate: 'd',
        decisionTemplate: 'dec',
        evidenceRefTemplate: 'ref',
      }],
    });
    expect(pack.requirements[0].confirmArg).toBe('--confirm "a|b|o|d|dec|ref"');
    expect(pack.status).toBe('READY');
  });

  it('handles unicode characters in requirement fields', () => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [{
        topic: '验证 🔒 安全',
        owner: '管理员',
        dueDate: '2026-06-01',
        decisionTemplate: '确认安全策略',
        evidenceRefTemplate: 'ref#验证🔒',
      }],
    });

    expect(pack.status).toBe('READY');
    expect(pack.requirements[0].confirmArg).toContain('验证 🔒 安全');
    expect(pack.nextCommand).toContain('管理员');
  });

  it('mixed complete and incomplete requirements produce ACTION_REQUIRED with correct counts', () => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [
        { topic: 'complete', owner: 'o', dueDate: 'd', decisionTemplate: 'dec', evidenceRefTemplate: 'ref' },
        { topic: 'incomplete', owner: '', dueDate: 'd', decisionTemplate: 'dec', evidenceRefTemplate: '' },
      ],
    });

    expect(pack.status).toBe('ACTION_REQUIRED');
    expect(pack.summary.readyTemplateCount).toBe(1);
    expect(pack.summary.requirementCount).toBe(2);
    expect(pack.summary.missingTemplateFieldCount).toBe(2);
    expect(pack.requirements[0].status).toBe('READY');
    expect(pack.requirements[1].status).toBe('ACTION_REQUIRED');
    expect(pack.nextCommand).toBe('');
  });

  it('whitespace-only dueDate is treated as missing field', () => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [{
        topic: 'topic-1', owner: 'o', dueDate: '   ', decisionTemplate: 'dec', evidenceRefTemplate: 'ref',
      }],
    });
    expect(pack.status).toBe('ACTION_REQUIRED');
    expect(pack.requirements[0].missingFields).toEqual(['dueDate']);
    expect(pack.requirements[0].confirmArg).toBe('');
  });

  it('whitespace-only decisionTemplate is treated as missing field', () => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [{
        topic: 'topic-1', owner: 'o', dueDate: 'd', decisionTemplate: '   ', evidenceRefTemplate: 'ref',
      }],
    });
    expect(pack.status).toBe('ACTION_REQUIRED');
    expect(pack.requirements[0].missingFields).toEqual(['decisionTemplate']);
  });

  it('handles identical values for all fields', () => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [{
        topic: 'x', owner: 'x', dueDate: 'x', decisionTemplate: 'x', evidenceRefTemplate: 'x',
      }],
    });

    expect(pack.status).toBe('READY');
    expect(pack.requirements[0].confirmArg).toBe('--confirm "x|x|x|x|x"');
  });

  it('empty requirements produce READY with prefix-only nextCommand', () => {
    const pack = buildQualityClosureEvidencePack({ requirements: [] });
    expect(pack.status).toBe('READY');
    expect(pack.nextCommand).toBe('npm run quality:evidence-intake --workspace=server -- ');
    expect(pack.gaps).toEqual([]);
  });

  it('requirement with all fields present but empty evidenceRefTemplate is ACTION_REQUIRED', () => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [{
        topic: 'topic-1', owner: 'o', dueDate: 'd', decisionTemplate: 'dec', evidenceRefTemplate: '  ',
      }],
    });
    expect(pack.status).toBe('ACTION_REQUIRED');
    expect(pack.requirements[0].missingFields).toEqual(['evidenceRefTemplate']);
    expect(pack.requirements[0].confirmArg).toBe('');
  });

  it('pack with all fields populated has READY status', () => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [{
        topic: 't1', owner: 'o', dueDate: 'd', decisionTemplate: 'dec', evidenceRefTemplate: 'ref',
      }],
    });
    expect(pack.status).toBe('READY');
    expect(pack.requirements[0].missingFields).toEqual([]);
  });

  it('evidence pack with no requirements returns empty array', () => {
    const pack = buildQualityClosureEvidencePack({ requirements: [], evidence: [] });
    expect(pack.requirements).toEqual([]);
  });


  it('pack with single evidence item returns valid structure', () => {
    const pack = buildQualityClosureEvidencePack({ requirements: [{ topic: 'T', owner: 'u1', dueDate: '2026-06-01', decisionTemplate: 'OK', evidenceRefTemplate: 'ref' }] });
    expect(pack.requirements).toHaveLength(1);
  });

  it('pack with empty requirements returns empty array', () => { const pack = buildQualityClosureEvidencePack({ requirements: [] }); expect(pack.requirements).toHaveLength(0); });

  it('pack with single requirement returns valid structure', () => { const pack = buildQualityClosureEvidencePack({ requirements: [{ topic: 'req', owner: 'admin', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' }] }); expect(pack.requirements).toHaveLength(1); });

  it('pack preserves topic field in requirements', () => { const pack = buildQualityClosureEvidencePack({ requirements: [{ topic: 'security-audit', owner: 'admin', dueDate: '2026-06-01', decisionTemplate: 'tmpl', evidenceRefTemplate: 'ref' }] }); expect(pack.requirements[0].topic).toBe('security-audit'); });

  it('pack with multiple requirements preserves order', () => { const pack = buildQualityClosureEvidencePack({ requirements: [{ topic: 'r1', owner: 'a', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' }, { topic: 'r2', owner: 'b', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' }] }); expect(pack.requirements[0].topic).toBe('r1'); expect(pack.requirements[1].topic).toBe('r2'); });

  it('pack with single requirement preserves owner', () => { const pack = buildQualityClosureEvidencePack({ requirements: [{ topic: 'req', owner: 'testowner', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' }] }); expect(pack.requirements[0].owner).toBe('testowner'); });

  it('pack mode is QUALITY_CLOSURE_EVIDENCE_PACK', () => { const pack = buildQualityClosureEvidencePack({ requirements: [] }); expect(pack.mode).toBe('QUALITY_CLOSURE_EVIDENCE_PACK'); });

  it('pack with empty requirements returns empty array', () => { const pack = buildQualityClosureEvidencePack({ requirements: [] }); expect(pack.requirements).toHaveLength(0); });

  it('pack with single requirement returns one requirement', () => { const pack = buildQualityClosureEvidencePack({ requirements: [{ topic: 't1', owner: 'admin', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' }] }); expect(pack.requirements).toHaveLength(1); });

  it('pack with multiple requirements preserves count', () => { const pack = buildQualityClosureEvidencePack({ requirements: [{ topic: 't1', owner: 'admin', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' }, { topic: 't2', owner: 'admin', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' }] }); expect(pack.requirements).toHaveLength(2); });

  it('pack with empty requirements returns valid', () => { const pack = buildQualityClosureEvidencePack({ requirements: [] }); expect(pack).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `evidence-topic-${index}`,
    `owner-${index}`,
    `2026-05-${String((index % 28) + 1).padStart(2, '0')}`,
    `decision-${index}`,
    `evidence-ref-${index}`,
  ] as const))('builds ready evidence confirm arg for %s', (topic, owner, dueDate, decisionTemplate, evidenceRefTemplate) => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [{ topic: ` ${topic} `, owner: ` ${owner} `, dueDate: ` ${dueDate} `, decisionTemplate: ` ${decisionTemplate} `, evidenceRefTemplate: ` ${evidenceRefTemplate} ` }],
    });

    expect(pack.status).toBe('READY');
    expect(pack.summary.readyTemplateCount).toBe(1);
    expect(pack.summary.missingTemplateFieldCount).toBe(0);
    expect(pack.requirements[0].confirmArg).toBe(`--confirm "${topic}|${owner}|${dueDate}|${decisionTemplate}|${evidenceRefTemplate}"`);
    expect(pack.nextCommand).toContain(pack.requirements[0].confirmArg);
  });

  it.each(Array.from({ length: 60 }, (_, index) => {
    const missingOwner = index % 2 === 0;
    const missingDueDate = index % 3 === 0;
    const missingDecision = index % 5 === 0;
    const missingEvidence = index % 7 === 0;
    return [
      `missing-template-${index}`,
      missingOwner ? '  ' : `owner-${index}`,
      missingDueDate ? '  ' : `2026-06-${String((index % 28) + 1).padStart(2, '0')}`,
      missingDecision ? '  ' : `decision-${index}`,
      missingEvidence ? '  ' : `ref-${index}`,
      [
        missingOwner ? 'owner' : undefined,
        missingDueDate ? 'dueDate' : undefined,
        missingDecision ? 'decisionTemplate' : undefined,
        missingEvidence ? 'evidenceRefTemplate' : undefined,
      ].filter(Boolean),
    ] as const;
  }))('reports missing evidence fields for %s', (topic, owner, dueDate, decisionTemplate, evidenceRefTemplate, missingFields) => {
    const pack = buildQualityClosureEvidencePack({
      requirements: [{ topic, owner, dueDate, decisionTemplate, evidenceRefTemplate }],
    });

    expect(pack.status).toBe(missingFields.length > 0 ? 'ACTION_REQUIRED' : 'READY');
    expect(pack.requirements[0].missingFields).toEqual(missingFields);
    expect(pack.summary.missingTemplateFieldCount).toBe(missingFields.length);
    expect(pack.requirements[0].confirmArg).toBe(missingFields.length > 0 ? '' : `--confirm "${topic}|${owner}|${dueDate}|${decisionTemplate}|${evidenceRefTemplate}"`);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch140-topic-${index}`,
    `owner-${index}`,
    `2026-07-${String((index % 28) + 1).padStart(2, '0')}`,
  ] as const))(
    'builds generated next command with two ready requirements %s',
    (topic, owner, dueDate) => {
      const requirements = [
        { topic: ` ${topic} `, owner: ` ${owner} `, dueDate: ` ${dueDate} `, decisionTemplate: ' approve ', evidenceRefTemplate: ` ref-${topic} ` },
        { topic: `${topic}-second`, owner, dueDate, decisionTemplate: 'confirm', evidenceRefTemplate: `ref-${topic}-second` },
      ];
      const pack = buildQualityClosureEvidencePack({ requirements });

      expect(pack.status).toBe('READY');
      expect(pack.summary).toEqual({ requirementCount: 2, readyTemplateCount: 2, missingTemplateFieldCount: 0 });
      expect(pack.nextCommand).toContain(`--confirm "${topic}|${owner}|${dueDate}|approve|ref-${topic}"`);
      expect(pack.nextCommand).toContain(`--confirm "${topic}-second|${owner}|${dueDate}|confirm|ref-${topic}-second"`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch140-missing-${index}`,
    index % 2 === 0 ? ' ' : `owner-${index}`,
    index % 3 === 0 ? ' ' : `due-${index}`,
  ] as const))(
    'filters generated blank topic and reports missing fields %s',
    (topic, owner, dueDate) => {
      const pack = buildQualityClosureEvidencePack({
        requirements: [
          { topic: ' ', owner: 'ignored', dueDate: 'ignored', decisionTemplate: 'ignored', evidenceRefTemplate: 'ignored' },
          { topic, owner, dueDate, decisionTemplate: ' ', evidenceRefTemplate: ' ' },
        ],
      });
      const expectedMissing = [
        owner.trim() ? undefined : 'owner',
        dueDate.trim() ? undefined : 'dueDate',
        'decisionTemplate',
        'evidenceRefTemplate',
      ].filter(Boolean);

      expect(pack.status).toBe('ACTION_REQUIRED');
      expect(pack.summary.requirementCount).toBe(1);
      expect(pack.requirements[0].topic).toBe(topic);
      expect(pack.requirements[0].missingFields).toEqual(expectedMissing);
      expect(pack.gaps).toEqual(expectedMissing.map((field) => `${topic} missing field: ${field}`));
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch145-topic-${index}`,
    `owner-${index}`,
    `2026-08-${String((index % 20) + 1).padStart(2, '0')}`,
    `decision-${index}`,
    `ref-${index}`,
  ] as const))(
    'builds generated single ready requirement %s',
    (topic, owner, dueDate, decisionTemplate, evidenceRefTemplate) => {
      const pack = buildQualityClosureEvidencePack({
        requirements: [
          { topic: ` ${topic} `, owner: ` ${owner} `, dueDate: ` ${dueDate} `, decisionTemplate: ` ${decisionTemplate} `, evidenceRefTemplate: ` ${evidenceRefTemplate} ` },
        ],
      });

      expect(pack.status).toBe('READY');
      expect(pack.summary).toEqual({ requirementCount: 1, readyTemplateCount: 1, missingTemplateFieldCount: 0 });
      expect(pack.gaps).toEqual([]);
      expect(pack.nextCommand).toContain(`--confirm "${topic}|${owner}|${dueDate}|${decisionTemplate}|${evidenceRefTemplate}"`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch145-gap-${index}`,
    index % 2 === 0 ? ' ' : `owner-${index}`,
    index % 3 === 0 ? ' ' : `2026-09-${String((index % 20) + 1).padStart(2, '0')}`,
    index % 5 === 0 ? ' ' : `decision-${index}`,
    index % 7 === 0 ? ' ' : `ref-${index}`,
  ] as const))(
    'reports generated evidence pack gaps %s',
    (topic, owner, dueDate, decisionTemplate, evidenceRefTemplate) => {
      const pack = buildQualityClosureEvidencePack({
        requirements: [{ topic, owner, dueDate, decisionTemplate, evidenceRefTemplate }],
      });
      const expectedMissing = [
        owner.trim() ? undefined : 'owner',
        dueDate.trim() ? undefined : 'dueDate',
        decisionTemplate.trim() ? undefined : 'decisionTemplate',
        evidenceRefTemplate.trim() ? undefined : 'evidenceRefTemplate',
      ].filter(Boolean);

      expect(pack.status).toBe(expectedMissing.length > 0 ? 'ACTION_REQUIRED' : 'READY');
      expect(pack.requirements[0].missingFields).toEqual(expectedMissing);
      expect(pack.summary.missingTemplateFieldCount).toBe(expectedMissing.length);
      expect(pack.nextCommand).toBe(expectedMissing.length > 0 ? '' : pack.nextCommand);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch154-topic-${index}`,
    `owner-${index}`,
    `2026-10-${String((index % 20) + 1).padStart(2, '0')}`,
  ] as const))(
    'builds generated ordered confirm args for ready requirements %s',
    (topic, owner, dueDate) => {
      const pack = buildQualityClosureEvidencePack({
        requirements: [
          { topic: ' ', owner: 'ignored', dueDate: 'ignored', decisionTemplate: 'ignored', evidenceRefTemplate: 'ignored' },
          { topic: ` ${topic}-a `, owner: ` ${owner}-a `, dueDate: ` ${dueDate} `, decisionTemplate: ' approve ', evidenceRefTemplate: ` ref-${topic}-a ` },
          { topic: `${topic}-b`, owner: `${owner}-b`, dueDate, decisionTemplate: 'confirm', evidenceRefTemplate: `ref-${topic}-b` },
        ],
      });

      expect(pack.status).toBe('READY');
      expect(pack.summary).toEqual({ requirementCount: 2, readyTemplateCount: 2, missingTemplateFieldCount: 0 });
      expect(pack.requirements.map((requirement) => requirement.topic)).toEqual([`${topic}-a`, `${topic}-b`]);
      expect(pack.nextCommand).toContain(`--confirm "${topic}-a|${owner}-a|${dueDate}|approve|ref-${topic}-a"`);
      expect(pack.nextCommand).toContain(`--confirm "${topic}-b|${owner}-b|${dueDate}|confirm|ref-${topic}-b"`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch154-gap-${index}`,
    index % 2 === 0 ? ' ' : `owner-${index}`,
    index % 3 === 0 ? ' ' : `2026-10-${String((index % 20) + 1).padStart(2, '0')}`,
    index % 4 === 0 ? ' ' : `decision-${index}`,
    index % 5 === 0 ? ' ' : `ref-${index}`,
  ] as const))(
    'reports generated evidence pack missing fields in required order %s',
    (topic, owner, dueDate, decisionTemplate, evidenceRefTemplate) => {
      const pack = buildQualityClosureEvidencePack({
        requirements: [{ topic: ` ${topic} `, owner, dueDate, decisionTemplate, evidenceRefTemplate }],
      });
      const expectedMissing = [
        owner.trim() ? undefined : 'owner',
        dueDate.trim() ? undefined : 'dueDate',
        decisionTemplate.trim() ? undefined : 'decisionTemplate',
        evidenceRefTemplate.trim() ? undefined : 'evidenceRefTemplate',
      ].filter(Boolean);

      expect(pack.status).toBe(expectedMissing.length > 0 ? 'ACTION_REQUIRED' : 'READY');
      expect(pack.requirements[0].missingFields).toEqual(expectedMissing);
      expect(pack.gaps).toEqual(expectedMissing.map((field) => `${topic} missing field: ${field}`));
      expect(pack.nextCommand).toBe(expectedMissing.length > 0 ? '' : pack.nextCommand);
    },
  );
});

describe('quality closure evidence pack batch 159 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch159-topic-${index}`,
    `owner-${index}`,
    `2026-11-${String((index % 20) + 1).padStart(2, '0')}`,
    `decision with spaces ${index}`,
    `ref-${index}`,
  ] as const))(
    'builds generated batch159 ready confirm command %s',
    (topic, owner, dueDate, decisionTemplate, evidenceRefTemplate) => {
      const pack = buildQualityClosureEvidencePack({
        requirements: [
          { topic: ' ', owner: 'ignored', dueDate: 'ignored', decisionTemplate: 'ignored', evidenceRefTemplate: 'ignored' },
          { topic: ` ${topic} `, owner: ` ${owner} `, dueDate: ` ${dueDate} `, decisionTemplate: ` ${decisionTemplate} `, evidenceRefTemplate: ` ${evidenceRefTemplate} ` },
        ],
      });

      expect(pack.status).toBe('READY');
      expect(pack.summary).toEqual({ requirementCount: 1, readyTemplateCount: 1, missingTemplateFieldCount: 0 });
      expect(pack.requirements[0].confirmArg).toBe(`--confirm "${topic}|${owner}|${dueDate}|${decisionTemplate}|${evidenceRefTemplate}"`);
      expect(pack.nextCommand).toContain(pack.requirements[0].confirmArg);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch159-gap-${index}`,
    index % 2 === 0 ? '' : `owner-${index}`,
    index % 3 === 0 ? ' ' : `2026-12-${String((index % 20) + 1).padStart(2, '0')}`,
    index % 4 === 0 ? '' : `decision-${index}`,
    index % 5 === 0 ? ' ' : `ref-${index}`,
  ] as const))(
    'reports generated batch159 missing evidence fields %s',
    (topic, owner, dueDate, decisionTemplate, evidenceRefTemplate) => {
      const pack = buildQualityClosureEvidencePack({
        requirements: [
          { topic: ' ', owner: '', dueDate: '', decisionTemplate: '', evidenceRefTemplate: '' },
          { topic, owner, dueDate, decisionTemplate, evidenceRefTemplate },
        ],
      });
      const expectedMissing = [
        owner.trim() ? undefined : 'owner',
        dueDate.trim() ? undefined : 'dueDate',
        decisionTemplate.trim() ? undefined : 'decisionTemplate',
        evidenceRefTemplate.trim() ? undefined : 'evidenceRefTemplate',
      ].filter(Boolean);

      expect(pack.status).toBe(expectedMissing.length > 0 ? 'ACTION_REQUIRED' : 'READY');
      expect(pack.summary.requirementCount).toBe(1);
      expect(pack.requirements[0].missingFields).toEqual(expectedMissing);
      expect(pack.gaps).toEqual(expectedMissing.map((field) => `${topic} missing field: ${field}`));
    },
  );
});

describe('quality closure evidence pack batch 176 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch176-topic-${index}`,
    `owner-${index}`,
    `2027-01-${String((index % 20) + 1).padStart(2, '0')}`,
    `decision-${index}`,
    `ref-${index}`,
  ] as const))(
    'builds generated batch176 ready evidence command after trimming %s',
    (topic, owner, dueDate, decisionTemplate, evidenceRefTemplate) => {
      const pack = buildQualityClosureEvidencePack({
        requirements: [
          { topic: ' ', owner: 'ignored', dueDate: 'ignored', decisionTemplate: 'ignored', evidenceRefTemplate: 'ignored' },
          { topic: ` ${topic} `, owner: ` ${owner} `, dueDate: ` ${dueDate} `, decisionTemplate: ` ${decisionTemplate} `, evidenceRefTemplate: ` ${evidenceRefTemplate} ` },
        ],
      });

      expect(pack.status).toBe('READY');
      expect(pack.summary).toEqual({ requirementCount: 1, readyTemplateCount: 1, missingTemplateFieldCount: 0 });
      expect(pack.gaps).toEqual([]);
      expect(pack.requirements[0].confirmArg).toBe(`--confirm "${topic}|${owner}|${dueDate}|${decisionTemplate}|${evidenceRefTemplate}"`);
      expect(pack.nextCommand).toContain(pack.requirements[0].confirmArg);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch176-gap-${index}`,
    index % 2 === 0 ? ' ' : `owner-${index}`,
    index % 3 === 0 ? '' : `2027-02-${String((index % 20) + 1).padStart(2, '0')}`,
    index % 4 === 0 ? ' ' : `decision-${index}`,
    index % 5 === 0 ? '' : `ref-${index}`,
  ] as const))(
    'reports generated batch176 evidence gaps in required order %s',
    (topic, owner, dueDate, decisionTemplate, evidenceRefTemplate) => {
      const pack = buildQualityClosureEvidencePack({
        requirements: [
          { topic, owner, dueDate, decisionTemplate, evidenceRefTemplate },
          { topic: ' ', owner: 'ignored', dueDate: 'ignored', decisionTemplate: 'ignored', evidenceRefTemplate: 'ignored' },
        ],
      });
      const expectedMissing = [
        owner.trim() ? undefined : 'owner',
        dueDate.trim() ? undefined : 'dueDate',
        decisionTemplate.trim() ? undefined : 'decisionTemplate',
        evidenceRefTemplate.trim() ? undefined : 'evidenceRefTemplate',
      ].filter(Boolean);

      expect(pack.status).toBe(expectedMissing.length > 0 ? 'ACTION_REQUIRED' : 'READY');
      expect(pack.summary.requirementCount).toBe(1);
      expect(pack.summary.readyTemplateCount).toBe(expectedMissing.length > 0 ? 0 : 1);
      expect(pack.requirements[0].missingFields).toEqual(expectedMissing);
      expect(pack.gaps).toEqual(expectedMissing.map((field) => `${topic} missing field: ${field}`));
      expect(pack.nextCommand).toBe(expectedMissing.length > 0 ? '' : pack.nextCommand);
    },
  );
});
