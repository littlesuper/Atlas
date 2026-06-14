/**
 * 只读问答 · 确定性计算（答案的唯一来源；LLM 不参与）
 *
 * 全部读 prisma 现有数据 + 工作日历算，结果结构化返回，由 queryService 格式化成中文答案。
 */
import prisma from '../../../db';
import { calculateWorkdays } from '../../../utils/workday';

const iso = (d: Date | null) => (d ? d.toISOString().split('T')[0] : null);

export interface PhaseDurationResult {
  type: 'phase_duration';
  phase: string;
  found: boolean;
  count: number;
  basis: 'actual' | 'plan' | null; // 按实际还是计划日期
  start: string | null;
  end: string | null;
  workdays: number | null;
}

export async function computePhaseDuration(projectId: string, phase: string): Promise<PhaseDurationResult> {
  const p = phase.trim().toUpperCase();
  const acts = await prisma.activity.findMany({
    where: { projectId, phase: p },
    select: { planStartDate: true, planEndDate: true, startDate: true, endDate: true },
  });
  if (acts.length === 0) {
    return { type: 'phase_duration', phase: p, found: false, count: 0, basis: null, start: null, end: null, workdays: null };
  }
  const allActual = acts.every((a) => a.startDate && a.endDate);
  const starts = acts.map((a) => (allActual ? a.startDate : a.planStartDate)).filter((d): d is Date => !!d);
  const ends = acts.map((a) => (allActual ? a.endDate : a.planEndDate)).filter((d): d is Date => !!d);
  if (starts.length === 0 || ends.length === 0) {
    return { type: 'phase_duration', phase: p, found: true, count: acts.length, basis: null, start: null, end: null, workdays: null };
  }
  const minStart = new Date(Math.min(...starts.map((d) => d.getTime())));
  const maxEnd = new Date(Math.max(...ends.map((d) => d.getTime())));
  return {
    type: 'phase_duration',
    phase: p,
    found: true,
    count: acts.length,
    basis: allActual ? 'actual' : 'plan',
    start: iso(minStart),
    end: iso(maxEnd),
    workdays: calculateWorkdays(minStart, maxEnd),
  };
}

export interface ProjectTimelineResult {
  type: 'project_timeline';
  start: string | null;
  end: string | null;
  workdays: number | null;
}

export async function computeProjectTimeline(projectId: string): Promise<ProjectTimelineResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { startDate: true, endDate: true },
  });
  const start = project?.startDate ?? null;
  const end = project?.endDate ?? null;
  return {
    type: 'project_timeline',
    start: iso(start),
    end: iso(end),
    workdays: start && end ? calculateWorkdays(start, end) : null,
  };
}

export interface RiskSummaryResult {
  type: 'risk_summary';
  total: number;
  bySeverity: Record<string, number>;
  open: number;
}

export async function computeRiskSummary(projectId: string): Promise<RiskSummaryResult> {
  const items = await prisma.riskItem.findMany({ where: { projectId }, select: { severity: true, status: true } });
  const bySeverity: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  let open = 0;
  for (const r of items) {
    if (bySeverity[r.severity] !== undefined) bySeverity[r.severity] += 1;
    if (r.status === 'OPEN' || r.status === 'IN_PROGRESS') open += 1;
  }
  return { type: 'risk_summary', total: items.length, bySeverity, open };
}

export interface OverdueCountResult {
  type: 'overdue_count';
  count: number;
  now: string;
}

export async function computeOverdueCount(projectId: string, now: Date): Promise<OverdueCountResult> {
  // 逾期：未完成（非 COMPLETED/CANCELLED）且计划结束日早于今天
  const acts = await prisma.activity.findMany({
    where: { projectId },
    select: { status: true, planEndDate: true },
  });
  let count = 0;
  for (const a of acts) {
    const done = a.status === 'COMPLETED' || a.status === 'CANCELLED';
    if (!done && a.planEndDate && a.planEndDate.getTime() < now.getTime()) count += 1;
  }
  return { type: 'overdue_count', count, now: iso(now)! };
}
