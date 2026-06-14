/**
 * 只读问答 · 混合编排（确定性优先 → 接地问答兜底）
 *
 * - 先尝试把问题映射到确定性白名单查询（runQuery）并精确计算（零幻觉）。
 * - 映射不上的"任意问题" → 接地问答：把"该用户权限可见"的系统数据喂给 LLM，
 *   强制"只依据数据作答、没有就说不知道、绝不编造"，答案标注来源为系统数据。
 *
 * 全程只读：不写任何库；写操作仍走 propose/apply 确认流程。LLM 调用经 aiCircuitBreaker。
 */
import { aiCircuitBreaker } from '../../../utils/circuitBreaker';
import { callAi } from '../../../utils/aiClient';
import { logger } from '../../../utils/logger';
import { resolveProjectTarget } from '../targetResolver';
import { runQuery } from './queryService';
import { buildAskContext } from './contextBuilder';
import type { Request } from 'express';

export type AskBasis = 'deterministic' | 'grounded';
export type RunAskResult =
  | { status: 'ai_unavailable' }
  | { status: 'answered'; answer: string; basis: AskBasis };

export function buildGroundedSystemPrompt(): string {
  return `你是硬件项目管理系统 Atlas 的问答助手。用户会问关于项目的问题，你必须**只依据下面提供的【系统数据】回答**。
铁律（本系统有过 AI 编造数据的生产事故，违反即为严重错误）：
- 只用【系统数据】里的事实回答；数据里没有的，**明确说"系统数据里没有这个信息"**，不要推测。
- **绝不编造或估算任何数字、日期、人名、状态、项目名**；所有具体数据必须来自【系统数据】。
- 不确定就说不确定。回答简洁、用中文，必要时点明依据的是哪个项目/活动。
- 你只负责回答问题，不执行任何修改。`;
}

export function buildGroundedUserPrompt(utterance: string, context: string): string {
  return ['【系统数据】', context, '', '【用户问题】', utterance, '', '请只依据上面的系统数据回答。'].join('\n');
}

async function groundedAnswer(utterance: string, context: string): Promise<RunAskResult> {
  let content: string | null = null;
  try {
    const res = await aiCircuitBreaker.execute(() =>
      callAi({
        feature: 'assistant',
        label: 'grounded',
        systemPrompt: buildGroundedSystemPrompt(),
        userPrompt: buildGroundedUserPrompt(utterance, context),
        temperature: 0.2,
      })
    );
    content = res?.content ?? null;
  } catch (err) {
    logger.warn({ err }, '接地问答 AI 调用失败');
    return { status: 'ai_unavailable' };
  }
  if (!content) return { status: 'ai_unavailable' };
  return { status: 'answered', answer: content.trim(), basis: 'grounded' };
}

export async function runAsk(input: {
  utterance: string;
  contextProjectId?: string | null;
  manageable: { id: string; name: string }[];
  req: Request;
}): Promise<RunAskResult> {
  // 1. 尝试定位单一目标项目（跨项目问题会 unresolved，正常）
  const target = await resolveProjectTarget({
    utterance: input.utterance,
    projects: input.manageable,
    contextProjectId: input.contextProjectId,
  });
  if (target.status === 'ai_unavailable') return { status: 'ai_unavailable' };
  const focusProjectId = target.status === 'ok' ? target.projectId : null;

  // 2. 确定性优先：命中单一项目时，先试白名单精确查询（零幻觉）
  if (focusProjectId) {
    const projectName = input.manageable.find((p) => p.id === focusProjectId)?.name ?? focusProjectId;
    const q = await runQuery({ projectId: focusProjectId, projectName, utterance: input.utterance });
    if (q.status === 'ai_unavailable') return { status: 'ai_unavailable' };
    if (q.status === 'answered') return { status: 'answered', answer: q.answer, basis: 'deterministic' };
    // not_understood → 落到接地问答
  }

  // 3. 接地问答兜底：权限内系统数据喂给 LLM，只依据数据作答
  const tCtx = Date.now();
  const context = await buildAskContext({ manageable: input.manageable, focusProjectId });
  logger.info(
    { ms: Date.now() - tCtx, projects: input.manageable.length, focus: !!focusProjectId },
    '接地上下文检索(DB)耗时'
  );
  return groundedAnswer(input.utterance, context);
}
