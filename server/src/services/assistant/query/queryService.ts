/**
 * 只读问答 · 编排（LLM 边缘：仅解析问题；答案由 queryCompute 确定性算出并格式化）
 *
 * LLM 把问题解析成白名单查询类型；不在白名单 → not_understood（不编造答案）。
 * 答案是确定性代码算出的事实，直接格式化成中文——不经第二次 LLM，杜绝幻觉。
 */
import { aiCircuitBreaker } from '../../../utils/circuitBreaker';
import { callAi } from '../../../utils/aiClient';
import { logger } from '../../../utils/logger';
import { queryIntentSchema, type QueryIntent } from '../../../schemas/queryAssistant';
import {
  computePhaseDuration,
  computeProjectTimeline,
  computeRiskSummary,
  computeOverdueCount,
} from './queryCompute';

export type RunQueryResult =
  | { status: 'ai_unavailable' }
  | { status: 'not_understood' }
  | { status: 'answered'; answer: string };

export function buildQuerySystemPrompt(): string {
  return `你是项目管理系统的"问题解析器"。把用户的提问解析成下面**白名单**里的一种查询；你**不负责回答**，只负责归类。
可回答的查询类型：
- phase_duration：某阶段花了多少工作日。{ "type":"phase_duration", "phase":"EVT|DVT|PVT|MP" }
- project_timeline：项目计划起止/周期。{ "type":"project_timeline" }
- risk_summary：项目风险项数量/分布。{ "type":"risk_summary" }
- overdue_count：项目有多少逾期活动。{ "type":"overdue_count" }

铁律：
- 只能输出上面列表里的 type；**绝不编造答案或数字**（答案由系统计算）。
- 问题不属于上述任何一类 → 输出 {"type":null}。
- phase 必须是 EVT/DVT/PVT/MP 之一（大写）。
严格输出 JSON：{"type":"...", ...参数} 或 {"type":null}`;
}

export function buildQueryUserPrompt(utterance: string): string {
  return ['## 用户的问题', utterance, '', '请输出 JSON 查询（或 {"type":null}）。'].join('\n');
}

/** 纯解析（可离线测试） */
export function parseQueryResponse(content: string): { ok: true; query: QueryIntent } | { ok: false } {
  let jsonStr = content.trim();
  const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) jsonStr = fenced[1].trim();
  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    return { ok: false };
  }
  const parsed = queryIntentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  return { ok: true, query: parsed.data };
}

export async function computeAndFormat(query: QueryIntent, projectId: string, projectName: string): Promise<string> {
  switch (query.type) {
    case 'phase_duration': {
      const r = await computePhaseDuration(projectId, query.phase);
      if (!r.found) return `未找到「${projectName}」的 ${r.phase} 阶段活动。`;
      if (r.workdays === null) return `「${projectName}」的 ${r.phase} 阶段有 ${r.count} 个活动，但缺少日期，无法计算工作日。`;
      const basis = r.basis === 'actual' ? '实际' : '计划';
      return `「${projectName}」的 ${r.phase} 阶段：${r.count} 个活动，按${basis}日期 ${r.start} ~ ${r.end}，共 ${r.workdays} 个工作日。`;
    }
    case 'project_timeline': {
      const r = await computeProjectTimeline(projectId);
      if (!r.start || !r.end) return `「${projectName}」尚未设定完整的计划起止日。`;
      return `「${projectName}」计划周期 ${r.start} ~ ${r.end}，共 ${r.workdays} 个工作日。`;
    }
    case 'risk_summary': {
      const r = await computeRiskSummary(projectId);
      const s = r.bySeverity;
      return `「${projectName}」共有 ${r.total} 个风险项（严重 ${s.CRITICAL} / 高 ${s.HIGH} / 中 ${s.MEDIUM} / 低 ${s.LOW}），其中 ${r.open} 个待处理或处理中。`;
    }
    case 'overdue_count': {
      const r = await computeOverdueCount(projectId, new Date());
      return `「${projectName}」当前有 ${r.count} 个逾期活动（计划结束日已过且未完成）。`;
    }
  }
}

export async function runQuery(input: {
  projectId: string;
  projectName: string;
  utterance: string;
}): Promise<RunQueryResult> {
  let content: string | null = null;
  try {
    const res = await aiCircuitBreaker.execute(() =>
      callAi({
        feature: 'assistant',
        label: 'query.parse',
        systemPrompt: buildQuerySystemPrompt(),
        userPrompt: buildQueryUserPrompt(input.utterance),
        temperature: 0,
      })
    );
    content = res?.content ?? null;
  } catch (err) {
    logger.warn({ err }, '问答解析 AI 调用失败');
    return { status: 'ai_unavailable' };
  }
  if (!content) return { status: 'ai_unavailable' };

  const parsed = parseQueryResponse(content);
  if (!parsed.ok) return { status: 'not_understood' };

  const answer = await computeAndFormat(parsed.query, input.projectId, input.projectName);
  return { status: 'answered', answer };
}
