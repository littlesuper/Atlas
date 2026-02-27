import { PrismaClient, ActivityStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface TriggeredActivity {
  id: string;
  name: string;
  detail?: string;
}

interface RiskFactor {
  factor: string;
  severity: string;
  description: string;
  triggeredActivities?: TriggeredActivity[];
}

interface RiskAssessmentResult {
  riskLevel: string;
  riskFactors: RiskFactor[];
  suggestions: string[];
}

/**
 * 基于规则的项目风险评估引擎
 * 评估因素：进度滞后、任务延期、逾期任务、资源分配
 *
 * @param projectId 项目ID
 * @returns 风险评估结果
 */
export async function assessProjectRisk(projectId: string): Promise<RiskAssessmentResult> {
  // 获取项目信息
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      activities: true,
    },
  });

  if (!project) {
    throw new Error('项目不存在');
  }

  const riskFactors: RiskFactor[] = [];
  const suggestions: string[] = [];
  let riskScore = 0;

  // 获取所有活动（包括子活动）
  const allActivities = await prisma.activity.findMany({
    where: { projectId },
    include: { assignees: { select: { id: true, realName: true } } },
  });

  const totalActivities = allActivities.length;
  if (totalActivities === 0) {
    return {
      riskLevel: 'LOW',
      riskFactors: [
        {
          factor: '项目初期',
          severity: 'LOW',
          description: '项目暂无活动，处于初期阶段',
        },
      ],
      suggestions: ['建议尽快创建项目活动和任务'],
    };
  }

  // 1. 评估进度滞后
  const now = new Date();
  if (project.startDate && project.endDate) {
    const totalDays = Math.ceil(
      (project.endDate.getTime() - project.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const passedDays = Math.ceil(
      (now.getTime() - project.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const timeProgress = Math.min(100, Math.max(0, (passedDays / totalDays) * 100));
    const actualProgress = project.progress;
    const progressGap = timeProgress - actualProgress;

    if (progressGap > 30) {
      riskScore += 3;
      riskFactors.push({
        factor: '进度严重滞后',
        severity: 'HIGH',
        description: `时间进度${timeProgress.toFixed(0)}%，实际进度${actualProgress.toFixed(0)}%，差距超过30%`,
      });
      suggestions.push('建议召开项目紧急评审会议，分析滞后原因并制定追赶计划');
    } else if (progressGap > 15) {
      riskScore += 2;
      riskFactors.push({
        factor: '进度滞后',
        severity: 'MEDIUM',
        description: `时间进度${timeProgress.toFixed(0)}%，实际进度${actualProgress.toFixed(0)}%，差距超过15%`,
      });
      suggestions.push('分析延期任务原因，制定追赶计划');
    }
  }

  // 2. 评估任务延期率（计划结束日期已过但未完成的活动占比）
  const activitiesWithPlanEnd = allActivities.filter(
    (a) => a.planEndDate && a.status !== ActivityStatus.CANCELLED
  );
  if (activitiesWithPlanEnd.length > 0) {
    const delayedActivities = activitiesWithPlanEnd.filter(
      (a) =>
        a.planEndDate! < now &&
        a.status !== ActivityStatus.COMPLETED
    );
    const delayRate = (delayedActivities.length / activitiesWithPlanEnd.length) * 100;

    const delayedTriggered: TriggeredActivity[] = delayedActivities.slice(0, 20).map((a) => ({
      id: a.id,
      name: a.name,
      detail: `计划截止: ${a.planEndDate!.toISOString().slice(0, 10)}`,
    }));

    if (delayRate > 30) {
      riskScore += 3;
      riskFactors.push({
        factor: '大量任务延期',
        severity: 'HIGH',
        description: `${delayedActivities.length}个任务延期，延期率${delayRate.toFixed(0)}%，超过30%`,
        triggeredActivities: delayedTriggered,
      });
      suggestions.push('大量任务延期，建议重新评估项目计划并调整排期');
    } else if (delayRate > 10) {
      riskScore += 1;
      riskFactors.push({
        factor: '部分任务延期',
        severity: 'MEDIUM',
        description: `${delayedActivities.length}个任务延期，延期率${delayRate.toFixed(0)}%，超过10%`,
        triggeredActivities: delayedTriggered,
      });
      suggestions.push('关注延期任务，分析延期原因并制定应对措施');
    }
  }

  // 3. 评估逾期未完成任务
  const overdueActivities = allActivities.filter(
    (a) =>
      a.planEndDate &&
      a.planEndDate < now &&
      a.status !== ActivityStatus.COMPLETED &&
      a.status !== ActivityStatus.CANCELLED
  );

  const overdueTriggered: TriggeredActivity[] = overdueActivities.slice(0, 20).map((a) => {
    const overdueDays = Math.ceil((now.getTime() - a.planEndDate!.getTime()) / (1000 * 60 * 60 * 24));
    return { id: a.id, name: a.name, detail: `逾期 ${overdueDays} 天` };
  });

  if (overdueActivities.length > 3) {
    riskScore += 3;
    riskFactors.push({
      factor: '存在逾期任务',
      severity: 'HIGH',
      description: `${overdueActivities.length}个任务已逾期未完成`,
      triggeredActivities: overdueTriggered,
    });
    suggestions.push('立即处理逾期任务，调整资源分配');
  } else if (overdueActivities.length > 0) {
    riskScore += 1;
    riskFactors.push({
      factor: '存在逾期任务',
      severity: 'LOW',
      description: `${overdueActivities.length}个任务已逾期未完成`,
      triggeredActivities: overdueTriggered,
    });
    suggestions.push('优先处理逾期任务');
  }

  // 4. 评估资源分配
  const unassignedActivities = allActivities.filter(
    (a) =>
      a.assignees.length === 0 &&
      a.status !== ActivityStatus.COMPLETED &&
      a.status !== ActivityStatus.CANCELLED
  );
  const unassignedRate = (unassignedActivities.length / totalActivities) * 100;

  if (unassignedRate > 30) {
    riskScore += 2;
    riskFactors.push({
      factor: '资源分配不足',
      severity: 'MEDIUM',
      description: `${unassignedActivities.length}个任务未分配负责人，占比${unassignedRate.toFixed(0)}%`,
      triggeredActivities: unassignedActivities.slice(0, 20).map((a) => ({
        id: a.id,
        name: a.name,
        detail: a.status,
      })),
    });
    suggestions.push('尽快为任务分配负责人，明确责任');
  }

  // 5. 工期偏差率（已完成活动的实际工期 vs 计划工期）
  const completedWithDuration = allActivities.filter(
    (a) =>
      a.status === ActivityStatus.COMPLETED &&
      a.duration != null &&
      a.planDuration != null &&
      a.planDuration > 0
  );
  if (completedWithDuration.length > 0) {
    const totalDeviation = completedWithDuration.reduce((sum, a) => {
      return sum + ((a.duration! - a.planDuration!) / a.planDuration!) * 100;
    }, 0);
    const avgDeviation = totalDeviation / completedWithDuration.length;

    const deviationTriggered: TriggeredActivity[] = completedWithDuration
      .filter((a) => ((a.duration! - a.planDuration!) / a.planDuration!) * 100 > 15)
      .slice(0, 20)
      .map((a) => ({
        id: a.id,
        name: a.name,
        detail: `计划 ${a.planDuration} 天，实际 ${a.duration} 天`,
      }));

    if (avgDeviation > 30) {
      riskScore += 2;
      riskFactors.push({
        factor: '工期偏差严重',
        severity: 'HIGH',
        description: `已完成活动平均工期偏差${avgDeviation.toFixed(0)}%，超过30%`,
        triggeredActivities: deviationTriggered,
      });
      suggestions.push('工期估算偏差较大，建议复盘估算方法并引入历史数据参考');
    } else if (avgDeviation > 15) {
      riskScore += 1;
      riskFactors.push({
        factor: '工期偏差偏高',
        severity: 'MEDIUM',
        description: `已完成活动平均工期偏差${avgDeviation.toFixed(0)}%，超过15%`,
        triggeredActivities: deviationTriggered,
      });
      suggestions.push('关注工期偏差趋势，优化排期估算准确性');
    }
  }

  // 6. 依赖链风险（解析 dependencies JSON 字段）
  const activityMap = new Map(allActivities.map((a) => [a.id, a]));
  const depCache = new Map<string, number>();

  function getMaxChainLength(activityId: string, visited: Set<string>): number {
    if (depCache.has(activityId)) return depCache.get(activityId)!;
    if (visited.has(activityId)) return 0; // 避免循环
    visited.add(activityId);

    const activity = activityMap.get(activityId);
    if (!activity || !activity.dependencies) return 0;

    let deps: Array<{ id: string }> = [];
    try {
      const raw = typeof activity.dependencies === 'string'
        ? JSON.parse(activity.dependencies)
        : activity.dependencies;
      if (Array.isArray(raw)) deps = raw;
    } catch {
      // 无效 JSON，跳过
    }

    let maxLen = 0;
    for (const dep of deps) {
      if (dep.id && activityMap.has(dep.id)) {
        const len = 1 + getMaxChainLength(dep.id, visited);
        if (len > maxLen) maxLen = len;
      }
    }

    visited.delete(activityId);
    depCache.set(activityId, maxLen);
    return maxLen;
  }

  let longestChain = 0;
  for (const a of allActivities) {
    const chainLen = getMaxChainLength(a.id, new Set());
    if (chainLen > longestChain) longestChain = chainLen;
  }

  if (longestChain > 5) {
    riskScore += 2;
    riskFactors.push({
      factor: '依赖链过长',
      severity: 'HIGH',
      description: `最长依赖链长度为${longestChain}，超过5级`,
    });
    suggestions.push('简化依赖关系，考虑将长链任务拆分或并行化');
  } else if (longestChain > 3) {
    riskScore += 1;
    riskFactors.push({
      factor: '存在较长依赖链',
      severity: 'MEDIUM',
      description: `最长依赖链长度为${longestChain}，超过3级`,
    });
    suggestions.push('关注依赖链上的关键活动，避免连锁延期');
  }

  // 7. 阶段集中度风险
  const inProgressActivities = allActivities.filter(
    (a) => a.status === ActivityStatus.IN_PROGRESS && a.phase
  );
  if (inProgressActivities.length > 0) {
    const phaseCounts: Record<string, number> = {};
    for (const a of inProgressActivities) {
      phaseCounts[a.phase!] = (phaseCounts[a.phase!] || 0) + 1;
    }
    const maxPhaseCount = Math.max(...Object.values(phaseCounts));
    const maxPhase = Object.entries(phaseCounts).find(([, v]) => v === maxPhaseCount)?.[0];
    const concentration = maxPhaseCount / inProgressActivities.length;

    if (concentration > 0.7 && inProgressActivities.length >= 3) {
      const phaseActivities = inProgressActivities.filter((a) => a.phase === maxPhase);
      riskScore += 1;
      riskFactors.push({
        factor: '活动集中在单一阶段',
        severity: 'MEDIUM',
        description: `${maxPhase}阶段占进行中活动的${(concentration * 100).toFixed(0)}%（${maxPhaseCount}/${inProgressActivities.length}）`,
        triggeredActivities: phaseActivities.slice(0, 20).map((a) => ({
          id: a.id,
          name: a.name,
          detail: maxPhase!,
        })),
      });
      suggestions.push('活动过于集中在单一阶段，建议评估是否可以提前启动下一阶段任务');
    }
  }

  // 8. 跨项目资源冲突
  const assigneeIds = new Set<string>();
  for (const a of allActivities) {
    if (
      a.status !== ActivityStatus.COMPLETED &&
      a.status !== ActivityStatus.CANCELLED
    ) {
      for (const assignee of a.assignees) {
        assigneeIds.add(assignee.id);
      }
    }
  }

  // 构建 userId -> realName 映射
  const userNameMap = new Map<string, string>();
  for (const a of allActivities) {
    for (const assignee of a.assignees) {
      if (!userNameMap.has(assignee.id)) {
        userNameMap.set(assignee.id, (assignee as any).realName || assignee.id);
      }
    }
  }

  if (assigneeIds.size > 0) {
    const conflictUserDetails: TriggeredActivity[] = [];
    for (const userId of assigneeIds) {
      const otherProjectActivities = await prisma.activity.count({
        where: {
          projectId: { not: projectId },
          status: { in: [ActivityStatus.IN_PROGRESS, ActivityStatus.NOT_STARTED] },
          assignees: { some: { id: userId } },
        },
      });
      if (otherProjectActivities > 0) {
        conflictUserDetails.push({
          id: userId,
          name: userNameMap.get(userId) || userId,
          detail: `在其他项目有 ${otherProjectActivities} 个活跃任务`,
        });
      }
    }

    if (conflictUserDetails.length > 3) {
      riskScore += 2;
      riskFactors.push({
        factor: '多人跨项目资源冲突',
        severity: 'HIGH',
        description: `${conflictUserDetails.length}人同时参与其他项目的活跃任务`,
        triggeredActivities: conflictUserDetails.slice(0, 20),
      });
      suggestions.push('多名成员存在跨项目资源冲突，建议协调各项目排期避免资源争抢');
    } else if (conflictUserDetails.length > 0) {
      riskScore += 1;
      riskFactors.push({
        factor: '存在跨项目资源冲突',
        severity: 'LOW',
        description: `${conflictUserDetails.length}人同时参与其他项目的活跃任务`,
        triggeredActivities: conflictUserDetails,
      });
      suggestions.push('关注跨项目人员的工作负载，避免资源过载');
    }
  }

  // 确定风险等级
  let riskLevel: string;
  if (riskScore >= 7) {
    riskLevel = 'CRITICAL';
  } else if (riskScore >= 4) {
    riskLevel = 'HIGH';
  } else if (riskScore >= 2) {
    riskLevel = 'MEDIUM';
  } else {
    riskLevel = 'LOW';
  }

  // 如果没有风险因素，添加一个正面评价
  if (riskFactors.length === 0) {
    riskFactors.push({
      factor: '项目运行正常',
      severity: 'LOW',
      description: '未发现明显风险因素',
    });
    suggestions.push('继续保持当前节奏，定期监控项目进展');
  }

  return {
    riskLevel,
    riskFactors,
    suggestions,
  };
}
