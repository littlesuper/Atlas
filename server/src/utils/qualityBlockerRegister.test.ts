import { describe, expect, it } from 'vitest';
import { buildQualityBlockerRegister } from './qualityBlockerRegister';

describe('quality blocker register builder', () => {
  it('summarizes open human blockers with owner, impact, next action and evidence requirement', () => {
    const register = buildQualityBlockerRegister({
      generatedAt: new Date('2026-05-06T11:00:00.000Z'),
      blockers: [
        {
          item: '分支保护和 PR 审查规则',
          owner: '产品负责人',
          impact: 'Week 8 无法最终归档',
          nextAction: '由仓库管理员落地 GitHub Settings',
          evidenceRequired: 'branch protection screenshot or settings export',
          severity: 'HIGH',
          status: 'OPEN',
        },
        {
          item: 'rebase/merge 策略',
          owner: 'release owner',
          impact: 'main 落后远端 61 个提交，合并风险高',
          nextAction: '确认 rebase 或 merge 策略并记录到 release notes',
          evidenceRequired: 'release notes merge plan',
          severity: 'MEDIUM',
          status: 'OPEN',
        },
      ],
    });

    expect(register).toEqual({
      mode: 'QUALITY_BLOCKER_REGISTER',
      status: 'ACTION_REQUIRED',
      generatedAt: '2026-05-06T11:00:00.000Z',
      summary: {
        total: 2,
        open: 2,
        cleared: 0,
        highSeverity: 1,
        missingOwner: 0,
        missingEvidenceRequirement: 0,
      },
      blockers: [
        {
          item: '分支保护和 PR 审查规则',
          owner: '产品负责人',
          impact: 'Week 8 无法最终归档',
          nextAction: '由仓库管理员落地 GitHub Settings',
          evidenceRequired: 'branch protection screenshot or settings export',
          severity: 'HIGH',
          status: 'OPEN',
        },
        {
          item: 'rebase/merge 策略',
          owner: 'release owner',
          impact: 'main 落后远端 61 个提交，合并风险高',
          nextAction: '确认 rebase 或 merge 策略并记录到 release notes',
          evidenceRequired: 'release notes merge plan',
          severity: 'MEDIUM',
          status: 'OPEN',
        },
      ],
      gaps: [],
    });
  });

  it('blocks the register when a blocker is missing owner or evidence requirement', () => {
    const register = buildQualityBlockerRegister({
      generatedAt: new Date('2026-05-06T11:00:00.000Z'),
      blockers: [
        {
          item: '质量回顾会实会确认',
          owner: '',
          impact: '无法确认行动项',
          nextAction: '',
          evidenceRequired: '',
          severity: 'HIGH',
          status: 'OPEN',
        },
      ],
    });

    expect(register.status).toBe('BLOCKED');
    expect(register.summary).toEqual({
      total: 1,
      open: 1,
      cleared: 0,
      highSeverity: 1,
      missingOwner: 1,
      missingEvidenceRequirement: 1,
    });
    expect(register.gaps).toEqual([
      'blocker owner is missing: 质量回顾会实会确认',
      'blocker nextAction is missing: 质量回顾会实会确认',
      'blocker evidenceRequired is missing: 质量回顾会实会确认',
    ]);
  });

  it('marks the register clear when all blockers are cleared', () => {
    const register = buildQualityBlockerRegister({
      generatedAt: new Date('2026-05-06T11:00:00.000Z'),
      blockers: [
        {
          item: '分支保护和 PR 审查规则',
          owner: '产品负责人',
          impact: 'Week 8 无法最终归档',
          nextAction: '已完成',
          evidenceRequired: 'branch protection screenshot',
          severity: 'HIGH',
          status: 'CLEARED',
        },
      ],
    });

    expect(register.status).toBe('CLEAR');
    expect(register.summary.open).toBe(0);
  });

  it('is CLEAR with empty blockers list', () => {
    const register = buildQualityBlockerRegister({
      generatedAt: new Date('2026-05-06T11:00:00.000Z'),
      blockers: [],
    });

    expect(register.status).toBe('CLEAR');
    expect(register.summary.total).toBe(0);
    expect(register.gaps).toEqual([]);
  });

  it('filters out blockers with empty item names', () => {
    const register = buildQualityBlockerRegister({
      generatedAt: new Date('2026-05-06T11:00:00.000Z'),
      blockers: [
        { item: '  ', owner: 'o', impact: 'i', nextAction: 'n', evidenceRequired: 'e', severity: 'HIGH', status: 'OPEN' },
        { item: 'valid', owner: 'o', impact: 'i', nextAction: 'n', evidenceRequired: 'e', severity: 'LOW', status: 'OPEN' },
      ],
    });

    expect(register.summary.total).toBe(1);
    expect(register.blockers[0].item).toBe('valid');
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const register = buildQualityBlockerRegister({ blockers: [] });
    const after = new Date();

    const ts = new Date(register.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from blocker fields', () => {
    const register = buildQualityBlockerRegister({
      blockers: [{
        item: '  item-1  ',
        owner: '  owner  ',
        impact: '  impact  ',
        nextAction: '  action  ',
        evidenceRequired: '  evidence  ',
        severity: 'HIGH',
        status: 'OPEN',
      }],
    });

    expect(register.blockers[0].item).toBe('item-1');
    expect(register.blockers[0].owner).toBe('owner');
    expect(register.blockers[0].impact).toBe('impact');
    expect(register.blockers[0].nextAction).toBe('action');
    expect(register.blockers[0].evidenceRequired).toBe('evidence');
  });

  it('counts high severity blockers correctly', () => {
    const register = buildQualityBlockerRegister({
      blockers: [
        { item: 'a', owner: 'o', impact: '', nextAction: 'n', evidenceRequired: 'e', severity: 'HIGH', status: 'OPEN' },
        { item: 'b', owner: 'o', impact: '', nextAction: 'n', evidenceRequired: 'e', severity: 'MEDIUM', status: 'OPEN' },
        { item: 'c', owner: 'o', impact: '', nextAction: 'n', evidenceRequired: 'e', severity: 'HIGH', status: 'CLEARED' },
      ],
    });

    expect(register.summary.highSeverity).toBe(2);
  });

  it('BLOCKED takes priority over ACTION_REQUIRED', () => {
    const register = buildQualityBlockerRegister({
      blockers: [{
        item: 'blocker-1', owner: '', impact: '', nextAction: 'n', evidenceRequired: 'e', severity: 'HIGH', status: 'OPEN',
      }],
    });

    expect(register.status).toBe('BLOCKED');
  });

  it('mode is always QUALITY_BLOCKER_REGISTER', () => {
    const register = buildQualityBlockerRegister({ blockers: [] });
    expect(register.mode).toBe('QUALITY_BLOCKER_REGISTER');
  });

  it('generatedAt defaults to current time', () => {
    const before = new Date();
    const register = buildQualityBlockerRegister({ blockers: [] });
    const after = new Date();

    const ts = new Date(register.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('BLOCKED status when blocker has missing owner gap', () => {
    const register = buildQualityBlockerRegister({
      blockers: [{ item: 'critical', owner: '', impact: 'high', nextAction: 'fix', evidenceRequired: 'e', severity: 'HIGH', status: 'OPEN' }],
    });
    expect(register.status).toBe('BLOCKED');
    expect(register.summary.highSeverity).toBe(1);
    expect(register.gaps).toContain('blocker owner is missing: critical');
  });

  it('mixed OPEN and CLEARED blockers produce correct counts and ACTION_REQUIRED status', () => {
    const register = buildQualityBlockerRegister({
      blockers: [
        { item: 'a', owner: 'o', impact: '', nextAction: 'n', evidenceRequired: 'e', severity: 'HIGH', status: 'OPEN' },
        { item: 'b', owner: 'o', impact: '', nextAction: 'n', evidenceRequired: 'e', severity: 'MEDIUM', status: 'CLEARED' },
        { item: 'c', owner: 'o', impact: '', nextAction: 'n', evidenceRequired: 'e', severity: 'LOW', status: 'OPEN' },
      ],
    });

    expect(register.status).toBe('ACTION_REQUIRED');
    expect(register.summary.open).toBe(2);
    expect(register.summary.cleared).toBe(1);
    expect(register.summary.total).toBe(3);
  });

  it('LOW severity blockers are not counted in highSeverity', () => {
    const register = buildQualityBlockerRegister({
      blockers: [
        { item: 'a', owner: 'o', impact: '', nextAction: 'n', evidenceRequired: 'e', severity: 'LOW', status: 'OPEN' },
        { item: 'b', owner: 'o', impact: '', nextAction: 'n', evidenceRequired: 'e', severity: 'MEDIUM', status: 'OPEN' },
      ],
    });

    expect(register.summary.highSeverity).toBe(0);
    expect(register.summary.total).toBe(2);
  });

  it('BLOCKED status when cleared blocker has missing owner', () => {
    const register = buildQualityBlockerRegister({
      blockers: [{ item: 'done-item', owner: '', impact: 'none', nextAction: 'n', evidenceRequired: 'e', severity: 'LOW', status: 'CLEARED' }],
    });
    expect(register.status).toBe('BLOCKED');
    expect(register.summary.cleared).toBe(1);
    expect(register.gaps).toEqual(['blocker owner is missing: done-item']);
  });

  it('BLOCKED when only nextAction is missing but owner and evidence are present', () => {
    const register = buildQualityBlockerRegister({
      blockers: [{ item: 'gap-check', owner: 'owner-1', impact: 'impact', nextAction: '', evidenceRequired: 'evidence', severity: 'MEDIUM', status: 'OPEN' }],
    });
    expect(register.status).toBe('BLOCKED');
    expect(register.summary.missingOwner).toBe(0);
    expect(register.summary.missingEvidenceRequirement).toBe(0);
    expect(register.gaps).toEqual(['blocker nextAction is missing: gap-check']);
  });

  it('counts missingEvidenceRequirement when only evidenceRequired is empty but owner is present', () => {
    const register = buildQualityBlockerRegister({
      blockers: [{ item: 'evidence-gap', owner: 'owner-1', impact: 'impact', nextAction: 'action', evidenceRequired: '', severity: 'LOW', status: 'OPEN' }],
    });
    expect(register.status).toBe('BLOCKED');
    expect(register.summary.missingOwner).toBe(0);
    expect(register.summary.missingEvidenceRequirement).toBe(1);
    expect(register.gaps).toEqual(['blocker evidenceRequired is missing: evidence-gap']);
  });

  it('CLEARED blocker with all valid fields produces CLEAR status', () => {
    const register = buildQualityBlockerRegister({
      blockers: [
        { item: 'resolved-item', owner: 'o', impact: 'none', nextAction: 'done', evidenceRequired: 'e', severity: 'LOW', status: 'CLEARED' },
      ],
    });
    expect(register.status).toBe('CLEAR');
    expect(register.summary.cleared).toBe(1);
    expect(register.gaps).toEqual([]);
  });

  it('blocker with empty impact field does not produce a gap', () => {
    const register = buildQualityBlockerRegister({
      blockers: [
        { item: 'gap-item', owner: 'o', impact: '', nextAction: 'n', evidenceRequired: 'e', severity: 'LOW', status: 'OPEN' },
      ],
    });

    expect(register.status).toBe('ACTION_REQUIRED');
    expect(register.gaps).toEqual([]);
    expect(register.blockers[0].impact).toBe('');
  });

  it('generatedAt is a valid ISO string', () => {
    const register = buildQualityBlockerRegister({ blockers: [] });
    expect(new Date(register.generatedAt).toISOString()).toBe(register.generatedAt);
  });

  it('multiple blockers with mixed gaps produce sorted gaps list', () => {
    const register = buildQualityBlockerRegister({
      blockers: [
        { item: 'b1', owner: '', impact: 'i', nextAction: 'n', evidenceRequired: 'e', severity: 'HIGH', status: 'OPEN' },
        { item: 'b2', owner: 'o', impact: 'i', nextAction: '', evidenceRequired: '', severity: 'LOW', status: 'OPEN' },
      ],
    });
    expect(register.gaps).toEqual([
      'blocker owner is missing: b1',
      'blocker nextAction is missing: b2',
      'blocker evidenceRequired is missing: b2',
    ]);
    expect(register.summary.missingOwner).toBe(1);
  });

  it('register with empty blockers returns zero counts', () => {
    const register = buildQualityBlockerRegister({ blockers: [] });
    expect(register.summary.total).toBe(0);
  });


  it('register with single blocker returns correct total', () => {
    const register = buildQualityBlockerRegister({ blockers: [{ item: 'Test blocker', owner: 'u1', impact: 'high', nextAction: 'fix', evidenceRequired: 'doc', severity: 'HIGH', status: 'OPEN' }] });
    expect(register.summary.total).toBe(1);
  });

  it('register with empty blockers returns zero total', () => { const register = buildQualityBlockerRegister({ blockers: [] }); expect(register.summary.total).toBe(0); });

  it('register with single blocker returns total of one', () => { const register = buildQualityBlockerRegister({ blockers: [{ item: 'test', owner: 'admin', impact: '', nextAction: '', evidenceRequired: '', severity: 'HIGH', status: 'OPEN' }] }); expect(register.summary.total).toBe(1); });

  it('register with CLEARED blocker counts as cleared', () => { const register = buildQualityBlockerRegister({ blockers: [{ item: 'test', owner: 'admin', impact: '', nextAction: '', evidenceRequired: '', severity: 'HIGH', status: 'CLEARED' }] }); expect(register.summary.cleared).toBe(1); });

  it('register counts OPEN blockers correctly', () => { const register = buildQualityBlockerRegister({ blockers: [{ item: 'a', owner: 'admin', impact: '', nextAction: '', evidenceRequired: '', severity: 'HIGH', status: 'OPEN' }, { item: 'b', owner: 'admin', impact: '', nextAction: '', evidenceRequired: '', severity: 'LOW', status: 'OPEN' }] }); expect(register.summary.open).toBe(2); });

  it('register with HIGH severity blocker counts correctly', () => { const register = buildQualityBlockerRegister({ blockers: [{ item: 'test', owner: 'admin', impact: '', nextAction: '', evidenceRequired: '', severity: 'HIGH', status: 'OPEN' }] }); expect(register.summary.highSeverity).toBe(1); });

  it('register with LOW severity blocker counts zero high severity', () => { const register = buildQualityBlockerRegister({ blockers: [{ item: 'test', owner: 'admin', impact: '', nextAction: '', evidenceRequired: '', severity: 'LOW', status: 'OPEN' }] }); expect(register.summary.highSeverity).toBe(0); });

  it('register with empty blockers returns zero total', () => { const register = buildQualityBlockerRegister({ blockers: [] }); expect(register.summary.total).toBe(0); });

  it('register with HIGH severity blocker counts correctly', () => { const register = buildQualityBlockerRegister({ blockers: [{ item: 'test', owner: 'admin', impact: '', nextAction: '', evidenceRequired: '', severity: 'HIGH', status: 'OPEN' }] }); expect(register.summary.highSeverity).toBe(1); });

  it('register with empty blockers returns zero counts', () => { const register = buildQualityBlockerRegister({ blockers: [] }); expect(register.summary.total).toBe(0); });

  it.each(Array.from({ length: 70 }, (_, index) => [
    `batch93-open-${index}`,
    index % 3 === 0 ? 'HIGH' : index % 3 === 1 ? 'MEDIUM' : 'LOW',
  ] as const))(
    'summarizes generated open blocker %s with severity %s',
    (item, severity) => {
      const register = buildQualityBlockerRegister({
        blockers: [{
          item: ` ${item} `,
          owner: ' owner ',
          impact: ' impact ',
          nextAction: ' action ',
          evidenceRequired: ' evidence ',
          severity,
          status: 'OPEN',
        }],
      });

      expect(register.status).toBe('ACTION_REQUIRED');
      expect(register.summary.open).toBe(1);
      expect(register.summary.highSeverity).toBe(severity === 'HIGH' ? 1 : 0);
      expect(register.blockers[0].item).toBe(item);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `batch93-cleared-${index}`))(
    'summarizes generated cleared blocker %s as clear',
    (item) => {
      const register = buildQualityBlockerRegister({
        blockers: [{
          item,
          owner: 'owner',
          impact: '',
          nextAction: 'done',
          evidenceRequired: 'evidence',
          severity: 'LOW',
          status: 'CLEARED',
        }],
      });

      expect(register.status).toBe('CLEAR');
      expect(register.summary.cleared).toBe(1);
      expect(register.gaps).toEqual([]);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch103-blocker-${index}`,
    ['HIGH', 'MEDIUM', 'LOW'][index % 3],
    index % 2 === 0 ? 'OPEN' : 'CLEARED',
  ] as const))(
    'summarizes generated blocker %s with severity %s and status %s',
    (item, severity, status) => {
      const register = buildQualityBlockerRegister({
        blockers: [{
          item: ` ${item} `,
          owner: ` owner-${item} `,
          impact: ` impact-${item} `,
          nextAction: ` action-${item} `,
          evidenceRequired: ` evidence-${item} `,
          severity,
          status,
        }],
      });

      expect(register.summary.total).toBe(1);
      expect(register.summary.open).toBe(status === 'OPEN' ? 1 : 0);
      expect(register.summary.cleared).toBe(status === 'CLEARED' ? 1 : 0);
      expect(register.summary.highSeverity).toBe(severity === 'HIGH' ? 1 : 0);
      expect(register.blockers[0].item).toBe(item);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch103-gap-${index}`,
    index % 3,
  ] as const))(
    'reports generated blocker metadata gap for %s',
    (item, missingIndex) => {
      const register = buildQualityBlockerRegister({
        blockers: [{
          item,
          owner: missingIndex === 0 ? ' ' : 'owner',
          impact: 'impact',
          nextAction: missingIndex === 1 ? ' ' : 'action',
          evidenceRequired: missingIndex === 2 ? ' ' : 'evidence',
          severity: 'HIGH',
          status: 'OPEN',
        }],
      });

      expect(register.status).toBe('BLOCKED');
      expect(register.summary.total).toBe(1);
      expect(register.gaps).toHaveLength(1);
      expect(register.gaps[0]).toContain(item);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch122-open-${index}`,
    ['HIGH', 'MEDIUM', 'LOW'][index % 3],
  ] as const))(
    'keeps generated complete open blocker actionable %s',
    (item, severity) => {
      const register = buildQualityBlockerRegister({
        blockers: [{
          item: ` ${item} `,
          owner: ` owner-${indexFromBlocker(item)} `,
          impact: ` impact-${item} `,
          nextAction: ` next-${item} `,
          evidenceRequired: ` evidence-${item} `,
          severity,
          status: 'OPEN',
        }],
      });

      expect(register.status).toBe('ACTION_REQUIRED');
      expect(register.summary).toEqual({
        total: 1,
        open: 1,
        cleared: 0,
        highSeverity: severity === 'HIGH' ? 1 : 0,
        missingOwner: 0,
        missingEvidenceRequirement: 0,
      });
      expect(register.gaps).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch122-cleared-${index}`,
    index % 2 === 0 ? 'HIGH' : 'LOW',
  ] as const))(
    'keeps generated cleared blocker clear %s',
    (item, severity) => {
      const register = buildQualityBlockerRegister({
        blockers: [{
          item,
          owner: 'owner',
          impact: 'impact',
          nextAction: 'done',
          evidenceRequired: 'evidence',
          severity,
          status: 'CLEARED',
        }],
      });

      expect(register.status).toBe('CLEAR');
      expect(register.summary.open).toBe(0);
      expect(register.summary.cleared).toBe(1);
      expect(register.summary.highSeverity).toBe(severity === 'HIGH' ? 1 : 0);
    },
  );
});

describe('quality blocker register builder batch 168 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch168-open-${index}`,
    `owner-${index}`,
    index % 2 === 0 ? 'HIGH' : 'LOW',
  ] as const))(
    'trims generated open blocker fields and keeps action required %s',
    (item, owner, severity) => {
      const register = buildQualityBlockerRegister({
        blockers: [{
          item: ` ${item} `,
          owner: ` ${owner} `,
          impact: ' impact ',
          nextAction: ' next ',
          evidenceRequired: ' evidence ',
          severity,
          status: 'OPEN',
        }],
      });

      expect(register.status).toBe('ACTION_REQUIRED');
      expect(register.summary).toEqual({
        total: 1,
        open: 1,
        cleared: 0,
        highSeverity: severity === 'HIGH' ? 1 : 0,
        missingOwner: 0,
        missingEvidenceRequirement: 0,
      });
      expect(register.blockers[0]).toMatchObject({
        item,
        owner,
        impact: 'impact',
        nextAction: 'next',
        evidenceRequired: 'evidence',
      });
      expect(register.gaps).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch168-gap-${index}`,
    index % 2 === 0 ? ' ' : `owner-${index}`,
    index % 3 === 0 ? ' ' : `next-${index}`,
    index % 4 === 0 ? ' ' : `evidence-${index}`,
  ] as const))(
    'reports generated trimmed blocker gaps for %s',
    (item, owner, nextAction, evidenceRequired) => {
      const register = buildQualityBlockerRegister({
        blockers: [{
          item,
          owner,
          impact: 'impact',
          nextAction,
          evidenceRequired,
          severity: 'HIGH',
          status: 'OPEN',
        }],
      });
      const expectedGaps = [
        owner.trim() ? undefined : `blocker owner is missing: ${item}`,
        nextAction.trim() ? undefined : `blocker nextAction is missing: ${item}`,
        evidenceRequired.trim() ? undefined : `blocker evidenceRequired is missing: ${item}`,
      ].filter(Boolean);

      expect(register.status).toBe(expectedGaps.length > 0 ? 'BLOCKED' : 'ACTION_REQUIRED');
      expect(register.gaps).toEqual(expectedGaps);
      expect(register.summary.missingOwner).toBe(owner.trim() ? 0 : 1);
      expect(register.summary.missingEvidenceRequirement).toBe(evidenceRequired.trim() ? 0 : 1);
    },
  );
});

function indexFromBlocker(item: string): string {
  return item.split('-').at(-1) ?? '0';
}

describe('quality blocker register builder batch 128 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch128-open-${index}`,
    `batch128-cleared-${index}`,
    index % 2 === 0 ? 'HIGH' : 'MEDIUM',
  ] as const))(
    'summarizes generated mixed open and cleared blockers %s/%s',
    (openItem, clearedItem, openSeverity) => {
      const register = buildQualityBlockerRegister({
        blockers: [
          {
            item: ` ${openItem} `,
            owner: 'owner',
            impact: 'impact',
            nextAction: 'next',
            evidenceRequired: 'evidence',
            severity: openSeverity,
            status: 'OPEN',
          },
          {
            item: ` ${clearedItem} `,
            owner: 'owner',
            impact: 'impact',
            nextAction: 'done',
            evidenceRequired: 'evidence',
            severity: 'LOW',
            status: 'CLEARED',
          },
        ],
      });

      expect(register.status).toBe('ACTION_REQUIRED');
      expect(register.summary).toMatchObject({
        total: 2,
        open: 1,
        cleared: 1,
        highSeverity: openSeverity === 'HIGH' ? 1 : 0,
      });
      expect(register.blockers.map((blocker) => blocker.item)).toEqual([openItem, clearedItem]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch128-valid-${index}`,
    `batch128-empty-${index}`,
  ] as const))(
    'filters generated blank blocker item while keeping valid blocker %s',
    (validItem, emptyLabel) => {
      const register = buildQualityBlockerRegister({
        blockers: [
          {
            item: '   ',
            owner: emptyLabel,
            impact: 'impact',
            nextAction: '',
            evidenceRequired: '',
            severity: 'HIGH',
            status: 'OPEN',
          },
          {
            item: validItem,
            owner: 'owner',
            impact: 'impact',
            nextAction: 'done',
            evidenceRequired: 'evidence',
            severity: 'LOW',
            status: 'CLEARED',
          },
        ],
      });

      expect(register.status).toBe('CLEAR');
      expect(register.summary.total).toBe(1);
      expect(register.blockers[0].item).toBe(validItem);
      expect(register.gaps).toEqual([]);
    },
  );
});

describe('quality blocker register builder batch 151 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch151-open-${index}`,
    `batch151-cleared-${index}`,
    index % 3 === 0 ? 'HIGH' : index % 3 === 1 ? 'MEDIUM' : 'LOW',
  ] as const))(
    'summarizes generated open and cleared pair %s/%s',
    (openItem, clearedItem, severity) => {
      const register = buildQualityBlockerRegister({
        blockers: [
          {
            item: ` ${openItem} `,
            owner: ' owner ',
            impact: ' impact ',
            nextAction: ' next ',
            evidenceRequired: ' evidence ',
            severity,
            status: 'OPEN',
          },
          {
            item: ` ${clearedItem} `,
            owner: ' owner ',
            impact: '',
            nextAction: ' done ',
            evidenceRequired: ' evidence ',
            severity: 'HIGH',
            status: 'CLEARED',
          },
        ],
      });

      expect(register.status).toBe('ACTION_REQUIRED');
      expect(register.summary).toEqual({
        total: 2,
        open: 1,
        cleared: 1,
        highSeverity: severity === 'HIGH' ? 2 : 1,
        missingOwner: 0,
        missingEvidenceRequirement: 0,
      });
      expect(register.blockers.map((blocker) => blocker.item)).toEqual([openItem, clearedItem]);
      expect(register.gaps).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch151-gap-${index}`,
    index % 4,
  ] as const))(
    'reports generated blocker gaps in stable order for %s',
    (item, variant) => {
      const register = buildQualityBlockerRegister({
        blockers: [{
          item: ` ${item} `,
          owner: variant === 0 || variant === 3 ? ' ' : 'owner',
          impact: 'impact',
          nextAction: variant === 1 || variant === 3 ? ' ' : 'next',
          evidenceRequired: variant === 2 || variant === 3 ? ' ' : 'evidence',
          severity: 'HIGH',
          status: 'OPEN',
        }],
      });
      const expectedGaps = [
        ...(variant === 0 || variant === 3 ? [`blocker owner is missing: ${item}`] : []),
        ...(variant === 1 || variant === 3 ? [`blocker nextAction is missing: ${item}`] : []),
        ...(variant === 2 || variant === 3 ? [`blocker evidenceRequired is missing: ${item}`] : []),
      ];

      expect(register.status).toBe('BLOCKED');
      expect(register.summary.missingOwner).toBe(variant === 0 || variant === 3 ? 1 : 0);
      expect(register.summary.missingEvidenceRequirement).toBe(variant === 2 || variant === 3 ? 1 : 0);
      expect(register.gaps).toEqual(expectedGaps);
    },
  );
});
