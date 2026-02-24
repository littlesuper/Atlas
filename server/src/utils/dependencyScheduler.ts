/**
 * 活动依赖调度器
 * 根据前置活动的依赖类型和延迟天数，自动计算后续活动的计划日期
 *
 * 依赖类型:
 *   FS (0) - Finish-to-Start: 前置结束后，后续才能开始
 *   SS (1) - Start-to-Start:  前置开始后，后续才能开始
 *   FF (2) - Finish-to-Finish: 前置结束后，后续才能结束
 *   SF (3) - Start-to-Finish:  前置开始后，后续才能结束
 */

import { offsetWorkdays, calculateWorkdays } from './workday';

export interface DependencyInput {
  id: string;
  type: string; // '0'=FS, '1'=SS, '2'=FF, '3'=SF
  lag?: number; // workdays, default 0, negative = lead
}

export interface PredecessorData {
  id: string;
  planStartDate: Date | null;
  planEndDate: Date | null;
  planDuration: number | null;
}

export interface ResolvedDates {
  planStartDate?: Date;
  planEndDate?: Date;
  planDuration?: number;
}

/**
 * 根据依赖关系计算活动的计划日期
 *
 * @param deps 当前活动的依赖列表
 * @param predecessors 前置活动数据（通过 id 匹配）
 * @param selfDuration 当前活动的工期（工作日数）
 * @returns 计算出的计划日期，空对象表示无法计算
 */
export function resolveActivityDates(
  deps: DependencyInput[],
  predecessors: PredecessorData[],
  selfDuration?: number | null
): ResolvedDates {
  if (!deps || deps.length === 0) return {};

  const predMap = new Map<string, PredecessorData>();
  for (const p of predecessors) {
    predMap.set(p.id, p);
  }

  // Collect start and end constraints from each dependency
  const startConstraints: Date[] = [];
  const endConstraints: Date[] = [];

  for (const dep of deps) {
    const pred = predMap.get(dep.id);
    if (!pred) continue;

    const lag = dep.lag ?? 0;
    const type = dep.type;

    if (type === '0') {
      // FS: successor start = offsetWorkdays(pred.planEndDate, 1 + lag)
      if (!pred.planEndDate) continue;
      startConstraints.push(offsetWorkdays(pred.planEndDate, 1 + lag));
    } else if (type === '1') {
      // SS: successor start = offsetWorkdays(pred.planStartDate, lag)
      if (!pred.planStartDate) continue;
      startConstraints.push(offsetWorkdays(pred.planStartDate, lag));
    } else if (type === '2') {
      // FF: successor end = offsetWorkdays(pred.planEndDate, lag)
      if (!pred.planEndDate) continue;
      endConstraints.push(offsetWorkdays(pred.planEndDate, lag));
    } else if (type === '3') {
      // SF: successor end = offsetWorkdays(pred.planStartDate, lag)
      if (!pred.planStartDate) continue;
      endConstraints.push(offsetWorkdays(pred.planStartDate, lag));
    }
  }

  const result: ResolvedDates = {};

  // Multiple start constraints → take latest (MAX)
  if (startConstraints.length > 0) {
    result.planStartDate = startConstraints.reduce((latest, d) =>
      d > latest ? d : latest
    );
  }

  // Multiple end constraints → take latest (MAX)
  if (endConstraints.length > 0) {
    result.planEndDate = endConstraints.reduce((latest, d) =>
      d > latest ? d : latest
    );
  }

  // Derive missing date from duration
  const duration = selfDuration ?? undefined;

  if (result.planStartDate && !result.planEndDate && duration && duration > 0) {
    // Start known + duration → end = offsetWorkdays(start, duration - 1)
    result.planEndDate = offsetWorkdays(result.planStartDate, duration - 1);
    result.planDuration = duration;
  } else if (!result.planStartDate && result.planEndDate && duration && duration > 0) {
    // End known + duration → start = offsetWorkdays(end, -(duration - 1))
    result.planStartDate = offsetWorkdays(result.planEndDate, -(duration - 1));
    result.planDuration = duration;
  } else if (result.planStartDate && result.planEndDate) {
    // Both known → duration = calculateWorkdays(start, end)
    result.planDuration = calculateWorkdays(result.planStartDate, result.planEndDate);
  }

  return result;
}
