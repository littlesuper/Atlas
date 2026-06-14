/**
 * 排期助手 · 边缘 1：意图解析（LLM）
 *
 * 自然语言 → 结构化意图。所有 LLM 调用经 aiCircuitBreaker（00 §4 / 12）。
 * 解析后的 activityId 在 parseIntentResponse 里再次过白名单——双重反幻觉兜底（03 §2）。
 *
 * 返回值是判别联合：
 *  - ai_unavailable：熔断器打开 / AI 未配置 / API 出错 → 路由层 503 降级，不伪造意图
 *  - not_understood：解析失败 / 编造 id / schema 不合法 → 路由层"没听懂"降级
 *  - ok：得到合法意图（operations 可能为空，由 proposeFromIntent 处理 noOp）
 */
import { aiCircuitBreaker } from '../utils/circuitBreaker';
import { callAi } from '../utils/aiClient';
import { logger } from '../utils/logger';
import {
  buildIntentSystemPrompt,
  buildIntentUserPrompt,
  parseIntentResponse,
  type IntentPromptActivity,
} from '../utils/scheduleAssistantPrompts';
import type { ScheduleChangeIntent } from '../schemas/scheduleAssistant';

export type ParseUtteranceResult =
  | { status: 'ai_unavailable' }
  | { status: 'not_understood'; reason: string }
  | { status: 'ok'; intent: ScheduleChangeIntent };

export interface ParseUtteranceInput {
  projectId: string;
  utterance: string;
  activities: IntentPromptActivity[];
}

export async function parseUtterance(
  input: ParseUtteranceInput
): Promise<ParseUtteranceResult> {
  const validIds = input.activities.map((a) => a.id);

  let content: string | null = null;
  try {
    const result = await aiCircuitBreaker.execute(() =>
      callAi({
        feature: 'schedule_assistant',
        label: 'intent',
        projectId: input.projectId,
        systemPrompt: buildIntentSystemPrompt(),
        userPrompt: buildIntentUserPrompt(input.utterance, input.activities),
        temperature: 0, // 解析任务要确定性，不要发挥
      })
    );
    content = result?.content ?? null;
  } catch (err) {
    // 熔断器打开或 API 抛错——不伪造意图（03 §4）
    logger.warn({ err, projectId: input.projectId }, '排期助手意图解析 AI 调用失败');
    return { status: 'ai_unavailable' };
  }

  if (!content) {
    // AI 未配置（callAi 返回 null）
    return { status: 'ai_unavailable' };
  }

  const parsed = parseIntentResponse(content, validIds, input.projectId);
  if (!parsed.ok) {
    logger.info(
      { kind: parsed.kind, detail: parsed.detail, projectId: input.projectId },
      '排期助手意图解析未通过校验'
    );
    return { status: 'not_understood', reason: parsed.kind };
  }

  return { status: 'ok', intent: parsed.intent };
}
