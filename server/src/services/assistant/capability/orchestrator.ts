import crypto from 'crypto';
import type { Request } from 'express';
import { callAi } from '../../../utils/aiClient';
import { aiCircuitBreaker } from '../../../utils/circuitBreaker';
import { logger } from '../../../utils/logger';
import { auditLog } from '../../../utils/auditLog';
import { resolveProjectTarget } from '../targetResolver';
import { VersionMismatchError, TargetNotFoundError, ProposalNotFoundError, UnknownDomainError } from '../orchestrator';
import type { AssistantPreview, AssistantDiffRow, AssistantRisk } from '../types';
import { proposalStore } from '../proposalStore';
import { getCapability, hasPermission } from './registry';
import { genericPreview } from './genericPreview';
import type { Capability, CapabilityContext, EntitySnapshot } from './types';

export class CapabilityForbiddenError extends Error {
  constructor(message = '无权应用此提议') {
    super(message);
    this.name = 'CapabilityForbiddenError';
  }
}

export type CapabilityProposeOutcome =
  | { status: 'ok'; proposalId: string; preview: AssistantPreview; narrative: string }
  | { status: 'need_input'; missing: string[]; partialArgs: Record<string, unknown> }
  | { status: 'need_target' }
  | { status: 'target_not_found' }
  | { status: 'noop' }
  | { status: 'not_understood' }
  | { status: 'ai_unavailable' }
  | { status: 'unknown_capability' };

function extractJson(raw: string): unknown | null {
  let s = raw.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const NARRATE_SYSTEM = `你是项目管理系统的"改动复述助手"。系统已用确定性代码算好一次改动的"改动清单"和"风险清单"，你只需用一段简洁中文复述给用户。
铁律：只复述给你的内容，不得新增任何事实、数字、日期、风险或建议；改动为空就说"无改动"，风险为空就说"未发现风险"。2-4 句，朴实，不要 markdown。`;

/** 通用叙述 user prompt（供能力在 narrate 钩子里复用，等价旧 adapter 的通用叙述） */
export function genericNarrateUserPrompt(preview: AssistantPreview): string {
  const lines: string[] = ['## 改动清单'];
  if (preview.rows.length === 0) lines.push('（无改动）');
  else for (const r of preview.rows) lines.push(`- ${r.label}：${r.before} → ${r.after}`);
  lines.push('', '## 风险清单');
  if (preview.risks.length === 0) lines.push('（无风险）');
  else for (const r of preview.risks) lines.push(`- ${r.text}`);
  lines.push('', '请用 2-4 句中文复述，不要新增任何信息。');
  return lines.join('\n');
}

async function llmNarrate(userPrompt: string): Promise<string> {
  try {
    const res = await aiCircuitBreaker.execute(() =>
      callAi({ feature: 'assistant', label: 'narrate', systemPrompt: NARRATE_SYSTEM, userPrompt, temperature: 0.2 })
    );
    return res?.content?.trim() ?? '';
  } catch (e) {
    logger.warn({ err: e }, '能力叙述生成失败，降级为结构化预览');
    return '';
  }
}

function deterministicNarrative(cap: Capability, preview: AssistantPreview): string {
  return `将${cap.description.replace(/。.*/, '')}：共 ${preview.rows.length} 项。`;
}

const isEmptyVal = (v: unknown) => v == null || v === '';

export async function capabilityPropose(
  capabilityName: string,
  utterance: string,
  ctx: CapabilityContext,
  priorArgs?: Record<string, unknown>
): Promise<CapabilityProposeOutcome> {
  const cap = getCapability(capabilityName);
  if (!cap) return { status: 'unknown_capability' };

  // 目标定位（仅 target 类）
  let targetId = '__new__';
  let entity: EntitySnapshot | undefined;
  if (cap.target === 'project') {
    const t = await resolveProjectTarget({ utterance, projects: ctx.projects, contextProjectId: ctx.contextProjectId });
    if (t.status === 'ai_unavailable') return { status: 'ai_unavailable' };
    if (t.status === 'unresolved') return { status: 'need_target' };
    targetId = t.projectId;
    const loaded = cap.loadEntity ? await cap.loadEntity(targetId, ctx) : null;
    if (!loaded) return { status: 'target_not_found' };
    entity = loaded;
  }

  // LLM 边缘：填参；续填轮追加「已知字段」块，让 LLM 只补增量
  const prompt = cap.buildPrompt(utterance, ctx, entity);
  let userPrompt = prompt.user;
  if (priorArgs && Object.keys(priorArgs).length > 0) {
    userPrompt += `\n\n## 已确认字段（无需重复；只补未提供或用户明确纠正的字段）\n${JSON.stringify(priorArgs)}`;
  }
  let content: string | null = null;
  try {
    const res = await aiCircuitBreaker.execute(() =>
      callAi({ feature: 'assistant', label: 'intent', systemPrompt: prompt.system, userPrompt, temperature: 0 })
    );
    content = res?.content ?? null;
  } catch (err) {
    logger.warn({ err, capabilityName }, '能力填参 AI 调用失败');
    return { status: 'ai_unavailable' };
  }
  if (!content) return { status: 'ai_unavailable' };

  // 解析增量：parseArgs 整体接管，或 extractJson + inputSchema
  let increment: Record<string, unknown>;
  if (cap.parseArgs) {
    const r = cap.parseArgs(content, ctx, entity);
    if (!r.ok) return { status: 'not_understood' };
    increment = r.input as Record<string, unknown>;
  } else {
    const raw = extractJson(content);
    if (raw == null) return { status: 'not_understood' };
    // 续填轮 LLM 可能对"未提供"字段输出空串；在 schema 校验前把空值剥掉，避免 min(1) 误判
    const stripped = raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => !isEmptyVal(v)))
      : raw;
    const parsed = cap.inputSchema.safeParse(stripped);
    if (!parsed.success) {
      logger.info({ capabilityName, issues: parsed.error.issues.map((i) => i.message) }, '能力参数未通过校验');
      return { status: 'not_understood' };
    }
    increment = parsed.data as Record<string, unknown>;
  }

  // 合并跨轮已填字段：本轮非空值覆盖/补全，空值绝不抹掉已填
  const merged: Record<string, unknown> = { ...(priorArgs ?? {}) };
  for (const [k, v] of Object.entries(increment)) if (!isEmptyVal(v)) merged[k] = v;

  // 引用 id 白名单（对合并后的完整意图）
  if (cap.validateRefs) {
    const v = cap.validateRefs(merged as never, ctx, entity);
    if (!v.ok) {
      logger.info({ capabilityName, fabricated: v.fabricated }, '能力引用 id 未通过白名单');
      return { status: 'not_understood' };
    }
  }

  // 缺失必填 → 追问（携带合并后的 partialArgs 供下一轮续填）
  const missing = cap.missingRequired ? cap.missingRequired(merged as never, ctx) : [];
  if (missing.length > 0) return { status: 'need_input', missing, partialArgs: merged };

  const input = (cap.applyDefaults ? cap.applyDefaults(merged as never, ctx) : merged) as Record<string, unknown>;

  const preview: AssistantPreview = cap.buildPreview
    ? cap.buildPreview(input as never, entity, ctx)
    : genericPreview(
        cap.mode,
        input,
        entity,
        { labels: cap.previewLabels, display: cap.previewDisplay ? (k, v) => cap.previewDisplay!(k, v, ctx) : undefined },
        ctx
      );
  if (preview.rows.length === 0) return { status: 'noop' };

  const narrative = cap.narrate ? await llmNarrate(cap.narrate(preview)) : deterministicNarrative(cap, preview);

  const proposalId = crypto.randomUUID();
  const fingerprint =
    cap.target === 'project' && cap.fingerprint
      ? cap.fingerprint(entity)
      : crypto.createHash('sha256').update(capabilityName + JSON.stringify(input)).digest('hex').slice(0, 16);
  proposalStore.set(proposalId, {
    domain: 'capability',
    targetId,
    userId: ctx.userId,
    capabilityName,
    args: input,
    rawUtterance: utterance,
    intent: null,
    fingerprint,
    createdAt: Date.now(),
  });
  return { status: 'ok', proposalId, preview, narrative };
}

export async function capabilityApply(
  proposalId: string,
  ctx: CapabilityContext,
  req: Request
): Promise<{ rows: AssistantDiffRow[]; risks: AssistantRisk[] }> {
  const cached = proposalStore.get(proposalId);
  if (!cached || !cached.capabilityName) throw new ProposalNotFoundError();
  // 归属：仅发起者本人可应用（拦截代他人应用 / 重放他人 proposalId）
  if (cached.userId && cached.userId !== ctx.userId) throw new CapabilityForbiddenError();
  const cap = getCapability(cached.capabilityName);
  if (!cap) throw new UnknownDomainError(cached.capabilityName);
  // 权限：能力边界 = 用户权限边界（apply 再核一次，防分类层被绕过）
  if (!hasPermission(ctx.permissions, cap.permission.resource, cap.permission.action)) {
    throw new CapabilityForbiddenError('权限不足');
  }
  if (cached.applied) return { rows: cached.applied.rows, risks: cached.applied.risks };

  // target 类：重载实体 + 指纹复核（并发保护）
  let target: { id: string; entity: EntitySnapshot } | undefined;
  if (cap.target === 'project') {
    const fresh = cap.loadEntity ? await cap.loadEntity(cached.targetId, ctx) : null;
    if (!fresh) throw new TargetNotFoundError();
    if (cap.fingerprint && cap.fingerprint(fresh) !== cached.fingerprint) throw new VersionMismatchError();
    target = { id: cached.targetId, entity: fresh };
  }

  const result = await cap.execute(cached.args as never, ctx, req, target);

  await auditLog({
    req,
    action: cap.mode === 'create' ? 'CREATE' : 'UPDATE',
    resourceType: 'assistant',
    resourceId: proposalId,
    resourceName: `能力应用：${cached.capabilityName}`,
    changes: {
      rawUtterance: { from: null, to: cached.rawUtterance },
      args: { from: null, to: cached.args as unknown },
      appliedDiff: { from: null, to: result.rows as unknown },
    },
  });

  proposalStore.markApplied(proposalId, { at: Date.now(), rows: result.rows, risks: result.risks });
  return result;
}
