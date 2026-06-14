/**
 * 助手框架 · 领域分类（LLM 边缘）
 *
 * 单框对话需先判断用户意图属于哪个领域（排期 / 项目字段 / …），再交给对应适配器。
 * 安全：LLM 只能返回已注册的 domain key（白名单校验），认不出 → unresolved（不瞎归类）。
 */
import { aiCircuitBreaker } from '../../utils/circuitBreaker';
import { callAi } from '../../utils/aiClient';
import { logger } from '../../utils/logger';

export interface DomainOption {
  key: string;
  description: string;
}

export type DomainClassifyResult =
  | { status: 'ok'; domain: string }
  | { status: 'unresolved' }
  | { status: 'ai_unavailable' };

export function buildClassifySystemPrompt(): string {
  return `你要判断用户这句话属于哪个"操作领域"，以便交给正确的处理器。
铁律：
- 只能返回下面列表里出现的 domain key，或 null（认不出 / 不属于任何领域）。**绝不编造 key。**
- 含糊、跨多个领域、或都不沾边 → 返回 null。
输出严格 JSON：{"domain":"<列表内的 key 或 null>"}`;
}

export function buildClassifyUserPrompt(utterance: string, domains: DomainOption[]): string {
  const lines: string[] = ['## 可选领域'];
  for (const d of domains) lines.push(`- ${d.key}：${d.description}`);
  lines.push('', '## 用户的话', utterance, '', '请输出 JSON：{"domain":"..."} 或 {"domain":null}');
  return lines.join('\n');
}

/** 纯解析 + 白名单兜底（可离线测试） */
export function parseDomainResponse(
  content: string,
  validDomains: Iterable<string>
): { ok: true; domain: string } | { ok: false } {
  let jsonStr = content.trim();
  const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) jsonStr = fenced[1].trim();
  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    return { ok: false };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false };
  const domain = (raw as { domain?: unknown }).domain;
  if (typeof domain !== 'string' || domain.length === 0) return { ok: false };
  if (!new Set(validDomains).has(domain)) return { ok: false }; // 编造/不在列表 → 失败
  return { ok: true, domain };
}

export async function classifyDomain(input: {
  utterance: string;
  domains: DomainOption[];
}): Promise<DomainClassifyResult> {
  if (input.domains.length === 0) return { status: 'unresolved' };
  // 只有一个领域时无需 LLM，直接命中
  if (input.domains.length === 1) return { status: 'ok', domain: input.domains[0].key };

  let content: string | null = null;
  try {
    const res = await aiCircuitBreaker.execute(() =>
      callAi({
        feature: 'assistant',
        label: 'classify',
        systemPrompt: buildClassifySystemPrompt(),
        userPrompt: buildClassifyUserPrompt(input.utterance, input.domains),
        temperature: 0,
      })
    );
    content = res?.content ?? null;
  } catch (err) {
    logger.warn({ err }, '助手领域分类 AI 调用失败');
    return { status: 'ai_unavailable' };
  }
  if (!content) return { status: 'ai_unavailable' };

  const parsed = parseDomainResponse(content, input.domains.map((d) => d.key));
  if (!parsed.ok) return { status: 'unresolved' };
  return { status: 'ok', domain: parsed.domain };
}
