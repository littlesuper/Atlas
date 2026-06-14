/**
 * 只读问答 · 权限内上下文检索（确定性，喂给接地问答的"系统数据"）
 *
 * 安全：调用方只传入"该用户权限可见"的项目清单（manageable），这里只读这些项目的数据；
 * 输出是给 LLM 的纯文本"系统数据"块，LLM 只能据此作答。有上限 + 截断提示，避免 token 失控。
 */
import prisma from '../../../db';

const PROJECT_CAP = 50;
const FOCUS_ACTIVITY_CAP = 80;
const FOCUS_RISK_CAP = 40;

const iso = (d: Date | null) => (d ? d.toISOString().split('T')[0] : '未设定');
const SEVERITY_ORDER: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: '进行中', COMPLETED: '已完成', ON_HOLD: '已暂停', ARCHIVED: '已归档',
  NOT_STARTED: '未开始', CANCELLED: '已取消',
  OPEN: '待处理', RESOLVED: '已解决', ACCEPTED: '已接受',
};
const sl = (s: string) => STATUS_LABEL[s] ?? s;

export interface AskContextInput {
  /** 该用户权限可见的项目（id + name），由路由按权限过滤后传入 */
  manageable: { id: string; name: string }[];
  /** 话里命中的具体项目（可空）；命中则附明细 */
  focusProjectId: string | null;
}

export async function buildAskContext(input: AskContextInput): Promise<string> {
  const allIds = input.manageable.map((m) => m.id);
  if (allIds.length === 0) return '（该用户当前没有可见的项目数据）';

  const ids = allIds.slice(0, PROJECT_CAP);
  const truncatedProjects = allIds.length > PROJECT_CAP;

  const [projects, riskRows, actCounts] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, status: true, priority: true, startDate: true, endDate: true, progress: true },
    }),
    prisma.riskItem.findMany({ where: { projectId: { in: ids } }, select: { projectId: true, severity: true, status: true } }),
    prisma.activity.groupBy({ by: ['projectId'], where: { projectId: { in: ids } }, _count: { _all: true } }),
  ]);

  const actCountMap = new Map<string, number>();
  for (const a of actCounts) actCountMap.set(a.projectId, a._count._all);

  const openRiskCount = new Map<string, number>();
  const maxOpenSeverity = new Map<string, string>();
  for (const r of riskRows) {
    const isOpen = r.status === 'OPEN' || r.status === 'IN_PROGRESS';
    if (!isOpen) continue;
    openRiskCount.set(r.projectId, (openRiskCount.get(r.projectId) || 0) + 1);
    const cur = maxOpenSeverity.get(r.projectId);
    if (!cur || (SEVERITY_ORDER[r.severity] || 0) > (SEVERITY_ORDER[cur] || 0)) {
      maxOpenSeverity.set(r.projectId, r.severity);
    }
  }

  const lines: string[] = [`## 项目概览（你权限内共 ${allIds.length} 个项目${truncatedProjects ? `，仅列前 ${PROJECT_CAP}` : ''}）`];
  for (const p of projects) {
    const openR = openRiskCount.get(p.id) || 0;
    const maxSev = maxOpenSeverity.get(p.id);
    lines.push(
      `- ${p.name} | 状态:${sl(p.status)} | 优先级:${p.priority} | 计划:${iso(p.startDate)}~${iso(p.endDate)} | 进度:${Math.round(p.progress ?? 0)}% | 活动:${actCountMap.get(p.id) || 0} | 未解决风险:${openR}${maxSev ? `(最高:${maxSev})` : ''}`
    );
  }

  if (input.focusProjectId && ids.includes(input.focusProjectId)) {
    const focusName = projects.find((p) => p.id === input.focusProjectId)?.name ?? input.focusProjectId;
    const [acts, risks] = await Promise.all([
      prisma.activity.findMany({
        where: { projectId: input.focusProjectId },
        select: { name: true, phase: true, status: true, planStartDate: true, planEndDate: true, startDate: true, endDate: true },
        orderBy: { sortOrder: 'asc' },
        take: FOCUS_ACTIVITY_CAP + 1,
      }),
      prisma.riskItem.findMany({
        where: { projectId: input.focusProjectId },
        select: { title: true, severity: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: FOCUS_RISK_CAP + 1,
      }),
    ]);

    lines.push('', `## 项目「${focusName}」明细`);
    lines.push('### 活动');
    const shownActs = acts.slice(0, FOCUS_ACTIVITY_CAP);
    for (const a of shownActs) {
      const plan = `计划 ${iso(a.planStartDate)}~${iso(a.planEndDate)}`;
      const actual = a.startDate || a.endDate ? `，实际 ${iso(a.startDate)}~${iso(a.endDate)}` : '';
      lines.push(`- ${a.phase ? `[${a.phase}] ` : ''}${a.name} | ${sl(a.status)} | ${plan}${actual}`);
    }
    if (acts.length > FOCUS_ACTIVITY_CAP) lines.push(`- …（活动较多，仅列前 ${FOCUS_ACTIVITY_CAP} 条）`);

    lines.push('### 风险项');
    const shownRisks = risks.slice(0, FOCUS_RISK_CAP);
    if (shownRisks.length === 0) lines.push('- （无）');
    for (const r of shownRisks) lines.push(`- [${r.severity}/${sl(r.status)}] ${r.title}`);
    if (risks.length > FOCUS_RISK_CAP) lines.push(`- …（风险项较多，仅列前 ${FOCUS_RISK_CAP} 条）`);
  }

  return lines.join('\n');
}
