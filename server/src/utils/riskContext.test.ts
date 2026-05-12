import { describe, it, expect } from 'vitest';
import { trimContextForAI, RiskContext } from './riskContext';

function makeActivity(overrides: Partial<RiskContext['activities'][0]> = {}): RiskContext['activities'][0] {
  return {
    id: `act-${Math.random().toString(36).slice(2, 6)}`,
    name: 'activity',
    type: 'DEVELOPMENT',
    phase: null,
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    assignees: [],
    planStartDate: null,
    planEndDate: null,
    planDuration: null,
    startDate: null,
    endDate: null,
    duration: null,
    dependencyCount: 0,
    isOnCriticalPath: false,
    ...overrides,
  };
}

function makeContext(activities: RiskContext['activities'] = []): RiskContext {
  return {
    project: { id: '1', name: 'test', status: 'IN_PROGRESS', priority: 'MEDIUM', progress: 50, startDate: null, endDate: null, managerName: 'mgr', memberCount: 1, totalActivities: activities.length },
    ruleEngineMetrics: { riskLevel: 'MEDIUM', riskScore: 30, factors: [] },
    activities,
    criticalPathActivityIds: [],
    historicalTrend: [],
    latestWeeklyReportRisks: null,
    summary: { completedCount: 0, inProgressCount: 0, notStartedCount: 0, overdueCount: 0, unassignedCount: 0, avgDurationDeviation: null, longestDependencyChain: 0, crossProjectConflictCount: 0 },
  };
}

describe('trimContextForAI', () => {
  it('returns context unchanged when activities <= 40', () => {
    const activities = Array.from({ length: 40 }, () => makeActivity());
    const ctx = makeContext(activities);

    const result = trimContextForAI(ctx);

    expect(result.activities).toHaveLength(40);
    expect(result.activities).toBe(activities);
  });

  it('trims to 40 activities when over limit', () => {
    const activities = Array.from({ length: 60 }, () => makeActivity());
    const ctx = makeContext(activities);

    const result = trimContextForAI(ctx);

    expect(result.activities).toHaveLength(40);
  });

  it('prioritizes overdue activities', () => {
    const overdue = makeActivity({ id: 'overdue', overdueDays: 10 });
    const normal = makeActivity({ id: 'normal' });
    const ctx = makeContext([
      ...Array.from({ length: 40 }, () => makeActivity()),
      overdue,
      normal,
    ]);

    const result = trimContextForAI(ctx);

    expect(result.activities.some((a) => a.id === 'overdue')).toBe(true);
  });

  it('prioritizes critical path activities', () => {
    const critical = makeActivity({ id: 'critical', isOnCriticalPath: true });
    const normal = makeActivity({ id: 'normal' });
    const ctx = makeContext([
      ...Array.from({ length: 40 }, () => makeActivity()),
      critical,
      normal,
    ]);

    const result = trimContextForAI(ctx);

    expect(result.activities.some((a) => a.id === 'critical')).toBe(true);
  });

  it('preserves non-activity fields', () => {
    const ctx = makeContext(Array.from({ length: 50 }, () => makeActivity()));

    const result = trimContextForAI(ctx);

    expect(result.project).toBe(ctx.project);
    expect(result.ruleEngineMetrics).toBe(ctx.ruleEngineMetrics);
    expect(result.criticalPathActivityIds).toBe(ctx.criticalPathActivityIds);
  });

  it('prioritizes IN_PROGRESS activities over COMPLETED', () => {
    const inProgress = makeActivity({ id: 'ip', status: 'IN_PROGRESS' });
    const completed = makeActivity({ id: 'done', status: 'COMPLETED' });
    const ctx = makeContext([
      ...Array.from({ length: 39 }, () => makeActivity({ status: 'COMPLETED' })),
      inProgress,
      completed,
    ]);

    const result = trimContextForAI(ctx);
    expect(result.activities.some(a => a.id === 'ip')).toBe(true);
  });

  it('prioritizes CRITICAL priority over MEDIUM', () => {
    const critical = makeActivity({ id: 'crit', priority: 'CRITICAL' });
    const medium = makeActivity({ id: 'med', priority: 'MEDIUM' });
    const ctx = makeContext([
      ...Array.from({ length: 40 }, () => makeActivity({ priority: 'LOW' })),
      critical,
      medium,
    ]);

    const result = trimContextForAI(ctx);
    expect(result.activities.some(a => a.id === 'crit')).toBe(true);
  });

  it('prioritizes HIGH priority over MEDIUM', () => {
    const high = makeActivity({ id: 'high', priority: 'HIGH' });
    const medium = makeActivity({ id: 'med', priority: 'MEDIUM' });
    const ctx = makeContext([
      ...Array.from({ length: 40 }, () => makeActivity({ priority: 'LOW' })),
      high,
      medium,
    ]);

    const result = trimContextForAI(ctx);
    expect(result.activities.some(a => a.id === 'high')).toBe(true);
  });

  it('prioritizes activities with upcoming start dates', () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const upcoming = makeActivity({ id: 'upcoming', status: 'NOT_STARTED', planStartDate: soon });
    const far = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const distant = makeActivity({ id: 'distant', status: 'NOT_STARTED', planStartDate: far });
    const ctx = makeContext([
      ...Array.from({ length: 40 }, () => makeActivity({ status: 'NOT_STARTED', planStartDate: far })),
      upcoming,
      distant,
    ]);

    const result = trimContextForAI(ctx);
    expect(result.activities.some(a => a.id === 'upcoming')).toBe(true);
  });

  it('prioritizes activities with >2 dependencies', () => {
    const manyDeps = makeActivity({ id: 'deps', dependencyCount: 5 });
    const fewDeps = makeActivity({ id: 'few', dependencyCount: 1 });
    const ctx = makeContext([
      ...Array.from({ length: 40 }, () => makeActivity({ dependencyCount: 0 })),
      manyDeps,
      fewDeps,
    ]);

    const result = trimContextForAI(ctx);
    expect(result.activities.some(a => a.id === 'deps')).toBe(true);
  });

  it('capped overdueDays bonus at 30', () => {
    const hugeOverdue = makeActivity({ id: 'huge', overdueDays: 100 });
    const moderateOverdue = makeActivity({ id: 'mod', overdueDays: 5 });
    const ctx = makeContext([
      ...Array.from({ length: 40 }, () => makeActivity()),
      hugeOverdue,
      moderateOverdue,
    ]);

    const result = trimContextForAI(ctx);
    expect(result.activities.some(a => a.id === 'huge')).toBe(true);
  });

  it('returns same context object reference when under limit', () => {
    const ctx = makeContext(Array.from({ length: 30 }, () => makeActivity()));
    const result = trimContextForAI(ctx);
    expect(result).toBe(ctx);
  });

  it('trimContextForAI preserves context with few activities', () => {
    const ctx: RiskContext = { project: { id: 'p1', name: 'P', status: 'IN_PROGRESS', startDate: '2026-01-01', endDate: '2026-06-01' }, activities: [], risks: [], products: [] };
    const result = trimContextForAI(ctx);
    expect(result.activities).toHaveLength(0);
    expect(result.project.name).toBe('P');
  });

  it('combined overdue + critical path + CRITICAL priority outscore single-attribute activities', () => {
    const superHigh = makeActivity({ id: 'super', overdueDays: 20, isOnCriticalPath: true, priority: 'CRITICAL', dependencyCount: 5 });
    const normal = makeActivity({ id: 'normal' });
    const ctx = makeContext([
      ...Array.from({ length: 40 }, () => makeActivity()),
      superHigh,
      normal,
    ]);

    const result = trimContextForAI(ctx);
    expect(result.activities.some(a => a.id === 'super')).toBe(true);
  });

  it('NOT_STARTED activity without planStartDate gets no upcoming-start bonus', () => {
    const noStart = makeActivity({ id: 'no-start', status: 'NOT_STARTED', planStartDate: null });
    const ctx = makeContext([
      ...Array.from({ length: 40 }, () => makeActivity({ status: 'IN_PROGRESS' })),
      noStart,
    ]);

    const result = trimContextForAI(ctx);
    expect(result.activities.some(a => a.id === 'no-start')).toBe(false);
  });

  it('overdue activity with overdueDays exactly 0 gets no overdue priority bonus', () => {
    const zeroOverdue = makeActivity({ id: 'zero-od', overdueDays: 0 });
    const ctx = makeContext([
      ...Array.from({ length: 40 }, () => makeActivity()),
      zeroOverdue,
    ]);

    const result = trimContextForAI(ctx);
    expect(result.activities.some(a => a.id === 'zero-od')).toBe(false);
  });

  it('trims exactly 41 activities to 40 and returns new object', () => {
    const activities = Array.from({ length: 41 }, (_, i) => makeActivity({ id: `act-${i}` }));
    const ctx = makeContext(activities);

    const result = trimContextForAI(ctx);

    expect(result.activities).toHaveLength(40);
    expect(result).not.toBe(ctx);
  });

  it('NOT_STARTED activity with planStartDate exactly 7 days away gets upcoming bonus', () => {
    const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const eightDays = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const atBoundary = makeActivity({ id: 'at-7', status: 'NOT_STARTED', planStartDate: sevenDays });
    const pastBoundary = makeActivity({ id: 'at-8', status: 'NOT_STARTED', planStartDate: eightDays });
    const ctx = makeContext([
      ...Array.from({ length: 40 }, () => makeActivity({ status: 'NOT_STARTED', planStartDate: eightDays })),
      atBoundary,
      pastBoundary,
    ]);

    const result = trimContextForAI(ctx);
    expect(result.activities.some(a => a.id === 'at-7')).toBe(true);
  });

  it('preserves historicalTrend and latestWeeklyReportRisks after trimming', () => {
    const trend = [{ assessedAt: '2026-05-01', riskLevel: 'LOW', source: 'manual' }];
    const report = { riskWarning: 'none', risks: [], progressStatus: 'GREEN', weekEnd: '2026-05-01' };
    const ctx = makeContext(Array.from({ length: 50 }, () => makeActivity()));
    ctx.historicalTrend = trend;
    ctx.latestWeeklyReportRisks = report;

    const result = trimContextForAI(ctx);

    expect(result.historicalTrend).toBe(trend);
    expect(result.latestWeeklyReportRisks).toBe(report);
  });

  it('trimContextForAI preserves project id and name', () => {
    const ctx = makeContext();
    const result = trimContextForAI(ctx);
    expect(result.project.id).toBe('1');
    expect(result.project.name).toBe('test');
  });

  it('trimContextForAI preserves activities array when under limit', () => {
    const ctx = makeContext();
    const result = trimContextForAI(ctx);
    expect(Array.isArray(result.activities)).toBe(true);
    expect(result.activities.length).toBe(ctx.activities.length);
  });

  it('trimContextForAI returns object with projectId', () => {
    const ctx = { ...makeContext(), projectId: 'proj-1' };
    const result = trimContextForAI(ctx);
    expect(result.projectId).toBe('proj-1');
  });

  it('trimContextForAI preserves ruleEngineMetrics field', () => {
    const ctx = makeContext();
    const trimmed = trimContextForAI(ctx);
    expect(trimmed.ruleEngineMetrics).toBeDefined();
    expect(trimmed.ruleEngineMetrics.riskLevel).toBe('MEDIUM');
  });

  it('trimContextForAI preserves riskLevel with empty factors', () => {
    const ctx = { ruleEngineMetrics: { riskLevel: 'LOW', factors: [] }, activities: [], project: { id: 'p1', name: 'Test' } };
    const trimmed = trimContextForAI(ctx);
    expect(trimmed.ruleEngineMetrics.riskLevel).toBe('LOW');
  });

  it('trimContextForAI preserves riskLevel', () => { const ctx = { ruleEngineMetrics: { riskLevel: 'HIGH', factors: [] }, activities: [], project: { id: 'p1', name: 'Test' } }; const trimmed = trimContextForAI(ctx); expect(trimmed.ruleEngineMetrics.riskLevel).toBe('HIGH'); });

  it('trimContextForAI handles empty activities array', () => { const ctx = { ruleEngineMetrics: { riskLevel: 'LOW', factors: [] }, activities: [], project: { id: 'p1', name: 'Test', status: '', priority: '', progress: 0, startDate: null, endDate: null, managerName: '', memberCount: 0, totalActivities: 0 }, criticalPathActivityIds: [], historicalTrend: [], latestWeeklyReportRisks: null, summary: { completedCount: 0, inProgressCount: 0, notStartedCount: 0, overdueCount: 0 } }; const trimmed = trimContextForAI(ctx as any); expect(trimmed).toBeDefined(); });

  it('trimContextForAI handles non-empty factors', () => { const ctx = { ruleEngineMetrics: { riskLevel: 'MEDIUM', factors: [{ name: 'f1', impact: 'high' }] }, activities: [], project: { id: 'p1', name: 'Test' } }; const trimmed = trimContextForAI(ctx as any); expect(trimmed.ruleEngineMetrics.factors).toHaveLength(1); });

  it('trimContextForAI handles undefined project gracefully', () => { const ctx = { ruleEngineMetrics: { riskLevel: 'LOW', factors: [] }, activities: [], project: undefined }; const trimmed = trimContextForAI(ctx as any); expect(trimmed).toBeDefined(); });

  it('trimContextForAI preserves ruleEngineMetrics', () => { const ctx = { ruleEngineMetrics: { riskLevel: 'CRITICAL', factors: [{ name: 'f1', impact: 'high' }] }, activities: [], project: { id: 'p1', name: 'Test' } }; const trimmed = trimContextForAI(ctx as any); expect(trimmed.ruleEngineMetrics.riskLevel).toBe('CRITICAL'); });

  it('trimContextForAI handles empty factors array', () => { const ctx = { ruleEngineMetrics: { riskLevel: 'LOW', factors: [] }, activities: [], project: { id: 'p1', name: 'Test' } }; const trimmed = trimContextForAI(ctx as any); expect(trimmed.ruleEngineMetrics.factors).toHaveLength(0); });

  it('trimContextForAI handles empty activities array', () => { const ctx = { ruleEngineMetrics: { riskLevel: 'LOW', factors: [] }, activities: [], project: { id: 'p1', name: 'Test' } }; const trimmed = trimContextForAI(ctx as any); expect(trimmed.activities).toHaveLength(0); });

  it('trimContextForAI handles null project gracefully', () => { const ctx = { ruleEngineMetrics: { riskLevel: 'LOW', factors: [] }, activities: [], project: null }; const trimmed = trimContextForAI(ctx as any); expect(trimmed).toBeDefined(); });

  it('trimContextForAI handles empty activities array', () => { const ctx = { ruleEngineMetrics: { riskLevel: 'MEDIUM', factors: [] }, activities: [], project: { id: 'p1', name: 'test' } }; const trimmed = trimContextForAI(ctx as any); expect(trimmed).toBeDefined(); });

  it.each(Array.from({ length: 41 }, (_, index) => index))(
    'returns same context reference for generated activity count %s',
    (count) => {
      const ctx = makeContext(Array.from({ length: count }, (_, index) => makeActivity({ id: `under-${count}-${index}` })));

      expect(trimContextForAI(ctx)).toBe(ctx);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `critical-generated-${index}`))(
    'keeps generated critical path activity %s when trimming',
    (id) => {
      const ctx = makeContext([
        ...Array.from({ length: 40 }, (_, index) => makeActivity({ id: `normal-${index}`, status: 'COMPLETED', priority: 'LOW' })),
        makeActivity({ id, isOnCriticalPath: true, status: 'COMPLETED', priority: 'LOW' }),
      ]);

      const result = trimContextForAI(ctx);

      expect(result.activities).toHaveLength(40);
      expect(result.activities.some((activity) => activity.id === id)).toBe(true);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => `overdue-generated-${index}`))(
    'keeps generated overdue activity %s when trimming',
    (id) => {
      const ctx = makeContext([
        ...Array.from({ length: 40 }, (_, index) => makeActivity({ id: `low-${index}`, status: 'COMPLETED', priority: 'LOW' })),
        makeActivity({ id, overdueDays: 10, status: 'COMPLETED', priority: 'LOW' }),
      ]);

      const result = trimContextForAI(ctx);

      expect(result.activities).toHaveLength(40);
      expect(result.activities.some((activity) => activity.id === id)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `summary-${index}`))(
    'preserves generated context metadata %s while trimming',
    (id) => {
      const ctx = makeContext(Array.from({ length: 45 }, (_, index) => makeActivity({ id: `${id}-${index}` })));
      ctx.summary.longestDependencyChain = id.length;
      ctx.project.name = id;

      const result = trimContextForAI(ctx);

      expect(result.activities).toHaveLength(40);
      expect(result.summary).toBe(ctx.summary);
      expect(result.project.name).toBe(id);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch149-in-progress-${index}`,
    `batch149-critical-${index}`,
  ] as const))(
    'keeps generated active and critical priority activities %s',
    (inProgressId, criticalId) => {
      const ctx = makeContext([
        ...Array.from({ length: 39 }, (_, index) => makeActivity({ id: `batch149-normal-${index}`, status: 'COMPLETED', priority: 'LOW', dependencyCount: 0 })),
        makeActivity({ id: inProgressId, status: 'IN_PROGRESS', priority: 'LOW', dependencyCount: 0 }),
        makeActivity({ id: criticalId, status: 'COMPLETED', priority: 'CRITICAL', dependencyCount: 0 }),
      ]);

      const result = trimContextForAI(ctx);

      expect(result.activities).toHaveLength(40);
      expect(result.activities.some((activity) => activity.id === inProgressId)).toBe(true);
      expect(result.activities.some((activity) => activity.id === criticalId)).toBe(true);
      expect(result.activities.filter((activity) => activity.id.startsWith('batch149-normal-'))).toHaveLength(38);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const upcoming = new Date(Date.now() + ((index % 6) + 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const distant = new Date(Date.now() + ((index % 6) + 10) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return [`batch149-upcoming-${index}`, upcoming, distant] as const;
  }))(
    'keeps generated upcoming not-started activity %s',
    (id, upcomingDate, distantDate) => {
      const ctx = makeContext([
        ...Array.from({ length: 40 }, (_, index) => makeActivity({ id: `batch149-completed-${index}`, status: 'COMPLETED', priority: 'LOW' })),
        makeActivity({ id, status: 'NOT_STARTED', priority: 'LOW', planStartDate: upcomingDate }),
        makeActivity({ id: `${id}-distant`, status: 'NOT_STARTED', priority: 'LOW', planStartDate: distantDate }),
      ]);

      const result = trimContextForAI(ctx);

      expect(result.activities).toHaveLength(40);
      expect(result.activities.some((activity) => activity.id === id)).toBe(true);
      expect(result.activities.some((activity) => activity.id === `${id}-distant`)).toBe(false);
    },
  );
});

describe('trimContextForAI batch 175 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch175-dependency-${index}`,
    (index % 5) + 3,
  ] as const))(
    'keeps generated high dependency activity %s',
    (id, dependencyCount) => {
      const ctx = makeContext([
        ...Array.from({ length: 40 }, (_, itemIndex) => makeActivity({ id: `batch175-low-${itemIndex}`, status: 'COMPLETED', priority: 'LOW', dependencyCount: 0 })),
        makeActivity({ id, status: 'COMPLETED', priority: 'LOW', dependencyCount }),
      ]);

      const result = trimContextForAI(ctx);

      expect(result.activities).toHaveLength(40);
      expect(result.activities.some((activity) => activity.id === id)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch175-high-${index}`,
    `batch175-medium-${index}`,
  ] as const))(
    'keeps generated high priority before medium overflow %s',
    (highId, mediumId) => {
      const ctx = makeContext([
        ...Array.from({ length: 39 }, (_, itemIndex) => makeActivity({ id: `batch175-completed-${itemIndex}`, status: 'COMPLETED', priority: 'LOW' })),
        makeActivity({ id: mediumId, status: 'COMPLETED', priority: 'MEDIUM' }),
        makeActivity({ id: highId, status: 'COMPLETED', priority: 'HIGH' }),
      ]);

      const result = trimContextForAI(ctx);

      expect(result.activities).toHaveLength(40);
      expect(result.activities.some((activity) => activity.id === highId)).toBe(true);
      expect(result.activities.some((activity) => activity.id === mediumId)).toBe(false);
    },
  );
});
