import crypto from 'crypto';
import type { Request } from 'express';
import { callAi } from '../../../utils/aiClient';
import { aiCircuitBreaker } from '../../../utils/circuitBreaker';
import { logger } from '../../../utils/logger';
import { auditLog } from '../../../utils/auditLog';
import type { AssistantPreview, AssistantDiffRow, AssistantRisk } from '../types';
import { proposalStore } from '../proposalStore';
import { getCapability } from './registry';
import { genericPreview } from './genericPreview';
import type { CapabilityContext } from './types';

export type CapabilityProposeOutcome =
  | { status: 'ok'; proposalId: string; preview: AssistantPreview; narrative: string }
  | { status: 'need_input'; missing: string[] }
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

export async function capabilityPropose(
  capabilityName: string,
  utterance: string,
  ctx: CapabilityContext
): Promise<CapabilityProposeOutcome> {
  const cap = getCapability(capabilityName);
  if (!cap) return { status: 'unknown_capability' };

  // LLM 边缘：填参
  const prompt = cap.buildPrompt(utterance, ctx);
  let content: string | null = null;
  try {
    const res = await aiCircuitBreaker.execute(() =>
      callAi({ feature: 'assistant', systemPrompt: prompt.system, userPrompt: prompt.user, temperature: 0 })
    );
    content = res?.content ?? null;
  } catch (err) {
    logger.warn({ err, capabilityName }, '能力填参 AI 调用失败');
    return { status: 'ai_unavailable' };
  }
  if (!content) return { status: 'ai_unavailable' };

  const raw = extractJson(content);
  if (raw == null) return { status: 'not_understood' };
  const parsed = cap.inputSchema.safeParse(raw);
  if (!parsed.success) {
    logger.info({ capabilityName, issues: parsed.error.issues.map((i) => i.message) }, '能力参数未通过校验');
    return { status: 'not_understood' };
  }

  // 缺失必填 → 追问（一次性，无跨轮记忆）
  const missing = cap.missingRequired ? cap.missingRequired(parsed.data, ctx) : [];
  if (missing.length > 0) return { status: 'need_input', missing };

  const input = cap.applyDefaults ? cap.applyDefaults(parsed.data, ctx) : parsed.data;

  // create 无目标实体；update/delete 在此 loadEntity（首发不涉及）
  const preview: AssistantPreview = cap.buildPreview
    ? cap.buildPreview(input, undefined, ctx)
    : genericPreview(
        cap.mode,
        input as Record<string, unknown>,
        undefined,
        {
          labels: cap.previewLabels,
          display: cap.previewDisplay ? (k, v) => cap.previewDisplay!(k, v, ctx) : undefined,
        },
        ctx
      );
  if (preview.rows.length === 0) return { status: 'noop' };

  const narrative = `将${cap.description.replace(/。.*/, '')}：共 ${preview.rows.length} 项。`;
  const proposalId = crypto.randomUUID();
  const fingerprint = crypto.createHash('sha256').update(capabilityName + JSON.stringify(input)).digest('hex').slice(0, 16);
  proposalStore.set(proposalId, {
    domain: 'capability',
    targetId: '__new__',
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
  if (!cached || !cached.capabilityName) throw new Error('PROPOSAL_NOT_FOUND');
  if (cached.applied) return { rows: cached.applied.rows, risks: cached.applied.risks };
  const cap = getCapability(cached.capabilityName);
  if (!cap) throw new Error('UNKNOWN_CAPABILITY');

  const result = await cap.execute(cached.args as never, ctx, req);

  await auditLog({
    req,
    action: 'CREATE',
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
