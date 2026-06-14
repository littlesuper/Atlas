/**
 * 助手框架 · 通用编排
 *
 * propose：loadContext → LLM 解析(经 aiCircuitBreaker) → adapter 护栏解析 → 预览 → 叙述 → 缓存。
 * apply：取缓存 → 重载上下文 → 指纹校验(防并发) → adapter.apply(走现有校验路由) → 写助手审计。
 *
 * LLM 只在边缘；每次写入需 apply（用户确认后调用）；无自动应用。见 00 §1。
 */
import crypto from 'crypto';
import type { Request } from 'express';
import { aiCircuitBreaker } from '../../utils/circuitBreaker';
import { callAi } from '../../utils/aiClient';
import { auditLog } from '../../utils/auditLog';
import { logger } from '../../utils/logger';
import { proposalStore } from './proposalStore';
import { getAdapter } from './registry';
import type { AssistantActionAdapter, AssistantPreview, AssistantDiffRow, AssistantRisk } from './types';

export class UnknownDomainError extends Error {
  constructor(public readonly domain: string) {
    super(`未知助手领域：${domain}`);
    this.name = 'UnknownDomainError';
  }
}
export class ProposalNotFoundError extends Error {
  constructor() {
    super('提议不存在或已过期');
    this.name = 'ProposalNotFoundError';
  }
}
export class TargetNotFoundError extends Error {
  constructor() {
    super('目标对象不存在');
    this.name = 'TargetNotFoundError';
  }
}
export class VersionMismatchError extends Error {
  constructor() {
    super('数据在此期间已被改动，请重新发起');
    this.name = 'VersionMismatchError';
  }
}

export type ProposeOutcome =
  | { status: 'ai_unavailable' }
  | { status: 'target_not_found' }
  | { status: 'not_understood'; reason: string }
  | { status: 'noop'; narrative: string }
  | {
      status: 'ok';
      proposalId: string;
      preview: AssistantPreview;
      narrative: string;
    };

export interface ApplyOutcome {
  rows: AssistantDiffRow[];
  risks: AssistantRisk[];
}

const NARRATE_SYSTEM = `你是项目管理系统的"改动复述助手"。系统已用确定性代码算好一次改动的"改动清单"和"风险清单"，你只需用一段简洁中文复述给用户。
铁律：只复述给你的内容，不得新增任何事实、数字、日期、风险或建议；改动为空就说"无改动"，风险为空就说"未发现风险"。2-4 句，朴实，不要 markdown。`;

function buildNarrateUser(adapter: AssistantActionAdapter, preview: AssistantPreview): string {
  if (adapter.describeForNarration) return adapter.describeForNarration(preview);
  const lines: string[] = ['## 改动清单'];
  if (preview.rows.length === 0) lines.push('（无改动）');
  else for (const r of preview.rows) lines.push(`- ${r.label}：${r.before} → ${r.after}`);
  lines.push('', '## 风险清单');
  if (preview.risks.length === 0) lines.push('（无风险）');
  else for (const r of preview.risks) lines.push(`- ${r.text}`);
  lines.push('', '请用 2-4 句中文复述，不要新增任何信息。');
  return lines.join('\n');
}

async function narrate(adapter: AssistantActionAdapter, preview: AssistantPreview): Promise<string> {
  try {
    const res = await aiCircuitBreaker.execute(() =>
      callAi({
        feature: 'assistant',
        systemPrompt: NARRATE_SYSTEM,
        userPrompt: buildNarrateUser(adapter, preview),
        temperature: 0.2,
      })
    );
    return res?.content?.trim() ?? '';
  } catch (e) {
    logger.warn({ err: e }, '助手叙述生成失败，降级为结构化预览');
    return '';
  }
}

export async function runPropose(
  domain: string,
  targetId: string,
  utterance: string
): Promise<ProposeOutcome> {
  const adapter = getAdapter(domain);
  if (!adapter) throw new UnknownDomainError(domain);

  const ctx = await adapter.loadContext(targetId);
  if (!ctx) return { status: 'target_not_found' };

  // LLM 边缘 1：意图解析（经熔断器）
  let content: string | null = null;
  try {
    const res = await aiCircuitBreaker.execute(() =>
      callAi({
        feature: 'assistant',
        systemPrompt: adapter.buildIntentSystemPrompt(ctx),
        userPrompt: adapter.buildIntentUserPrompt(utterance, ctx),
        temperature: 0,
      })
    );
    content = res?.content ?? null;
  } catch (err) {
    logger.warn({ err, domain, targetId }, '助手意图解析 AI 调用失败');
    return { status: 'ai_unavailable' };
  }
  if (!content) return { status: 'ai_unavailable' };

  const parsed = adapter.parseIntent(content, ctx);
  if (!parsed.ok) {
    logger.info({ domain, kind: parsed.kind, detail: parsed.detail }, '助手意图未通过校验');
    return { status: 'not_understood', reason: parsed.kind };
  }

  const preview = adapter.buildPreview(parsed.intent, ctx);
  if (preview.rows.length === 0) {
    return { status: 'noop', narrative: '没有可执行的改动。' };
  }

  const narrative = await narrate(adapter, preview);
  const proposalId = crypto.randomUUID();
  proposalStore.set(proposalId, {
    domain,
    targetId,
    rawUtterance: utterance,
    intent: parsed.intent,
    fingerprint: ctx.fingerprint,
    createdAt: Date.now(),
  });

  return { status: 'ok', proposalId, preview, narrative };
}

export async function runApply(proposalId: string, req: Request): Promise<ApplyOutcome> {
  const cached = proposalStore.get(proposalId);
  if (!cached) throw new ProposalNotFoundError();
  if (cached.applied) return { rows: cached.applied.rows, risks: cached.applied.risks };

  const adapter = getAdapter(cached.domain);
  if (!adapter) throw new UnknownDomainError(cached.domain);

  const freshCtx = await adapter.loadContext(cached.targetId);
  if (!freshCtx) throw new TargetNotFoundError();
  if (freshCtx.fingerprint !== cached.fingerprint) throw new VersionMismatchError();

  const result = await adapter.apply(cached.intent, freshCtx, req);

  // 助手层审计：记录对话溯源（rawUtterance + 解析意图 + 实际改动）。
  // 领域自身的写入路径还会各自审计（如 activity/project 的 UPDATE）。
  await auditLog({
    req,
    action: 'UPDATE',
    resourceType: 'assistant',
    resourceId: proposalId,
    resourceName: `${cached.domain} 助手应用（目标 ${cached.targetId}）`,
    changes: {
      rawUtterance: { from: null, to: cached.rawUtterance },
      resolvedIntent: { from: null, to: cached.intent as unknown },
      appliedDiff: { from: null, to: result.rows as unknown },
    },
  });

  proposalStore.markApplied(proposalId, { at: Date.now(), rows: result.rows, risks: result.risks });
  return result;
}
