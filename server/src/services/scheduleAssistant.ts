/**
 * 排期助手 · 编排层
 *
 * 与 docs/specs/ai-scheduling-beacon/01 §F 对齐。
 *
 * 职责：
 *  - loadProjectSnapshot：从 DB 拼装 ProjectSnapshot（不含 LLM 调用）
 *  - proposeFromIntent：已经过 Zod 校验的结构化意图 → 干跑 + 风险 + 叙述（叙述函数注入式，
 *    step-2 不接 LLM，step-3 由 routes 层注入 circuitBreaker 保护的 narrate）
 *  - applyProposal：取缓存提议 → 校验项目版本指纹 → 重算 dry-run → 循环依赖校验 →
 *    单 transaction 写回 → 审计；幂等
 *
 * 关键安全点（01 §C [9]→[10]）：apply 完全不信任前端传回的 diff，
 * 只信 proposalId 对应的、服务端已校验缓存的 intent，再走与现有写入路径
 * 共用的 computeProjectScheduleCascade（通过 dryRunSchedule）重新计算。
 */
import crypto from 'crypto';
import type { Request } from 'express';
import { Prisma } from '../generated/prisma/client';
import prisma from '../db';
import {
  dryRunSchedule,
  type ActivitySnapshot,
  type ActivitySnapshotType,
  type ProjectSnapshot,
  type ScheduleDiff,
} from '../utils/scheduleEngine';
import { assessRisks, type RiskFinding } from '../utils/scheduleRisks';
import { dependenciesFromJson } from '../routes/activities/shared';
import { detectCircularDependency } from '../utils/dependencyValidator';
import { updateProjectProgress } from '../utils/projectProgress';
import { auditLog } from '../utils/auditLog';
import { logger } from '../utils/logger';
import type { ScheduleChangeIntent } from '../schemas/scheduleAssistant';

// ─── 缓存 ─────────────────────────────────────────────────
const PROPOSAL_TTL_MS = 10 * 60 * 1000; // 10 min（01 §F.3）

interface CachedProposal {
  projectId: string;
  rawUtterance: string;
  intent: ScheduleChangeIntent;
  snapshotFingerprint: string;
  createdAt: number;
  applied?: { at: number; appliedDiff: ScheduleDiff; risks: RiskFinding[] };
}

class ProposalCache {
  private store = new Map<string, CachedProposal>();

  set(id: string, proposal: CachedProposal): void {
    this.store.set(id, proposal);
    this.prune();
  }

  get(id: string): CachedProposal | null {
    const p = this.store.get(id);
    if (!p) return null;
    if (Date.now() - p.createdAt > PROPOSAL_TTL_MS) {
      this.store.delete(id);
      return null;
    }
    return p;
  }

  markApplied(id: string, applied: NonNullable<CachedProposal['applied']>): void {
    const p = this.store.get(id);
    if (p) p.applied = applied;
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (now - v.createdAt > PROPOSAL_TTL_MS) this.store.delete(k);
    }
  }

  /** 仅供测试使用 */
  __reset(): void {
    this.store.clear();
  }
}

export const proposalCache = new ProposalCache();

// ─── 领域错误 ─────────────────────────────────────────────
export class ProjectNotFoundError extends Error {
  constructor(public readonly projectId: string) {
    super(`项目不存在：${projectId}`);
    this.name = 'ProjectNotFoundError';
  }
}

export class ProposalNotFoundError extends Error {
  constructor(public readonly proposalId: string) {
    super(`提议不存在或已过期：${proposalId}`);
    this.name = 'ProposalNotFoundError';
  }
}

export class ProjectVersionMismatchError extends Error {
  constructor() {
    super('项目排期已发生变更，请重新发起提议');
    this.name = 'ProjectVersionMismatchError';
  }
}

export class DependencyCycleError extends Error {
  constructor(public readonly activityId: string) {
    super(`活动 ${activityId} 的依赖变更会形成循环依赖`);
    this.name = 'DependencyCycleError';
  }
}

// ─── 类型 ────────────────────────────────────────────────
export interface ProposalResult {
  /** 仅在有可应用操作时返回；空操作 / 没听懂时为 undefined */
  proposalId?: string;
  intent: ScheduleChangeIntent;
  diff: ScheduleDiff;
  risks: RiskFinding[];
  narrative: string;
  parseConfidence: 'high' | 'low';
  unresolved: string[];
  /** true 表示无可执行操作（不会创建提议；不需要 apply） */
  noOp: boolean;
}

export interface ApplyResult {
  ok: true;
  appliedDiff: ScheduleDiff;
  risks: RiskFinding[];
}

export interface ProposeFromIntentOptions {
  rawUtterance: string;
  /** 由 routes 层注入；不传则 narrative 为空字符串（降级模式） */
  narrate?: (input: { diff: ScheduleDiff; risks: RiskFinding[] }) => Promise<string>;
  /** 预加载的快照（避免路由层与本函数重复读库）；不传则内部加载 */
  snapshot?: ProjectSnapshot;
}

// ─── 内部工具 ─────────────────────────────────────────────
export async function loadProjectSnapshot(projectId: string): Promise<ProjectSnapshot | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, endDate: true },
  });
  if (!project) return null;
  const activities = await prisma.activity.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      type: true,
      planStartDate: true,
      planEndDate: true,
      planDuration: true,
      hardConstraintDate: true,
      dependencies: true,
    },
  });
  return {
    projectId,
    projectEndDate: project.endDate,
    activities: activities.map(
      (a): ActivitySnapshot => ({
        id: a.id,
        name: a.name,
        type: a.type as ActivitySnapshotType,
        planStartDate: a.planStartDate,
        planEndDate: a.planEndDate,
        planDuration: a.planDuration,
        hardConstraintDate: a.hardConstraintDate,
        dependencies: dependenciesFromJson(a.dependencies),
      })
    ),
  };
}

export function computeSnapshotFingerprint(snap: ProjectSnapshot): string {
  const parts = snap.activities
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a) =>
      [
        a.id,
        a.planStartDate?.toISOString() ?? '',
        a.planEndDate?.toISOString() ?? '',
        a.planDuration ?? '',
        a.hardConstraintDate?.toISOString() ?? '',
        JSON.stringify(a.dependencies ?? []),
      ].join('|')
    );
  const projectPart = `project:${snap.projectEndDate?.toISOString() ?? ''}`;
  const blob = [projectPart, ...parts].join('\n');
  return crypto.createHash('sha256').update(blob).digest('hex').slice(0, 16);
}

// ─── 主要导出 ─────────────────────────────────────────────

/**
 * 把已校验的结构化意图转成"可应用提议"。
 * 失败/无操作时不创建提议（noOp=true）。
 */
export async function proposeFromIntent(
  intent: ScheduleChangeIntent,
  options: ProposeFromIntentOptions
): Promise<ProposalResult> {
  const snapshot =
    options.snapshot && options.snapshot.projectId === intent.projectId
      ? options.snapshot
      : await loadProjectSnapshot(intent.projectId);
  if (!snapshot) throw new ProjectNotFoundError(intent.projectId);

  if (intent.operations.length === 0) {
    return {
      intent,
      diff: { items: [] },
      risks: [],
      narrative:
        intent.unresolved.length > 0
          ? `没听懂以下用语：${intent.unresolved.join('、')}。请尝试更明确的表达，或直接手动调整。`
          : '没有可执行的操作。',
      parseConfidence: intent.confidence,
      unresolved: intent.unresolved,
      noOp: true,
    };
  }

  const dryRun = dryRunSchedule(snapshot, intent.operations);
  const risks = assessRisks(snapshot, dryRun.snapshot, dryRun.diff);
  const fingerprint = computeSnapshotFingerprint(snapshot);
  const proposalId = crypto.randomUUID();

  let narrative = '';
  if (options.narrate) {
    try {
      narrative = await options.narrate({ diff: dryRun.diff, risks });
    } catch (e) {
      // 叙述失败不阻塞应用——降级到结构化 diff（01 §G）
      logger.warn({ err: e, proposalId }, '叙述生成失败，降级为结构化预览');
      narrative = '';
    }
  }

  proposalCache.set(proposalId, {
    projectId: intent.projectId,
    rawUtterance: options.rawUtterance,
    intent,
    snapshotFingerprint: fingerprint,
    createdAt: Date.now(),
  });

  return {
    proposalId,
    intent,
    diff: dryRun.diff,
    risks,
    narrative,
    parseConfidence: intent.confidence,
    unresolved: intent.unresolved,
    noOp: false,
  };
}

/**
 * 排期应用核心（无缓存/审计）：在 fresh 快照上重算 → dependencyValidator 拒环 →
 * 单 transaction 写回 → 刷新进度。返回 diff + 风险。
 *
 * 被 applyProposal（老 /api/schedule-assistant）与 assistant 框架的 scheduleAdapter 共用，
 * 确保两条入口走同一份写入逻辑，杜绝分歧。
 */
export async function executeScheduleApply(
  projectId: string,
  operations: ScheduleChangeIntent['operations'],
  before: ProjectSnapshot,
  _req: Request
): Promise<{ diff: ScheduleDiff; risks: RiskFinding[] }> {
  const dryRun = dryRunSchedule(before, operations);
  const risks = assessRisks(before, dryRun.snapshot, dryRun.diff);

  // 循环依赖校验：只对 deps 有变更的活动
  const depChangedIds = new Set<string>();
  for (const op of operations) {
    if (op.type === 'add_dependency' || op.type === 'remove_dependency') {
      depChangedIds.add(op.activityId);
    }
  }
  for (const id of depChangedIds) {
    const next = dryRun.snapshot.activities.find((a) => a.id === id);
    if (!next) continue;
    const hasCycle = await detectCircularDependency(projectId, id, next.dependencies, prisma);
    if (hasCycle) throw new DependencyCycleError(id);
  }

  const nextById = new Map(dryRun.snapshot.activities.map((a) => [a.id, a]));
  const beforeById = new Map(before.activities.map((a) => [a.id, a]));
  const writeIds = new Set<string>([...dryRun.changedIds, ...depChangedIds]);

  if (writeIds.size > 0) {
    await prisma.$transaction(
      Array.from(writeIds).map((id) => {
        const next = nextById.get(id)!;
        const beforeAct = beforeById.get(id)!;
        const data: Prisma.ActivityUncheckedUpdateInput = {};
        const beforeStart = beforeAct.planStartDate?.getTime();
        const afterStart = next.planStartDate?.getTime();
        if (beforeStart !== afterStart) {
          data.planStartDate = next.planStartDate;
        }
        const beforeEnd = beforeAct.planEndDate?.getTime();
        const afterEnd = next.planEndDate?.getTime();
        if (beforeEnd !== afterEnd) {
          data.planEndDate = next.planEndDate;
        }
        if (next.planDuration !== beforeAct.planDuration) {
          data.planDuration = next.planDuration;
        }
        if (depChangedIds.has(id)) {
          data.dependencies = next.dependencies as unknown as Prisma.InputJsonValue;
        }
        return prisma.activity.update({ where: { id }, data });
      })
    );
  }

  await updateProjectProgress(projectId);
  return { diff: dryRun.diff, risks };
}

/**
 * 应用提议：服务端取缓存意图 → 校验项目版本未变 → 重算 dry-run →
 * dependencyValidator 拒环 → 单 transaction 写回 → 审计；幂等。
 */
export async function applyProposal(
  proposalId: string,
  req: Request
): Promise<ApplyResult> {
  const cached = proposalCache.get(proposalId);
  if (!cached) throw new ProposalNotFoundError(proposalId);

  // 幂等：同一 proposalId 二次 apply 直接返回首次结果
  if (cached.applied) {
    return {
      ok: true,
      appliedDiff: cached.applied.appliedDiff,
      risks: cached.applied.risks,
    };
  }

  const before = await loadProjectSnapshot(cached.projectId);
  if (!before) throw new ProjectNotFoundError(cached.projectId);

  const currentFingerprint = computeSnapshotFingerprint(before);
  if (currentFingerprint !== cached.snapshotFingerprint) {
    throw new ProjectVersionMismatchError();
  }

  // 复用共享写入核心（与 scheduleAdapter 同一份逻辑），保证干跑=实算
  const { diff, risks } = await executeScheduleApply(
    cached.projectId,
    cached.intent.operations,
    before,
    req
  );

  await auditLog({
    req,
    action: 'UPDATE',
    resourceType: 'schedule_assistant',
    resourceId: proposalId,
    resourceName: `项目 ${cached.projectId} 排期助手应用`,
    changes: {
      rawUtterance: { from: null, to: cached.rawUtterance },
      resolvedIntent: { from: null, to: cached.intent as unknown },
      appliedDiff: { from: null, to: diff as unknown },
    },
  });

  proposalCache.markApplied(proposalId, {
    at: Date.now(),
    appliedDiff: diff,
    risks,
  });

  return { ok: true, appliedDiff: diff, risks };
}
