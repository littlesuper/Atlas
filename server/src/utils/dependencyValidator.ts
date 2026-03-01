/**
 * 循环依赖检测器
 * 使用 DFS 三色标记法（WHITE/GRAY/BLACK）检测依赖图是否成环
 */
import { PrismaClient } from '@prisma/client';

enum Color {
  WHITE = 0, // 未访问
  GRAY = 1,  // 正在访问（在当前 DFS 路径上）
  BLACK = 2, // 已完成
}

interface DependencyInput {
  id: string;
  type: string;
  lag?: number;
}

/**
 * 检测如果将 newDeps 设置为 activityId 的依赖，是否会产生循环依赖
 *
 * @param projectId 项目 ID
 * @param activityId 当前活动 ID
 * @param newDeps 即将设置的新依赖列表
 * @param prisma Prisma 客户端实例
 * @returns true 表示存在循环依赖
 */
export async function detectCircularDependency(
  projectId: string,
  activityId: string,
  newDeps: DependencyInput[],
  prisma: PrismaClient
): Promise<boolean> {
  // 查询项目内所有活动的依赖关系，构建邻接表
  const allActivities = await prisma.activity.findMany({
    where: { projectId },
    select: { id: true, dependencies: true },
  });

  // 构建邻接表：activityId → 它依赖的活动 ID 列表（即该活动的前置活动）
  // 依赖方向：如果 A 依赖 B，则 A → B（A 的前置是 B）
  // 循环检测方向：如果 A 依赖 B，B 依赖 C，C 依赖 A → 成环
  // 邻接表存储：节点 → 它所依赖的前置节点（outgoing edges in dependency graph）
  const adjList = new Map<string, string[]>();

  for (const activity of allActivities) {
    const deps = activity.dependencies as DependencyInput[] | null;
    if (deps && Array.isArray(deps) && deps.length > 0) {
      // 对于当前要修改的活动，跳过旧依赖（后面用 newDeps 替代）
      if (activity.id === activityId) continue;
      adjList.set(activity.id, deps.map(d => d.id));
    }
  }

  // 应用新依赖
  if (newDeps.length > 0) {
    adjList.set(activityId, newDeps.map(d => d.id));
  }

  // DFS 三色标记检测环
  const color = new Map<string, Color>();
  for (const activity of allActivities) {
    color.set(activity.id, Color.WHITE);
  }

  function dfs(nodeId: string): boolean {
    color.set(nodeId, Color.GRAY);

    const neighbors = adjList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const c = color.get(neighbor);
      if (c === Color.GRAY) {
        // 发现环：邻居节点在当前 DFS 路径上
        return true;
      }
      if (c === Color.WHITE) {
        if (dfs(neighbor)) return true;
      }
    }

    color.set(nodeId, Color.BLACK);
    return false;
  }

  // 从所有白色节点开始 DFS
  for (const activity of allActivities) {
    if (color.get(activity.id) === Color.WHITE) {
      if (dfs(activity.id)) return true;
    }
  }

  return false;
}
