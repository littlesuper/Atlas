/**
 * 排期助手 · Prompt 构建器 + 意图响应解析（边缘 1/2）
 *
 * 与 docs/specs/ai-scheduling-beacon/03 对齐：
 *  - 边缘 1（意图解析）：自然语言 → 结构化意图。只"听懂"，不算日期。
 *  - 边缘 2（结果叙述）：结构化 diff/风险 → 自然语言。只"复述"，不新增事实。
 *
 * parseIntentResponse 是纯函数（无 LLM / DB），可离线契约测试；它是反幻觉的
 * 代码层兜底（03 §2）：任何不在活动白名单内的 id → 直接判失败。
 */
import {
  scheduleChangeIntentSchema,
  type ScheduleChangeIntent,
} from '../schemas/scheduleAssistant';
import type { ScheduleDiff } from './scheduleEngine';
import type { RiskFinding } from './scheduleRisks';

// 传给 LLM 的活动清单条目——字段最小化（00 §4）
export interface IntentPromptActivity {
  id: string;
  name: string;
  isMilestone: boolean;
  planStartDate: string | null; // YYYY-MM-DD
  planEndDate: string | null;
  dependsOn: string[]; // 前置活动 id
}

const RISK_KIND_LABEL: Record<RiskFinding['kind'], string> = {
  milestone_slip: '里程碑顺延',
  hard_node_breach: '撞硬节点',
  project_overdue: '项目超期',
};

// ─── 边缘 1：意图解析 ──────────────────────────────────────

export function buildIntentSystemPrompt(): string {
  return `你是硬件项目管理系统 Atlas 的"排期意图解析器"。你的唯一职责是把项目经理的一句话，翻译成一组结构化的"排期变更操作"。你不负责计算任何日期，也不负责判断风险——那些都由系统的确定性代码完成。

## 你能输出的操作类型（只有这五种）
- shift_activity：把某活动整体提前/推迟若干天。{ "type":"shift_activity", "activityId":"<id>", "deltaDays":<整数，正为推迟，负为提前> }
- set_planned：把某活动的计划开始或结束日设为某日。{ "type":"set_planned", "activityId":"<id>", "field":"start|end", "date":"YYYY-MM-DD" }
- set_duration：把某活动的工期改为若干工作日。{ "type":"set_duration", "activityId":"<id>", "durationDays":<正整数> }
- add_dependency：让某活动依赖另一活动。{ "type":"add_dependency", "activityId":"<id>", "dependsOnId":"<id>" }
- remove_dependency：取消某活动对另一活动的依赖。{ "type":"remove_dependency", "activityId":"<id>", "dependsOnId":"<id>" }

## 铁律（违反即为严重错误）
1. activityId / dependsOnId **只能**从下面提供的"活动清单"里选取。清单里没有的活动，**绝对不要编造或猜测一个 id**——把用户提到但你无法对应到清单的词，原样放进 "unresolved" 数组。
2. 你**不计算任何日期、不做任何顺延**。例如"把打样推迟两周，后面依赖的都顺延"——你只需输出对"打样"这一个活动的 shift_activity，下游顺延由系统自动计算。绝不要自己枚举下游活动的改动。
3. 如果用户的话你无法可靠地映射到上面任一操作，宁可返回空的 operations 数组并说明，也**不要猜一个最可能的**。
4. 对自己的解析有把握就 confidence:"high"，含糊（如"挪挪""优化一下"没有明确量）就 confidence:"low"。
5. 记住本系统的历史教训：曾有 AI 编造出一个看似合理实则不存在的调休日（2026-04-26），污染了数据。**编造一个看似合理实则不存在的东西，是最严重的错误；不确定就报告不确定。**

## 输出格式
严格输出 JSON（不要包含 markdown 代码块标记），结构：
{
  "operations": [ <上述操作对象，0 个或多个> ],
  "confidence": "high" | "low",
  "unresolved": [ "<用户提到但无法对应到清单的原词>" ]
}`;
}

export function buildIntentUserPrompt(
  utterance: string,
  activities: IntentPromptActivity[]
): string {
  const lines: string[] = [];
  lines.push('## 本项目活动清单（只能从这里选 activityId）');
  if (activities.length === 0) {
    lines.push('（本项目暂无活动）');
  } else {
    for (const a of activities) {
      const parts = [`id=${a.id}`, `名称=${a.name}`];
      if (a.isMilestone) parts.push('里程碑');
      if (a.planStartDate || a.planEndDate) {
        parts.push(`计划=${a.planStartDate ?? '?'}~${a.planEndDate ?? '?'}`);
      }
      if (a.dependsOn.length > 0) parts.push(`依赖=[${a.dependsOn.join(',')}]`);
      lines.push(`- ${parts.join(' | ')}`);
    }
  }
  lines.push('');
  lines.push('## 用户的话');
  lines.push(utterance);
  lines.push('');
  lines.push('请输出 JSON 格式的结构化意图。');
  return lines.join('\n');
}

// ─── 纯解析 + 反幻觉兜底 ───────────────────────────────────

export type IntentParseResult =
  | { ok: true; intent: ScheduleChangeIntent }
  | { ok: false; kind: 'unparseable' | 'invalid_schema' | 'fabricated_id'; detail?: string };

export function parseIntentResponse(
  content: string,
  validActivityIds: Iterable<string>,
  projectId: string
): IntentParseResult {
  // 1) 提取 JSON（容忍 ```json 代码块）
  let jsonStr = content.trim();
  const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) jsonStr = fenced[1].trim();

  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    return { ok: false, kind: 'unparseable' };
  }

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, kind: 'unparseable' };
  }

  // 2) 注入受信任的 projectId（绝不信任 LLM 给的 projectId）
  const candidate = {
    projectId,
    operations: (raw as { operations?: unknown }).operations ?? [],
    confidence: (raw as { confidence?: unknown }).confidence,
    unresolved: (raw as { unresolved?: unknown }).unresolved ?? [],
  };

  // 3) Zod 结构校验
  const parsed = scheduleChangeIntentSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      kind: 'invalid_schema',
      detail: parsed.error.issues.map((i) => i.message).join('; '),
    };
  }

  // 4) 反幻觉兜底：所有 activityId / dependsOnId 必须在白名单内
  const validSet = new Set(validActivityIds);
  for (const op of parsed.data.operations) {
    if (!validSet.has(op.activityId)) {
      return { ok: false, kind: 'fabricated_id', detail: op.activityId };
    }
    if ((op.type === 'add_dependency' || op.type === 'remove_dependency') && !validSet.has(op.dependsOnId)) {
      return { ok: false, kind: 'fabricated_id', detail: op.dependsOnId };
    }
  }

  return { ok: true, intent: parsed.data };
}

// ─── 边缘 2：结果叙述 ──────────────────────────────────────

export function buildNarrateSystemPrompt(): string {
  return `你是硬件项目管理系统 Atlas 的"排期变更复述助手"。系统已经用确定性代码算好了一次排期变更的"改动清单"和"风险清单"，你的唯一职责是把它们用一段简洁的中文复述给项目经理听。

## 铁律
- 只复述下面给你的改动和风险，**不得新增任何事实、数字、日期、风险或建议**。
- 不要安抚、不要承诺、不要推测"可能还有别的风险"。给了什么就说什么。
- 如果改动清单为空，就如实说"没有排期改动"。如果风险清单为空，就说"未发现撞节点或超期风险"。
- 用 2-4 句话，朴实、面向非技术读者。不要用 markdown 标题或代码块。`;
}

export function buildNarrateUserPrompt(diff: ScheduleDiff, risks: RiskFinding[]): string {
  const lines: string[] = [];
  lines.push('## 改动清单（每行：活动 | 原计划 → 新计划）');
  const changed = diff.items.filter((i) => i.changed);
  if (changed.length === 0) {
    lines.push('（无改动）');
  } else {
    for (const item of changed) {
      const before = `${fmtDate(item.before.start)}~${fmtDate(item.before.end)}`;
      const after = `${fmtDate(item.after.start)}~${fmtDate(item.after.end)}`;
      lines.push(`- ${item.name}：${before} → ${after}`);
    }
  }
  lines.push('');
  lines.push('## 风险清单');
  if (risks.length === 0) {
    lines.push('（无风险）');
  } else {
    for (const r of risks) {
      lines.push(`- ${describeRisk(r)}`);
    }
  }
  lines.push('');
  lines.push('请用 2-4 句中文复述以上改动与风险，不要新增任何信息。');
  return lines.join('\n');
}

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().split('T')[0] : '未设定';
}

function describeRisk(r: RiskFinding): string {
  switch (r.kind) {
    case 'milestone_slip':
      return `${RISK_KIND_LABEL[r.kind]}：里程碑「${r.name}」从 ${fmtDate(r.before)} 移到 ${fmtDate(r.after)}`;
    case 'hard_node_breach':
      return `${RISK_KIND_LABEL[r.kind]}：活动「${r.name}」预计 ${fmtDate(r.projected)} 完成，晚于硬节点 ${fmtDate(r.deadline)}`;
    case 'project_overdue':
      return `${RISK_KIND_LABEL[r.kind]}：项目预计 ${fmtDate(r.projectedEnd)} 结束，晚于项目截止 ${fmtDate(r.projectDeadline)}`;
  }
}
