export type QuarterlyGoalPriority = 'P0' | 'P1' | 'P2';

export type QuarterlyQualityGoal = {
  title: string;
  owner: string;
  priority: QuarterlyGoalPriority;
  source: string;
};

export type QuarterlyMilestone = {
  month: string;
  focus: string;
  deliverables: string[];
};

export type QuarterlyQualityPlan = {
  mode: 'QUARTERLY_QUALITY_PLAN';
  status: 'READY' | 'BLOCKED';
  quarter: string;
  generatedAt: string;
  summary: {
    themeCount: number;
    goalCount: number;
    p0GoalCount: number;
    milestoneCount: number;
    riskCount: number;
    successMetricCount: number;
  };
  themes: string[];
  goals: QuarterlyQualityGoal[];
  milestones: QuarterlyMilestone[];
  risks: string[];
  successMetrics: string[];
  blockers: string[];
};

export function buildQuarterlyQualityPlan(input: {
  quarter: string;
  themes: string[];
  goals: QuarterlyQualityGoal[];
  milestones: QuarterlyMilestone[];
  risks: string[];
  successMetrics: string[];
  generatedAt?: Date;
}): QuarterlyQualityPlan {
  const themes = normalizeList(input.themes);
  const goals = input.goals.map(normalizeGoal).filter((goal) => goal.title.length > 0);
  const milestones = input.milestones.map(normalizeMilestone).filter((milestone) => milestone.month.length > 0);
  const risks = normalizeList(input.risks);
  const successMetrics = normalizeList(input.successMetrics);
  const blockers = buildBlockers({ themes, goals, milestones, successMetrics });

  return {
    mode: 'QUARTERLY_QUALITY_PLAN',
    status: blockers.length > 0 ? 'BLOCKED' : 'READY',
    quarter: input.quarter,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      themeCount: themes.length,
      goalCount: goals.length,
      p0GoalCount: goals.filter((goal) => goal.priority === 'P0').length,
      milestoneCount: milestones.length,
      riskCount: risks.length,
      successMetricCount: successMetrics.length,
    },
    themes,
    goals,
    milestones,
    risks,
    successMetrics,
    blockers,
  };
}

function normalizeGoal(goal: QuarterlyQualityGoal): QuarterlyQualityGoal {
  return {
    title: goal.title.trim(),
    owner: goal.owner.trim(),
    priority: goal.priority,
    source: goal.source.trim(),
  };
}

function normalizeMilestone(milestone: QuarterlyMilestone): QuarterlyMilestone {
  return {
    month: milestone.month.trim(),
    focus: milestone.focus.trim(),
    deliverables: normalizeList(milestone.deliverables),
  };
}

function buildBlockers(input: {
  themes: string[];
  goals: QuarterlyQualityGoal[];
  milestones: QuarterlyMilestone[];
  successMetrics: string[];
}): string[] {
  return [
    ...(input.themes.length > 0 ? [] : ['at least one theme is required']),
    ...(input.milestones.length > 0 ? [] : ['at least one milestone is required']),
    ...(input.successMetrics.length > 0 ? [] : ['at least one success metric is required']),
    ...input.goals
      .filter((goal) => !goal.owner)
      .map((goal) => `goal owner is missing: ${goal.title}`),
  ];
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
