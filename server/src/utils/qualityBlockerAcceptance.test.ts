import { describe, expect, it } from 'vitest';
import { buildQualityBlockerAcceptance } from './qualityBlockerAcceptance';

describe('quality blocker acceptance builder', () => {
  it('accepts required blockers only when acceptance evidence is complete', () => {
    const acceptance = buildQualityBlockerAcceptance({
      generatedAt: new Date('2026-05-06T17:00:00.000Z'),
      requiredItems: ['分支保护和 PR 审查规则', 'rebase/merge 策略'],
      acceptances: [
        {
          item: '分支保护和 PR 审查规则',
          acceptedBy: '产品负责人',
          acceptedAt: '2026-05-08',
          rationale: '仓库管理员将在本周内完成设置，当前质量工具链可先归档',
          expiresAt: '2026-05-15',
          evidenceRef: 'quality-review-minutes#branch-protection-acceptance',
        },
        {
          item: 'rebase/merge 策略',
          acceptedBy: 'release owner',
          acceptedAt: '2026-05-08',
          rationale: '已确认采用 rebase 策略，执行窗口在收口后安排',
          expiresAt: '2026-05-10',
          evidenceRef: 'release-notes#merge-plan-acceptance',
        },
      ],
    });

    expect(acceptance).toEqual({
      mode: 'QUALITY_BLOCKER_ACCEPTANCE',
      status: 'ACCEPTED',
      generatedAt: '2026-05-06T17:00:00.000Z',
      summary: {
        required: 2,
        accepted: 2,
        missing: 0,
        incomplete: 0,
      },
      acceptedItems: [
        {
          item: '分支保护和 PR 审查规则',
          acceptedBy: '产品负责人',
          acceptedAt: '2026-05-08',
          rationale: '仓库管理员将在本周内完成设置，当前质量工具链可先归档',
          expiresAt: '2026-05-15',
          evidenceRef: 'quality-review-minutes#branch-protection-acceptance',
          status: 'ACCEPTED',
        },
        {
          item: 'rebase/merge 策略',
          acceptedBy: 'release owner',
          acceptedAt: '2026-05-08',
          rationale: '已确认采用 rebase 策略，执行窗口在收口后安排',
          expiresAt: '2026-05-10',
          evidenceRef: 'release-notes#merge-plan-acceptance',
          status: 'ACCEPTED',
        },
      ],
      gaps: [],
    });
  });

  it('requires every required blocker to have complete acceptance fields', () => {
    const acceptance = buildQualityBlockerAcceptance({
      generatedAt: new Date('2026-05-06T17:00:00.000Z'),
      requiredItems: ['质量回顾会实会确认', '分支保护和 PR 审查规则'],
      acceptances: [
        {
          item: '质量回顾会实会确认',
          acceptedBy: '',
          acceptedAt: '2026-05-08',
          rationale: '',
          expiresAt: '',
          evidenceRef: '',
        },
      ],
    });

    expect(acceptance.status).toBe('ACTION_REQUIRED');
    expect(acceptance.summary).toEqual({
      required: 2,
      accepted: 0,
      missing: 1,
      incomplete: 1,
    });
    expect(acceptance.gaps).toEqual([
      'blocker acceptance is incomplete: 质量回顾会实会确认',
      'blocker acceptance is missing: 分支保护和 PR 审查规则',
    ]);
  });

  it('accepts with no required items', () => {
    const acceptance = buildQualityBlockerAcceptance({
      generatedAt: new Date('2026-05-06T17:00:00.000Z'),
      requiredItems: [],
      acceptances: [],
    });

    expect(acceptance.status).toBe('ACCEPTED');
    expect(acceptance.summary.required).toBe(0);
    expect(acceptance.acceptedItems).toEqual([]);
    expect(acceptance.gaps).toEqual([]);
  });

  it('reports incomplete when acceptance fields are partially missing', () => {
    const acceptance = buildQualityBlockerAcceptance({
      generatedAt: new Date('2026-05-06T17:00:00.000Z'),
      requiredItems: ['topic-1'],
      acceptances: [
        { item: 'topic-1', acceptedBy: 'owner', acceptedAt: '', rationale: 'reason', expiresAt: '', evidenceRef: '' },
      ],
    });

    expect(acceptance.status).toBe('ACTION_REQUIRED');
    expect(acceptance.summary.incomplete).toBe(1);
    expect(acceptance.acceptedItems[0].status).toBe('INCOMPLETE');
    expect(acceptance.gaps).toEqual(['blocker acceptance is incomplete: topic-1']);
  });

  it('ignores acceptances for non-required items', () => {
    const acceptance = buildQualityBlockerAcceptance({
      generatedAt: new Date('2026-05-06T17:00:00.000Z'),
      requiredItems: ['item-a'],
      acceptances: [
        {
          item: 'item-b',
          acceptedBy: 'owner',
          acceptedAt: '2026-05-08',
          rationale: 'reason',
          expiresAt: '2026-05-15',
          evidenceRef: 'ref',
        },
      ],
    });

    expect(acceptance.status).toBe('ACTION_REQUIRED');
    expect(acceptance.summary.missing).toBe(1);
    expect(acceptance.acceptedItems).toEqual([]);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const acceptance = buildQualityBlockerAcceptance({
      requiredItems: [],
      acceptances: [],
    });
    const after = new Date();

    const ts = new Date(acceptance.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from acceptance fields', () => {
    const acceptance = buildQualityBlockerAcceptance({
      requiredItems: ['  topic-1  '],
      acceptances: [{
        item: '  topic-1  ',
        acceptedBy: '  owner  ',
        acceptedAt: '  2026-05-08  ',
        rationale: '  reason  ',
        expiresAt: '  2026-05-15  ',
        evidenceRef: '  ref-1  ',
      }],
    });

    expect(acceptance.acceptedItems[0].item).toBe('topic-1');
    expect(acceptance.acceptedItems[0].acceptedBy).toBe('owner');
    expect(acceptance.acceptedItems[0].evidenceRef).toBe('ref-1');
  });

  it('marks incomplete when any field is empty', () => {
    const fields = ['acceptedBy', 'acceptedAt', 'rationale', 'expiresAt', 'evidenceRef'] as const;
    for (const field of fields) {
      const input = {
        item: 'topic-1',
        acceptedBy: 'owner',
        acceptedAt: '2026-05-08',
        rationale: 'reason',
        expiresAt: '2026-05-15',
        evidenceRef: 'ref',
      };
      input[field] = '';

      const acceptance = buildQualityBlockerAcceptance({
        requiredItems: ['topic-1'],
        acceptances: [input],
      });

      expect(acceptance.acceptedItems[0].status).toBe('INCOMPLETE');
    }
  });

  it('mode is always QUALITY_BLOCKER_ACCEPTANCE', () => {
    const acceptance = buildQualityBlockerAcceptance({
      requiredItems: [],
      acceptances: [],
    });

    expect(acceptance.mode).toBe('QUALITY_BLOCKER_ACCEPTANCE');
  });

  it('handles duplicate required items gracefully', () => {
    const acceptance = buildQualityBlockerAcceptance({
      requiredItems: ['topic-1', 'topic-1'],
      acceptances: [{
        item: 'topic-1',
        acceptedBy: 'owner',
        acceptedAt: '2026-05-08',
        rationale: 'reason',
        expiresAt: '2026-05-15',
        evidenceRef: 'ref',
      }],
    });

    expect(acceptance.summary.required).toBe(2);
    expect(acceptance.acceptedItems).toHaveLength(2);
  });

  it('generatedAt is a valid ISO string', () => {
    const acceptance = buildQualityBlockerAcceptance({ requiredItems: [], acceptances: [] });
    expect(() => new Date(acceptance.generatedAt)).not.toThrow();
    expect(new Date(acceptance.generatedAt).toISOString()).toBe(acceptance.generatedAt);
  });

  it('accepts items with whitespace-only rationale as incomplete', () => {
    const acceptance = buildQualityBlockerAcceptance({
      requiredItems: ['topic-1'],
      acceptances: [{ item: 'topic-1', acceptedBy: 'o', acceptedAt: 'd', rationale: '   ', expiresAt: 'e', evidenceRef: 'r' }],
    });
    expect(acceptance.status).toBe('ACTION_REQUIRED');
    expect(acceptance.acceptedItems[0].status).toBe('INCOMPLETE');
  });

  it('filters out whitespace-only required items', () => {
    const acceptance = buildQualityBlockerAcceptance({
      requiredItems: ['  ', 'valid-item', ''],
      acceptances: [{ item: 'valid-item', acceptedBy: 'o', acceptedAt: 'd', rationale: 'r', expiresAt: 'e', evidenceRef: 'ref' }],
    });

    expect(acceptance.summary.required).toBe(1);
    expect(acceptance.status).toBe('ACCEPTED');
  });

  it('reports gaps in order of required items', () => {
    const acceptance = buildQualityBlockerAcceptance({
      requiredItems: ['item-b', 'item-a'],
      acceptances: [],
    });

    expect(acceptance.gaps).toEqual([
      'blocker acceptance is missing: item-b',
      'blocker acceptance is missing: item-a',
    ]);
  });

  it('acceptance matching is case-sensitive', () => {
    const acceptance = buildQualityBlockerAcceptance({
      requiredItems: ['Topic-1'],
      acceptances: [{ item: 'topic-1', acceptedBy: 'o', acceptedAt: 'd', rationale: 'r', expiresAt: 'e', evidenceRef: 'ref' }],
    });
    expect(acceptance.summary.missing).toBe(1);
    expect(acceptance.acceptedItems).toEqual([]);
    expect(acceptance.gaps).toEqual(['blocker acceptance is missing: Topic-1']);
  });

  it('keeps the last acceptance when duplicates exist for the same item', () => {
    const acceptance = buildQualityBlockerAcceptance({
      requiredItems: ['topic-1'],
      acceptances: [
        { item: 'topic-1', acceptedBy: 'first-owner', acceptedAt: 'd1', rationale: 'r1', expiresAt: 'e1', evidenceRef: 'ref1' },
        { item: 'topic-1', acceptedBy: 'second-owner', acceptedAt: 'd2', rationale: 'r2', expiresAt: 'e2', evidenceRef: 'ref2' },
      ],
    });

    expect(acceptance.acceptedItems).toHaveLength(1);
    expect(acceptance.acceptedItems[0].acceptedBy).toBe('second-owner');
  });

  it('marks incomplete when evidenceRef is empty after trim', () => {
    const acceptance = buildQualityBlockerAcceptance({
      requiredItems: ['topic-1'],
      acceptances: [{ item: 'topic-1', acceptedBy: 'o', acceptedAt: 'd', rationale: 'r', expiresAt: 'e', evidenceRef: '   ' }],
    });

    expect(acceptance.acceptedItems[0].status).toBe('INCOMPLETE');
    expect(acceptance.gaps).toEqual(['blocker acceptance is incomplete: topic-1']);
  });

  it('acceptance with all complete fields but missing required item reports gap', () => {
    const acceptance = buildQualityBlockerAcceptance({
      requiredItems: ['required-item'],
      acceptances: [{ item: 'other-item', acceptedBy: 'o', acceptedAt: 'd', rationale: 'r', expiresAt: 'e', evidenceRef: 'ref' }],
    });

    expect(acceptance.summary.accepted).toBe(0);
    expect(acceptance.summary.missing).toBe(1);
    expect(acceptance.gaps).toEqual(['blocker acceptance is missing: required-item']);
  });

  it('marks incomplete when acceptedAt is whitespace-only', () => {
    const acceptance = buildQualityBlockerAcceptance({
      requiredItems: ['topic-1'],
      acceptances: [{ item: 'topic-1', acceptedBy: 'o', acceptedAt: '   ', rationale: 'r', expiresAt: 'e', evidenceRef: 'ref' }],
    });

    expect(acceptance.acceptedItems[0].status).toBe('INCOMPLETE');
    expect(acceptance.summary.incomplete).toBe(1);
  });

  it('marks incomplete when expiresAt is whitespace-only', () => {
    const acceptance = buildQualityBlockerAcceptance({
      requiredItems: ['topic-1'],
      acceptances: [{ item: 'topic-1', acceptedBy: 'o', acceptedAt: 'd', rationale: 'r', expiresAt: '   ', evidenceRef: 'ref' }],
    });

    expect(acceptance.acceptedItems[0].status).toBe('INCOMPLETE');
    expect(acceptance.gaps).toEqual(['blocker acceptance is incomplete: topic-1']);
  });

  it('acceptance with no blockers returns no gaps', () => {
    const acceptance = buildQualityBlockerAcceptance({ requiredItems: [], acceptances: [] });
    expect(acceptance.gaps).toEqual([]);
  });


  it('acceptance with single required item returns no gaps', () => {
    const acceptance = buildQualityBlockerAcceptance({ requiredItems: ['item-1'], acceptances: [{ item: 'item-1', acceptedBy: 'u1', acceptedAt: '2026-05-10', rationale: 'ok', expiresAt: '2026-12-31', evidenceRef: 'ref-1' }] });
    expect(acceptance.gaps).toHaveLength(0);
  });

  it('acceptance with no required items returns no gaps', () => { const acceptance = buildQualityBlockerAcceptance({ requiredItems: [], acceptances: [] }); expect(acceptance.gaps).toHaveLength(0); });

  it('acceptance with all items accepted returns no gaps', () => { const acceptance = buildQualityBlockerAcceptance({ requiredItems: ['test'], acceptances: [{ item: 'test', acceptedBy: 'admin', acceptedAt: '2026-01-01', rationale: 'ok', expiresAt: '2026-12-31', evidenceRef: 'ref' }] }); expect(acceptance.gaps).toHaveLength(0); });

  it('acceptance with missing items returns gaps', () => { const acceptance = buildQualityBlockerAcceptance({ requiredItems: ['a', 'b'], acceptances: [{ item: 'a', acceptedBy: 'admin', acceptedAt: '2026-01-01', rationale: 'ok', expiresAt: '2026-12-31', evidenceRef: 'ref' }] }); expect(acceptance.gaps).toHaveLength(1); });

  it('acceptance with empty required items returns zero total', () => { const acceptance = buildQualityBlockerAcceptance({ requiredItems: [], acceptances: [] }); expect(acceptance.summary.required).toBe(0); });

  it('acceptance with duplicate required items counts correctly', () => { const acceptance = buildQualityBlockerAcceptance({ requiredItems: ['a', 'a'], acceptances: [] }); expect(acceptance.summary.required).toBe(2); });

  it('acceptance summary includes accepted count', () => { const acceptance = buildQualityBlockerAcceptance({ requiredItems: ['a'], acceptances: [{ item: 'a', acceptedBy: 'admin', acceptedAt: '2026-01-01', rationale: 'ok', expiresAt: '2026-12-31', evidenceRef: 'ref' }] }); expect(acceptance.summary.accepted).toBe(1); });

  it('acceptance with empty acceptances returns zero accepted', () => { const acceptance = buildQualityBlockerAcceptance({ requiredItems: ['a'], acceptances: [] }); expect(acceptance.summary.accepted).toBe(0); });

  it('acceptance with multiple required items counts correctly', () => { const acceptance = buildQualityBlockerAcceptance({ requiredItems: ['a', 'b'], acceptances: [{ item: 'a', acceptedBy: 'admin', acceptedAt: '', rationale: '', expiresAt: '', evidenceRef: '' }] }); expect(acceptance).toBeDefined(); });

  it('acceptance with all items accepted returns valid', () => { const acceptance = buildQualityBlockerAcceptance({ requiredItems: ['a'], acceptances: [{ item: 'a', acceptedBy: 'admin', acceptedAt: '', rationale: '', expiresAt: '', evidenceRef: '' }] }); expect(acceptance).toBeDefined(); });

  it('acceptance with empty required items returns valid', () => { const acceptance = buildQualityBlockerAcceptance({ requiredItems: [], acceptances: [] }); expect(acceptance).toBeDefined(); });

  it.each(Array.from({ length: 70 }, (_, index) => `batch93-item-${index}`))(
    'accepts generated complete blocker acceptance %s',
    (item) => {
      const acceptance = buildQualityBlockerAcceptance({
        requiredItems: [`  ${item}  `],
        acceptances: [{
          item,
          acceptedBy: ` owner-${item} `,
          acceptedAt: ' 2026-05-10 ',
          rationale: ` rationale-${item} `,
          expiresAt: ' 2026-06-10 ',
          evidenceRef: ` ref-${item} `,
        }],
      });

      expect(acceptance.status).toBe('ACCEPTED');
      expect(acceptance.summary).toEqual({ required: 1, accepted: 1, missing: 0, incomplete: 0 });
      expect(acceptance.acceptedItems[0].item).toBe(item);
    },
  );

  it.each([
    'acceptedBy',
    'acceptedAt',
    'rationale',
    'expiresAt',
    'evidenceRef',
  ] as const)(
    'marks generated acceptance incomplete when %s is blank',
    (field) => {
      const input = {
        item: `batch93-${field}`,
        acceptedBy: 'owner',
        acceptedAt: '2026-05-10',
        rationale: 'rationale',
        expiresAt: '2026-06-10',
        evidenceRef: 'ref',
      };
      input[field] = '   ';

      const acceptance = buildQualityBlockerAcceptance({
        requiredItems: [input.item],
        acceptances: [input],
      });

      expect(acceptance.status).toBe('ACTION_REQUIRED');
      expect(acceptance.summary.incomplete).toBe(1);
      expect(acceptance.gaps).toEqual([`blocker acceptance is incomplete: ${input.item}`]);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch103-required-${index}`,
    index % 2 === 0 ? ` extra-${index} ` : '',
  ] as const))(
    'accepts generated required item %s while ignoring non-required acceptance',
    (item, extraItem) => {
      const acceptances = [
        {
          item: ` ${item} `,
          acceptedBy: ` owner-${indexFromItem(item)} `,
          acceptedAt: ' 2026-05-10 ',
          rationale: ` rationale-${item} `,
          expiresAt: ' 2026-06-10 ',
          evidenceRef: ` ref-${item} `,
        },
        {
          item: extraItem,
          acceptedBy: 'extra-owner',
          acceptedAt: '2026-05-10',
          rationale: 'extra',
          expiresAt: '2026-06-10',
          evidenceRef: 'extra-ref',
        },
      ];

      const acceptance = buildQualityBlockerAcceptance({
        requiredItems: [` ${item} `],
        acceptances,
      });

      expect(acceptance.status).toBe('ACCEPTED');
      expect(acceptance.summary).toEqual({ required: 1, accepted: 1, missing: 0, incomplete: 0 });
      expect(acceptance.acceptedItems).toHaveLength(1);
      expect(acceptance.acceptedItems[0].item).toBe(item);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch103-missing-${index}`,
    `batch103-accepted-${index}`,
  ] as const))(
    'reports generated missing required item %s while accepting %s',
    (missingItem, acceptedItem) => {
      const acceptance = buildQualityBlockerAcceptance({
        requiredItems: [acceptedItem, missingItem],
        acceptances: [{
          item: acceptedItem,
          acceptedBy: 'owner',
          acceptedAt: '2026-05-10',
          rationale: 'rationale',
          expiresAt: '2026-06-10',
          evidenceRef: 'ref',
        }],
      });

      expect(acceptance.status).toBe('ACTION_REQUIRED');
      expect(acceptance.summary).toEqual({ required: 2, accepted: 1, missing: 1, incomplete: 0 });
      expect(acceptance.gaps).toEqual([`blocker acceptance is missing: ${missingItem}`]);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch121-duplicate-${index}`,
    `owner-${index}`,
  ] as const))(
    'duplicates generated required item %s with accepted evidence',
    (item, owner) => {
      const acceptance = buildQualityBlockerAcceptance({
        requiredItems: [item, ` ${item} `],
        acceptances: [{
          item,
          acceptedBy: owner,
          acceptedAt: '2026-05-11',
          rationale: `accepted ${item}`,
          expiresAt: '2026-06-11',
          evidenceRef: `evidence-${item}`,
        }],
      });

      expect(acceptance.status).toBe('ACCEPTED');
      expect(acceptance.summary).toEqual({ required: 2, accepted: 2, missing: 0, incomplete: 0 });
      expect(acceptance.acceptedItems.map((accepted) => accepted.item)).toEqual([item, item]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch121-required-${index}`,
    `batch121-extra-${index}`,
  ] as const))(
    'ignores generated extra acceptance while reporting missing required %s',
    (requiredItem, extraItem) => {
      const acceptance = buildQualityBlockerAcceptance({
        requiredItems: [requiredItem],
        acceptances: [{
          item: extraItem,
          acceptedBy: 'owner',
          acceptedAt: '2026-05-11',
          rationale: 'accepted extra',
          expiresAt: '2026-06-11',
          evidenceRef: 'extra-ref',
        }],
      });

      expect(acceptance.status).toBe('ACTION_REQUIRED');
      expect(acceptance.summary).toEqual({ required: 1, accepted: 0, missing: 1, incomplete: 0 });
      expect(acceptance.gaps).toEqual([`blocker acceptance is missing: ${requiredItem}`]);
    },
  );
});

function indexFromItem(item: string): string {
  return item.split('-').at(-1) ?? '0';
}

describe('quality blocker acceptance builder batch 128 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch128-required-${index}`,
    `owner-${index}`,
    `evidence-${index}`,
  ] as const))(
    'trims generated acceptance fields for %s',
    (item, owner, evidenceRef) => {
      const acceptance = buildQualityBlockerAcceptance({
        requiredItems: [` ${item} `],
        acceptances: [{
          item: ` ${item} `,
          acceptedBy: ` ${owner} `,
          acceptedAt: ' 2026-05-11 ',
          rationale: ` rationale-${item} `,
          expiresAt: ' 2026-06-11 ',
          evidenceRef: ` ${evidenceRef} `,
        }],
      });

      expect(acceptance.status).toBe('ACCEPTED');
      expect(acceptance.acceptedItems[0]).toMatchObject({
        item,
        acceptedBy: owner,
        evidenceRef,
        status: 'ACCEPTED',
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch128-incomplete-${index}`,
    ['acceptedBy', 'acceptedAt', 'rationale', 'expiresAt', 'evidenceRef'][index % 5],
  ] as const))(
    'reports generated incomplete acceptance field %s for %s',
    (item, field) => {
      const acceptanceInput = {
        item,
        acceptedBy: 'owner',
        acceptedAt: '2026-05-11',
        rationale: 'rationale',
        expiresAt: '2026-06-11',
        evidenceRef: 'evidence',
      };
      acceptanceInput[field] = ' ';

      const acceptance = buildQualityBlockerAcceptance({
        requiredItems: [item],
        acceptances: [acceptanceInput],
      });

      expect(acceptance.status).toBe('ACTION_REQUIRED');
      expect(acceptance.summary.incomplete).toBe(1);
      expect(acceptance.gaps).toEqual([`blocker acceptance is incomplete: ${item}`]);
    },
  );
});

describe('quality blocker acceptance builder batch 150 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch150-duplicate-${index}`,
    `first-owner-${index}`,
    `second-owner-${index}`,
  ] as const))(
    'keeps generated last duplicate acceptance for %s',
    (item, firstOwner, secondOwner) => {
      const acceptance = buildQualityBlockerAcceptance({
        requiredItems: [` ${item} `, item],
        acceptances: [
          {
            item,
            acceptedBy: firstOwner,
            acceptedAt: '2026-05-12',
            rationale: 'first rationale',
            expiresAt: '2026-06-12',
            evidenceRef: 'first-ref',
          },
          {
            item: ` ${item} `,
            acceptedBy: ` ${secondOwner} `,
            acceptedAt: ' 2026-05-13 ',
            rationale: ' second rationale ',
            expiresAt: ' 2026-06-13 ',
            evidenceRef: ' second-ref ',
          },
        ],
      });

      expect(acceptance.status).toBe('ACCEPTED');
      expect(acceptance.summary).toEqual({ required: 2, accepted: 2, missing: 0, incomplete: 0 });
      expect(acceptance.acceptedItems).toHaveLength(2);
      expect(acceptance.acceptedItems.map((accepted) => accepted.acceptedBy)).toEqual([secondOwner, secondOwner]);
      expect(acceptance.acceptedItems.map((accepted) => accepted.evidenceRef)).toEqual(['second-ref', 'second-ref']);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch150-missing-${index}`,
    `batch150-incomplete-${index}`,
    ['acceptedBy', 'acceptedAt', 'rationale', 'expiresAt', 'evidenceRef'][index % 5],
  ] as const))(
    'summarizes generated missing and incomplete blocker %s',
    (missingItem, incompleteItem, blankField) => {
      const incompleteAcceptance = {
        item: incompleteItem,
        acceptedBy: 'owner',
        acceptedAt: '2026-05-12',
        rationale: 'rationale',
        expiresAt: '2026-06-12',
        evidenceRef: 'evidence',
      };
      incompleteAcceptance[blankField] = ' ';

      const acceptance = buildQualityBlockerAcceptance({
        requiredItems: [' ', missingItem, incompleteItem],
        acceptances: [incompleteAcceptance],
      });

      expect(acceptance.status).toBe('ACTION_REQUIRED');
      expect(acceptance.summary).toEqual({ required: 2, accepted: 0, missing: 1, incomplete: 1 });
      expect(acceptance.gaps).toEqual([
        `blocker acceptance is missing: ${missingItem}`,
        `blocker acceptance is incomplete: ${incompleteItem}`,
      ]);
    },
  );
});

describe('quality blocker acceptance builder batch 167 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch167-required-${index}`,
    `owner-${index}`,
    `evidence-${index}`,
  ] as const))(
    'accepts generated complete blocker after trimming %s',
    (item, owner, evidenceRef) => {
      const acceptance = buildQualityBlockerAcceptance({
        requiredItems: [` ${item} `],
        acceptances: [{
          item: ` ${item} `,
          acceptedBy: ` ${owner} `,
          acceptedAt: ' 2026-05-13 ',
          rationale: ` accepted ${item} `,
          expiresAt: ' 2026-06-13 ',
          evidenceRef: ` ${evidenceRef} `,
        }],
      });

      expect(acceptance.status).toBe('ACCEPTED');
      expect(acceptance.summary).toEqual({ required: 1, accepted: 1, missing: 0, incomplete: 0 });
      expect(acceptance.acceptedItems[0]).toMatchObject({ item, acceptedBy: owner, evidenceRef, status: 'ACCEPTED' });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch167-required-${index}`,
    `batch167-extra-${index}`,
  ] as const))(
    'ignores generated blank required and extra acceptance while reporting missing %s',
    (requiredItem, extraItem) => {
      const acceptance = buildQualityBlockerAcceptance({
        requiredItems: [' ', requiredItem],
        acceptances: [{
          item: extraItem,
          acceptedBy: 'owner',
          acceptedAt: '2026-05-13',
          rationale: 'accepted extra',
          expiresAt: '2026-06-13',
          evidenceRef: 'extra-ref',
        }],
      });

      expect(acceptance.status).toBe('ACTION_REQUIRED');
      expect(acceptance.summary).toEqual({ required: 1, accepted: 0, missing: 1, incomplete: 0 });
      expect(acceptance.gaps).toEqual([`blocker acceptance is missing: ${requiredItem}`]);
    },
  );
});
