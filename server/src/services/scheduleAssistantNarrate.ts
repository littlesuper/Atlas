/**
 * 排期助手 · 边缘 2：结果叙述（LLM）
 *
 * 结构化 diff + 风险 → 一段自然语言。仅"复述"，输入只有结构化数据（03 §3）。
 * 经 aiCircuitBreaker。叙述是锦上添花：不可用即抛错，由 proposeFromIntent 捕获
 * 并降级为"只展示结构化 diff 表"（01 §G）。
 */
import { aiCircuitBreaker } from '../utils/circuitBreaker';
import { callAi } from '../utils/aiClient';
import {
  buildNarrateSystemPrompt,
  buildNarrateUserPrompt,
} from '../utils/scheduleAssistantPrompts';
import type { ScheduleDiff } from '../utils/scheduleEngine';
import type { RiskFinding } from '../utils/scheduleRisks';

export interface NarrateInput {
  projectId?: string;
  diff: ScheduleDiff;
  risks: RiskFinding[];
}

/**
 * 生成自然语言预览。AI 不可用时抛错（调用方负责降级），绝不返回伪造内容。
 */
export async function narrateProposal(input: NarrateInput): Promise<string> {
  const result = await aiCircuitBreaker.execute(() =>
    callAi({
      feature: 'schedule_assistant',
      label: 'narrate',
      projectId: input.projectId,
      systemPrompt: buildNarrateSystemPrompt(),
      userPrompt: buildNarrateUserPrompt(input.diff, input.risks),
      temperature: 0.2,
    })
  );

  if (!result?.content) {
    throw new Error('AI 叙述不可用');
  }
  return result.content.trim();
}
