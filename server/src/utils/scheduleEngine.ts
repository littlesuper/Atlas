/**
 * 排期助手 · 纯逻辑层
 *
 * 设计原则（与 docs/specs/ai-scheduling-beacon/00 §3 一致）：
 * - 本文件 100% 纯函数，无任何 DB / 网络 / LLM 调用
 * - 写入路径（routes/activities/shared.ts cascadeUpdateDependents）与
 *   对话式排期助手（routes/scheduleAssistant）共用此处的算法
 * - 干跑 = 实算：同一份 (snapshot, operations) → 同一份结果
 */
import { resolveActivityDates, DependencyInput, PredecessorData } from './dependencyScheduler';
import { offsetWorkdays, calculateWorkdays } from './workday';

export type ActivitySnapshotType = 'TASK' | 'MILESTONE' | 'PHASE';

export interface ActivitySnapshot {
  id: string;
  name: string;
  type: ActivitySnapshotType;
  planStartDate: Date | null;
  planEndDate: Date | null;
  planDuration: number | null;
  /** "硬节点"——计划完成不得晚于此日期；schema 加字段在 step-2 */
  hardConstraintDate: Date | null;
  dependencies: DependencyInput[];
}

export interface ProjectSnapshot {
  projectId: string;
  projectEndDate: Date | null;
  activities: ActivitySnapshot[];
}

export type ScheduleOperation =
  | { type: 'shift_activity'; activityId: string; deltaDays: number }
  | { type: 'set_planned'; activityId: string; field: 'start' | 'end'; date: string }
  | { type: 'set_duration'; activityId: string; durationDays: number }
  | {
      type: 'add_dependency';
      activityId: string;
      dependsOnId: string;
      depType?: string;
      lag?: number;
    }
  | { type: 'remove_dependency'; activityId: string; dependsOnId: string };

export interface ActivityDateState {
  start: Date | null;
  end: Date | null;
}

export interface ActivityDiff {
  activityId: string;
  name: string;
  before: ActivityDateState;
  after: ActivityDateState;
  changed: boolean;
}

export interface ScheduleDiff {
  items: ActivityDiff[];
}

export interface ScheduleDryRunResult {
  snapshot: ProjectSnapshot;
  diff: ScheduleDiff;
  changedIds: Set<string>;
}

export class UnknownActivityIdError extends Error {
  constructor(public readonly activityId: string) {
    super(`未知活动 id：${activityId}`);
    this.name = 'UnknownActivityIdError';
  }
}

// ─── 内部工具 ─────────────────────────────────────────────

function cloneActivities(activities: readonly ActivitySnapshot[]): ActivitySnapshot[] {
  return activities.map((a) => ({
    ...a,
    dependencies: a.dependencies.map((d) => ({ ...d })),
  }));
}

function buildReverseDeps(activities: readonly ActivitySnapshot[]): Map<string, string[]> {
  const reverseDeps = new Map<string, string[]>();
  for (const act of activities) {
    for (const dep of act.dependencies) {
      const list = reverseDeps.get(dep.id);
      if (list) list.push(act.id);
      else reverseDeps.set(dep.id, [act.id]);
    }
  }
  return reverseDeps;
}

function predecessorsFor(
  activity: ActivitySnapshot,
  byId: Map<string, ActivitySnapshot>
): PredecessorData[] {
  return activity.dependencies
    .map((dep): PredecessorData | null => {
      const p = byId.get(dep.id);
      if (!p) return null;
      return {
        id: p.id,
        planStartDate: p.planStartDate,
        planEndDate: p.planEndDate,
        planDuration: p.planDuration,
      };
    })
    .filter((p): p is PredecessorData => p !== null);
}

function recomputeFromDeps(
  activity: ActivitySnapshot,
  byId: Map<string, ActivitySnapshot>
): boolean {
  if (activity.dependencies.length === 0) return false;
  const preds = predecessorsFor(activity, byId);
  const resolved = resolveActivityDates(activity.dependencies, preds, activity.planDuration);

  let changed = false;
  if (
    resolved.planStartDate &&
    (!activity.planStartDate ||
      resolved.planStartDate.getTime() !== activity.planStartDate.getTime())
  ) {
    activity.planStartDate = resolved.planStartDate;
    changed = true;
  }
  if (
    resolved.planEndDate &&
    (!activity.planEndDate || resolved.planEndDate.getTime() !== activity.planEndDate.getTime())
  ) {
    activity.planEndDate = resolved.planEndDate;
    changed = true;
  }
  if (resolved.planDuration !== undefined && resolved.planDuration !== activity.planDuration) {
    activity.planDuration = resolved.planDuration;
    changed = true;
  }
  return changed;
}

function shiftCalendarDays(date: Date, deltaDays: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + deltaDays);
  return result;
}

function parseISODate(iso: string): Date {
  // 接受 'YYYY-MM-DD' 或带时间的 ISO；统一按 UTC 0 点
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(`${iso}T00:00:00.000Z`);
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`无法解析日期：${iso}`);
  }
  return d;
}

// ─── 主要导出 ─────────────────────────────────────────────

/**
 * 在给定 snapshot 上沿 reverse-deps 做 BFS 级联，重算受影响活动的计划日期。
 * 不变更入参；返回新 snapshot 与变更集合。
 *
 * 注意：这只是"级联"，不应用任何用户操作；用户操作请走 dryRunSchedule。
 */
export function computeProjectScheduleCascade(
  snapshot: ProjectSnapshot,
  seedIds: Iterable<string>
): { snapshot: ProjectSnapshot; changedIds: Set<string> } {
  const cloned = cloneActivities(snapshot.activities);
  const byId = new Map(cloned.map((a) => [a.id, a]));
  const reverseDeps = buildReverseDeps(cloned);

  const visited = new Set<string>();
  const changedIds = new Set<string>();
  const queue: string[] = Array.from(seedIds);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const dependentIds = reverseDeps.get(currentId);
    if (!dependentIds) continue;

    for (const depId of dependentIds) {
      const dep = byId.get(depId);
      if (!dep) continue;
      if (recomputeFromDeps(dep, byId)) {
        changedIds.add(depId);
        queue.push(depId);
      }
    }
  }

  return {
    snapshot: { ...snapshot, activities: cloned },
    changedIds,
  };
}

/**
 * 干跑：把 operations 应用到 snapshot，并向下游级联，最后产出 diff。
 * 完全无副作用；用于 propose 阶段预览。
 *
 * - 任何 operation 引用了 snapshot 中不存在的 activityId/dependsOnId →
 *   抛 UnknownActivityIdError。这是反幻觉的代码层兜底（见 03 §2）。
 */
export function dryRunSchedule(
  snapshot: ProjectSnapshot,
  operations: ScheduleOperation[]
): ScheduleDryRunResult {
  const knownIds = new Set(snapshot.activities.map((a) => a.id));
  for (const op of operations) {
    if (!knownIds.has(op.activityId)) {
      throw new UnknownActivityIdError(op.activityId);
    }
    if (op.type === 'add_dependency' || op.type === 'remove_dependency') {
      if (!knownIds.has(op.dependsOnId)) {
        throw new UnknownActivityIdError(op.dependsOnId);
      }
    }
  }

  const cloned = cloneActivities(snapshot.activities);
  const byId = new Map(cloned.map((a) => [a.id, a]));
  const seedIds = new Set<string>();

  for (const op of operations) {
    const activity = byId.get(op.activityId);
    if (!activity) continue; // 已被上面校验过，理论不会到这里

    switch (op.type) {
      case 'shift_activity': {
        if (op.deltaDays === 0) break;
        if (activity.planStartDate) {
          activity.planStartDate = shiftCalendarDays(activity.planStartDate, op.deltaDays);
        }
        if (activity.planEndDate) {
          activity.planEndDate = shiftCalendarDays(activity.planEndDate, op.deltaDays);
        }
        seedIds.add(activity.id);
        break;
      }
      case 'set_planned': {
        const target = parseISODate(op.date);
        if (op.field === 'start') {
          activity.planStartDate = target;
          if (activity.planEndDate) {
            activity.planDuration = calculateWorkdays(target, activity.planEndDate);
          } else if (activity.planDuration && activity.planDuration > 0) {
            activity.planEndDate = offsetWorkdays(target, activity.planDuration - 1);
          }
        } else {
          activity.planEndDate = target;
          if (activity.planStartDate) {
            activity.planDuration = calculateWorkdays(activity.planStartDate, target);
          } else if (activity.planDuration && activity.planDuration > 0) {
            activity.planStartDate = offsetWorkdays(target, -(activity.planDuration - 1));
          }
        }
        seedIds.add(activity.id);
        break;
      }
      case 'set_duration': {
        if (op.durationDays <= 0) break; // 校验层应已拦截
        activity.planDuration = op.durationDays;
        if (activity.planStartDate) {
          activity.planEndDate = offsetWorkdays(activity.planStartDate, op.durationDays - 1);
        } else if (activity.planEndDate) {
          activity.planStartDate = offsetWorkdays(activity.planEndDate, -(op.durationDays - 1));
        }
        seedIds.add(activity.id);
        break;
      }
      case 'add_dependency': {
        const existsIdx = activity.dependencies.findIndex((d) => d.id === op.dependsOnId);
        if (existsIdx === -1) {
          activity.dependencies.push({
            id: op.dependsOnId,
            type: op.depType ?? '0',
            lag: op.lag ?? 0,
          });
        }
        recomputeFromDeps(activity, byId);
        seedIds.add(activity.id);
        break;
      }
      case 'remove_dependency': {
        activity.dependencies = activity.dependencies.filter((d) => d.id !== op.dependsOnId);
        if (activity.dependencies.length > 0) {
          recomputeFromDeps(activity, byId);
        }
        seedIds.add(activity.id);
        break;
      }
    }
  }

  const intermediate: ProjectSnapshot = { ...snapshot, activities: cloned };
  const { snapshot: nextSnapshot, changedIds: cascadeChanged } = computeProjectScheduleCascade(
    intermediate,
    seedIds
  );

  const originalById = new Map(snapshot.activities.map((a) => [a.id, a]));

  const items: ActivityDiff[] = nextSnapshot.activities.map((after) => {
    const before = originalById.get(after.id)!;
    const startBefore = before.planStartDate?.getTime() ?? null;
    const startAfter = after.planStartDate?.getTime() ?? null;
    const endBefore = before.planEndDate?.getTime() ?? null;
    const endAfter = after.planEndDate?.getTime() ?? null;
    const changed = startBefore !== startAfter || endBefore !== endAfter;
    return {
      activityId: after.id,
      name: after.name,
      before: { start: before.planStartDate, end: before.planEndDate },
      after: { start: after.planStartDate, end: after.planEndDate },
      changed,
    };
  });

  const diffChanged = new Set<string>(
    items.filter((i) => i.changed).map((i) => i.activityId)
  );
  // 包含 cascade 计算出的所有受影响 id（即使 diff 比较没识别出来——理论上不会，但稳妥起见）
  for (const id of cascadeChanged) diffChanged.add(id);

  return {
    snapshot: nextSnapshot,
    diff: { items },
    changedIds: diffChanged,
  };
}

export type { DependencyInput, PredecessorData };
