/**
 * 助手框架 · 项目字段编辑适配器（Phase 2）
 *
 * 目标对象就是项目本身（targetId = projectId）。支持改：名称/状态/优先级/起止日。
 * 安全：
 *  - 枚举/日期格式由 Zod 兜底（projectChangeIntentSchema），LLM 编造值过不了校验；
 *  - 归档项目不可编辑（loadContext 对 ARCHIVED 返回 null → 上层 target_not_found）；
 *  - 结束日早于开始日 → 预览标风险 + apply 拒绝（复用 isValidDateRange）；
 *  - 写入走 prisma.project.update（与现有 PUT /api/projects/:id 同字段同校验helper）；
 *    变更溯源由 orchestrator 的 assistant 审计记录（项目路由本身亦未单独审计）。
 */
import crypto from 'crypto';
import type { Request } from 'express';
import prisma from '../../../db';
import { isValidDateRange } from '../../../utils/validation';
import {
  projectChangeIntentSchema,
  type ProjectChangeIntent,
  type ProjectOperation,
} from '../../../schemas/projectAssistant';
import type {
  AssistantActionAdapter,
  AdapterContext,
  AssistantPreview,
  AssistantDiffRow,
  AssistantRisk,
  IntentParseResult,
} from '../types';

export class ProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectValidationError';
  }
}

interface ProjectFields {
  name: string;
  status: string;
  priority: string;
  startDate: Date | null;
  endDate: Date | null;
}

interface ProjectContext extends AdapterContext {
  project: ProjectFields;
}

const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  ON_HOLD: '已暂停',
  ARCHIVED: '已归档',
};
const PRIORITY_LABEL: Record<string, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  CRITICAL: '紧急',
};
const FIELD_LABEL: Record<ProjectOperation['field'], string> = {
  name: '名称',
  status: '状态',
  priority: '优先级',
  startDate: '计划开始',
  endDate: '计划结束',
};

const iso = (d: Date | null) => (d ? d.toISOString().split('T')[0] : '未设定');

function displayValue(field: ProjectOperation['field'], value: string | Date | null): string {
  if (field === 'status') return STATUS_LABEL[value as string] ?? String(value);
  if (field === 'priority') return PRIORITY_LABEL[value as string] ?? String(value);
  if (field === 'startDate' || field === 'endDate') {
    return value instanceof Date ? iso(value) : (value as string) || '未设定';
  }
  return (value as string) ?? '未设定';
}

function currentValue(field: ProjectOperation['field'], p: ProjectFields): string | Date | null {
  switch (field) {
    case 'name': return p.name;
    case 'status': return p.status;
    case 'priority': return p.priority;
    case 'startDate': return p.startDate;
    case 'endDate': return p.endDate;
  }
}

// 计算应用 operations 后的最终起止日（用于日期区间校验/风险）
function resolveDates(intent: ProjectChangeIntent, p: ProjectFields): { start: Date | null; end: Date | null } {
  let start = p.startDate;
  let end = p.endDate;
  for (const op of intent.operations) {
    if (op.field === 'startDate') start = new Date(`${op.value}T00:00:00.000Z`);
    if (op.field === 'endDate') end = new Date(`${op.value}T00:00:00.000Z`);
  }
  return { start, end };
}

function fingerprint(p: ProjectFields): string {
  const blob = [p.name, p.status, p.priority, iso(p.startDate), iso(p.endDate)].join('|');
  return crypto.createHash('sha256').update(blob).digest('hex').slice(0, 16);
}

export const projectAdapter: AssistantActionAdapter<ProjectChangeIntent> = {
  domain: 'project',
  description: '修改项目本身的属性：项目名称、项目状态(进行中/已完成/已暂停)、优先级、项目计划起止日期。',
  permission: { resource: 'project', action: 'update' },

  async loadContext(targetId: string): Promise<ProjectContext | null> {
    const project = await prisma.project.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, status: true, priority: true, startDate: true, endDate: true },
    });
    if (!project) return null;
    if (project.status === 'ARCHIVED') return null; // 归档项目不可编辑
    const fields: ProjectFields = {
      name: project.name,
      status: project.status,
      priority: project.priority,
      startDate: project.startDate,
      endDate: project.endDate,
    };
    return { targetId, fingerprint: fingerprint(fields), project: fields };
  },

  buildIntentSystemPrompt() {
    return `你是项目管理系统的"项目字段编辑意图解析器"。把用户的话解析成对**项目本身属性**的结构化改动。
可改字段（只有这几项）：
- name：项目名称（字符串）
- status：项目状态，只能是 IN_PROGRESS(进行中) / COMPLETED(已完成) / ON_HOLD(已暂停)。**不能设为已归档**。
- priority：优先级，只能是 LOW(低) / MEDIUM(中) / HIGH(高) / CRITICAL(紧急)。
- startDate / endDate：计划起止日，格式 YYYY-MM-DD。

铁律：
- 只输出用户**明确表达**的字段改动；**绝不编造用户没说的值**（不要凭空造日期/名称）。
- status/priority 必须映射到上面的枚举值之一；映射不了就不要输出该操作。
- 解析不出任何明确改动 → 返回空 operations。
- 有把握 confidence:"high"，含糊 confidence:"low"。
严格输出 JSON：{"operations":[{"field":"...","value":"..."}],"confidence":"high|low","unresolved":[]}`;
  },

  buildIntentUserPrompt(utterance: string, ctx: AdapterContext) {
    const p = (ctx as ProjectContext).project;
    const lines = [
      '## 当前项目字段',
      `- 名称：${p.name}`,
      `- 状态：${STATUS_LABEL[p.status] ?? p.status}`,
      `- 优先级：${PRIORITY_LABEL[p.priority] ?? p.priority}`,
      `- 计划开始：${iso(p.startDate)}`,
      `- 计划结束：${iso(p.endDate)}`,
      '',
      '## 用户的话',
      utterance,
      '',
      '请输出 JSON 格式的结构化意图。',
    ];
    return lines.join('\n');
  },

  parseIntent(rawLLM: string, _ctx: AdapterContext): IntentParseResult<ProjectChangeIntent> {
    let jsonStr = rawLLM.trim();
    const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) jsonStr = fenced[1].trim();
    let raw: unknown;
    try {
      raw = JSON.parse(jsonStr);
    } catch {
      return { ok: false, kind: 'unparseable' };
    }
    const parsed = projectChangeIntentSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, kind: 'invalid_schema', detail: parsed.error.issues.map((i) => i.message).join('; ') };
    }
    return { ok: true, intent: parsed.data };
  },

  buildPreview(intent: ProjectChangeIntent, ctx: AdapterContext): AssistantPreview {
    const p = (ctx as ProjectContext).project;
    const rows: AssistantDiffRow[] = intent.operations.map((op) => ({
      key: op.field,
      label: FIELD_LABEL[op.field],
      before: displayValue(op.field, currentValue(op.field, p)),
      after: displayValue(op.field, op.value),
    }));
    const risks: AssistantRisk[] = [];
    const { start, end } = resolveDates(intent, p);
    if (start && end && end.getTime() < start.getTime()) {
      risks.push({ kind: '日期区间无效', severity: 'danger', text: `结束日 ${iso(end)} 早于开始日 ${iso(start)}` });
    }
    return { rows, risks, confidence: intent.confidence };
  },

  async apply(intent: ProjectChangeIntent, freshCtx: AdapterContext, _req: Request) {
    const ctx = freshCtx as ProjectContext;
    const { start, end } = resolveDates(intent, ctx.project);
    if (start && end && !isValidDateRange(iso(start), iso(end))) {
      throw new ProjectValidationError('结束日期不能早于开始日期');
    }

    const data: Record<string, unknown> = {};
    for (const op of intent.operations) {
      if (op.field === 'startDate' || op.field === 'endDate') {
        data[op.field] = new Date(`${op.value}T00:00:00.000Z`);
      } else {
        data[op.field] = op.value;
      }
    }

    await prisma.project.update({ where: { id: ctx.targetId }, data });

    const rows: AssistantDiffRow[] = intent.operations.map((op) => ({
      key: op.field,
      label: FIELD_LABEL[op.field],
      before: displayValue(op.field, currentValue(op.field, ctx.project)),
      after: displayValue(op.field, op.value),
    }));
    return { rows, risks: [] };
  },
};
