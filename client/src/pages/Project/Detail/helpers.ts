import type { ColumnDef } from './ColumnSettings';
import type { Activity } from '../../../types';
import { getApiErrorMessage as _getApiErrorMessage } from '../../../utils/apiError';
import dayjs from 'dayjs';

export const getApiErrorMessage = (err: unknown, fallback: string): string =>
  _getApiErrorMessage(err, fallback) ?? fallback;

export const escapeCsvHelper = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;

export const getMsDateHelper = (m: Activity) => {
  const d = m.planEndDate || m.planStartDate;
  return d ? dayjs(d) : null;
};

export const ACTIVITY_COLUMN_DEFS: ColumnDef[] = [
  { key: 'id', label: 'ID', removable: true },
  { key: 'predecessor', label: '前置', removable: true },
  { key: 'phase', label: '阶段', removable: true },
  { key: 'name', label: '活动名称', removable: false },
  { key: 'type', label: '类型', removable: true },
  { key: 'status', label: '状态', removable: true },
  { key: 'assignee', label: '负责人', removable: true },
  { key: 'planDuration', label: '计划工期', removable: true },
  { key: 'planDates', label: '计划时间', removable: true },
  { key: 'actualDates', label: '实际时间', removable: true },
  { key: 'checkItems', label: '检查项', removable: true },
  { key: 'notes', label: '备注', removable: true },
];

export const DEFAULT_COLUMN_ORDER = ACTIVITY_COLUMN_DEFS.map((d) => d.key);
export const DEFAULT_COLUMN_VISIBLE = ACTIVITY_COLUMN_DEFS.map((d) => d.key);

export function formatDeps(
  act: Activity,
  seqMap: Map<string, number>,
  depTypeMap: Record<string, string> = { '0': 'FS', '1': 'SS', '2': 'FF', '3': 'SF' },
): string {
  if (!act.dependencies) return '';
  const deps = Array.isArray(act.dependencies) ? act.dependencies
    : (() => { try { return JSON.parse(act.dependencies as unknown as string); } catch { return []; } })();
  return deps.map((dep: { id: string; type: string; lag?: number }) => {
    const seq = seqMap.get(dep.id);
    const seqStr = seq ? String(seq).padStart(3, '0') : '?';
    const typeLabel = depTypeMap[dep.type] || 'FS';
    const lag = dep.lag ?? 0;
    const lagStr = lag > 0 ? `+${lag}` : lag < 0 ? String(lag) : '';
    return `${seqStr}${typeLabel}${lagStr}`;
  }).join(', ');
}

// 计算在 atIndex 插入新活动时的 sortOrder 安排（sortOrder 是 Int，必须给唯一整数）。
// - 邻居间有整数空隙（含两端余量）→ 取干净整数，不动同级（reindex 空）。
// - 无空隙（相邻整数 / 0 值稠密）→ 把同级重排成 (pos+1)*STEP 等距网格、新活动落 idx 位，
//   reindex 仅含 sortOrder 真正变化的同级。
// 旧版 computeSortOrder 用 Math.floor((prev+next)/2)，在相邻整数上塌缩到 prev 造成冲突。
export function planInsertSortOrder(
  activities: { id: string; sortOrder: number }[],
  atIndex: number,
): { newSortOrder: number; reindex: { id: string; sortOrder: number }[] } {
  const STEP = 10;
  const idx = Math.max(0, Math.min(atIndex, activities.length));
  const prev = idx > 0 ? activities[idx - 1].sortOrder : null;
  const next = idx < activities.length ? activities[idx].sortOrder : null;

  let clean: number | null = null;
  if (prev === null && next === null) {
    clean = STEP; // 空列表
  } else if (prev === null && next !== null) {
    if (next >= 2) clean = Math.floor(next / 2); // 开头有余量：落 [1, next-1]
  } else if (prev !== null && next === null) {
    clean = prev + STEP; // 末尾追加
  } else if (prev !== null && next !== null && next - prev >= 2) {
    clean = Math.floor((prev + next) / 2); // 中间有整数空隙
  }
  if (clean !== null) {
    return { newSortOrder: clean, reindex: [] };
  }

  // 无空隙：重排成等距网格，新活动占 idx 位。
  const reindex: { id: string; sortOrder: number }[] = [];
  activities.forEach((a, i) => {
    const finalPos = i < idx ? i : i + 1;
    const target = (finalPos + 1) * STEP;
    if (target !== a.sortOrder) reindex.push({ id: a.id, sortOrder: target });
  });
  return { newSortOrder: (idx + 1) * STEP, reindex };
}
