export type RetrospectiveWeek = {
  week: string;
  focus: string;
  progress: number;
  wins: string[];
  gaps: string[];
};

export type QualityRetrospectiveReport = {
  mode: 'QUALITY_RETROSPECTIVE';
  status: 'PASSED' | 'ACTION_REQUIRED';
  period: string;
  generatedAt: string;
  summary: {
    weekCount: number;
    averageProgress: number;
    completedWeeks: string[];
    partialWeeks: string[];
  };
  weeks: RetrospectiveWeek[];
  risks: string[];
  nextActions: string[];
};

export function buildQualityRetrospectiveReport(input: {
  period: string;
  weeks: RetrospectiveWeek[];
  risks: string[];
  nextActions: string[];
  generatedAt?: Date;
}): QualityRetrospectiveReport {
  const weeks = input.weeks.map(normalizeWeek);
  const risks = normalizeList(input.risks);
  const partialWeeks = weeks.filter((week) => week.progress < 100).map((week) => week.week);
  const completedWeeks = weeks.filter((week) => week.progress >= 100).map((week) => week.week);
  const status = partialWeeks.length > 0 || risks.length > 0 ? 'ACTION_REQUIRED' : 'PASSED';

  return {
    mode: 'QUALITY_RETROSPECTIVE',
    status,
    period: input.period,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      weekCount: weeks.length,
      averageProgress: calculateAverageProgress(weeks),
      completedWeeks,
      partialWeeks,
    },
    weeks,
    risks,
    nextActions: buildNextActions({
      status,
      partialWeeks,
      nextActions: input.nextActions,
    }),
  };
}

function normalizeWeek(week: RetrospectiveWeek): RetrospectiveWeek {
  return {
    week: week.week.trim(),
    focus: week.focus.trim(),
    progress: clampProgress(week.progress),
    wins: normalizeList(week.wins),
    gaps: normalizeList(week.gaps),
  };
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(progress)));
}

function calculateAverageProgress(weeks: RetrospectiveWeek[]): number {
  if (weeks.length === 0) {
    return 0;
  }

  const total = weeks.reduce((sum, week) => sum + week.progress, 0);
  return Math.round(total / weeks.length);
}

function buildNextActions(input: {
  status: QualityRetrospectiveReport['status'];
  partialWeeks: string[];
  nextActions: string[];
}): string[] {
  const nextActions = normalizeList(input.nextActions);

  if (input.status === 'PASSED') {
    return nextActions.length > 0
      ? nextActions
      : ['Archive the retrospective and use it as baseline for the next quarter.'];
  }

  return [
    ...nextActions,
    ...(input.partialWeeks.length > 0 ? ['Carry incomplete weeks into the Week 8 stabilization backlog.'] : []),
  ];
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
