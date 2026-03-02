/**
 * 关键路径计算（CPM - Critical Path Method）
 * 从 activities.ts 提取为独立函数，供风险评估和活动路由共用
 */

interface ActivityForCPM {
  id: string;
  planDuration: number | null;
  dependencies: any; // Json field
}

/**
 * 计算关键路径，返回关键活动 ID 数组
 */
export function calculateCriticalPath(activities: ActivityForCPM[]): string[] {
  if (activities.length === 0) return [];

  // Build dependency graph
  const actMap = new Map(activities.map(a => [a.id, a]));
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();

  for (const a of activities) {
    if (!a.dependencies || !Array.isArray(a.dependencies)) continue;
    for (const dep of a.dependencies as any[]) {
      if (!actMap.has(dep.id)) continue;
      const succ = successors.get(dep.id);
      if (succ) succ.push(a.id);
      else successors.set(dep.id, [a.id]);
      const pred = predecessors.get(a.id);
      if (pred) pred.push(dep.id);
      else predecessors.set(a.id, [dep.id]);
    }
  }

  // Duration map
  const duration = new Map<string, number>();
  for (const a of activities) {
    duration.set(a.id, a.planDuration || 1);
  }

  // Topological sort (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  for (const a of activities) {
    inDegree.set(a.id, (predecessors.get(a.id) || []).length);
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topoOrder.push(id);
    for (const succId of (successors.get(id) || [])) {
      const newDeg = (inDegree.get(succId) || 1) - 1;
      inDegree.set(succId, newDeg);
      if (newDeg === 0) queue.push(succId);
    }
  }

  // Forward pass: Early Start (ES) and Early Finish (EF)
  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  for (const id of topoOrder) {
    const preds = predecessors.get(id) || [];
    const earlyStart = preds.length > 0 ? Math.max(...preds.map(p => ef.get(p) || 0)) : 0;
    es.set(id, earlyStart);
    ef.set(id, earlyStart + (duration.get(id) || 1));
  }

  // Backward pass: Late Start (LS) and Late Finish (LF)
  const projectEnd = Math.max(...activities.map(a => ef.get(a.id) || 0));
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();

  for (const id of topoOrder.slice().reverse()) {
    const succs = successors.get(id) || [];
    const lateFinish = succs.length > 0 ? Math.min(...succs.map(s => ls.get(s) || projectEnd)) : projectEnd;
    lf.set(id, lateFinish);
    ls.set(id, lateFinish - (duration.get(id) || 1));
  }

  // Critical path: float = 0
  return activities
    .filter(a => {
      const float = (ls.get(a.id) || 0) - (es.get(a.id) || 0);
      return float === 0;
    })
    .map(a => a.id);
}
