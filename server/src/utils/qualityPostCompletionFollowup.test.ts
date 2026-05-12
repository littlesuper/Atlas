import { describe, expect, it } from 'vitest';
import {
  QualityPostCompletionFollowupUpdate,
  buildDefaultQualityPostCompletionFollowup,
  buildQualityPostCompletionFollowup,
  renderQualityPostCompletionFollowupMarkdown,
} from './qualityPostCompletionFollowup';

describe('quality post completion follow-up builder', () => {
  it('turns accepted completion risks into owned post-100 follow-up actions', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
    });

    expect(followup).toEqual({
      mode: 'QUALITY_POST_COMPLETION_FOLLOWUP',
      status: 'ACTION_REQUIRED',
      generatedAt: '2026-05-06T05:00:00.000Z',
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      summary: {
        total: 3,
        open: 3,
        blocked: 0,
      done: 0,
      missingOwner: 0,
      missingDueDate: 0,
      missingEvidence: 0,
      missingAction: 0,
      },
      deadlineSummary: {
        overdue: 0,
        dueSoon: 1,
        onTrack: 2,
        done: 0,
        undated: 0,
        nearestDueDate: '2026-05-10',
      },
      ownerSummary: [
        {
          owner: 'release owner',
          total: 1,
          open: 1,
          blocked: 0,
          done: 0,
          overdue: 0,
          dueSoon: 1,
          undated: 0,
          alerts: 1,
          nearestDueDate: '2026-05-10',
        },
        {
          owner: 'AI 代码守护人',
          total: 1,
          open: 1,
          blocked: 0,
          done: 0,
          overdue: 0,
          dueSoon: 0,
          undated: 0,
          alerts: 0,
          nearestDueDate: '2026-05-15',
        },
        {
          owner: '产品负责人',
          total: 1,
          open: 1,
          blocked: 0,
          done: 0,
          overdue: 0,
          dueSoon: 0,
          undated: 0,
          alerts: 0,
          nearestDueDate: '2026-05-15',
        },
      ],
      followUps: [
        {
          risk: '质量回顾会实会确认',
          action: '归档后补会议纪要',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-15',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
          deadlineHealth: 'ON_TRACK',
          daysUntilDue: 9,
        },
        {
          risk: '分支保护和 PR 审查规则',
          action: '仓库管理员补 GitHub Settings 截图',
          owner: '产品负责人',
          dueDate: '2026-05-15',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
          deadlineHealth: 'ON_TRACK',
          daysUntilDue: 9,
        },
        {
          risk: 'rebase/merge 策略',
          action: '归档后执行 merge 策略确认',
          owner: 'release owner',
          dueDate: '2026-05-10',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
          deadlineHealth: 'DUE_SOON',
          daysUntilDue: 4,
        },
      ],
      deadlineAlerts: [
        'rebase/merge 策略 due in 4 day(s): 2026-05-10',
      ],
      gaps: [],
      nextCommands: [
        'npm run quality:post-completion-followup --workspace=server',
        'npm run quality:progress-guard --workspace=server -- --min-week8-progress 100 --evidence QUALITY_POST_COMPLETION_FOLLOWUP --changelog quality:post-completion-followup',
      ],
    });
  });

  it('blocks when accepted risks do not have owner, due date, or evidence', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: '',
      },
      followUps: [
        {
          risk: '质量回顾会实会确认',
          action: '归档后补会议纪要',
          owner: '',
          dueDate: '',
          evidenceRef: '',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.summary.missingOwner).toBe(1);
    expect(followup.summary.missingDueDate).toBe(1);
    expect(followup.summary.missingEvidence).toBe(1);
    expect(followup.ownerSummary).toEqual([
      {
        owner: '未分派',
        total: 1,
        open: 1,
        blocked: 0,
        done: 0,
        overdue: 0,
        dueSoon: 0,
        undated: 1,
        alerts: 1,
      },
    ]);
    expect(followup.gaps).toEqual([
      'authorizationRef is missing',
      'follow-up owner is missing: 质量回顾会实会确认',
      'follow-up dueDate is missing: 质量回顾会实会确认',
      'follow-up evidenceRef is missing: 质量回顾会实会确认',
    ]);
  });

  it('blocks source done items without evidence without counting them as done', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'completion#approved',
      },
      followUps: [
        {
          risk: '质量回顾会实会确认',
          action: '归档后补会议纪要',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-15',
          evidenceRef: '',
          status: 'DONE',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.summary).toMatchObject({
      total: 1,
      open: 1,
      done: 0,
      missingEvidence: 1,
    });
    expect(followup.deadlineSummary.done).toBe(0);
    expect(followup.followUps[0]).toMatchObject({
      risk: '质量回顾会实会确认',
      status: 'OPEN',
      deadlineHealth: 'ON_TRACK',
    });
    expect(followup.gaps).toContain('follow-up evidenceRef is missing: 质量回顾会实会确认');
  });

  it('does not report authorization evidence reuse when both authorization and evidence are missing', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: '',
      },
      followUps: [
        {
          risk: '质量回顾会实会确认',
          action: '归档后补会议纪要',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-15',
          evidenceRef: '',
          status: 'DONE',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toEqual(expect.arrayContaining([
      'authorizationRef is missing',
      'follow-up evidenceRef is missing: 质量回顾会实会确认',
    ]));
    expect(followup.gaps).not.toContain(
      'follow-up DONE item evidenceRef must differ from authorizationRef: 质量回顾会实会确认'
    );
  });

  it('blocks source done items without required owner, due date, or action without counting them as done', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'completion#approved',
      },
      followUps: [
        {
          risk: '质量回顾会实会确认',
          action: '',
          owner: '',
          dueDate: '',
          evidenceRef: 'review-minutes#2026-05-15',
          status: 'DONE',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.summary).toMatchObject({
      total: 1,
      open: 1,
      done: 0,
      missingOwner: 1,
      missingDueDate: 1,
      missingAction: 1,
    });
    expect(followup.deadlineSummary.done).toBe(0);
    expect(followup.followUps[0]).toMatchObject({
      risk: '质量回顾会实会确认',
      status: 'OPEN',
      deadlineHealth: 'UNDATED',
    });
    expect(followup.gaps).toEqual(expect.arrayContaining([
      'follow-up owner is missing: 质量回顾会实会确认',
      'follow-up dueDate is missing: 质量回顾会实会确认',
      'follow-up action is missing: 质量回顾会实会确认',
    ]));
  });

  it('normalizes invalid generatedAt dates without throwing', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('not-a-date'),
    });

    expect(followup.status).toBe('ACTION_REQUIRED');
    expect(followup.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('blocks non-object builder inputs without throwing', () => {
    const followup = buildQualityPostCompletionFollowup(
      null as unknown as Parameters<typeof buildQualityPostCompletionFollowup>[0]
    );

    expect(followup.status).toBe('BLOCKED');
    expect(followup.source).toEqual({
      mode: '',
      authorizationRef: '',
    });
    expect(followup.summary.total).toBe(0);
    expect(followup.gaps).toEqual([
      'source mode is invalid: ',
      'authorizationRef is missing',
      'follow-up list is empty',
    ]);
  });

  it('blocks empty source follow-up lists', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up list is empty');
  });

  it('blocks non-array source follow-up lists without throwing', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: null as unknown as [],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up list is empty');
  });

  it('blocks non-object source follow-up items without throwing', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        null as unknown as {
          risk: string;
          action: string;
          owner: string;
          dueDate: string;
          evidenceRef: string;
          status: 'OPEN';
        },
        {
          risk: '质量回顾会实会确认',
          action: '归档后补会议纪要',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-15',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.summary.total).toBe(1);
    expect(followup.gaps).toContain('follow-up item is invalid');
  });

  it('blocks source follow-up items with missing risk instead of dropping them silently', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: 123 as unknown as string,
          action: '归档后补会议纪要',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-15',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
          blocker: '缺风险名',
        },
        {
          risk: '分支保护和 PR 审查规则',
          action: '仓库管理员补 GitHub Settings 截图',
          owner: '产品负责人',
          dueDate: '2026-05-15',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.summary.total).toBe(1);
    expect(followup.gaps).toContain('follow-up risk is missing');
    expect(followup.gaps).not.toContain('follow-up OPEN item blocker must be empty: ');
  });

  it('blocks invalid completion source modes at runtime', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'QUALITY_CLOSURE_REQUEST_PACK' as 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '质量回顾会实会确认',
          action: '归档后补会议纪要',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-15',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('source mode is invalid: QUALITY_CLOSURE_REQUEST_PACK');
  });

  it('blocks non-object completion sources without throwing', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: null as unknown as {
        mode: 'ATLAS_QUALITY_COMPLETION';
        authorizationRef: string;
      },
      followUps: [
        {
          risk: '质量回顾会实会确认',
          action: '归档后补会议纪要',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-15',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('source mode is invalid: ');
    expect(followup.gaps).toContain('authorizationRef is missing');
  });

  it('blocks non-string authorization references without throwing', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: null as unknown as string,
      },
      followUps: [
        {
          risk: '质量回顾会实会确认',
          action: '归档后补会议纪要',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-15',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.source.authorizationRef).toBe('');
    expect(followup.gaps).toContain('authorizationRef is missing');
  });

  it('blocks non-string follow-up text fields without throwing', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '质量回顾会实会确认',
          action: null as unknown as string,
          owner: null as unknown as string,
          dueDate: null as unknown as string,
          evidenceRef: null as unknown as string,
          status: 'OPEN',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.followUps[0]).toMatchObject({
      action: '',
      owner: '',
      dueDate: '',
      evidenceRef: '',
      deadlineHealth: 'UNDATED',
    });
    expect(followup.gaps).toEqual([
      'follow-up owner is missing: 质量回顾会实会确认',
      'follow-up dueDate is missing: 质量回顾会实会确认',
      'follow-up evidenceRef is missing: 质量回顾会实会确认',
      'follow-up action is missing: 质量回顾会实会确认',
    ]);
  });

  it('blocks invalid due date formats while keeping the item visible as undated', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: 'rebase/merge 策略',
          action: '归档后执行 merge 策略确认',
          owner: 'release owner',
          dueDate: '2026/05/10',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.summary.missingDueDate).toBe(0);
    expect(followup.deadlineSummary).toMatchObject({
      overdue: 0,
      dueSoon: 0,
      onTrack: 0,
      done: 0,
      undated: 1,
    });
    expect(followup.followUps[0]).toMatchObject({
      deadlineHealth: 'UNDATED',
    });
    expect(followup.gaps).toContain('follow-up dueDate format is invalid: rebase/merge 策略 (2026/05/10)');
  });

  it('blocks impossible due date values while keeping the item visible as undated', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: 'rebase/merge 策略',
          action: '归档后执行 merge 策略确认',
          owner: 'release owner',
          dueDate: '2026-13-40',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.deadlineSummary).toMatchObject({
      overdue: 0,
      dueSoon: 0,
      onTrack: 0,
      done: 0,
      undated: 1,
    });
    expect(followup.followUps[0]).toMatchObject({
      deadlineHealth: 'UNDATED',
    });
    expect(followup.gaps).toContain('follow-up dueDate value is invalid: rebase/merge 策略 (2026-13-40)');
  });

  it('blocks done items with invalid due dates without counting them as done', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'completion#approved',
      },
      followUps: [
        {
          risk: 'rebase/merge 策略',
          action: '归档后执行 merge 策略确认',
          owner: 'release owner',
          dueDate: '2026-13-40',
          evidenceRef: 'merge-plan#2026-05-10',
          status: 'DONE',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.summary).toMatchObject({
      open: 1,
      done: 0,
    });
    expect(followup.deadlineSummary).toMatchObject({
      overdue: 0,
      dueSoon: 0,
      onTrack: 0,
      done: 0,
      undated: 1,
    });
    expect(followup.followUps[0]).toMatchObject({
      status: 'OPEN',
      deadlineHealth: 'UNDATED',
    });
    expect(followup.gaps).toContain('follow-up dueDate value is invalid: rebase/merge 策略 (2026-13-40)');
  });

  it('excludes invalid due dates from owner nearest due dates', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '分支保护和 PR 审查规则',
          action: '仓库管理员补 GitHub Settings 截图',
          owner: '产品负责人',
          dueDate: '2026-13-40',
          evidenceRef: 'github-settings#pending',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.ownerSummary[0]?.nearestDueDate).toBeUndefined();
    expect(renderQualityPostCompletionFollowupMarkdown(followup)).toContain(
      '| 产品负责人 | 1 | 1 | 0 | 0 | 0 | 0 | 1 | 1 | - |'
    );
  });

  it('keeps overdue follow-ups visible without hiding schema gaps', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-16T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '质量回顾会实会确认',
          action: '归档后补会议纪要',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-15',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.status).toBe('ACTION_REQUIRED');
    expect(followup.deadlineSummary).toMatchObject({
      overdue: 1,
      dueSoon: 0,
      onTrack: 0,
      done: 0,
      undated: 0,
      nearestDueDate: '2026-05-15',
    });
    expect(followup.followUps[0]).toMatchObject({
      deadlineHealth: 'OVERDUE',
      daysUntilDue: -1,
    });
    expect(followup.deadlineAlerts).toEqual([
      '质量回顾会实会确认 overdue by 1 day(s): 2026-05-15',
    ]);
    expect(followup.gaps).toEqual([]);
  });

  it('applies completion updates without mutating unrelated accepted risks', () => {
    const updates: QualityPostCompletionFollowupUpdate[] = [
      {
        risk: 'rebase/merge 策略',
        status: 'DONE',
        evidenceRef: 'merge-plan#2026-05-10',
      },
    ];

    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates,
    });

    expect(followup.status).toBe('ACTION_REQUIRED');
    expect(followup.summary).toMatchObject({
      open: 2,
      blocked: 0,
      done: 1,
    });
    expect(followup.deadlineSummary).toMatchObject({
      overdue: 0,
      dueSoon: 0,
      onTrack: 2,
      done: 1,
      undated: 0,
      nearestDueDate: '2026-05-15',
    });
    expect(followup.ownerSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'release owner',
          total: 1,
          open: 0,
          done: 1,
          dueSoon: 0,
        }),
      ]),
    );
    expect(followup.followUps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          risk: 'rebase/merge 策略',
          status: 'DONE',
          evidenceRef: 'merge-plan#2026-05-10',
          deadlineHealth: 'DONE',
        }),
      ]),
    );
    expect(followup.deadlineAlerts).toEqual([]);
  });

  it('reports unmatched status updates as gaps', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        {
          risk: '不存在的补证项',
          status: 'DONE',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up update target is missing: 不存在的补证项');
    expect(followup.gaps).not.toContain('follow-up DONE update evidenceRef is missing: 不存在的补证项');
  });

  it('ignores non-array update lists without throwing', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: { risk: 'rebase/merge 策略' } as unknown as [],
    });

    expect(followup.status).toBe('ACTION_REQUIRED');
    expect(followup.summary).toMatchObject({
      open: 3,
      blocked: 0,
      done: 0,
    });
    expect(followup.gaps).toEqual([]);
  });

  it('blocks non-object update items without throwing', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        null as unknown as QualityPostCompletionFollowupUpdate,
        {
          risk: 'rebase/merge 策略',
          status: 'DONE',
          evidenceRef: 'merge-plan#2026-05-10',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.summary.done).toBe(1);
    expect(followup.gaps).toContain('follow-up update item is invalid');
  });

  it('blocks non-string update text fields without throwing', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        {
          risk: 'rebase/merge 策略',
          status: 'DONE',
          evidenceRef: 123 as unknown as string,
          blocker: 456 as unknown as string,
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up DONE update evidenceRef is missing: rebase/merge 策略');
  });

  it('blocks update items with missing risk instead of dropping them silently', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        {
          risk: 123 as unknown as string,
          status: 'DONE',
          evidenceRef: 'manual#done',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up update risk is missing');
  });

  it('does not report field-level update safety gaps when update risk is missing', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        {
          risk: '',
          status: 'DONE',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up update risk is missing');
    expect(followup.gaps).not.toContain('follow-up DONE update evidenceRef is missing: ');
  });

  it('blocks unsafe updates that mark items done without new evidence or blocked without a reason', () => {
    const doneWithoutEvidence = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        {
          risk: 'rebase/merge 策略',
          status: 'DONE',
        },
      ],
    });
    const blockedWithoutReason = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        {
          risk: '分支保护和 PR 审查规则',
          status: 'BLOCKED',
          evidenceRef: 'github-settings#pending',
        },
      ],
    });

    expect(doneWithoutEvidence.status).toBe('BLOCKED');
    expect(doneWithoutEvidence.gaps).toContain('follow-up DONE update evidenceRef is missing: rebase/merge 策略');
    expect(doneWithoutEvidence.followUps).toContainEqual(
      expect.objectContaining({
        risk: 'rebase/merge 策略',
        status: 'OPEN',
        evidenceRef: 'chat#2026-05-06-direct-to-100',
      }),
    );
    expect(blockedWithoutReason.status).toBe('BLOCKED');
    expect(blockedWithoutReason.gaps).toContain('follow-up BLOCKED update blocker is missing: 分支保护和 PR 审查规则');
    expect(blockedWithoutReason.followUps).toContainEqual(
      expect.objectContaining({
        risk: '分支保护和 PR 审查规则',
        status: 'OPEN',
        evidenceRef: 'chat#2026-05-06-direct-to-100',
      }),
    );
  });

  it('blocks open updates that include blocker text without mutating details', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        {
          risk: '分支保护和 PR 审查规则',
          status: 'OPEN',
          blocker: '仍缺 GitHub Settings 截图',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up OPEN update blocker must be empty: 分支保护和 PR 审查规则');
    const updatedFollowup = followup.followUps.find((item) => item.risk === '分支保护和 PR 审查规则');

    expect(updatedFollowup).toMatchObject({
      status: 'OPEN',
      evidenceRef: 'chat#2026-05-06-direct-to-100',
    });
    expect(updatedFollowup).not.toHaveProperty('blocker');
  });

  it('blocks open updates that include evidence without mutating details', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        {
          risk: '分支保护和 PR 审查规则',
          status: 'OPEN',
          evidenceRef: 'github-settings#pending',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up OPEN update evidenceRef must be empty: 分支保护和 PR 审查规则');
    const updatedFollowup = followup.followUps.find((item) => item.risk === '分支保护和 PR 审查规则');

    expect(updatedFollowup).toMatchObject({
      status: 'OPEN',
      evidenceRef: 'chat#2026-05-06-direct-to-100',
    });
  });

  it('blocks done updates that include blocker text without mutating details', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        {
          risk: 'rebase/merge 策略',
          status: 'DONE',
          evidenceRef: 'merge-plan#2026-05-10',
          blocker: '仍有合并策略争议',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up DONE update blocker must be empty: rebase/merge 策略');
    const updatedFollowup = followup.followUps.find((item) => item.risk === 'rebase/merge 策略');

    expect(updatedFollowup).toMatchObject({
      status: 'OPEN',
      evidenceRef: 'chat#2026-05-06-direct-to-100',
    });
    expect(updatedFollowup).not.toHaveProperty('blocker');
  });

  it('blocks blocked updates that include evidence without mutating details', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        {
          risk: '分支保护和 PR 审查规则',
          status: 'BLOCKED',
          evidenceRef: 'github-settings#pending',
          blocker: '仍缺仓库管理员截图',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up BLOCKED update evidenceRef must be empty: 分支保护和 PR 审查规则');
    const updatedFollowup = followup.followUps.find((item) => item.risk === '分支保护和 PR 审查规则');

    expect(updatedFollowup).toMatchObject({
      status: 'OPEN',
      evidenceRef: 'chat#2026-05-06-direct-to-100',
    });
    expect(updatedFollowup).not.toHaveProperty('blocker');
  });

  it('blocks done updates that reuse the completion authorization evidence', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        {
          risk: 'rebase/merge 策略',
          status: 'DONE',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up DONE update evidenceRef must differ from authorizationRef: rebase/merge 策略');
  });

  it('blocks done updates that reuse the original accepted-risk evidence', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'completion#approved',
      },
      followUps: [
        {
          risk: '质量回顾会实会确认',
          action: '归档后补会议纪要',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-15',
          evidenceRef: 'accepted-risk#review-meeting',
          status: 'OPEN',
        },
      ],
      updates: [
        {
          risk: '质量回顾会实会确认',
          status: 'DONE',
          evidenceRef: 'accepted-risk#review-meeting',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up DONE update evidenceRef must differ from original evidenceRef: 质量回顾会实会确认');
  });

  it('blocks duplicate updates for the same accepted risk', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        {
          risk: 'rebase/merge 策略',
          status: 'DONE',
          evidenceRef: 'merge-plan#2026-05-10',
        },
        {
          risk: 'rebase/merge 策略',
          status: 'OPEN',
          evidenceRef: 'reopen#2026-05-11',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up update target is duplicated: rebase/merge 策略');
    expect(followup.gaps).not.toContain('follow-up OPEN update evidenceRef must be empty: rebase/merge 策略');
    expect(followup.followUps).toContainEqual(
      expect.objectContaining({
        risk: 'rebase/merge 策略',
        status: 'OPEN',
        evidenceRef: 'chat#2026-05-06-direct-to-100',
        deadlineHealth: 'DUE_SOON',
      }),
    );
  });

  it('blocks invalid update statuses at runtime without mutating the follow-up item', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        {
          risk: 'rebase/merge 策略',
          status: 'CLOSED',
          evidenceRef: 'merge-plan#2026-05-10',
        } as unknown as QualityPostCompletionFollowupUpdate,
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up update status is invalid: rebase/merge 策略 (CLOSED)');
    expect(followup.followUps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          risk: 'rebase/merge 策略',
          status: 'OPEN',
        }),
      ]),
    );
  });

  it('blocks invalid source follow-up statuses at runtime', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: 'rebase/merge 策略',
          action: '归档后执行 merge 策略确认',
          owner: 'release owner',
          dueDate: '2026-05-10',
          evidenceRef: 'merge-plan#2026-05-10',
          status: 'CLOSED',
        } as unknown as Parameters<typeof buildQualityPostCompletionFollowup>[0]['followUps'][number],
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.summary).toMatchObject({
      total: 1,
      open: 1,
      blocked: 0,
      done: 0,
    });
    expect(followup.followUps[0]?.status).toBe('OPEN');
    expect(followup.gaps).toContain('follow-up item status is invalid: rebase/merge 策略 (CLOSED)');
  });

  it('blocks duplicate accepted risk definitions in the source follow-up list', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: 'rebase/merge 策略',
          action: '归档后执行 merge 策略确认',
          owner: 'release owner',
          dueDate: '2026-05-10',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
        },
        {
          risk: 'rebase/merge 策略',
          action: '重复定义不应进入可执行补证',
          owner: 'release owner',
          dueDate: '2026-05-11',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
          blocker: '重复定义携带的阻塞原因不应进入 gaps',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.summary.total).toBe(1);
    expect(followup.followUps).toHaveLength(1);
    expect(followup.followUps[0]).toMatchObject({
      risk: 'rebase/merge 策略',
      action: '归档后执行 merge 策略确认',
      dueDate: '2026-05-10',
    });
    expect(followup.gaps).toContain('follow-up risk is duplicated: rebase/merge 策略');
    expect(followup.gaps).not.toContain('follow-up OPEN item blocker must be empty: rebase/merge 策略');
  });

  it('blocks source follow-up items marked blocked without a blocker reason', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '分支保护和 PR 审查规则',
          action: '仓库管理员补 GitHub Settings 截图',
          owner: '产品负责人',
          dueDate: '2026-05-15',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'BLOCKED',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up BLOCKED item blocker is missing: 分支保护和 PR 审查规则');
  });

  it('blocks source follow-up items marked open with blocker text', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '分支保护和 PR 审查规则',
          action: '仓库管理员补 GitHub Settings 截图',
          owner: '产品负责人',
          dueDate: '2026-05-15',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
          blocker: '仍缺 GitHub Settings 截图',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.gaps).toContain('follow-up OPEN item blocker must be empty: 分支保护和 PR 审查规则');
    expect(followup.followUps[0]).toMatchObject({
      risk: '分支保护和 PR 审查规则',
      status: 'OPEN',
    });
    expect(followup.followUps[0]).not.toHaveProperty('blocker');
  });

  it('blocks source follow-up items marked done with completion authorization evidence', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: 'rebase/merge 策略',
          action: '归档后执行 merge 策略确认',
          owner: 'release owner',
          dueDate: '2026-05-10',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'DONE',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.summary).toMatchObject({
      total: 1,
      open: 1,
      done: 0,
    });
    expect(followup.deadlineSummary.done).toBe(0);
    expect(followup.followUps[0]).toMatchObject({
      risk: 'rebase/merge 策略',
      status: 'OPEN',
      evidenceRef: 'chat#2026-05-06-direct-to-100',
    });
    expect(followup.gaps).toContain('follow-up DONE item evidenceRef must differ from authorizationRef: rebase/merge 策略');
  });

  it('blocks source follow-up items marked done with blocker text without counting them as done', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'completion#approved',
      },
      followUps: [
        {
          risk: 'rebase/merge 策略',
          action: '归档后执行 merge 策略确认',
          owner: 'release owner',
          dueDate: '2026-05-10',
          evidenceRef: 'merge-plan#2026-05-10',
          status: 'DONE',
          blocker: '仍有合并策略争议',
        },
      ],
    });

    expect(followup.status).toBe('BLOCKED');
    expect(followup.summary).toMatchObject({
      open: 1,
      done: 0,
    });
    expect(followup.deadlineSummary.done).toBe(0);
    expect(followup.gaps).toContain('follow-up DONE item blocker must be empty: rebase/merge 策略');
    expect(followup.followUps[0]).toMatchObject({
      risk: 'rebase/merge 策略',
      status: 'OPEN',
      evidenceRef: 'merge-plan#2026-05-10',
    });
    expect(followup.followUps[0]).not.toHaveProperty('blocker');
  });

  it('renders a markdown summary for progress board and meeting notes', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
    });

    expect(renderQualityPostCompletionFollowupMarkdown(followup)).toBe([
      '# 100% 后补证跟踪',
      '',
      '- status: ACTION_REQUIRED',
      '- generatedAt: 2026-05-06T05:00:00.000Z',
      '- total/open/blocked/done: 3/3/0/0',
      '- missing owner/dueDate/evidence/action: 0/0/0/0',
      '- deadline overdue/dueSoon/onTrack/done/undated: 0/1/2/0/0',
      '- deadlineAlerts: 1',
      '- nearestDueDate: 2026-05-10',
      '',
      '## Owner Summary',
      '',
      '| Owner | Total | Open | Blocked | Done | Overdue | DueSoon | Undated | Alerts | Nearest Due |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
      '| release owner | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 1 | 2026-05-10 |',
      '| AI 代码守护人 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 2026-05-15 |',
      '| 产品负责人 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 2026-05-15 |',
      '',
      '## Follow-Ups',
      '',
      '| Risk | Action | Owner | Status | Deadline | Health | Evidence | Blocker |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      '| 质量回顾会实会确认 | 归档后补会议纪要 | AI 代码守护人 | OPEN | 2026-05-15 | ON_TRACK | chat#2026-05-06-direct-to-100 | - |',
      '| 分支保护和 PR 审查规则 | 仓库管理员补 GitHub Settings 截图 | 产品负责人 | OPEN | 2026-05-15 | ON_TRACK | chat#2026-05-06-direct-to-100 | - |',
      '| rebase/merge 策略 | 归档后执行 merge 策略确认 | release owner | OPEN | 2026-05-10 | DUE_SOON | chat#2026-05-06-direct-to-100 | - |',
      '',
      '## Deadline Alerts',
      '',
      '- rebase/merge 策略 due in 4 day(s): 2026-05-10',
    ].join('\n'));
  });

  it('renders missing field counts in the markdown summary', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '质量回顾会实会确认',
          action: '归档后补会议纪要',
          owner: '',
          dueDate: '',
          evidenceRef: '',
          status: 'OPEN',
        },
      ],
    });

    expect(renderQualityPostCompletionFollowupMarkdown(followup)).toContain(
      '- missing owner/dueDate/evidence/action: 1/1/1/0'
    );
    expect(renderQualityPostCompletionFollowupMarkdown(followup)).toContain(
      '| 质量回顾会实会确认 | 归档后补会议纪要 | 未分派 | OPEN | 未填写 | UNDATED | 未填写 | - |'
    );
    expect(followup.deadlineAlerts).toEqual([
      '质量回顾会实会确认 missing due date',
    ]);
  });

  it('renders missing action cells explicitly in the markdown follow-up table', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '质量回顾会实会确认',
          action: '',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-15',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
        },
      ],
    });

    expect(renderQualityPostCompletionFollowupMarkdown(followup)).toContain(
      '| 质量回顾会实会确认 | 未填写 | AI 代码守护人 | OPEN | 2026-05-15 | ON_TRACK | chat#2026-05-06-direct-to-100 | - |'
    );
  });

  it('renders undated count in the markdown deadline summary', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '分支保护和 PR 审查规则',
          action: '仓库管理员补 GitHub Settings 截图',
          owner: '产品负责人',
          dueDate: '2026-13-40',
          evidenceRef: 'github-settings#pending',
          status: 'OPEN',
        },
      ],
    });

    expect(renderQualityPostCompletionFollowupMarkdown(followup)).toContain(
      '- deadline overdue/dueSoon/onTrack/done/undated: 0/0/0/0/1'
    );
    expect(followup.deadlineAlerts).toEqual([
      '分支保护和 PR 审查规则 invalid due date: 2026-13-40',
    ]);
  });

  it('orders deadline alerts by severity before input order', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-16T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '临近到期补证',
          action: '补一项临近到期证据',
          owner: 'release owner',
          dueDate: '2026-05-20',
          evidenceRef: 'due-soon#pending',
          status: 'OPEN',
        },
        {
          risk: '无日期补证',
          action: '补截止日期',
          owner: '产品负责人',
          dueDate: '',
          evidenceRef: 'undated#pending',
          status: 'OPEN',
        },
        {
          risk: '逾期补证',
          action: '补逾期证据',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-15',
          evidenceRef: 'overdue#pending',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.deadlineAlerts).toEqual([
      '逾期补证 overdue by 1 day(s): 2026-05-15',
      '无日期补证 missing due date',
      '临近到期补证 due in 4 day(s): 2026-05-20',
    ]);
  });

  it('orders deadline alerts by urgency within the same severity', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-16T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '轻微逾期补证',
          action: '补轻微逾期证据',
          owner: 'AI 代码守护人',
          dueDate: '2026-05-15',
          evidenceRef: 'minor-overdue#pending',
          status: 'OPEN',
        },
        {
          risk: '严重逾期补证',
          action: '补严重逾期证据',
          owner: '产品负责人',
          dueDate: '2026-05-10',
          evidenceRef: 'major-overdue#pending',
          status: 'OPEN',
        },
        {
          risk: '较晚临期补证',
          action: '补较晚临期证据',
          owner: 'release owner',
          dueDate: '2026-05-20',
          evidenceRef: 'later-due-soon#pending',
          status: 'OPEN',
        },
        {
          risk: '更近临期补证',
          action: '补更近临期证据',
          owner: '项目负责人',
          dueDate: '2026-05-17',
          evidenceRef: 'earlier-due-soon#pending',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.deadlineAlerts).toEqual([
      '严重逾期补证 overdue by 6 day(s): 2026-05-10',
      '轻微逾期补证 overdue by 1 day(s): 2026-05-15',
      '更近临期补证 due in 1 day(s): 2026-05-17',
      '较晚临期补证 due in 4 day(s): 2026-05-20',
    ]);
  });

  it('orders owner summary by owner deadline risk before input order', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-16T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '正常补证',
          action: '补正常证据',
          owner: '普通负责人',
          dueDate: '2026-05-30',
          evidenceRef: 'normal#pending',
          status: 'OPEN',
        },
        {
          risk: '无日期补证',
          action: '补截止日期',
          owner: '无日期负责人',
          dueDate: '',
          evidenceRef: 'undated#pending',
          status: 'OPEN',
        },
        {
          risk: '逾期补证',
          action: '补逾期证据',
          owner: '逾期负责人',
          dueDate: '2026-05-15',
          evidenceRef: 'overdue#pending',
          status: 'OPEN',
        },
        {
          risk: '临近到期补证',
          action: '补临期证据',
          owner: '临期负责人',
          dueDate: '2026-05-20',
          evidenceRef: 'due-soon#pending',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.ownerSummary.map((owner) => owner.owner)).toEqual([
      '逾期负责人',
      '无日期负责人',
      '临期负责人',
      '普通负责人',
    ]);
  });

  it('orders owner summary by alerts count within the same deadline risk level', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-16T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '单项逾期补证',
          action: '补逾期证据',
          owner: '单项逾期负责人',
          dueDate: '2026-05-15',
          evidenceRef: 'single-overdue#pending',
          status: 'OPEN',
        },
        {
          risk: '多项逾期补证一',
          action: '补第一项逾期证据',
          owner: '多项逾期负责人',
          dueDate: '2026-05-14',
          evidenceRef: 'multi-overdue-1#pending',
          status: 'OPEN',
        },
        {
          risk: '多项逾期补证二',
          action: '补第二项逾期证据',
          owner: '多项逾期负责人',
          dueDate: '2026-05-13',
          evidenceRef: 'multi-overdue-2#pending',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.ownerSummary.map((owner) => `${owner.owner}:${owner.alerts}`)).toEqual([
      '多项逾期负责人:2',
      '单项逾期负责人:1',
    ]);
  });

  it('orders owner summary by nearest active due date when deadline risk and alerts tie', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-16T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '较远普通补证',
          action: '补较远证据',
          owner: '较远负责人',
          dueDate: '2026-05-30',
          evidenceRef: 'later-normal#pending',
          status: 'OPEN',
        },
        {
          risk: '较近普通补证',
          action: '补较近证据',
          owner: '较近负责人',
          dueDate: '2026-05-22',
          evidenceRef: 'earlier-normal#pending',
          status: 'OPEN',
        },
      ],
    });

    expect(followup.ownerSummary.map((owner) => `${owner.owner}:${owner.nearestDueDate}`)).toEqual([
      '较近负责人:2026-05-22',
      '较远负责人:2026-05-30',
    ]);
  });

  it('renders gaps in markdown when follow-up output is blocked', () => {
    const followup = buildDefaultQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      updates: [
        {
          risk: 'rebase/merge 策略',
          status: 'DONE',
        },
      ],
    });

    const markdown = renderQualityPostCompletionFollowupMarkdown(followup);

    expect(followup.status).toBe('BLOCKED');
    expect(markdown).toContain('## Gaps');
    expect(markdown).toContain('- follow-up DONE update evidenceRef is missing: rebase/merge 策略');
  });

  it('renders blocker details directly in the markdown follow-up table', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '分支保护和 PR 审查规则',
          action: '仓库管理员补 GitHub Settings 截图',
          owner: '产品负责人',
          dueDate: '2026-05-15',
          evidenceRef: 'github-settings#pending',
          status: 'BLOCKED',
          blocker: '等待仓库管理员截图',
        },
      ],
    });

    const markdown = renderQualityPostCompletionFollowupMarkdown(followup);

    expect(markdown).toContain('| Risk | Action | Owner | Status | Deadline | Health | Evidence | Blocker |');
    expect(markdown).toContain('| 分支保护和 PR 审查规则 | 仓库管理员补 GitHub Settings 截图 | 产品负责人 | BLOCKED | 2026-05-15 | ON_TRACK | github-settings#pending | 等待仓库管理员截图 |');
  });

  it('renders missing blocker cells explicitly for blocked follow-ups', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '分支保护和 PR 审查规则',
          action: '仓库管理员补 GitHub Settings 截图',
          owner: '产品负责人',
          dueDate: '2026-05-15',
          evidenceRef: 'github-settings#pending',
          status: 'BLOCKED',
        },
      ],
    });

    expect(renderQualityPostCompletionFollowupMarkdown(followup)).toContain(
      '| 分支保护和 PR 审查规则 | 仓库管理员补 GitHub Settings 截图 | 产品负责人 | BLOCKED | 2026-05-15 | ON_TRACK | github-settings#pending | 未填写 |'
    );
  });

  it('escapes pipe characters in markdown table cells', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '分支保护和 PR 审查规则',
          action: '仓库管理员补 GitHub Settings 截图',
          owner: '产品负责人',
          dueDate: '2026-05-15',
          evidenceRef: 'github|settings#pending',
          status: 'BLOCKED',
          blocker: '等待截图|管理员确认',
        },
      ],
    });

    const markdown = renderQualityPostCompletionFollowupMarkdown(followup);

    expect(markdown).toContain('| 分支保护和 PR 审查规则 | 仓库管理员补 GitHub Settings 截图 | 产品负责人 | BLOCKED | 2026-05-15 | ON_TRACK | github\\|settings#pending | 等待截图\\|管理员确认 |');
  });

  it('normalizes line breaks in markdown table cells', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '分支保护和 PR 审查规则',
          action: '仓库管理员补 GitHub Settings 截图',
          owner: '产品负责人',
          dueDate: '2026-05-15',
          evidenceRef: 'github-settings#pending\nscreenshot#todo',
          status: 'BLOCKED',
          blocker: '等待截图\r\n管理员确认',
        },
      ],
    });

    const markdown = renderQualityPostCompletionFollowupMarkdown(followup);

    expect(markdown).toContain('| 分支保护和 PR 审查规则 | 仓库管理员补 GitHub Settings 截图 | 产品负责人 | BLOCKED | 2026-05-15 | ON_TRACK | github-settings#pending<br>screenshot#todo | 等待截图<br>管理员确认 |');
  });

  it('normalizes line breaks in markdown gap entries', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: '分支保护和 PR 审查规则',
          action: '仓库管理员补 GitHub Settings 截图',
          owner: '产品负责人',
          dueDate: '2026-05-15',
          evidenceRef: 'github-settings#pending',
          status: 'BLOCKED',
          blocker: '等待截图\n管理员确认',
        },
      ],
    });

    const markdown = renderQualityPostCompletionFollowupMarkdown(followup);

    expect(markdown).toContain('- 分支保护和 PR 审查规则: 等待截图<br>管理员确认');
  });

  it('normalizes line breaks in markdown deadline alerts', () => {
    const followup = buildQualityPostCompletionFollowup({
      generatedAt: new Date('2026-05-06T05:00:00.000Z'),
      source: {
        mode: 'ATLAS_QUALITY_COMPLETION',
        authorizationRef: 'chat#2026-05-06-direct-to-100',
      },
      followUps: [
        {
          risk: 'rebase/merge\n策略',
          action: '归档后执行 merge 策略确认',
          owner: 'release owner',
          dueDate: '2026-05-10',
          evidenceRef: 'chat#2026-05-06-direct-to-100',
          status: 'OPEN',
        },
      ],
    });

    const markdown = renderQualityPostCompletionFollowupMarkdown(followup);

    expect(markdown).toContain('- rebase/merge<br>策略 due in 4 day(s): 2026-05-10');
  });

  it('renderQualityPostCompletionFollowupMarkdown handles empty actions', () => {
    const followup = buildQualityPostCompletionFollowup({ projectId: 'p1', projectName: 'Test', completionDate: '2026-05-06', actions: [] });
    const markdown = renderQualityPostCompletionFollowupMarkdown(followup);
    expect(markdown).toBeDefined();
    expect(markdown.length).toBeGreaterThan(0);
  });

  it('buildQualityPostCompletionFollowup handles single action', () => {
    const followup = buildQualityPostCompletionFollowup({ source: { mode: 'ATLAS_QUALITY_COMPLETION', authorizationRef: 'REF-001' }, followUps: [{ risk: 'risk1', action: 'task1', owner: 'admin', dueDate: '2026-06-01', evidenceRef: '', status: 'OPEN' }] });
    expect(followup.followUps).toHaveLength(1);
  });

  it('buildQualityPostCompletionFollowup handles empty followUps', () => {
    const followup = buildQualityPostCompletionFollowup({ source: { mode: 'ATLAS_QUALITY_COMPLETION', authorizationRef: '' }, followUps: [] });
    expect(followup.followUps).toHaveLength(0);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch143-risk-${index}`,
    `action-${index}`,
    `owner-${index}`,
    `evidence-${index}`,
  ] as const))(
    'marks generated completed follow-up done %s',
    (risk, action, owner, evidenceRef) => {
      const followup = buildQualityPostCompletionFollowup({
        generatedAt: new Date('2026-05-11T00:00:00.000Z'),
        source: { mode: 'ATLAS_QUALITY_COMPLETION', authorizationRef: 'AUTH-143' },
        followUps: [{
          risk: ` ${risk} `,
          action: ` ${action} `,
          owner: ` ${owner} `,
          dueDate: ' 2026-05-20 ',
          evidenceRef: ` ${evidenceRef} `,
          status: 'DONE',
        }],
      });

      expect(followup.status).toBe('DONE');
      expect(followup.summary.done).toBe(1);
      expect(followup.deadlineSummary.done).toBe(1);
      expect(followup.followUps[0]).toMatchObject({ risk, action, owner, evidenceRef, status: 'DONE' });
      expect(followup.gaps).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch143-blocked-${index}`,
    `owner-${index}`,
    `blocker-${index}`,
  ] as const))(
    'reports generated blocked follow-up blocker %s',
    (risk, owner, blocker) => {
      const followup = buildQualityPostCompletionFollowup({
        generatedAt: new Date('2026-05-11T00:00:00.000Z'),
        source: { mode: 'ATLAS_QUALITY_COMPLETION', authorizationRef: 'AUTH-143' },
        followUps: [{
          risk,
          action: 'action',
          owner,
          dueDate: '2026-05-25',
          evidenceRef: 'evidence',
          status: 'BLOCKED',
          blocker: ` ${blocker} `,
        }],
      });

      expect(followup.status).toBe('BLOCKED');
      expect(followup.summary.blocked).toBe(1);
      expect(followup.followUps[0].blocker).toBe(blocker);
      expect(followup.gaps).toContain(`${risk}: ${blocker}`);
    },
  );
});
