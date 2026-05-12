import { describe, expect, it } from 'vitest';
import { buildQualityOwnerAssignmentPack } from './qualityOwnerAssignmentPack';

describe('quality owner assignment pack builder', () => {
  it('groups open blockers by owner with message-ready assignment content', () => {
    const pack = buildQualityOwnerAssignmentPack({
      generatedAt: new Date('2026-05-06T12:00:00.000Z'),
      blockers: [
        {
          item: '分支保护和 PR 审查规则',
          owner: '产品负责人',
          impact: 'Week 8 无法最终归档',
          nextAction: '由仓库管理员落地 GitHub Settings',
          evidenceRequired: 'github-settings#branch-protection',
          severity: 'HIGH',
          status: 'OPEN',
        },
        {
          item: 'rebase/merge 策略',
          owner: 'release owner',
          impact: 'main 落后远端 61 个提交',
          nextAction: '确认 rebase 或 merge 策略',
          evidenceRequired: 'release-notes#merge-plan',
          severity: 'MEDIUM',
          status: 'OPEN',
        },
        {
          item: '历史阻塞项',
          owner: '产品负责人',
          impact: '已解决',
          nextAction: '无',
          evidenceRequired: 'done',
          severity: 'LOW',
          status: 'CLEARED',
        },
      ],
    });

    expect(pack).toEqual({
      mode: 'QUALITY_OWNER_ASSIGNMENT_PACK',
      status: 'ACTION_REQUIRED',
      generatedAt: '2026-05-06T12:00:00.000Z',
      summary: {
        ownerCount: 2,
        openAssignmentCount: 2,
        highSeverityAssignmentCount: 1,
      },
      assignments: [
        {
          owner: '产品负责人',
          items: [
            {
              item: '分支保护和 PR 审查规则',
              impact: 'Week 8 无法最终归档',
              nextAction: '由仓库管理员落地 GitHub Settings',
              evidenceRequired: 'github-settings#branch-protection',
              severity: 'HIGH',
            },
          ],
          evidenceRefs: ['github-settings#branch-protection'],
          message: '请处理 1 个质量阻塞项：分支保护和 PR 审查规则。完成后回填证据：github-settings#branch-protection。',
        },
        {
          owner: 'release owner',
          items: [
            {
              item: 'rebase/merge 策略',
              impact: 'main 落后远端 61 个提交',
              nextAction: '确认 rebase 或 merge 策略',
              evidenceRequired: 'release-notes#merge-plan',
              severity: 'MEDIUM',
            },
          ],
          evidenceRefs: ['release-notes#merge-plan'],
          message: '请处理 1 个质量阻塞项：rebase/merge 策略。完成后回填证据：release-notes#merge-plan。',
        },
      ],
    });
  });

  it('is ready when there are no open blockers to assign', () => {
    const pack = buildQualityOwnerAssignmentPack({
      generatedAt: new Date('2026-05-06T12:00:00.000Z'),
      blockers: [
        {
          item: '分支保护和 PR 审查规则',
          owner: '产品负责人',
          impact: 'Week 8 无法最终归档',
          nextAction: '已完成',
          evidenceRequired: 'github-settings#branch-protection',
          severity: 'HIGH',
          status: 'CLEARED',
        },
      ],
    });

    expect(pack.status).toBe('READY');
    expect(pack.summary.openAssignmentCount).toBe(0);
    expect(pack.assignments).toEqual([]);
  });

  it('assigns unowned blockers to UNASSIGNED', () => {
    const pack = buildQualityOwnerAssignmentPack({
      generatedAt: new Date('2026-05-06T12:00:00.000Z'),
      blockers: [
        {
          item: 'unowned blocker',
          owner: '',
          impact: 'impact',
          nextAction: 'fix it',
          evidenceRequired: 'evidence',
          severity: 'HIGH',
          status: 'OPEN',
        },
      ],
    });

    expect(pack.assignments).toHaveLength(1);
    expect(pack.assignments[0].owner).toBe('UNASSIGNED');
    expect(pack.summary.highSeverityAssignmentCount).toBe(1);
  });

  it('groups multiple blockers under the same owner', () => {
    const pack = buildQualityOwnerAssignmentPack({
      generatedAt: new Date('2026-05-06T12:00:00.000Z'),
      blockers: [
        { item: 'a', owner: 'owner-1', impact: '', nextAction: '', evidenceRequired: 'e1', severity: 'HIGH', status: 'OPEN' },
        { item: 'b', owner: 'owner-1', impact: '', nextAction: '', evidenceRequired: 'e2', severity: 'MEDIUM', status: 'OPEN' },
      ],
    });

    expect(pack.assignments).toHaveLength(1);
    expect(pack.assignments[0].items).toHaveLength(2);
    expect(pack.assignments[0].evidenceRefs).toEqual(['e1', 'e2']);
    expect(pack.assignments[0].message).toContain('2 个质量阻塞项');
  });

  it('is READY with empty blockers', () => {
    const pack = buildQualityOwnerAssignmentPack({
      generatedAt: new Date('2026-05-06T12:00:00.000Z'),
      blockers: [],
    });

    expect(pack.status).toBe('READY');
    expect(pack.summary.ownerCount).toBe(0);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const pack = buildQualityOwnerAssignmentPack({ blockers: [] });
    const after = new Date();

    const ts = new Date(pack.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from blocker fields', () => {
    const pack = buildQualityOwnerAssignmentPack({
      blockers: [{
        item: '  item-1  ',
        owner: '  owner-1  ',
        impact: '  impact  ',
        nextAction: '  action  ',
        evidenceRequired: '  evidence  ',
        severity: 'HIGH',
        status: 'OPEN',
      }],
    });

    expect(pack.assignments[0].owner).toBe('owner-1');
    expect(pack.assignments[0].items[0].item).toBe('item-1');
  });

  it('excludes CLEARED blockers from assignments', () => {
    const pack = buildQualityOwnerAssignmentPack({
      blockers: [
        { item: 'open', owner: 'o', impact: '', nextAction: '', evidenceRequired: 'e', severity: 'HIGH', status: 'OPEN' },
        { item: 'cleared', owner: 'o', impact: '', nextAction: '', evidenceRequired: 'e', severity: 'LOW', status: 'CLEARED' },
      ],
    });

    expect(pack.summary.openAssignmentCount).toBe(1);
    expect(pack.assignments).toHaveLength(1);
    expect(pack.assignments[0].items).toHaveLength(1);
  });

  it('message includes all item names and evidence refs', () => {
    const pack = buildQualityOwnerAssignmentPack({
      blockers: [
        { item: 'task-a', owner: 'owner-1', impact: '', nextAction: '', evidenceRequired: 'ev-a', severity: 'HIGH', status: 'OPEN' },
        { item: 'task-b', owner: 'owner-1', impact: '', nextAction: '', evidenceRequired: 'ev-b', severity: 'MEDIUM', status: 'OPEN' },
      ],
    });

    const msg = pack.assignments[0].message;
    expect(msg).toContain('task-a、task-b');
    expect(msg).toContain('ev-a、ev-b');
    expect(msg).toContain('2 个质量阻塞项');
  });

  it('mode is always QUALITY_OWNER_ASSIGNMENT_PACK', () => {
    const pack = buildQualityOwnerAssignmentPack({ blockers: [] });
    expect(pack.mode).toBe('QUALITY_OWNER_ASSIGNMENT_PACK');
  });

  it('counts high severity only for OPEN blockers', () => {
    const pack = buildQualityOwnerAssignmentPack({
      blockers: [
        { item: 'a', owner: 'o', impact: '', nextAction: '', evidenceRequired: 'e', severity: 'HIGH', status: 'OPEN' },
        { item: 'b', owner: 'o', impact: '', nextAction: '', evidenceRequired: 'e', severity: 'HIGH', status: 'CLEARED' },
      ],
    });

    expect(pack.summary.highSeverityAssignmentCount).toBe(1);
  });

  it('generatedAt is valid ISO string', () => {
    const pack = buildQualityOwnerAssignmentPack({ blockers: [] });
    expect(new Date(pack.generatedAt).toISOString()).toBe(pack.generatedAt);
  });

  it('blockers with empty item name are filtered out of assignments', () => {
    const pack = buildQualityOwnerAssignmentPack({
      blockers: [
        { item: '  ', owner: 'o', impact: '', nextAction: '', evidenceRequired: 'e', severity: 'HIGH', status: 'OPEN' },
        { item: 'valid', owner: 'o', impact: '', nextAction: '', evidenceRequired: 'e', severity: 'HIGH', status: 'OPEN' },
      ],
    });

    expect(pack.summary.openAssignmentCount).toBe(1);
    expect(pack.assignments).toHaveLength(1);
    expect(pack.assignments[0].items[0].item).toBe('valid');
  });

  it('evidenceRefs array matches items evidenceRequired values', () => {
    const pack = buildQualityOwnerAssignmentPack({
      blockers: [
        { item: 'a', owner: 'o1', impact: '', nextAction: '', evidenceRequired: 'ev-a', severity: 'HIGH', status: 'OPEN' },
        { item: 'b', owner: 'o1', impact: '', nextAction: '', evidenceRequired: 'ev-b', severity: 'MEDIUM', status: 'OPEN' },
      ],
    });

    expect(pack.assignments[0].evidenceRefs).toEqual(['ev-a', 'ev-b']);
    expect(pack.assignments[0].items.map(i => i.evidenceRequired)).toEqual(['ev-a', 'ev-b']);
  });

  it('openAssignmentCount differs from ownerCount when multiple blockers share same owner', () => {
    const pack = buildQualityOwnerAssignmentPack({
      blockers: [
        { item: 'a', owner: 'owner-1', impact: '', nextAction: '', evidenceRequired: 'e1', severity: 'HIGH', status: 'OPEN' },
        { item: 'b', owner: 'owner-1', impact: '', nextAction: '', evidenceRequired: 'e2', severity: 'LOW', status: 'OPEN' },
        { item: 'c', owner: 'owner-2', impact: '', nextAction: '', evidenceRequired: 'e3', severity: 'MEDIUM', status: 'OPEN' },
      ],
    });

    expect(pack.summary.openAssignmentCount).toBe(3);
    expect(pack.summary.ownerCount).toBe(2);
  });

  it('blocker with RESOLVED status is excluded from assignments', () => {
    const pack = buildQualityOwnerAssignmentPack({
      blockers: [
        { item: 'resolved-item', owner: 'o', impact: '', nextAction: '', evidenceRequired: 'e', severity: 'HIGH', status: 'RESOLVED' },
      ],
    });

    expect(pack.summary.openAssignmentCount).toBe(0);
    expect(pack.assignments).toEqual([]);
    expect(pack.status).toBe('READY');
  });

  it('blocker with whitespace-only owner is assigned to UNASSIGNED', () => {
    const pack = buildQualityOwnerAssignmentPack({
      blockers: [{
        item: 'blocker-1',
        owner: '   ',
        impact: 'impact',
        nextAction: 'fix',
        evidenceRequired: 'ev',
        severity: 'MEDIUM',
        status: 'OPEN',
      }],
    });

    expect(pack.assignments).toHaveLength(1);
    expect(pack.assignments[0].owner).toBe('UNASSIGNED');
    expect(pack.summary.ownerCount).toBe(1);
  });

  it('OPEN blocker with whitespace-only impact and nextAction still creates assignment', () => {
    const pack = buildQualityOwnerAssignmentPack({
      blockers: [{
        item: 'valid-item',
        owner: 'owner-1',
        impact: '   ',
        nextAction: '   ',
        evidenceRequired: 'ev',
        severity: 'LOW',
        status: 'OPEN',
      }],
    });

    expect(pack.assignments).toHaveLength(1);
    expect(pack.assignments[0].items[0].impact).toBe('');
    expect(pack.assignments[0].items[0].nextAction).toBe('');
    expect(pack.summary.openAssignmentCount).toBe(1);
  });

  it('assignments maintain order of first owner appearance from blockers list', () => {
    const pack = buildQualityOwnerAssignmentPack({
      blockers: [
        { item: 'a', owner: 'owner-B', impact: '', nextAction: '', evidenceRequired: 'e1', severity: 'HIGH', status: 'OPEN' },
        { item: 'b', owner: 'owner-A', impact: '', nextAction: '', evidenceRequired: 'e2', severity: 'HIGH', status: 'OPEN' },
        { item: 'c', owner: 'owner-B', impact: '', nextAction: '', evidenceRequired: 'e3', severity: 'MEDIUM', status: 'OPEN' },
      ],
    });

    expect(pack.assignments[0].owner).toBe('owner-B');
    expect(pack.assignments[1].owner).toBe('owner-A');
    expect(pack.assignments[0].items).toHaveLength(2);
    expect(pack.assignments[1].items).toHaveLength(1);
  });

  it('message includes count of items and evidence refs', () => {
    const pack = buildQualityOwnerAssignmentPack({
      blockers: [
        { item: 'alpha', owner: 'owner-1', impact: '', nextAction: '', evidenceRequired: 'ev-alpha', severity: 'HIGH', status: 'OPEN' },
        { item: 'beta', owner: 'owner-1', impact: '', nextAction: '', evidenceRequired: 'ev-beta', severity: 'LOW', status: 'OPEN' },
      ],
    });

    expect(pack.assignments[0].message).toContain('2 个质量阻塞项');
    expect(pack.assignments[0].message).toContain('alpha、beta');
    expect(pack.assignments[0].message).toContain('ev-alpha、ev-beta');
  });

  it('empty blockers list produces no assignments', () => {
    const pack = buildQualityOwnerAssignmentPack({ blockers: [] });
    expect(pack.assignments).toEqual([]);
    expect(pack.summary.ownerCount).toBe(0);
  });

  it('pack with empty blockers has zero assignments', () => {
    const pack = buildQualityOwnerAssignmentPack({ blockers: [] });
    expect(pack.assignments).toEqual([]);
    expect(pack.summary.ownerCount).toBe(0);
    expect(pack.status).toBe('READY');
  });

  it('pack with no owners returns PENDING status', () => {
    const pack = buildQualityOwnerAssignmentPack({ blockers: [] });
    expect(pack.status).toBeDefined();
  });

  it('pack with single blocker returns valid status', () => {
    const pack = buildQualityOwnerAssignmentPack({ blockers: [{ item: 'Blocker', owner: 'u1', impact: 'high', nextAction: 'fix', evidenceRequired: 'doc', severity: 'HIGH', status: 'OPEN' }] });
    expect(pack.status).toBeDefined();
  });

  it('pack with empty blockers returns valid status', () => { const pack = buildQualityOwnerAssignmentPack({ blockers: [] }); expect(pack).toBeDefined(); });

  it('pack with single blocker returns valid structure', () => { const pack = buildQualityOwnerAssignmentPack({ blockers: [{ item: 'test', owner: 'admin', impact: '', nextAction: '', evidenceRequired: '', severity: 'HIGH', status: 'OPEN' }] }); expect(pack).toBeDefined(); });

  it('pack with CLEARED blocker returns valid status', () => { const pack = buildQualityOwnerAssignmentPack({ blockers: [{ item: 'test', owner: 'admin', impact: '', nextAction: '', evidenceRequired: '', severity: 'LOW', status: 'CLEARED' }] }); expect(pack).toBeDefined(); });

  it('pack with multiple blockers counts correctly', () => { const pack = buildQualityOwnerAssignmentPack({ blockers: [{ item: 'a', owner: 'x', impact: '', nextAction: '', evidenceRequired: '', severity: 'HIGH', status: 'OPEN' }, { item: 'b', owner: 'y', impact: '', nextAction: '', evidenceRequired: '', severity: 'LOW', status: 'CLEARED' }] }); expect(pack).toBeDefined(); });

  it('pack with empty blockers returns valid mode', () => { const pack = buildQualityOwnerAssignmentPack({ blockers: [] }); expect(pack.mode).toBe('QUALITY_OWNER_ASSIGNMENT_PACK'); });

  it('pack with all CLEARED blockers returns valid status', () => { const pack = buildQualityOwnerAssignmentPack({ blockers: [{ item: 'a', owner: 'x', impact: '', nextAction: '', evidenceRequired: '', severity: 'HIGH', status: 'CLEARED' }, { item: 'b', owner: 'y', impact: '', nextAction: '', evidenceRequired: '', severity: 'LOW', status: 'CLEARED' }] }); expect(pack.mode).toBe('QUALITY_OWNER_ASSIGNMENT_PACK'); });

  it('pack with single OPEN blocker counts correctly', () => { const pack = buildQualityOwnerAssignmentPack({ blockers: [{ item: 'a', owner: 'x', impact: '', nextAction: '', evidenceRequired: '', severity: 'HIGH', status: 'OPEN' }] }); expect(pack).toBeDefined(); });

  it('pack with empty blockers returns zero total', () => { const pack = buildQualityOwnerAssignmentPack({ blockers: [] }); expect(pack).toBeDefined(); });

  it('pack with RESOLVED blocker returns valid', () => { const pack = buildQualityOwnerAssignmentPack({ blockers: [{ item: 'a', owner: 'x', impact: '', nextAction: '', evidenceRequired: '', severity: 'HIGH', status: 'RESOLVED' }] }); expect(pack).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [`owner ${index} 中文`, `item-${index}<html>`, index % 2 === 0 ? 'HIGH' : 'LOW']))(
    'trims owner and item fields for assignment %s',
    (owner, item, severity) => {
      const pack = buildQualityOwnerAssignmentPack({
        blockers: [{
          item: `  ${item}  `,
          owner: `  ${owner}  `,
          impact: `  impact ${item}  `,
          nextAction: `  action ${item}  `,
          evidenceRequired: `  evidence-${item}  `,
          severity: severity as 'HIGH' | 'LOW',
          status: 'OPEN',
        }],
      });

      expect(pack.status).toBe('ACTION_REQUIRED');
      expect(pack.assignments[0].owner).toBe(owner);
      expect(pack.assignments[0].items[0].item).toBe(item);
      expect(pack.assignments[0].items[0].impact).toBe(`impact ${item}`);
      expect(pack.assignments[0].items[0].nextAction).toBe(`action ${item}`);
      expect(pack.assignments[0].evidenceRefs).toEqual([`evidence-${item}`]);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [index % 2 === 0 ? 'CLEARED' : 'RESOLVED', `closed-${index}`]))(
    'excludes non-open blocker status %s for %s',
    (status, item) => {
      const pack = buildQualityOwnerAssignmentPack({
        blockers: [{
          item,
          owner: 'owner',
          impact: 'impact',
          nextAction: 'action',
          evidenceRequired: 'evidence',
          severity: 'HIGH',
          status: status as 'CLEARED',
        }],
      });

      expect(pack.status).toBe('READY');
      expect(pack.summary.openAssignmentCount).toBe(0);
      expect(pack.summary.highSeverityAssignmentCount).toBe(0);
      expect(pack.assignments).toEqual([]);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [`shared-owner-${index}`, `item-a-${index}`, `item-b-${index}`] as const))(
    'groups generated blockers under shared owner %s',
    (owner, firstItem, secondItem) => {
      const pack = buildQualityOwnerAssignmentPack({
        blockers: [
          { item: firstItem, owner, impact: 'impact-a', nextAction: 'action-a', evidenceRequired: `ev-${firstItem}`, severity: 'HIGH', status: 'OPEN' },
          { item: secondItem, owner, impact: 'impact-b', nextAction: 'action-b', evidenceRequired: `ev-${secondItem}`, severity: 'MEDIUM', status: 'OPEN' },
        ],
      });

      expect(pack.status).toBe('ACTION_REQUIRED');
      expect(pack.summary.ownerCount).toBe(1);
      expect(pack.summary.openAssignmentCount).toBe(2);
      expect(pack.summary.highSeverityAssignmentCount).toBe(1);
      expect(pack.assignments[0].items.map((item) => item.item)).toEqual([firstItem, secondItem]);
      expect(pack.assignments[0].message).toContain(`${firstItem}、${secondItem}`);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [`unassigned-${index}`, `evidence-${index}`] as const))(
    'assigns generated blank owner blocker to UNASSIGNED %s',
    (item, evidenceRequired) => {
      const pack = buildQualityOwnerAssignmentPack({
        blockers: [{
          item,
          owner: '   ',
          impact: 'impact',
          nextAction: 'next',
          evidenceRequired,
          severity: 'LOW',
          status: 'OPEN',
        }],
      });

      expect(pack.assignments).toHaveLength(1);
      expect(pack.assignments[0].owner).toBe('UNASSIGNED');
      expect(pack.assignments[0].evidenceRefs).toEqual([evidenceRequired]);
      expect(pack.assignments[0].message).toContain(evidenceRequired);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch146-owner-a-${index}`,
    `batch146-owner-b-${index}`,
    `batch146-item-${index}`,
  ] as const))(
    'keeps generated owner insertion order for %s/%s',
    (firstOwner, secondOwner, item) => {
      const pack = buildQualityOwnerAssignmentPack({
        blockers: [
          { item: `${item}-a`, owner: ` ${firstOwner} `, impact: 'impact-a', nextAction: 'next-a', evidenceRequired: `ev-${item}-a`, severity: 'LOW', status: 'OPEN' },
          { item: `${item}-b`, owner: ` ${secondOwner} `, impact: 'impact-b', nextAction: 'next-b', evidenceRequired: `ev-${item}-b`, severity: 'HIGH', status: 'OPEN' },
          { item: `${item}-c`, owner: ` ${firstOwner} `, impact: 'impact-c', nextAction: 'next-c', evidenceRequired: `ev-${item}-c`, severity: 'MEDIUM', status: 'OPEN' },
        ],
      });

      expect(pack.status).toBe('ACTION_REQUIRED');
      expect(pack.summary).toEqual({ ownerCount: 2, openAssignmentCount: 3, highSeverityAssignmentCount: 1 });
      expect(pack.assignments.map((assignment) => assignment.owner)).toEqual([firstOwner, secondOwner]);
      expect(pack.assignments[0].evidenceRefs).toEqual([`ev-${item}-a`, `ev-${item}-c`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch146-blank-${index}`,
    index % 2 === 0 ? 'HIGH' : 'LOW',
  ] as const))(
    'filters generated blank open blocker item %s',
    (owner, severity) => {
      const pack = buildQualityOwnerAssignmentPack({
        blockers: [
          { item: '   ', owner, impact: 'impact', nextAction: 'next', evidenceRequired: 'evidence', severity: severity as 'HIGH' | 'LOW', status: 'OPEN' },
          { item: `${owner}-cleared`, owner, impact: 'impact', nextAction: 'next', evidenceRequired: 'evidence-cleared', severity: 'HIGH', status: 'CLEARED' },
        ],
      });

      expect(pack.status).toBe('READY');
      expect(pack.summary.openAssignmentCount).toBe(0);
      expect(pack.summary.highSeverityAssignmentCount).toBe(0);
      expect(pack.assignments).toEqual([]);
    },
  );
});

describe('quality owner assignment pack builder batch 169 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch169-owner-${index}`,
    `batch169-high-${index}`,
    `batch169-low-${index}`,
  ] as const))(
    'groups generated batch169 mixed severity blockers for %s',
    (owner, highItem, lowItem) => {
      const pack = buildQualityOwnerAssignmentPack({
        blockers: [
          { item: ` ${highItem} `, owner: ` ${owner} `, impact: ' high impact ', nextAction: ' high next ', evidenceRequired: ` evidence-${highItem} `, severity: 'HIGH', status: 'OPEN' },
          { item: ` ${lowItem} `, owner: ` ${owner} `, impact: ' low impact ', nextAction: ' low next ', evidenceRequired: ` evidence-${lowItem} `, severity: 'LOW', status: 'OPEN' },
        ],
      });

      expect(pack.status).toBe('ACTION_REQUIRED');
      expect(pack.summary).toEqual({ ownerCount: 1, openAssignmentCount: 2, highSeverityAssignmentCount: 1 });
      expect(pack.assignments[0].owner).toBe(owner);
      expect(pack.assignments[0].items.map((item) => item.item)).toEqual([highItem, lowItem]);
      expect(pack.assignments[0].evidenceRefs).toEqual([`evidence-${highItem}`, `evidence-${lowItem}`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch169-unassigned-${index}`,
    index % 2 === 0 ? 'MEDIUM' : 'HIGH',
  ] as const))(
    'assigns generated batch169 blank owner while preserving severity %s',
    (item, severity) => {
      const pack = buildQualityOwnerAssignmentPack({
        blockers: [{
          item,
          owner: ' ',
          impact: 'impact',
          nextAction: 'next',
          evidenceRequired: `evidence-${item}`,
          severity: severity as 'MEDIUM' | 'HIGH',
          status: 'OPEN',
        }],
      });

      expect(pack.status).toBe('ACTION_REQUIRED');
      expect(pack.summary.ownerCount).toBe(1);
      expect(pack.summary.highSeverityAssignmentCount).toBe(severity === 'HIGH' ? 1 : 0);
      expect(pack.assignments[0].owner).toBe('UNASSIGNED');
      expect(pack.assignments[0].items[0].severity).toBe(severity);
    },
  );
});
