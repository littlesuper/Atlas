/**
 * 排期助手 · 风险判定（确定性、纯逻辑）
 *
 * 规格 01 §E 问题二：本灯塔的风险仅指可由排期结构确定性算出的——
 *   1) milestone_slip：里程碑（type=MILESTONE）计划完成日发生变化
 *   2) hard_node_breach：活动设置的 hardConstraintDate 早于新计划完成日
 *   3) project_overdue：项目内最晚活动结束日晚于 Project.endDate
 *
 * 严禁让 LLM 参与判定；本文件不导入任何 AI 工具。
 */
import type { ProjectSnapshot, ScheduleDiff } from './scheduleEngine';

export type RiskFinding =
  | {
      kind: 'milestone_slip';
      activityId: string;
      name: string;
      before: Date | null;
      after: Date | null;
    }
  | {
      kind: 'hard_node_breach';
      activityId: string;
      name: string;
      deadline: Date;
      projected: Date;
    }
  | {
      kind: 'project_overdue';
      projectDeadline: Date;
      projectedEnd: Date;
    };

export function assessRisks(
  original: ProjectSnapshot,
  next: ProjectSnapshot,
  diff: ScheduleDiff
): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const originalById = new Map(original.activities.map((a) => [a.id, a]));
  const changedIds = new Set(diff.items.filter((i) => i.changed).map((i) => i.activityId));

  // 1) milestone_slip：里程碑活动的计划完成日（或开始日）发生变化
  for (const after of next.activities) {
    if (after.type !== 'MILESTONE') continue;
    if (!changedIds.has(after.id)) continue;
    const before = originalById.get(after.id);
    if (!before) continue;
    const beforeEnd = before.planEndDate?.getTime() ?? null;
    const afterEnd = after.planEndDate?.getTime() ?? null;
    const beforeStart = before.planStartDate?.getTime() ?? null;
    const afterStart = after.planStartDate?.getTime() ?? null;
    if (beforeEnd === afterEnd && beforeStart === afterStart) continue;
    findings.push({
      kind: 'milestone_slip',
      activityId: after.id,
      name: after.name,
      before: before.planEndDate ?? before.planStartDate ?? null,
      after: after.planEndDate ?? after.planStartDate ?? null,
    });
  }

  // 2) hard_node_breach：活动有 hardConstraintDate，且新 planEndDate 晚于该 deadline
  for (const after of next.activities) {
    if (!after.hardConstraintDate) continue;
    if (!after.planEndDate) continue;
    if (after.planEndDate.getTime() > after.hardConstraintDate.getTime()) {
      findings.push({
        kind: 'hard_node_breach',
        activityId: after.id,
        name: after.name,
        deadline: after.hardConstraintDate,
        projected: after.planEndDate,
      });
    }
  }

  // 3) project_overdue：项目最晚活动结束日超过 Project.endDate
  if (next.projectEndDate) {
    let projectedEnd: Date | null = null;
    for (const act of next.activities) {
      if (!act.planEndDate) continue;
      if (!projectedEnd || act.planEndDate.getTime() > projectedEnd.getTime()) {
        projectedEnd = act.planEndDate;
      }
    }
    if (projectedEnd && projectedEnd.getTime() > next.projectEndDate.getTime()) {
      findings.push({
        kind: 'project_overdue',
        projectDeadline: next.projectEndDate,
        projectedEnd,
      });
    }
  }

  return findings;
}
