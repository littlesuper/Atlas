import { PrismaClient, ActivityStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 计算项目整体进度
 * 基于所有活动的状态，按 planDuration（计划工期）加权平均
 *
 * 进度计算规则：
 * - COMPLETED（已完成）= 100%
 * - IN_PROGRESS（进行中）= 50%
 * - 其他状态（未开始/已取消）= 0%
 *
 * 加权规则：
 * - 每个活动的权重 = planDuration（工作日数），无 planDuration 的活动 fallback 权重为 1
 * - 最终进度 = Σ(活动进度 × 权重) / Σ(权重)
 *
 * @param projectId 项目ID
 * @returns 项目加权平均进度（0-100，保留2位小数）
 */
export async function calculateProjectProgress(projectId: string): Promise<number> {
  const activities = await prisma.activity.findMany({
    where: { projectId },
    select: { status: true, planDuration: true },
  });

  if (activities.length === 0) {
    return 0;
  }

  let totalWeight = 0;
  let weightedProgress = 0;

  for (const activity of activities) {
    const weight = activity.planDuration && activity.planDuration > 0 ? activity.planDuration : 1;
    let progress = 0;

    if (activity.status === ActivityStatus.COMPLETED) {
      progress = 100;
    } else if (activity.status === ActivityStatus.IN_PROGRESS) {
      progress = 50;
    }

    totalWeight += weight;
    weightedProgress += progress * weight;
  }

  const averageProgress = weightedProgress / totalWeight;
  return Math.round(averageProgress * 100) / 100;
}

/**
 * 自动更新项目进度
 * 在活动创建、更新、删除时调用
 *
 * @param projectId 项目ID
 */
export async function updateProjectProgress(projectId: string): Promise<void> {
  const progress = await calculateProjectProgress(projectId);

  await prisma.project.update({
    where: { id: projectId },
    data: { progress },
  });
}
