/**
 * 风险评估上下文组装器
 * 将项目全量数据组装为结构化上下文，供 AI 分析
 */

import { PrismaClient, ActivityStatus } from '@prisma/client';
import { assessProjectRisk } from './riskEngine';
import { calculateCriticalPath } from './criticalPath';

const prisma = new PrismaClient();

export interface RiskContext {
  project: {
    id: string;
    name: string;
    status: string;
    priority: string;
    progress: number;
    startDate: string | null;
    endDate: string | null;
    managerName: string;
    memberCount: number;
    totalActivities: number;
  };
  ruleEngineMetrics: {
    riskLevel: string;
    riskScore: number;
    factors: Array<{ factor: string; severity: string; description: string; score?: number }>;
  };
  activities: Array<{
    id: string;
    name: string;
    type: string;
    phase: string | null;
    status: string;
    priority: string;
    assignees: string[];
    planStartDate: string | null;
    planEndDate: string | null;
    planDuration: number | null;
    startDate: string | null;
    endDate: string | null;
    duration: number | null;
    dependencyCount: number;
    isOnCriticalPath: boolean;
    overdueDays?: number;
  }>;
  criticalPathActivityIds: string[];
  historicalTrend: Array<{ assessedAt: string; riskLevel: string; source: string }>;
  latestWeeklyReportRisks: {
    riskWarning: string | null;
    risks: any;
    progressStatus: string;
    weekEnd: string;
  } | null;
  summary: {
    completedCount: number;
    inProgressCount: number;
    notStartedCount: number;
    overdueCount: number;
    unassignedCount: number;
    avgDurationDeviation: number | null;
    longestDependencyChain: number;
    crossProjectConflictCount: number;
  };
}

/**
 * 组装完整风险评估上下文
 */
export async function buildRiskContext(projectId: string): Promise<RiskContext> {
  // Parallel data fetching
  const [project, allActivities, members, historicalAssessments, latestReport, ruleEngineResult] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: { manager: { select: { realName: true } } },
    }),
    prisma.activity.findMany({
      where: { projectId },
      include: {
        executors: {
          include: { user: { select: { id: true, realName: true } } },
        },
      },
    }),
    prisma.projectMember.count({ where: { projectId } }),
    prisma.riskAssessment.findMany({
      where: { projectId },
      orderBy: { assessedAt: 'desc' },
      take: 10,
      select: { assessedAt: true, riskLevel: true, source: true },
    }),
    prisma.weeklyReport.findFirst({
      where: { projectId, status: { in: ['SUBMITTED', 'ARCHIVED'] } },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
      select: { riskWarning: true, risks: true, progressStatus: true, weekEnd: true },
    }),
    assessProjectRisk(projectId),
  ]);

  if (!project) throw new Error('项目不存在');

  const now = new Date();

  // Calculate critical path
  const activitiesForCPM = allActivities.map(a => ({
    id: a.id,
    planDuration: a.planDuration,
    dependencies: a.dependencies,
  }));
  const criticalPathIds = calculateCriticalPath(activitiesForCPM);
  const criticalPathSet = new Set(criticalPathIds);

  // Calculate summary stats
  const completedCount = allActivities.filter(a => a.status === ActivityStatus.COMPLETED).length;
  const inProgressCount = allActivities.filter(a => a.status === ActivityStatus.IN_PROGRESS).length;
  const notStartedCount = allActivities.filter(a => a.status === ActivityStatus.NOT_STARTED).length;

  const overdueActivities = allActivities.filter(
    a => a.planEndDate && a.planEndDate < now && a.status !== ActivityStatus.COMPLETED && a.status !== ActivityStatus.CANCELLED
  );

  const unassignedCount = allActivities.filter(
    a => a.executors.length === 0 && a.status !== ActivityStatus.COMPLETED && a.status !== ActivityStatus.CANCELLED
  ).length;

  // Average duration deviation
  const completedWithDuration = allActivities.filter(
    a => a.status === ActivityStatus.COMPLETED && a.duration != null && a.planDuration != null && a.planDuration > 0
  );
  const avgDurationDeviation = completedWithDuration.length > 0
    ? completedWithDuration.reduce((sum, a) => sum + ((a.duration! - a.planDuration!) / a.planDuration!) * 100, 0) / completedWithDuration.length
    : null;

  // Longest dependency chain (from rule engine)
  const chainFactor = ruleEngineResult.riskFactors.find(f => f.factor.includes('依赖链'));
  const longestChainMatch = chainFactor?.description.match(/(\d+)/);
  const longestDependencyChain = longestChainMatch ? parseInt(longestChainMatch[1]) : 0;

  // Cross-project conflict count
  const conflictFactor = ruleEngineResult.riskFactors.find(f => f.factor.includes('跨项目'));
  const conflictMatch = conflictFactor?.description.match(/(\d+)/);
  const crossProjectConflictCount = conflictMatch ? parseInt(conflictMatch[1]) : 0;

  // Build activities array
  const activities = allActivities.map(a => {
    const depCount = Array.isArray(a.dependencies) ? (a.dependencies as any[]).length : 0;
    let overdueDays: number | undefined;
    if (a.planEndDate && a.planEndDate < now && a.status !== ActivityStatus.COMPLETED && a.status !== ActivityStatus.CANCELLED) {
      overdueDays = Math.ceil((now.getTime() - a.planEndDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      phase: a.phase,
      status: a.status,
      priority: a.priority,
      assignees: a.executors.map(executor => executor.user.realName),
      planStartDate: a.planStartDate?.toISOString().slice(0, 10) || null,
      planEndDate: a.planEndDate?.toISOString().slice(0, 10) || null,
      planDuration: a.planDuration,
      startDate: a.startDate?.toISOString().slice(0, 10) || null,
      endDate: a.endDate?.toISOString().slice(0, 10) || null,
      duration: a.duration,
      dependencyCount: depCount,
      isOnCriticalPath: criticalPathSet.has(a.id),
      overdueDays,
    };
  });

  return {
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      priority: project.priority,
      progress: project.progress,
      startDate: project.startDate?.toISOString().slice(0, 10) || null,
      endDate: project.endDate?.toISOString().slice(0, 10) || null,
      managerName: project.manager.realName,
      memberCount: members + 1, // +1 for manager
      totalActivities: allActivities.length,
    },
    ruleEngineMetrics: {
      riskLevel: ruleEngineResult.riskLevel,
      riskScore: ruleEngineResult.riskScore,
      factors: ruleEngineResult.riskFactors.map(f => ({
        factor: f.factor,
        severity: f.severity,
        description: f.description,
        score: f.score,
      })),
    },
    activities,
    criticalPathActivityIds: criticalPathIds,
    historicalTrend: historicalAssessments.map(a => ({
      assessedAt: a.assessedAt.toISOString(),
      riskLevel: a.riskLevel,
      source: a.source,
    })),
    latestWeeklyReportRisks: latestReport ? {
      riskWarning: latestReport.riskWarning,
      risks: latestReport.risks,
      progressStatus: latestReport.progressStatus,
      weekEnd: latestReport.weekEnd.toISOString().slice(0, 10),
    } : null,
    summary: {
      completedCount,
      inProgressCount,
      notStartedCount,
      overdueCount: overdueActivities.length,
      unassignedCount,
      avgDurationDeviation: avgDurationDeviation ? Math.round(avgDurationDeviation * 10) / 10 : null,
      longestDependencyChain,
      crossProjectConflictCount,
    },
  };
}

/**
 * 智能裁剪上下文以适配 AI token 限制（目标 ~4000 tokens）
 * 优先保留：高风险活动、关键路径活动、进行中活动、逾期活动
 */
export function trimContextForAI(context: RiskContext): RiskContext {
  const MAX_ACTIVITIES = 40;

  if (context.activities.length <= MAX_ACTIVITIES) return context;

  // Prioritize activities
  const scored = context.activities.map(a => {
    let priority = 0;
    if (a.overdueDays) priority += 10 + Math.min(a.overdueDays, 30);
    if (a.isOnCriticalPath) priority += 8;
    if (a.status === 'IN_PROGRESS') priority += 5;
    if (a.status === 'NOT_STARTED' && a.planStartDate) {
      const daysToStart = Math.ceil((new Date(a.planStartDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysToStart <= 7) priority += 4;
    }
    if (a.priority === 'CRITICAL') priority += 3;
    if (a.priority === 'HIGH') priority += 2;
    if (a.dependencyCount > 2) priority += 1;
    return { activity: a, priority };
  });

  scored.sort((a, b) => b.priority - a.priority);
  const kept = scored.slice(0, MAX_ACTIVITIES).map(s => s.activity);

  return {
    ...context,
    activities: kept,
  };
}
