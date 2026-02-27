import { PrismaClient, ActivityStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 计算项目整体进度
 * 基于所有活动的状态自动计算
 *
 * 进度计算规则：
 * - COMPLETED（已完成）= 100%
 * - IN_PROGRESS（进行中）= 50%
 * - 其他状态（未开始/已取消）= 0%
 *
 * 优化：使用 Prisma count 查询替代加载所有记录到内存
 *
 * @param projectId 项目ID
 * @returns 项目平均进度（0-100，保留2位小数）
 */
export async function calculateProjectProgress(projectId: string): Promise<number> {
  const topLevelWhere = { projectId };

  // 使用并行 count 查询替代 findMany + 内存遍历
  const [totalCount, completedCount, inProgressCount] = await Promise.all([
    prisma.activity.count({ where: topLevelWhere }),
    prisma.activity.count({ where: { ...topLevelWhere, status: ActivityStatus.COMPLETED } }),
    prisma.activity.count({ where: { ...topLevelWhere, status: ActivityStatus.IN_PROGRESS } }),
  ]);

  // 如果没有活动，进度为0
  if (totalCount === 0) {
    return 0;
  }

  // COMPLETED = 100%, IN_PROGRESS = 50%, others = 0%
  const totalProgress = completedCount * 100 + inProgressCount * 50;

  // 计算平均进度（保留2位小数）
  const averageProgress = totalProgress / totalCount;
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
