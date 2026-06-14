/**
 * 助手框架 · 目标项目解析（LLM 边缘）
 *
 * 让用户单框对话、不必先选项目：从用户**有权限的真实项目清单**里认出指代的项目。
 * 安全：LLM 只能返回清单内的 projectId（代码层白名单校验，编造一律判失败），
 * 认不出 → unresolved（路由反问，绝不替用户猜一个项目去改）。
 */
import { aiCircuitBreaker } from '../../utils/circuitBreaker';
import { callAi } from '../../utils/aiClient';
import { logger } from '../../utils/logger';

export interface ProjectRef {
  id: string;
  name: string;
}

export type TargetResolveResult =
  | { status: 'ok'; projectId: string }
  | { status: 'unresolved' }
  | { status: 'ai_unavailable' };

export function buildTargetSystemPrompt(): string {
  return `你要从给定的"项目清单"里判断用户这句话指的是哪个项目。
铁律：
- 只能返回清单里出现的 projectId，或 null（认不出 / 用户没点明）。**绝不编造或猜测一个 id。**
- 若提供了"当前项目"且用户没有明确点名别的项目，就返回当前项目的 id。
- 用户明确点了另一个项目名，就返回那个项目的 id。
- 含糊、清单里没有、或你不确定 → 返回 null。
输出严格 JSON：{"projectId": "<清单内的 id 或 null>"}`;
}

export function buildTargetUserPrompt(
  utterance: string,
  projects: ProjectRef[],
  contextProjectId?: string | null
): string {
  const lines: string[] = [];
  if (contextProjectId) {
    const cur = projects.find((p) => p.id === contextProjectId);
    lines.push(`## 当前项目（用户没点明别的就用它）`);
    lines.push(cur ? `- id=${cur.id} | 名称=${cur.name}` : `- id=${contextProjectId}`);
    lines.push('');
  }
  lines.push('## 项目清单（只能从这里选 projectId）');
  if (projects.length === 0) lines.push('（无可操作项目）');
  else for (const p of projects) lines.push(`- id=${p.id} | 名称=${p.name}`);
  lines.push('');
  lines.push('## 用户的话');
  lines.push(utterance);
  lines.push('');
  lines.push('请输出 JSON：{"projectId": "..."} 或 {"projectId": null}');
  return lines.join('\n');
}

/**
 * 确定性快路径：用户话里直接点到某个项目名（唯一匹配）→ 无需 LLM。
 * 安全：只在真实项目清单里按名字匹配，编造不了；多个等长名都出现时放弃（交 LLM）。
 */
export function matchProjectByName(utterance: string, projects: ProjectRef[]): string | null {
  const u = utterance.toLowerCase();
  const hits = projects.filter((p) => p.name && u.includes(p.name.toLowerCase()));
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0].id;
  // 多个项目名都出现 → 取名字最长（最具体）的；若最长并列则放弃，交 LLM 判
  const sorted = [...hits].sort((a, b) => b.name.length - a.name.length);
  if (sorted[0].name.length > sorted[1].name.length) return sorted[0].id;
  return null;
}

/** 纯解析 + 白名单兜底（可离线测试） */
export function parseTargetResponse(
  content: string,
  validProjectIds: Iterable<string>
): { ok: true; projectId: string } | { ok: false } {
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

  const pid = (raw as { projectId?: unknown }).projectId;
  if (typeof pid !== 'string' || pid.length === 0) return { ok: false };

  const valid = new Set(validProjectIds);
  if (!valid.has(pid)) return { ok: false }; // 编造/不在清单 → 失败
  return { ok: true, projectId: pid };
}

export async function resolveProjectTarget(input: {
  utterance: string;
  projects: ProjectRef[];
  contextProjectId?: string | null;
}): Promise<TargetResolveResult> {
  if (input.projects.length === 0) return { status: 'unresolved' };

  // 确定性快路径：话里直接点到项目名 → 跳过 LLM（省一次往返、且零幻觉）
  const det = matchProjectByName(input.utterance, input.projects);
  if (det) return { status: 'ok', projectId: det };

  let content: string | null = null;
  try {
    const res = await aiCircuitBreaker.execute(() =>
      callAi({
        feature: 'assistant',
        label: 'target',
        systemPrompt: buildTargetSystemPrompt(),
        userPrompt: buildTargetUserPrompt(input.utterance, input.projects, input.contextProjectId),
        temperature: 0,
      })
    );
    content = res?.content ?? null;
  } catch (err) {
    logger.warn({ err }, '助手目标项目解析 AI 调用失败');
    return { status: 'ai_unavailable' };
  }
  if (!content) return { status: 'ai_unavailable' };

  const parsed = parseTargetResponse(
    content,
    input.projects.map((p) => p.id)
  );
  if (!parsed.ok) return { status: 'unresolved' };
  return { status: 'ok', projectId: parsed.projectId };
}
