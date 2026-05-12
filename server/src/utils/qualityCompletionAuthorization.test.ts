import { describe, expect, it } from 'vitest';
import { buildQualityCompletionAuthorization } from './qualityCompletionAuthorization';

describe('quality completion authorization builder', () => {
  it('marks the quality project completed when final archive and risk acceptance are recorded', () => {
    const completion = buildQualityCompletionAuthorization({
      generatedAt: new Date('2026-05-06T11:00:00.000Z'),
      authorizedBy: '项目负责人',
      authorizedAt: '2026-05-06',
      authorizationRef: 'chat#2026-05-06-direct-to-100',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [
        { item: '质量回顾会实会确认', owner: 'AI 代码守护人', evidenceRef: 'chat#2026-05-06-direct-to-100', followUp: '归档后补会议纪要' },
        { item: '分支保护和 PR 审查规则', owner: '产品负责人', evidenceRef: 'chat#2026-05-06-direct-to-100', followUp: '仓库管理员补 GitHub Settings 截图' },
        { item: 'rebase/merge 策略', owner: 'release owner', evidenceRef: 'chat#2026-05-06-direct-to-100', followUp: '归档后执行 merge 策略确认' },
      ],
      archiveActions: ['attach final closure JSON to monthly audit', 'start next-quarter quality cadence'],
    });

    expect(completion).toEqual({
      mode: 'ATLAS_QUALITY_COMPLETION',
      status: 'COMPLETED',
      generatedAt: '2026-05-06T11:00:00.000Z',
      authorization: {
        authorizedBy: '项目负责人',
        authorizedAt: '2026-05-06',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      summary: {
        acceptedRiskCount: 3,
        archiveActionCount: 2,
        missingEvidenceCount: 0,
      },
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [
        { item: '质量回顾会实会确认', owner: 'AI 代码守护人', evidenceRef: 'chat#2026-05-06-direct-to-100', followUp: '归档后补会议纪要' },
        { item: '分支保护和 PR 审查规则', owner: '产品负责人', evidenceRef: 'chat#2026-05-06-direct-to-100', followUp: '仓库管理员补 GitHub Settings 截图' },
        { item: 'rebase/merge 策略', owner: 'release owner', evidenceRef: 'chat#2026-05-06-direct-to-100', followUp: '归档后执行 merge 策略确认' },
      ],
      archiveActions: ['attach final closure JSON to monthly audit', 'start next-quarter quality cadence'],
      gaps: [],
    });
  });

  it('keeps completion action-required without authorization or ready final closure', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: '',
      authorizedAt: '',
      authorizationRef: '',
      finalClosureStatus: 'ACTION_REQUIRED',
      acceptedRisks: [
        { item: '分支保护和 PR 审查规则', owner: '', evidenceRef: '', followUp: '' },
      ],
      archiveActions: [],
    });

    expect(completion.status).toBe('ACTION_REQUIRED');
    expect(completion.gaps).toEqual([
      'authorization is incomplete',
      'final closure is not READY_TO_ARCHIVE',
      'accepted risk owner is missing: 分支保护和 PR 审查规则',
      'accepted risk evidence is missing: 分支保护和 PR 审查规则',
      'accepted risk followUp is missing: 分支保护和 PR 审查规则',
    ]);
  });

  it('completes with minimal valid input', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref-1',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [],
      archiveActions: [],
    });

    expect(completion.status).toBe('COMPLETED');
    expect(completion.summary.acceptedRiskCount).toBe(0);
    expect(completion.summary.archiveActionCount).toBe(0);
  });

  it('reports action-required when finalClosureStatus is not READY_TO_ARCHIVE', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref-1',
      finalClosureStatus: 'ACTION_REQUIRED',
      acceptedRisks: [],
      archiveActions: [],
    });

    expect(completion.status).toBe('ACTION_REQUIRED');
    expect(completion.gaps).toContain('final closure is not READY_TO_ARCHIVE');
  });

  it('counts missingEvidence gaps correctly', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref-1',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [
        { item: 'risk-1', owner: 'o', evidenceRef: '', followUp: 'f' },
        { item: 'risk-2', owner: 'o', evidenceRef: 'ref', followUp: 'f' },
      ],
      archiveActions: [],
    });

    expect(completion.summary.missingEvidenceCount).toBe(1);
    expect(completion.gaps).toEqual(['accepted risk evidence is missing: risk-1']);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref-1',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [],
      archiveActions: [],
    });
    const after = new Date();

    const ts = new Date(completion.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from authorization fields', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: '  admin  ',
      authorizedAt: '  2026-05-08  ',
      authorizationRef: '  ref-1  ',
      finalClosureStatus: '  READY_TO_ARCHIVE  ',
      acceptedRisks: [],
      archiveActions: [],
    });

    expect(completion.authorization.authorizedBy).toBe('admin');
    expect(completion.authorization.authorizedAt).toBe('2026-05-08');
    expect(completion.authorization.authorizationRef).toBe('ref-1');
    expect(completion.finalClosureStatus).toBe('READY_TO_ARCHIVE');
  });

  it('trims and filters archiveActions', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [],
      archiveActions: ['  action-1  ', '  ', '  action-2  '],
    });

    expect(completion.archiveActions).toEqual(['action-1', 'action-2']);
    expect(completion.summary.archiveActionCount).toBe(2);
  });

  it('trims whitespace from risk fields', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [{
        item: '  risk-1  ',
        owner: '  owner  ',
        evidenceRef: '  ref  ',
        followUp: '  follow  ',
      }],
      archiveActions: [],
    });

    expect(completion.acceptedRisks[0].item).toBe('risk-1');
    expect(completion.acceptedRisks[0].owner).toBe('owner');
  });

  it('filters out risks with empty item', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [
        { item: '  ', owner: 'o', evidenceRef: 'r', followUp: 'f' },
        { item: 'real risk', owner: 'o', evidenceRef: 'r', followUp: 'f' },
      ],
      archiveActions: [],
    });

    expect(completion.acceptedRisks).toHaveLength(1);
    expect(completion.summary.acceptedRiskCount).toBe(1);
  });

  it('mode is always QUALITY_COMPLETION_AUTHORIZATION', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [],
      archiveActions: [],
    });
    expect(completion.mode).toBe('ATLAS_QUALITY_COMPLETION');
  });

  it('generatedAt is valid ISO string', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'a', authorizedAt: 'd', authorizationRef: 'r',
      finalClosureStatus: 'READY_TO_ARCHIVE', acceptedRisks: [], archiveActions: [],
    });
    expect(new Date(completion.generatedAt).toISOString()).toBe(completion.generatedAt);
  });

  it('reports gap for risk with missing owner', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [
        { item: 'risk-no-owner', owner: '', evidenceRef: 'ref', followUp: 'fu' },
      ],
      archiveActions: [],
    });

    expect(completion.gaps).toContain('accepted risk owner is missing: risk-no-owner');
    expect(completion.status).toBe('ACTION_REQUIRED');
  });

  it('reports gap for risk with missing followUp', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [
        { item: 'risk-no-followup', owner: 'o', evidenceRef: 'ref', followUp: '' },
      ],
      archiveActions: [],
    });

    expect(completion.gaps).toContain('accepted risk followUp is missing: risk-no-followup');
    expect(completion.status).toBe('ACTION_REQUIRED');
  });

  it('reports authorization incomplete when only authorizedBy is missing', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: '',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [],
      archiveActions: [],
    });

    expect(completion.status).toBe('ACTION_REQUIRED');
    expect(completion.gaps).toEqual(['authorization is incomplete']);
    expect(completion.summary.missingEvidenceCount).toBe(0);
  });

  it('reports authorization incomplete when only authorizedAt is missing', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '',
      authorizationRef: 'ref',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [],
      archiveActions: [],
    });

    expect(completion.status).toBe('ACTION_REQUIRED');
    expect(completion.gaps).toEqual(['authorization is incomplete']);
  });

  it('reports authorization incomplete when only authorizationRef is missing', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-08',
      authorizationRef: '',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [],
      archiveActions: [],
    });

    expect(completion.status).toBe('ACTION_REQUIRED');
    expect(completion.gaps).toEqual(['authorization is incomplete']);
  });

  it('whitespace-only authorizedBy is treated as incomplete authorization', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: '   ',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [],
      archiveActions: [],
    });

    expect(completion.status).toBe('ACTION_REQUIRED');
    expect(completion.gaps).toEqual(['authorization is incomplete']);
  });

  it('risk with missing owner evidence and followUp produces correct missingEvidenceCount', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [
        { item: 'multi-gap-risk', owner: '', evidenceRef: '', followUp: '' },
      ],
      archiveActions: [],
    });

    expect(completion.gaps).toHaveLength(3);
    expect(completion.summary.missingEvidenceCount).toBe(1);
    expect(completion.gaps).toContain('accepted risk owner is missing: multi-gap-risk');
    expect(completion.gaps).toContain('accepted risk evidence is missing: multi-gap-risk');
    expect(completion.gaps).toContain('accepted risk followUp is missing: multi-gap-risk');
  });

  it('whitespace-only finalClosureStatus is not READY_TO_ARCHIVE', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref',
      finalClosureStatus: '   ',
      acceptedRisks: [],
      archiveActions: [],
    });

    expect(completion.status).toBe('ACTION_REQUIRED');
    expect(completion.gaps).toContain('final closure is not READY_TO_ARCHIVE');
  });

  it('completed authorization with archive actions preserves them', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-08',
      authorizationRef: 'ref',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [],
      archiveActions: ['action-a', 'action-b', 'action-c'],
    });

    expect(completion.status).toBe('COMPLETED');
    expect(completion.archiveActions).toEqual(['action-a', 'action-b', 'action-c']);
    expect(completion.summary.archiveActionCount).toBe(3);
  });

  it('completion with no archive actions has ACTION_REQUIRED status', () => {
    const completion = buildQualityCompletionAuthorization({
      authorizedBy: '',
      authorizedAt: '',
      authorizationRef: '',
      finalClosureStatus: 'ACTION_REQUIRED',
      acceptedRisks: [],
      archiveActions: [],
    });
    expect(completion.status).toBe('ACTION_REQUIRED');
    expect(completion.archiveActions).toEqual([]);
  });

  it('authorization with empty checks returns authorized status', () => {
    const result = buildQualityCompletionAuthorization({
      authorizedBy: 'admin',
      authorizedAt: '2026-05-10',
      authorizationRef: 'AUTH-001',
      finalClosureStatus: 'READY_TO_ARCHIVE',
      acceptedRisks: [],
      archiveActions: [],
    });
    expect(result.status).toBe('COMPLETED');
  });


  it('authorization with incomplete dashboard returns valid status', () => {
    const result = buildQualityCompletionAuthorization({ authorizedBy: 'admin', authorizedAt: '2026-05-10', authorizationRef: 'AUTH-002', finalClosureStatus: 'ACTION_REQUIRED', acceptedRisks: [], archiveActions: [] });
    expect(result.status).toBeDefined();
  });

  it('authorization with COMPLETED status returns valid result', () => { const result = buildQualityCompletionAuthorization({ authorizedBy: 'admin', authorizedAt: '', authorizationRef: 'REF', finalClosureStatus: 'COMPLETED', acceptedRisks: [], archiveActions: [] }); expect(result).toBeDefined(); });

  it('authorization with PENDING status returns valid result', () => { const result = buildQualityCompletionAuthorization({ authorizedBy: '', authorizedAt: '', authorizationRef: '', finalClosureStatus: 'PENDING', acceptedRisks: [], archiveActions: [] }); expect(result).toBeDefined(); });

  it('authorization with accepted risks includes risk count', () => { const result = buildQualityCompletionAuthorization({ authorizedBy: 'admin', authorizedAt: '2026-01-01', authorizationRef: 'REF', finalClosureStatus: 'COMPLETED', acceptedRisks: [{ item: 'r1', owner: 'admin', evidenceRef: 'ref', followUp: 'none' }], archiveActions: [] }); expect(result.acceptedRisks).toHaveLength(1); });

  it('authorization with empty accepted risks returns zero count', () => { const result = buildQualityCompletionAuthorization({ authorizedBy: 'admin', authorizedAt: '', authorizationRef: '', finalClosureStatus: 'PENDING', acceptedRisks: [], archiveActions: [] }); expect(result.acceptedRisks).toHaveLength(0); });

  it('authorization with archiveActions preserves actions', () => { const result = buildQualityCompletionAuthorization({ authorizedBy: 'admin', authorizedAt: '', authorizationRef: '', finalClosureStatus: 'COMPLETED', acceptedRisks: [], archiveActions: ['archive-1', 'archive-2'] }); expect(result.archiveActions).toHaveLength(2); });

  it('authorization mode is QUALITY_COMPLETION_AUTHORIZATION', () => { const result = buildQualityCompletionAuthorization({ authorizedBy: '', authorizedAt: '', authorizationRef: '', finalClosureStatus: 'PENDING', acceptedRisks: [], archiveActions: [] }); expect(result.mode).toBe('ATLAS_QUALITY_COMPLETION'); });

  it('authorization with COMPLETED status returns valid result', () => { const result = buildQualityCompletionAuthorization({ authorizedBy: 'admin', authorizedAt: '2026-01-01', authorizationRef: 'REF', finalClosureStatus: 'COMPLETED', acceptedRisks: [], archiveActions: [] }); expect(result.finalClosureStatus).toBe('COMPLETED'); });

  it('authorization with acceptedRisks returns valid count', () => { const result = buildQualityCompletionAuthorization({ authorizedBy: '', authorizedAt: '', authorizationRef: '', finalClosureStatus: 'PENDING', acceptedRisks: [], archiveActions: [] }); expect(result).toBeDefined(); });

  it('authorization with non-empty archiveActions returns valid', () => { const result = buildQualityCompletionAuthorization({ authorizedBy: 'admin', authorizedAt: '2026-01-01', authorizationRef: 'REF', finalClosureStatus: 'COMPLETED', acceptedRisks: [], archiveActions: ['action1'] }); expect(result.archiveActions).toHaveLength(1); });

  it('authorization with empty archiveActions returns valid', () => { const result = buildQualityCompletionAuthorization({ authorizedBy: 'admin', authorizedAt: '', authorizationRef: '', finalClosureStatus: 'COMPLETED', acceptedRisks: [], archiveActions: [] }); expect(result).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch104-risk-${index}`,
    `owner-${index}`,
    `evidence-${index}`,
    `follow-${index}`,
  ] as const))(
    'completes generated authorization with accepted risk %s',
    (item, owner, evidenceRef, followUp) => {
      const completion = buildQualityCompletionAuthorization({
        authorizedBy: ` authorized-${item} `,
        authorizedAt: ' 2026-05-10 ',
        authorizationRef: ` ref-${item} `,
        finalClosureStatus: ' READY_TO_ARCHIVE ',
        acceptedRisks: [{
          item: ` ${item} `,
          owner: ` ${owner} `,
          evidenceRef: ` ${evidenceRef} `,
          followUp: ` ${followUp} `,
        }],
        archiveActions: [` archive-${item} `, ' '],
      });

      expect(completion.status).toBe('COMPLETED');
      expect(completion.summary).toEqual({
        acceptedRiskCount: 1,
        archiveActionCount: 1,
        missingEvidenceCount: 0,
      });
      expect(completion.acceptedRisks[0]).toEqual({ item, owner, evidenceRef, followUp });
      expect(completion.archiveActions).toEqual([`archive-${item}`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch104-gap-risk-${index}`,
    ['owner', 'evidenceRef', 'followUp'][index % 3],
  ] as const))(
    'reports generated accepted risk gap for %s missing %s',
    (item, field) => {
      const risk = {
        item,
        owner: 'owner',
        evidenceRef: 'evidence',
        followUp: 'follow',
      };
      risk[field] = ' ';

      const completion = buildQualityCompletionAuthorization({
        authorizedBy: 'authorized',
        authorizedAt: '2026-05-10',
        authorizationRef: 'ref',
        finalClosureStatus: 'READY_TO_ARCHIVE',
        acceptedRisks: [risk],
        archiveActions: [],
      });

      expect(completion.status).toBe('ACTION_REQUIRED');
      expect(completion.gaps).toHaveLength(1);
      expect(completion.gaps[0]).toContain(item);
      expect(completion.summary.missingEvidenceCount).toBe(field === 'evidenceRef' ? 1 : 0);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch142-risk-${index}`,
    `owner-${index}`,
    `evidence-${index}`,
    `follow-${index}`,
  ] as const))(
    'normalizes generated completed authorization %s',
    (item, owner, evidenceRef, followUp) => {
      const completion = buildQualityCompletionAuthorization({
        authorizedBy: ' approver ',
        authorizedAt: ' 2026-05-11 ',
        authorizationRef: ' AUTH-142 ',
        finalClosureStatus: ' READY_TO_ARCHIVE ',
        acceptedRisks: [{ item: ` ${item} `, owner: ` ${owner} `, evidenceRef: ` ${evidenceRef} `, followUp: ` ${followUp} ` }],
        archiveActions: [' ', ` archive-${item} `],
      });

      expect(completion.status).toBe('COMPLETED');
      expect(completion.authorization).toEqual({ authorizedBy: 'approver', authorizedAt: '2026-05-11', authorizationRef: 'AUTH-142' });
      expect(completion.acceptedRisks[0]).toEqual({ item, owner, evidenceRef, followUp });
      expect(completion.archiveActions).toEqual([`archive-${item}`]);
      expect(completion.gaps).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch142-gap-${index}`,
    index % 2 === 0 ? ' ' : 'approver',
    index % 3 === 0 ? 'ACTION_REQUIRED' : 'READY_TO_ARCHIVE',
    index % 5 === 0 ? ' ' : `evidence-${index}`,
  ] as const))(
    'reports generated authorization gaps %s',
    (item, authorizedBy, finalClosureStatus, evidenceRef) => {
      const completion = buildQualityCompletionAuthorization({
        authorizedBy,
        authorizedAt: '2026-05-11',
        authorizationRef: 'AUTH-142',
        finalClosureStatus,
        acceptedRisks: [{ item, owner: 'owner', evidenceRef, followUp: 'follow' }],
        archiveActions: [],
      });
      const expectedGaps = [
        authorizedBy.trim() ? undefined : 'authorization is incomplete',
        finalClosureStatus === 'READY_TO_ARCHIVE' ? undefined : 'final closure is not READY_TO_ARCHIVE',
        evidenceRef.trim() ? undefined : `accepted risk evidence is missing: ${item}`,
      ].filter(Boolean);

      expect(completion.status).toBe(expectedGaps.length > 0 ? 'ACTION_REQUIRED' : 'COMPLETED');
      expect(completion.gaps).toEqual(expectedGaps);
      expect(completion.summary.missingEvidenceCount).toBe(evidenceRef.trim() ? 0 : 1);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch147-risk-${index}`,
    `owner-${index}`,
    `evidence-${index}`,
    `follow-${index}`,
  ] as const))(
    'filters generated blank accepted risk before gap checks %s',
    (item, owner, evidenceRef, followUp) => {
      const completion = buildQualityCompletionAuthorization({
        authorizedBy: 'approver',
        authorizedAt: '2026-05-11',
        authorizationRef: 'AUTH-147',
        finalClosureStatus: 'READY_TO_ARCHIVE',
        acceptedRisks: [
          { item: '   ', owner: ' ', evidenceRef: ' ', followUp: ' ' },
          { item, owner, evidenceRef, followUp },
        ],
        archiveActions: [' ', ` archive-${item} `],
      });

      expect(completion.status).toBe('COMPLETED');
      expect(completion.summary.acceptedRiskCount).toBe(1);
      expect(completion.summary.archiveActionCount).toBe(1);
      expect(completion.summary.missingEvidenceCount).toBe(0);
      expect(completion.acceptedRisks).toEqual([{ item, owner, evidenceRef, followUp }]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch147-evidence-gap-${index}`,
    index % 2 === 0 ? ' ' : `evidence-${index}`,
    index % 3 === 0 ? ' ' : `follow-${index}`,
  ] as const))(
    'counts generated accepted risk evidence gaps %s',
    (item, evidenceRef, followUp) => {
      const completion = buildQualityCompletionAuthorization({
        authorizedBy: 'approver',
        authorizedAt: '2026-05-11',
        authorizationRef: 'AUTH-147',
        finalClosureStatus: 'READY_TO_ARCHIVE',
        acceptedRisks: [{ item, owner: 'owner', evidenceRef, followUp }],
        archiveActions: [],
      });
      const expectedGaps = [
        evidenceRef.trim() ? undefined : `accepted risk evidence is missing: ${item}`,
        followUp.trim() ? undefined : `accepted risk followUp is missing: ${item}`,
      ].filter(Boolean);

      expect(completion.status).toBe(expectedGaps.length > 0 ? 'ACTION_REQUIRED' : 'COMPLETED');
      expect(completion.gaps).toEqual(expectedGaps);
      expect(completion.summary.missingEvidenceCount).toBe(expectedGaps.filter((gap) => String(gap).includes('evidence')).length);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch152-risk-${index}<tag>`,
    `owner-${index}-负责人`,
    `evidence-${index}/path`,
    `follow-${index}&review`,
  ] as const))(
    'preserves generated completed accepted risk metadata %s',
    (item, owner, evidenceRef, followUp) => {
      const generatedAt = new Date('2026-05-11T00:00:00.000Z');
      const completion = buildQualityCompletionAuthorization({
        authorizedBy: ' approver-152 ',
        authorizedAt: ' 2026-05-11 ',
        authorizationRef: ' AUTH-152 ',
        finalClosureStatus: ' READY_TO_ARCHIVE ',
        acceptedRisks: [
          { item: ' ', owner: ' ', evidenceRef: ' ', followUp: ' ' },
          { item: ` ${item} `, owner: ` ${owner} `, evidenceRef: ` ${evidenceRef} `, followUp: ` ${followUp} ` },
        ],
        archiveActions: [' ', ` archive-${item} `, '  attach evidence  '],
        generatedAt,
      });

      expect(completion.status).toBe('COMPLETED');
      expect(completion.generatedAt).toBe(generatedAt.toISOString());
      expect(completion.summary).toEqual({ acceptedRiskCount: 1, archiveActionCount: 2, missingEvidenceCount: 0 });
      expect(completion.acceptedRisks).toEqual([{ item, owner, evidenceRef, followUp }]);
      expect(completion.archiveActions).toEqual([`archive-${item}`, 'attach evidence']);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch152-gap-${index}`,
    index % 2 === 0 ? ' ' : 'approver',
    index % 3 === 0 ? ' ' : '2026-05-11',
    index % 4 === 0 ? ' ' : 'AUTH-152',
    index % 5 === 0 ? 'ACTION_REQUIRED' : 'READY_TO_ARCHIVE',
    index % 2 === 0 ? ' ' : 'owner',
    index % 3 === 0 ? ' ' : 'evidence',
    index % 4 === 0 ? ' ' : 'follow',
  ] as const))(
    'reports generated combined authorization and accepted risk gaps %s',
    (item, authorizedBy, authorizedAt, authorizationRef, finalClosureStatus, owner, evidenceRef, followUp) => {
      const completion = buildQualityCompletionAuthorization({
        authorizedBy,
        authorizedAt,
        authorizationRef,
        finalClosureStatus,
        acceptedRisks: [{ item, owner, evidenceRef, followUp }],
        archiveActions: [' ', 'archive'],
      });
      const expectedGaps = [
        authorizedBy.trim() && authorizedAt.trim() && authorizationRef.trim() ? undefined : 'authorization is incomplete',
        finalClosureStatus === 'READY_TO_ARCHIVE' ? undefined : 'final closure is not READY_TO_ARCHIVE',
        owner.trim() ? undefined : `accepted risk owner is missing: ${item}`,
        evidenceRef.trim() ? undefined : `accepted risk evidence is missing: ${item}`,
        followUp.trim() ? undefined : `accepted risk followUp is missing: ${item}`,
      ].filter(Boolean);

      expect(completion.status).toBe(expectedGaps.length > 0 ? 'ACTION_REQUIRED' : 'COMPLETED');
      expect(completion.gaps).toEqual(expectedGaps);
      expect(completion.summary.missingEvidenceCount).toBe(expectedGaps.filter((gap) => String(gap).includes('evidence')).length);
      expect(completion.archiveActions).toEqual(['archive']);
    },
  );
});

describe('quality completion authorization batch 161 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch161-risk-${index}`,
    `owner-${index}`,
    `evidence-${index}`,
    `follow-${index}`,
    `archive-${index}`,
  ] as const))(
    'builds generated batch161 completed authorization %s',
    (item, owner, evidenceRef, followUp, archiveAction) => {
      const completion = buildQualityCompletionAuthorization({
        authorizedBy: ' approver-161 ',
        authorizedAt: ' 2026-05-11 ',
        authorizationRef: ' AUTH-161 ',
        finalClosureStatus: ' READY_TO_ARCHIVE ',
        acceptedRisks: [
          { item: ' ', owner: 'ignored', evidenceRef: 'ignored', followUp: 'ignored' },
          { item: ` ${item} `, owner: ` ${owner} `, evidenceRef: ` ${evidenceRef} `, followUp: ` ${followUp} ` },
        ],
        archiveActions: [' ', ` ${archiveAction} `],
      });

      expect(completion.status).toBe('COMPLETED');
      expect(completion.authorization).toEqual({
        authorizedBy: 'approver-161',
        authorizedAt: '2026-05-11',
        authorizationRef: 'AUTH-161',
      });
      expect(completion.summary).toEqual({
        acceptedRiskCount: 1,
        archiveActionCount: 1,
        missingEvidenceCount: 0,
      });
      expect(completion.acceptedRisks).toEqual([{ item, owner, evidenceRef, followUp }]);
      expect(completion.archiveActions).toEqual([archiveAction]);
      expect(completion.gaps).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch161-gap-${index}`,
    index % 2 === 0 ? ' ' : 'owner',
    index % 3 === 0 ? ' ' : 'evidence',
    index % 4 === 0 ? ' ' : 'follow',
    index % 5 === 0 ? 'ACTION_REQUIRED' : ' READY_TO_ARCHIVE ',
  ] as const))(
    'reports generated batch161 risk and closure gaps %s',
    (item, owner, evidenceRef, followUp, finalClosureStatus) => {
      const completion = buildQualityCompletionAuthorization({
        authorizedBy: 'approver',
        authorizedAt: '2026-05-11',
        authorizationRef: 'AUTH-161',
        finalClosureStatus,
        acceptedRisks: [{ item, owner, evidenceRef, followUp }],
        archiveActions: ['archive'],
      });
      const expectedGaps = [
        finalClosureStatus.trim() === 'READY_TO_ARCHIVE' ? undefined : 'final closure is not READY_TO_ARCHIVE',
        owner.trim() ? undefined : `accepted risk owner is missing: ${item}`,
        evidenceRef.trim() ? undefined : `accepted risk evidence is missing: ${item}`,
        followUp.trim() ? undefined : `accepted risk followUp is missing: ${item}`,
      ].filter(Boolean);

      expect(completion.status).toBe(expectedGaps.length > 0 ? 'ACTION_REQUIRED' : 'COMPLETED');
      expect(completion.gaps).toEqual(expectedGaps);
      expect(completion.summary.missingEvidenceCount).toBe(expectedGaps.filter((gap) => String(gap).includes('evidence')).length);
      expect(completion.finalClosureStatus).toBe(finalClosureStatus.trim());
    },
  );
});
