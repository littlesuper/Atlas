import { PrismaClient, ActivityStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface RiskFactor {
  factor: string;
  severity: string;
  description: string;
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
      activities: {
        where: { parentId: null }, // 只统计顶级活动
      },
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

  // 2. 评估任务延期情况
  const delayedActivities = allActivities.filter((a) => a.status === ActivityStatus.DELAYED);
  const delayedRate = (delayedActivities.length / totalActivities) * 100;

  if (delayedRate > 30) {
    riskScore += 3;
    riskFactors.push({
      factor: '大量任务延期',
      severity: 'HIGH',
      description: `${delayedActivities.length}个任务延期，延期率${delayedRate.toFixed(0)}%`,
    });
    suggestions.push('优先处理延期任务，重新评估项目时间线');
  } else if (delayedRate > 10) {
    riskScore += 1;
    riskFactors.push({
      factor: '部分任务延期',
      severity: 'LOW',
      description: `${delayedActivities.length}个任务延期，延期率${delayedRate.toFixed(0)}%`,
    });
    suggestions.push('关注延期任务，避免影响扩大');
  }

  // 3. 评估逾期未完成任务
  const overdueActivities = allActivities.filter(
    (a) =>
      a.planEndDate &&
      a.planEndDate < now &&
      a.status !== ActivityStatus.COMPLETED &&
      a.status !== ActivityStatus.CANCELLED
  );

  if (overdueActivities.length > 3) {
    riskScore += 3;
    riskFactors.push({
      factor: '存在逾期任务',
      severity: 'HIGH',
      description: `${overdueActivities.length}个任务已逾期未完成`,
    });
    suggestions.push('立即处理逾期任务，调整资源分配');
  } else if (overdueActivities.length > 0) {
    riskScore += 1;
    riskFactors.push({
      factor: '存在逾期任务',
      severity: 'LOW',
      description: `${overdueActivities.length}个任务已逾期未完成`,
    });
    suggestions.push('优先处理逾期任务');
  }

  // 4. 评估资源分配
  const unassignedActivities = allActivities.filter(
    (a) =>
      !a.assigneeId &&
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
    });
    suggestions.push('尽快为任务分配负责人，明确责任');
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
