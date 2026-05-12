import { describe, expect, it } from 'vitest';
import { buildQuarterlyQualityPlan } from './quarterlyQualityPlan';

describe('quarterly quality plan builder', () => {
  it('builds a ready quarterly roadmap with goals, milestones and success metrics', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q2',
      generatedAt: new Date('2026-05-05T23:00:00.000Z'),
      themes: ['流程闭环', '生产可观测性', '发布安全'],
      goals: [
        { title: '完成团队侧流程闭环', owner: 'AI 代码守护人', priority: 'P0', source: 'Week 1/3 gaps' },
        { title: '接入真实告警通道与 APM 选型', owner: '后端负责人', priority: 'P1', source: 'Week 6 gaps' },
      ],
      milestones: [
        { month: '2026-05', focus: 'Week 8 稳定化收口', deliverables: ['质量回顾会', '分支保护策略确认'] },
        { month: '2026-06', focus: '流程制度化', deliverables: ['PR 审查规则', 'AI 守护人轮值'] },
        { month: '2026-07', focus: '生产运营强化', deliverables: ['APM 选型', '真实告警通道'] },
      ],
      risks: ['团队 owner 未确认', 'main 落后远端 61 个提交'],
      successMetrics: ['P0 CI 持续通过', 'high/critical audit = 0', '质量回顾会每月执行'],
    });

    expect(plan).toEqual({
      mode: 'QUARTERLY_QUALITY_PLAN',
      status: 'READY',
      quarter: '2026 Q2',
      generatedAt: '2026-05-05T23:00:00.000Z',
      summary: {
        themeCount: 3,
        goalCount: 2,
        p0GoalCount: 1,
        milestoneCount: 3,
        riskCount: 2,
        successMetricCount: 3,
      },
      themes: ['流程闭环', '生产可观测性', '发布安全'],
      goals: [
        { title: '完成团队侧流程闭环', owner: 'AI 代码守护人', priority: 'P0', source: 'Week 1/3 gaps' },
        { title: '接入真实告警通道与 APM 选型', owner: '后端负责人', priority: 'P1', source: 'Week 6 gaps' },
      ],
      milestones: [
        { month: '2026-05', focus: 'Week 8 稳定化收口', deliverables: ['质量回顾会', '分支保护策略确认'] },
        { month: '2026-06', focus: '流程制度化', deliverables: ['PR 审查规则', 'AI 守护人轮值'] },
        { month: '2026-07', focus: '生产运营强化', deliverables: ['APM 选型', '真实告警通道'] },
      ],
      risks: ['团队 owner 未确认', 'main 落后远端 61 个提交'],
      successMetrics: ['P0 CI 持续通过', 'high/critical audit = 0', '质量回顾会每月执行'],
      blockers: [],
    });
  });

  it('blocks the roadmap when owners or milestones are missing', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q2',
      generatedAt: new Date('2026-05-05T23:00:00.000Z'),
      themes: [],
      goals: [{ title: '完成团队侧流程闭环', owner: '', priority: 'P0', source: 'Week 1/3 gaps' }],
      milestones: [],
      risks: [],
      successMetrics: [],
    });

    expect(plan.status).toBe('BLOCKED');
    expect(plan.blockers).toEqual([
      'at least one theme is required',
      'at least one milestone is required',
      'at least one success metric is required',
      'goal owner is missing: 完成团队侧流程闭环',
    ]);
  });

  it('counts P0 goals correctly', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      generatedAt: new Date(),
      themes: ['test'],
      goals: [
        { title: 'g1', owner: 'a', priority: 'P0', source: 's' },
        { title: 'g2', owner: 'b', priority: 'P1', source: 's' },
        { title: 'g3', owner: 'c', priority: 'P0', source: 's' },
      ],
      milestones: [{ month: '2026-07', focus: 'test', deliverables: [] }],
      risks: [],
      successMetrics: ['m1'],
    });

    expect(plan.summary.p0GoalCount).toBe(2);
    expect(plan.summary.goalCount).toBe(3);
  });

  it('passes with minimal valid input', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      generatedAt: new Date(),
      themes: ['one theme'],
      goals: [],
      milestones: [{ month: '2026-07', focus: 'test', deliverables: [] }],
      risks: [],
      successMetrics: ['one metric'],
    });

    expect(plan.status).toBe('READY');
    expect(plan.blockers).toEqual([]);
  });

  it('trims whitespace from themes, risks, and success metrics', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      themes: ['  theme-a  ', '  '],
      goals: [],
      milestones: [{ month: '2026-07', focus: 'test', deliverables: ['  del-1  '] }],
      risks: ['  risk-1  ', '  '],
      successMetrics: ['  metric-1  ', '  '],
    });

    expect(plan.themes).toEqual(['theme-a']);
    expect(plan.risks).toEqual(['risk-1']);
    expect(plan.successMetrics).toEqual(['metric-1']);
    expect(plan.milestones[0].deliverables).toEqual(['del-1']);
  });

  it('trims whitespace from goal fields', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      themes: ['t'],
      goals: [{ title: '  goal  ', owner: '  owner  ', priority: 'P2', source: '  src  ' }],
      milestones: [{ month: '2026-07', focus: 'f', deliverables: [] }],
      risks: [],
      successMetrics: ['m'],
    });

    expect(plan.goals[0].title).toBe('goal');
    expect(plan.goals[0].owner).toBe('owner');
    expect(plan.goals[0].source).toBe('src');
  });

  it('filters out goals with empty titles', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      themes: ['t'],
      goals: [
        { title: '  ', owner: 'o', priority: 'P0', source: 's' },
        { title: 'real goal', owner: 'o', priority: 'P1', source: 's' },
      ],
      milestones: [{ month: '2026-07', focus: 'f', deliverables: [] }],
      risks: [],
      successMetrics: ['m'],
    });

    expect(plan.goals).toHaveLength(1);
    expect(plan.goals[0].title).toBe('real goal');
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      themes: ['t'],
      goals: [],
      milestones: [{ month: '2026-07', focus: 'f', deliverables: [] }],
      risks: [],
      successMetrics: ['m'],
    });
    const after = new Date();

    const ts = new Date(plan.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('milestones with empty month are filtered out', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      themes: ['t'],
      goals: [],
      milestones: [
        { month: '  ', focus: 'test', deliverables: [] },
        { month: '2026-08', focus: 'real', deliverables: [] },
      ],
      risks: [],
      successMetrics: ['m'],
    });

    expect(plan.milestones).toHaveLength(1);
    expect(plan.milestones[0].month).toBe('2026-08');
  });

  it('counts P2 goals correctly', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      generatedAt: new Date(),
      themes: ['t'],
      goals: [
        { title: 'g1', owner: 'a', priority: 'P2', source: 's' },
        { title: 'g2', owner: 'b', priority: 'P2', source: 's' },
      ],
      milestones: [{ month: '2026-07', focus: 'test', deliverables: [] }],
      risks: [],
      successMetrics: ['m'],
    });

    expect(plan.summary.p0GoalCount).toBe(0);
    expect(plan.summary.goalCount).toBe(2);
  });

  it('reports multiple blockers when multiple goals lack owners', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      generatedAt: new Date(),
      themes: [],
      goals: [
        { title: 'g1', owner: '', priority: 'P0', source: 's' },
        { title: 'g2', owner: '', priority: 'P1', source: 's' },
      ],
      milestones: [],
      risks: [],
      successMetrics: [],
    });

    expect(plan.blockers).toContain('goal owner is missing: g1');
    expect(plan.blockers).toContain('goal owner is missing: g2');
  });

  it('mode is always QUARTERLY_QUALITY_PLAN', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      themes: [],
      goals: [],
      milestones: [],
      risks: [],
      successMetrics: [],
    });
    expect(plan.mode).toBe('QUARTERLY_QUALITY_PLAN');
  });

  it('quarter string is preserved exactly as provided', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '  2026 Q4  ',
      themes: ['t'],
      goals: [],
      milestones: [{ month: '2026-10', focus: 'f', deliverables: [] }],
      risks: [],
      successMetrics: ['m'],
    });

    expect(plan.quarter).toBe('  2026 Q4  ');
  });

  it('empty string risks are filtered out', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      themes: ['t'],
      goals: [],
      milestones: [{ month: '2026-07', focus: 'f', deliverables: [] }],
      risks: ['  valid risk  ', '  ', 'another risk'],
      successMetrics: ['m'],
    });

    expect(plan.risks).toEqual(['valid risk', 'another risk']);
    expect(plan.summary.riskCount).toBe(2);
  });

  it('is BLOCKED when themes and successMetrics are present but milestones are missing and goals lack owners', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      themes: ['theme'],
      goals: [{ title: 'g1', owner: '', priority: 'P0', source: 's' }],
      milestones: [],
      risks: [],
      successMetrics: ['metric'],
    });

    expect(plan.status).toBe('BLOCKED');
    expect(plan.blockers).toContain('at least one milestone is required');
    expect(plan.blockers).toContain('goal owner is missing: g1');
  });

  it('generatedAt is valid ISO string', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      themes: ['t'],
      goals: [],
      milestones: [{ month: '2026-07', focus: 'f', deliverables: [] }],
      risks: [],
      successMetrics: ['m'],
    });
    expect(new Date(plan.generatedAt).toISOString()).toBe(plan.generatedAt);
  });

  it('goal with whitespace-only owner after trimming triggers blocker', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      themes: ['t'],
      goals: [{ title: 'goal-1', owner: '  ', priority: 'P0', source: 's' }],
      milestones: [{ month: '2026-07', focus: 'f', deliverables: [] }],
      risks: [],
      successMetrics: ['m'],
    });

    expect(plan.status).toBe('BLOCKED');
    expect(plan.blockers).toContain('goal owner is missing: goal-1');
    expect(plan.goals).toHaveLength(1);
    expect(plan.goals[0].owner).toBe('');
  });

  it('milestone with whitespace-only focus is still included', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      themes: ['t'],
      goals: [],
      milestones: [{ month: '2026-07', focus: '   ', deliverables: ['d1'] }],
      risks: [],
      successMetrics: ['m'],
    });

    expect(plan.milestones).toHaveLength(1);
    expect(plan.milestones[0].focus).toBe('');
    expect(plan.milestones[0].deliverables).toEqual(['d1']);
  });

  it('goals with identical titles but different owners are both included', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026 Q3',
      themes: ['t'],
      goals: [
        { title: 'improve CI', owner: 'alice', priority: 'P0', source: 's' },
        { title: 'improve CI', owner: 'bob', priority: 'P1', source: 's' },
      ],
      milestones: [{ month: '2026-07', focus: 'f', deliverables: [] }],
      risks: [],
      successMetrics: ['m'],
    });

    expect(plan.goals).toHaveLength(2);
    expect(plan.goals[0].owner).toBe('alice');
    expect(plan.goals[1].owner).toBe('bob');
  });

  it('empty plan has zero counts in all summary fields', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026-Q3',
      themes: [],
      goals: [],
      milestones: [],
      risks: [],
      successMetrics: [],
    });

    expect(plan.summary.themeCount).toBe(0);
    expect(plan.summary.goalCount).toBe(0);
    expect(plan.summary.milestoneCount).toBe(0);
    expect(plan.summary.riskCount).toBe(0);
  });

  it('plan with goals includes them in summary', () => {
    const plan = buildQuarterlyQualityPlan({
      quarter: '2026-Q3',
      themes: ['t'],
      goals: [{ title: 'reliability', owner: 'pm', priority: 'P0', source: 'retro' }],
      milestones: [{ month: '2026-07', focus: 'f', deliverables: [] }],
      risks: [],
      successMetrics: ['m'],
    });
    expect(plan.summary.goalCount).toBe(1);
    expect(plan.goals[0].title).toBe('reliability');
  });

  it('plan with empty goals returns empty array', () => {
    const plan = buildQuarterlyQualityPlan({ quarter: 'Q1', themes: [], goals: [], milestones: [], risks: [], successMetrics: [] });
    expect(plan.goals).toEqual([]);
  });

  it('plan with single goal returns correct count', () => {
    const plan = buildQuarterlyQualityPlan({ quarter: 'Q1', themes: [], goals: [{ title: 'Goal 1', owner: 'u1', priority: 'P1', source: 'planning' }], milestones: [{ month: 'Jan', focus: 'dev', deliverables: ['feat-1'] }], risks: [], successMetrics: ['metric-1'] });
    expect(plan.goals).toHaveLength(1);
  });

  it('plan with empty goals returns zero count', () => { const plan = buildQuarterlyQualityPlan({ quarter: 'Q1', themes: [], goals: [], milestones: [], risks: [], successMetrics: [] }); expect(plan.goals).toHaveLength(0); });

  it('plan with single goal returns valid count', () => { const plan = buildQuarterlyQualityPlan({ quarter: 'Q1', themes: [], goals: [{ title: 'goal', owner: 'admin', priority: 'P0', source: '' }], milestones: [], risks: [], successMetrics: [] }); expect(plan.goals).toHaveLength(1); });

  it('plan with milestones includes milestone count', () => { const plan = buildQuarterlyQualityPlan({ quarter: 'Q1', themes: [], goals: [], milestones: [{ month: '2026-03', focus: 'delivery', deliverables: ['item1'] }], risks: [], successMetrics: [] }); expect(plan.milestones).toHaveLength(1); });

  it('plan with themes includes theme count', () => { const plan = buildQuarterlyQualityPlan({ quarter: 'Q1', themes: ['security', 'performance'], goals: [], milestones: [], risks: [], successMetrics: [] }); expect(plan.themes).toHaveLength(2); });

  it('plan with risks includes risk count', () => { const plan = buildQuarterlyQualityPlan({ quarter: 'Q1', themes: [], goals: [], milestones: [], risks: ['supply chain delay'], successMetrics: [] }); expect(plan.risks).toHaveLength(1); });

  it('plan with successMetrics includes metric count', () => { const plan = buildQuarterlyQualityPlan({ quarter: 'Q1', themes: [], goals: [], milestones: [], risks: [], successMetrics: ['metric-a', 'metric-b'] }); expect(plan.summary.successMetricCount).toBe(2); });

  it('plan with empty all arrays returns valid structure', () => { const plan = buildQuarterlyQualityPlan({ quarter: 'Q2', themes: [], goals: [], milestones: [], risks: [], successMetrics: [] }); expect(plan.quarter).toBe('Q2'); });

  it('plan with single theme returns one theme', () => { const plan = buildQuarterlyQualityPlan({ quarter: 'Q1', themes: ['reliability'], goals: [], milestones: [], risks: [], successMetrics: [] }); expect(plan.themes).toHaveLength(1); });

  it('plan with multiple goals preserves count', () => { const plan = buildQuarterlyQualityPlan({ quarter: 'Q1', themes: [], goals: [{ title: 'goal1', owner: 'admin', priority: 'HIGH', source: '' }, { title: 'goal2', owner: 'admin', priority: 'MEDIUM', source: '' }], milestones: [], risks: [], successMetrics: [] }); expect(plan.goals).toHaveLength(2); });

  it('plan with empty goals returns valid', () => { const plan = buildQuarterlyQualityPlan({ quarter: 'Q2', themes: [], goals: [], milestones: [], risks: [], successMetrics: [] }); expect(plan).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch95-goal-${index}`,
    index % 3 === 0 ? 'P0' : index % 3 === 1 ? 'P1' : 'P2',
  ] as const))(
    'counts generated quarterly goal %s with priority %s',
    (title, priority) => {
      const plan = buildQuarterlyQualityPlan({
        quarter: '2026 Q4',
        themes: [' theme '],
        goals: [{ title: ` ${title} `, owner: ' owner ', priority, source: ' source ' }],
        milestones: [{ month: ' 2026-10 ', focus: ' focus ', deliverables: [' deliverable '] }],
        risks: [' risk '],
        successMetrics: [' metric '],
      });

      expect(plan.status).toBe('READY');
      expect(plan.goals[0].title).toBe(title);
      expect(plan.summary.goalCount).toBe(1);
      expect(plan.summary.p0GoalCount).toBe(priority === 'P0' ? 1 : 0);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `batch95-ownerless-${index}`))(
    'reports generated ownerless goal blocker %s',
    (title) => {
      const plan = buildQuarterlyQualityPlan({
        quarter: '2026 Q4',
        themes: ['theme'],
        goals: [{ title, owner: ' ', priority: 'P0', source: 's' }],
        milestones: [{ month: '2026-10', focus: 'f', deliverables: [] }],
        risks: [],
        successMetrics: ['metric'],
      });

      expect(plan.status).toBe('BLOCKED');
      expect(plan.blockers).toEqual([`goal owner is missing: ${title}`]);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch141-theme-${index}`,
    index % 3 === 0 ? 'P0' : index % 3 === 1 ? 'P1' : 'P2',
    `metric-${index}`,
  ] as const))(
    'builds generated ready quarterly plan %s',
    (theme, priority, metric) => {
      const plan = buildQuarterlyQualityPlan({
        quarter: '2026 Q4',
        themes: [` ${theme} `, ' '],
        goals: [{ title: ` goal-${theme} `, owner: ' owner ', priority, source: ' source ' }],
        milestones: [{ month: ' 2026-10 ', focus: ' focus ', deliverables: [' deliverable ', ' '] }],
        risks: [' risk ', ' '],
        successMetrics: [` ${metric} `],
      });

      expect(plan.status).toBe('READY');
      expect(plan.themes).toEqual([theme]);
      expect(plan.goals[0]).toMatchObject({ title: `goal-${theme}`, owner: 'owner', priority, source: 'source' });
      expect(plan.milestones[0].deliverables).toEqual(['deliverable']);
      expect(plan.summary.p0GoalCount).toBe(priority === 'P0' ? 1 : 0);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch141-blocked-${index}`,
    index % 2 === 0,
    index % 3 === 0,
    index % 5 === 0,
  ] as const))(
    'reports generated quarterly blocker combination %s',
    (title, hasTheme, hasMilestone, hasMetric) => {
      const plan = buildQuarterlyQualityPlan({
        quarter: '2026 Q4',
        themes: hasTheme ? ['theme'] : [' '],
        goals: [{ title, owner: ' ', priority: 'P0', source: 'source' }],
        milestones: hasMilestone ? [{ month: '2026-10', focus: 'focus', deliverables: [] }] : [{ month: ' ', focus: 'ignored', deliverables: ['ignored'] }],
        risks: [],
        successMetrics: hasMetric ? ['metric'] : [' '],
      });
      const expectedBlockers = [
        hasTheme ? undefined : 'at least one theme is required',
        hasMilestone ? undefined : 'at least one milestone is required',
        hasMetric ? undefined : 'at least one success metric is required',
        `goal owner is missing: ${title}`,
      ].filter(Boolean);

      expect(plan.status).toBe('BLOCKED');
      expect(plan.blockers).toEqual(expectedBlockers);
      expect(plan.summary.goalCount).toBe(1);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch148-theme-${index}`,
    `batch148-goal-${index}`,
    ['P0', 'P1', 'P2'][index % 3],
  ] as const))(
    'filters generated blank quarterly plan entries %s',
    (theme, title, priority) => {
      const plan = buildQuarterlyQualityPlan({
        quarter: '2026 Q4',
        themes: [' ', ` ${theme} `],
        goals: [
          { title: ' ', owner: 'ignored', priority: 'P0', source: 'ignored' },
          { title: ` ${title} `, owner: ' owner ', priority, source: ' source ' },
        ],
        milestones: [
          { month: ' ', focus: 'ignored', deliverables: ['ignored'] },
          { month: ' 2026-10 ', focus: ' focus ', deliverables: [' deliverable-a ', ' ', 'deliverable-b'] },
        ],
        risks: [' ', ` risk-${title} `],
        successMetrics: [' ', ` metric-${title} `],
      });

      expect(plan.status).toBe('READY');
      expect(plan.summary).toEqual({
        themeCount: 1,
        goalCount: 1,
        p0GoalCount: priority === 'P0' ? 1 : 0,
        milestoneCount: 1,
        riskCount: 1,
        successMetricCount: 1,
      });
      expect(plan.themes).toEqual([theme]);
      expect(plan.milestones[0].deliverables).toEqual(['deliverable-a', 'deliverable-b']);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch148-ownerless-${index}`,
    index % 2 === 0 ? ' ' : `owner-${index}`,
    index % 3 === 0 ? ' ' : `metric-${index}`,
  ] as const))(
    'builds generated blocker set for owner and metric gaps %s',
    (title, owner, metric) => {
      const plan = buildQuarterlyQualityPlan({
        quarter: '2026 Q4',
        themes: ['theme'],
        goals: [{ title, owner, priority: 'P0', source: 'source' }],
        milestones: [{ month: '2026-10', focus: 'focus', deliverables: [' '] }],
        risks: ['risk'],
        successMetrics: [metric],
      });
      const expectedBlockers = [
        metric.trim() ? undefined : 'at least one success metric is required',
        owner.trim() ? undefined : `goal owner is missing: ${title}`,
      ].filter(Boolean);

      expect(plan.status).toBe(expectedBlockers.length > 0 ? 'BLOCKED' : 'READY');
      expect(plan.blockers).toEqual(expectedBlockers);
      expect(plan.summary.riskCount).toBe(1);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch153-theme-${index}`,
    `batch153-p0-${index}`,
    `batch153-p1-${index}`,
  ] as const))(
    'summarizes generated multi-goal quarterly plan %s',
    (theme, p0Title, p1Title) => {
      const plan = buildQuarterlyQualityPlan({
        quarter: '2026 Q4',
        themes: [' ', ` ${theme} `],
        goals: [
          { title: ` ${p0Title} `, owner: ' owner-p0 ', priority: 'P0', source: ' source-p0 ' },
          { title: p1Title, owner: 'owner-p1', priority: 'P1', source: 'source-p1' },
        ],
        milestones: [{ month: ' 2026-10 ', focus: ' focus ', deliverables: [' deliverable-a ', ' ', 'deliverable-b'] }],
        risks: [' ', `risk-${theme}`],
        successMetrics: [` metric-${theme} `, ' '],
      });

      expect(plan.status).toBe('READY');
      expect(plan.summary).toEqual({ themeCount: 1, goalCount: 2, p0GoalCount: 1, milestoneCount: 1, riskCount: 1, successMetricCount: 1 });
      expect(plan.goals.map((goal) => goal.title)).toEqual([p0Title, p1Title]);
      expect(plan.milestones[0].deliverables).toEqual(['deliverable-a', 'deliverable-b']);
      expect(plan.blockers).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch153-goal-${index}`,
    index % 2 === 0,
    index % 3 === 0,
    index % 4 === 0,
    index % 5 === 0 ? ' ' : `owner-${index}`,
  ] as const))(
    'reports generated quarterly plan blockers in stable order %s',
    (title, hasTheme, hasMilestone, hasMetric, owner) => {
      const plan = buildQuarterlyQualityPlan({
        quarter: '2026 Q4',
        themes: hasTheme ? ['theme'] : [' '],
        goals: [{ title, owner, priority: 'P2', source: 'batch153' }],
        milestones: hasMilestone ? [{ month: '2026-11', focus: 'focus', deliverables: [' '] }] : [{ month: ' ', focus: 'ignored', deliverables: ['ignored'] }],
        risks: [' ', `risk-${title}`],
        successMetrics: hasMetric ? ['metric'] : [' '],
      });
      const expectedBlockers = [
        hasTheme ? undefined : 'at least one theme is required',
        hasMilestone ? undefined : 'at least one milestone is required',
        hasMetric ? undefined : 'at least one success metric is required',
        owner.trim() ? undefined : `goal owner is missing: ${title}`,
      ].filter(Boolean);

      expect(plan.status).toBe(expectedBlockers.length > 0 ? 'BLOCKED' : 'READY');
      expect(plan.blockers).toEqual(expectedBlockers);
      expect(plan.summary.riskCount).toBe(1);
      expect(plan.summary.p0GoalCount).toBe(0);
    },
  );
});
