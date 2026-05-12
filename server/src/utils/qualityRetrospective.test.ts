import { describe, expect, it } from 'vitest';
import { buildQualityRetrospectiveReport } from './qualityRetrospective';

describe('quality retrospective report builder', () => {
  it('summarizes weekly outcomes and requires action when gaps remain', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'Week 1-7',
      generatedAt: new Date('2026-05-05T21:00:00.000Z'),
      weeks: [
        { week: 'Week 1', focus: '紧急止血', progress: 45, wins: ['Sentry 最低错误追踪'], gaps: ['分支保护未配置'] },
        { week: 'Week 2', focus: '基础设施', progress: 100, wins: ['CI 质量门禁', 'high audit 清零'], gaps: [] },
        { week: 'Week 3', focus: '开发流程', progress: 25, wins: ['PR 模板'], gaps: ['流程培训未执行'] },
        { week: 'Week 4', focus: '单元测试与代码审查', progress: 100, wins: ['ESLint warning 清零'], gaps: [] },
        { week: 'Week 5', focus: '集成测试与 E2E', progress: 100, wins: ['P0/P1/P2 分层', 'a11y 覆盖'], gaps: [] },
        { week: 'Week 6', focus: '可观测性', progress: 90, wins: ['metrics', 'alerts:check'], gaps: ['APM 未选型'] },
        { week: 'Week 7', focus: '发布与应急', progress: 100, wins: ['灰度/回滚/应急工具包'], gaps: [] },
      ],
      risks: ['团队侧流程未确认', 'main 落后远端 61 个提交'],
      nextActions: ['安排流程培训', '规划 rebase/merge 策略'],
    });

    expect(report).toEqual({
      mode: 'QUALITY_RETROSPECTIVE',
      status: 'ACTION_REQUIRED',
      period: 'Week 1-7',
      generatedAt: '2026-05-05T21:00:00.000Z',
      summary: {
        weekCount: 7,
        averageProgress: 80,
        completedWeeks: ['Week 2', 'Week 4', 'Week 5', 'Week 7'],
        partialWeeks: ['Week 1', 'Week 3', 'Week 6'],
      },
      weeks: [
        { week: 'Week 1', focus: '紧急止血', progress: 45, wins: ['Sentry 最低错误追踪'], gaps: ['分支保护未配置'] },
        { week: 'Week 2', focus: '基础设施', progress: 100, wins: ['CI 质量门禁', 'high audit 清零'], gaps: [] },
        { week: 'Week 3', focus: '开发流程', progress: 25, wins: ['PR 模板'], gaps: ['流程培训未执行'] },
        { week: 'Week 4', focus: '单元测试与代码审查', progress: 100, wins: ['ESLint warning 清零'], gaps: [] },
        { week: 'Week 5', focus: '集成测试与 E2E', progress: 100, wins: ['P0/P1/P2 分层', 'a11y 覆盖'], gaps: [] },
        { week: 'Week 6', focus: '可观测性', progress: 90, wins: ['metrics', 'alerts:check'], gaps: ['APM 未选型'] },
        { week: 'Week 7', focus: '发布与应急', progress: 100, wins: ['灰度/回滚/应急工具包'], gaps: [] },
      ],
      risks: ['团队侧流程未确认', 'main 落后远端 61 个提交'],
      nextActions: [
        '安排流程培训',
        '规划 rebase/merge 策略',
        'Carry incomplete weeks into the Week 8 stabilization backlog.',
      ],
    });
  });

  it('passes when every week is complete and no risks remain', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'Week 1-7',
      generatedAt: new Date('2026-05-05T21:00:00.000Z'),
      weeks: [
        { week: 'Week 1', focus: '紧急止血', progress: 100, wins: ['完成'], gaps: [] },
      ],
      risks: [],
      nextActions: [],
    });

    expect(report.status).toBe('PASSED');
    expect(report.nextActions).toEqual(['Archive the retrospective and use it as baseline for the next quarter.']);
  });

  it('calculates average progress correctly', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [
        { week: 'W1', focus: 'a', progress: 50, wins: [], gaps: [] },
        { week: 'W2', focus: 'b', progress: 100, wins: [], gaps: [] },
      ],
      risks: [],
      nextActions: [],
    });

    expect(report.summary.averageProgress).toBe(75);
    expect(report.summary.weekCount).toBe(2);
  });

  it('is action-required when risks exist even with all weeks complete', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [{ week: 'W1', focus: 'a', progress: 100, wins: [], gaps: [] }],
      risks: ['risk-1'],
      nextActions: [],
    });

    expect(report.status).toBe('ACTION_REQUIRED');
  });

  it('clamps progress above 100 to 100', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [{ week: 'W1', focus: 'a', progress: 150, wins: [], gaps: [] }],
      risks: [],
      nextActions: [],
    });

    expect(report.weeks[0].progress).toBe(100);
  });

  it('clamps negative progress to 0', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [{ week: 'W1', focus: 'a', progress: -20, wins: [], gaps: [] }],
      risks: [],
      nextActions: [],
    });

    expect(report.weeks[0].progress).toBe(0);
  });

  it('clamps NaN progress to 0', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [{ week: 'W1', focus: 'a', progress: NaN, wins: [], gaps: [] }],
      risks: [],
      nextActions: [],
    });

    expect(report.weeks[0].progress).toBe(0);
  });

  it('clamps Infinity progress to 0 (non-finite)', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [{ week: 'W1', focus: 'a', progress: Infinity, wins: [], gaps: [] }],
      risks: [],
      nextActions: [],
    });

    expect(report.weeks[0].progress).toBe(0);
  });

  it('returns 0 average progress for empty weeks', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [],
      risks: [],
      nextActions: [],
    });

    expect(report.summary.averageProgress).toBe(0);
    expect(report.summary.weekCount).toBe(0);
  });

  it('rounds progress values', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [{ week: 'W1', focus: 'a', progress: 66.6, wins: [], gaps: [] }],
      risks: [],
      nextActions: [],
    });

    expect(report.weeks[0].progress).toBe(67);
  });

  it('trims whitespace from week fields, wins, gaps, risks', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [{
        week: '  W1  ',
        focus: '  focus  ',
        progress: 50,
        wins: ['  win1  ', '  '],
        gaps: ['  gap1  '],
      }],
      risks: ['  risk-1  ', '  '],
      nextActions: ['  action  '],
    });

    expect(report.weeks[0].week).toBe('W1');
    expect(report.weeks[0].focus).toBe('focus');
    expect(report.weeks[0].wins).toEqual(['win1']);
    expect(report.weeks[0].gaps).toEqual(['gap1']);
    expect(report.risks).toEqual(['risk-1']);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      weeks: [],
      risks: [],
      nextActions: [],
    });
    const after = new Date();

    const ts = new Date(report.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('PASSED with no nextActions provides archive suggestion', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [{ week: 'W1', focus: 'a', progress: 100, wins: [], gaps: [] }],
      risks: [],
      nextActions: [],
    });

    expect(report.nextActions).toEqual([
      'Archive the retrospective and use it as baseline for the next quarter.',
    ]);
  });

  it('PASSED with provided nextActions keeps them', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [{ week: 'W1', focus: 'a', progress: 100, wins: [], gaps: [] }],
      risks: [],
      nextActions: ['custom action'],
    });

    expect(report.nextActions).toEqual(['custom action']);
  });

  it('ACTION_REQUIRED with partial weeks adds carry-forward action', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [{ week: 'W1', focus: 'a', progress: 50, wins: [], gaps: [] }],
      risks: [],
      nextActions: ['do something'],
    });

    expect(report.nextActions).toContain('do something');
    expect(report.nextActions).toContain('Carry incomplete weeks into the Week 8 stabilization backlog.');
  });

  it('ACTION_REQUIRED from risks only with no partial weeks and no nextActions yields empty nextActions', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [{ week: 'W1', focus: 'a', progress: 100, wins: [], gaps: [] }],
      risks: ['risk-1'],
      nextActions: [],
    });

    expect(report.status).toBe('ACTION_REQUIRED');
    expect(report.summary.partialWeeks).toEqual([]);
    expect(report.nextActions).toEqual([]);
  });

  it('progress of 99.5 rounds to 100 and counts as completed week', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [{ week: 'W1', focus: 'a', progress: 99.5, wins: [], gaps: [] }],
      risks: [],
      nextActions: [],
    });

    expect(report.weeks[0].progress).toBe(100);
    expect(report.summary.completedWeeks).toEqual(['W1']);
    expect(report.summary.partialWeeks).toEqual([]);
    expect(report.status).toBe('PASSED');
  });

  it('whitespace-only nextActions are filtered out', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [{ week: 'W1', focus: 'a', progress: 50, wins: [], gaps: [] }],
      risks: [],
      nextActions: ['  valid action  ', '   ', '\t'],
    });

    expect(report.nextActions).toEqual([
      'valid action',
      'Carry incomplete weeks into the Week 8 stabilization backlog.',
    ]);
  });

  it('period string is preserved without trimming', () => {
    const report = buildQualityRetrospectiveReport({
      period: '  Week 1-7  ',
      weeks: [],
      risks: [],
      nextActions: [],
    });

    expect(report.period).toBe('  Week 1-7  ');
  });

  it('negative progress is clamped to 0', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'test',
      generatedAt: new Date(),
      weeks: [{ week: 'W1', focus: 'a', progress: -10, wins: [], gaps: [] }],
      risks: [],
      nextActions: [],
    });

    expect(report.weeks[0].progress).toBe(0);
    expect(report.summary.averageProgress).toBe(0);
    expect(report.summary.partialWeeks).toEqual(['W1']);
  });

  it('empty weeks array produces zero average progress', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'empty',
      weeks: [],
      risks: [],
      nextActions: [],
    });

    expect(report.summary.averageProgress).toBe(0);
    expect(report.summary.weekCount).toBe(0);
    expect(report.summary.partialWeeks).toEqual([]);
    expect(report.status).toBe('PASSED');
  });

  it('retrospective mode is QUALITY_RETROSPECTIVE', () => {
    const report = buildQualityRetrospectiveReport({
      period: 'Week 1',
      weeks: [],
      risks: [],
      nextActions: [],
    });
    expect(report.mode).toBe('QUALITY_RETROSPECTIVE');
  });

  it('retrospective with empty findings returns empty arrays', () => {
    const report = buildQualityRetrospectiveReport({ period: '2026-Q1', weeks: [], risks: [], nextActions: [] });
    expect(report.summary.weekCount).toBe(0);
  });

  it('report with single week returns correct count', () => {
    const report = buildQualityRetrospectiveReport({ period: '2026-Q1', weeks: [{ week: 'W1', focus: 'testing', progress: 80, wins: ['done'], gaps: ['slow'] }], risks: [], nextActions: [] });
    expect(report.summary.weekCount).toBe(1);
  });

  it('report with empty weeks returns zero count', () => { const report = buildQualityRetrospectiveReport({ period: '2026-Q1', weeks: [], risks: [], nextActions: [] }); expect(report.summary.weekCount).toBe(0); });

  it('report with single week returns valid count', () => { const report = buildQualityRetrospectiveReport({ period: '2026-Q1', weeks: [{ week: '1', focus: '', progress: 100, wins: [], gaps: [] }], risks: [], nextActions: [] }); expect(report.summary.weekCount).toBe(1); });

  it('report with risks includes risk count', () => { const report = buildQualityRetrospectiveReport({ period: '2026-Q1', weeks: [], risks: ['HIGH: supply chain delay', 'LOW: minor issue'], nextActions: [] }); expect(report.risks).toHaveLength(2); });

  it('report with nextActions includes action count', () => { const report = buildQualityRetrospectiveReport({ period: '2026-Q1', weeks: [], risks: [], nextActions: ['action1', 'action2'] }); expect(report.nextActions).toHaveLength(2); });

  it('report with empty period returns valid structure', () => { const report = buildQualityRetrospectiveReport({ period: '', weeks: [], risks: [], nextActions: [] }); expect(report.period).toBe(''); });

  it('report with multiple weeks counts correctly', () => { const report = buildQualityRetrospectiveReport({ period: '2026-Q1', weeks: [{ week: '1', focus: '', progress: 50, wins: [], gaps: [] }, { week: '2', focus: '', progress: 100, wins: [], gaps: [] }], risks: [], nextActions: [] }); expect(report.summary.weekCount).toBe(2); });

  it('report with wins in week preserves wins', () => { const report = buildQualityRetrospectiveReport({ period: '2026-Q1', weeks: [{ week: '1', focus: '', progress: 100, wins: ['win1', 'win2'], gaps: [] }], risks: [], nextActions: [] }); expect(report.weeks[0].wins).toHaveLength(2); });

  it('report with empty weeks returns zero count', () => { const report = buildQualityRetrospectiveReport({ period: '2026-Q1', weeks: [], risks: [], nextActions: [] }); expect(report.summary.weekCount).toBe(0); });

  it('report with non-empty risks preserves risks', () => { const report = buildQualityRetrospectiveReport({ period: '2026-Q1', weeks: [], risks: ['risk1'], nextActions: [] }); expect(report.risks).toHaveLength(1); });

  it('report with empty period returns valid', () => { const report = buildQualityRetrospectiveReport({ period: '', weeks: [], risks: [], nextActions: [] }); expect(report).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    ` Week ${index} `,
    ` focus ${index} `,
    index % 2 === 0 ? 100 : 99,
  ] as const))('normalizes generated week metadata %s', (week, focus, progress) => {
    const report = buildQualityRetrospectiveReport({
      period: '2026-Q2',
      weeks: [{
        week,
        focus,
        progress,
        wins: [` win-${progress} `, ' '],
        gaps: [` gap-${progress} `, ' '],
      }],
      risks: [],
      nextActions: [],
    });

    expect(report.weeks[0].week).toBe(week.trim());
    expect(report.weeks[0].focus).toBe(focus.trim());
    expect(report.weeks[0].wins).toEqual([`win-${progress}`]);
    expect(report.weeks[0].gaps).toEqual([`gap-${progress}`]);
    expect(report.status).toBe(progress >= 100 ? 'PASSED' : 'ACTION_REQUIRED');
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 3 === 0 ? Number.NaN : index % 3 === 1 ? Number.POSITIVE_INFINITY : -index,
    index % 3 === 2 ? 0 : 0,
  ] as const))('clamps generated invalid progress %s', (progress, expected) => {
    const report = buildQualityRetrospectiveReport({
      period: '2026-Q2',
      weeks: [{ week: 'W', focus: 'focus', progress, wins: [], gaps: [] }],
      risks: [],
      nextActions: [' action '],
    });

    expect(report.weeks[0].progress).toBe(expected);
    expect(report.summary.averageProgress).toBe(expected);
    expect(report.summary.partialWeeks).toEqual(['W']);
    expect(report.nextActions).toContain('action');
    expect(report.nextActions).toContain('Carry incomplete weeks into the Week 8 stabilization backlog.');
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `Week ${index}`,
    index % 2 === 0 ? 100 : 101 + index,
  ] as const))(
    'summarizes generated completed retrospective week %s',
    (week, progress) => {
      const report = buildQualityRetrospectiveReport({
        period: '2026-Q2',
        weeks: [{ week: ` ${week} `, focus: ' focus ', progress, wins: [' win ', ' '], gaps: [' '] }],
        risks: [' '],
        nextActions: [],
      });

      expect(report.status).toBe('PASSED');
      expect(report.summary.completedWeeks).toEqual([week]);
      expect(report.summary.partialWeeks).toEqual([]);
      expect(report.summary.averageProgress).toBe(100);
      expect(report.nextActions).toEqual(['Archive the retrospective and use it as baseline for the next quarter.']);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Week ${index}`,
    index % 101,
    index % 2 === 0 ? ` risk-${index} ` : ' ',
  ] as const))(
    'builds generated action-required retrospective week %s',
    (week, progress, risk) => {
      const report = buildQualityRetrospectiveReport({
        period: '2026-Q2',
        weeks: [{ week: ` ${week} `, focus: 'focus', progress, wins: [], gaps: [` gap-${indexFromWeek(week)} `] }],
        risks: [risk],
        nextActions: [` next-${week} `],
      });

      expect(report.status).toBe('ACTION_REQUIRED');
      expect(report.summary.partialWeeks).toEqual(progress < 100 ? [week] : []);
      expect(report.risks).toEqual(risk.trim() ? [risk.trim()] : []);
      expect(report.nextActions).toContain(`next-${week}`);
      if (progress < 100) {
        expect(report.nextActions).toContain('Carry incomplete weeks into the Week 8 stabilization backlog.');
      }
    },
  );
});

describe('quality retrospective batch 161 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `Week 161-${index}`,
    index % 2 === 0 ? Number.NaN : Number.POSITIVE_INFINITY,
  ] as const))(
    'clamps generated batch161 non-finite progress %s',
    (week, progress) => {
      const report = buildQualityRetrospectiveReport({
        period: '2026-Q2',
        weeks: [{ week: ` ${week} `, focus: ' focus ', progress, wins: [' win '], gaps: [' gap '] }],
        risks: [],
        nextActions: [' follow up '],
      });

      expect(report.status).toBe('ACTION_REQUIRED');
      expect(report.weeks[0].progress).toBe(0);
      expect(report.summary.averageProgress).toBe(0);
      expect(report.summary.partialWeeks).toEqual([week]);
      expect(report.nextActions).toEqual(['follow up', 'Carry incomplete weeks into the Week 8 stabilization backlog.']);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Week 161-pass-${index}`,
    100 + index,
    index % 2 === 0 ? ' archive-now ' : ' ',
  ] as const))(
    'builds generated batch161 passed retrospective actions %s',
    (week, progress, nextAction) => {
      const report = buildQualityRetrospectiveReport({
        period: '2026-Q2',
        weeks: [{ week: ` ${week} `, focus: ' closure ', progress, wins: [' done ', ' '], gaps: [' '] }],
        risks: [' '],
        nextActions: [nextAction],
      });

      expect(report.status).toBe('PASSED');
      expect(report.weeks[0].progress).toBe(100);
      expect(report.summary.completedWeeks).toEqual([week]);
      expect(report.summary.partialWeeks).toEqual([]);
      expect(report.nextActions).toEqual(nextAction.trim() ? [nextAction.trim()] : ['Archive the retrospective and use it as baseline for the next quarter.']);
    },
  );
});

function indexFromWeek(week: string): string {
  return week.split(' ').at(-1) ?? '';
}

describe('quality retrospective batch 147 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `Week ${index}`,
    index % 2 === 0 ? 49.4 : 49.5,
    index % 2 === 0 ? 50.4 : 50.5,
  ] as const))(
    'rounds generated week progress before averaging %s',
    (week, firstProgress, secondProgress) => {
      const report = buildQualityRetrospectiveReport({
        period: '2026-Q2',
        weeks: [
          { week: `${week}-A`, focus: 'focus', progress: firstProgress, wins: [' win-a '], gaps: [] },
          { week: `${week}-B`, focus: 'focus', progress: secondProgress, wins: [], gaps: [' gap-b '] },
        ],
        risks: [],
        nextActions: [],
      });
      const expectedFirst = Math.round(firstProgress);
      const expectedSecond = Math.round(secondProgress);

      expect(report.summary.averageProgress).toBe(Math.round((expectedFirst + expectedSecond) / 2));
      expect(report.summary.partialWeeks).toEqual([`${week}-A`, `${week}-B`]);
      expect(report.weeks.map((item) => item.progress)).toEqual([expectedFirst, expectedSecond]);
      expect(report.nextActions).toContain('Carry incomplete weeks into the Week 8 stabilization backlog.');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `risk-${index}`,
    index % 2 === 0 ? ` next-${index} ` : ' ',
  ] as const))(
    'keeps generated risk-only report action required without carry action %s',
    (risk, nextAction) => {
      const report = buildQualityRetrospectiveReport({
        period: '2026-Q2',
        weeks: [{ week: 'Week 8', focus: 'closure', progress: 100, wins: ['done'], gaps: [] }],
        risks: [` ${risk} `],
        nextActions: [nextAction],
      });

      expect(report.status).toBe('ACTION_REQUIRED');
      expect(report.summary.completedWeeks).toEqual(['Week 8']);
      expect(report.summary.partialWeeks).toEqual([]);
      expect(report.risks).toEqual([risk]);
      expect(report.nextActions).toEqual(nextAction.trim() ? [nextAction.trim()] : []);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `Week 152-${index}`,
    index % 2 === 0 ? 99.49 : 99.5,
    120 + index,
  ] as const))(
    'classifies generated rounded retrospective weeks %s',
    (week, partialProgress, completedProgress) => {
      const report = buildQualityRetrospectiveReport({
        period: '2026-Q2',
        weeks: [
          { week: ` ${week}-partial `, focus: ' focus ', progress: partialProgress, wins: [' win ', ' '], gaps: [' gap '] },
          { week: ` ${week}-complete `, focus: ' closure ', progress: completedProgress, wins: [], gaps: [] },
        ],
        risks: [' '],
        nextActions: [' '],
      });
      const roundedPartial = Math.round(partialProgress);

      expect(report.weeks.map((item) => item.progress)).toEqual([roundedPartial, 100]);
      expect(report.summary.averageProgress).toBe(Math.round((roundedPartial + 100) / 2));
      expect(report.summary.completedWeeks).toEqual(roundedPartial >= 100 ? [`${week}-partial`, `${week}-complete`] : [`${week}-complete`]);
      expect(report.summary.partialWeeks).toEqual(roundedPartial >= 100 ? [] : [`${week}-partial`]);
      expect(report.status).toBe(roundedPartial >= 100 ? 'PASSED' : 'ACTION_REQUIRED');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Week 152-default-${index}`,
    index % 2 === 0 ? ' ' : '',
  ] as const))(
    'uses generated default archive action for passed report %s',
    (week, nextAction) => {
      const report = buildQualityRetrospectiveReport({
        period: '2026-Q2',
        weeks: [{ week: ` ${week} `, focus: ' closure ', progress: 100, wins: [' done '], gaps: [' '] }],
        risks: [' '],
        nextActions: [nextAction],
      });

      expect(report.status).toBe('PASSED');
      expect(report.risks).toEqual([]);
      expect(report.summary.completedWeeks).toEqual([week]);
      expect(report.summary.partialWeeks).toEqual([]);
      expect(report.nextActions).toEqual(['Archive the retrospective and use it as baseline for the next quarter.']);
    },
  );
});
