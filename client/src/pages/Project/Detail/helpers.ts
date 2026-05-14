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

export function computeSortOrder(activities: { sortOrder: number }[], atIndex: number): number {
  const prev = atIndex > 0 ? activities[atIndex - 1].sortOrder : 0;
  const next = atIndex < activities.length ? activities[atIndex].sortOrder : prev + 20;
  return Math.floor((prev + next) / 2);
}
