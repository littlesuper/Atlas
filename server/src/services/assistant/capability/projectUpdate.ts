import type { Request } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../../../db';
import { isValidDateRange } from '../../../utils/validation';
import {
  projectChangeIntentSchema,
  type ProjectChangeIntent,
  type ProjectOperation,
} from '../../../schemas/projectAssistant';
import type { AssistantPreview, AssistantDiffRow, AssistantRisk } from '../types';
import { genericNarrateUserPrompt } from './orchestrator';
import type { Capability, CapabilityContext } from './types';
import { CapabilityValidationError } from '../errors';
export { CapabilityValidationError as ProjectUpdateValidationError };

interface ProjectFields { name: string; status: string; priority: string; startDate: Date | null; endDate: Date | null; }

const STATUS_LABEL: Record<string, string> = { IN_PROGRESS: '进行中', COMPLETED: '已完成', ON_HOLD: '已暂停', ARCHIVED: '已归档' };
const PRIORITY_LABEL: Record<string, string> = { LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '紧急' };
const FIELD_LABEL: Record<ProjectOperation['field'], string> = { name: '名称', status: '状态', priority: '优先级', startDate: '计划开始', endDate: '计划结束' };
const iso = (d: Date | null) => (d ? d.toISOString().split('T')[0] : '未设定');

function displayValue(field: ProjectOperation['field'], value: string | Date | null): string {
  if (field === 'status') return STATUS_LABEL[value as string] ?? String(value);
  if (field === 'priority') return PRIORITY_LABEL[value as string] ?? String(value);
  if (field === 'startDate' || field === 'endDate') return value instanceof Date ? iso(value) : (value as string) || '未设定';
  return (value as string) ?? '未设定';
}
function currentValue(field: ProjectOperation['field'], p: ProjectFields): string | Date | null {
  switch (field) { case 'name': return p.name; case 'status': return p.status; case 'priority': return p.priority; case 'startDate': return p.startDate; case 'endDate': return p.endDate; }
}
function resolveDates(intent: ProjectChangeIntent, p: ProjectFields): { start: Date | null; end: Date | null } {
  let start = p.startDate, end = p.endDate;
  for (const op of intent.operations) {
    if (op.field === 'startDate') start = new Date(`${op.value}T00:00:00.000Z`);
    if (op.field === 'endDate') end = new Date(`${op.value}T00:00:00.000Z`);
  }
  return { start, end };
}
function fp(p: ProjectFields): string {
  return crypto.createHash('sha256').update([p.name, p.status, p.priority, iso(p.startDate), iso(p.endDate)].join('|')).digest('hex').slice(0, 16);
}

export const projectUpdateCapability: Capability<ProjectChangeIntent> = {
  name: 'project.update',
  description: '修改项目本身的属性：项目名称、项目状态(进行中/已完成/已暂停)、优先级、项目计划起止日期。',
  permission: { resource: 'project', action: 'update' },
  mode: 'custom',
  target: 'project',
  inputSchema: z.any() as unknown as z.ZodType<ProjectChangeIntent>,

  async loadEntity(id) {
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, status: true, priority: true, startDate: true, endDate: true } });
    if (!project) return null;
    if (project.status === 'ARCHIVED') return null; // 归档不可编辑 → target_not_found
    const fields: ProjectFields = { name: project.name, status: project.status, priority: project.priority, startDate: project.startDate, endDate: project.endDate };
    return { id, fingerprint: fp(fields), fields: fields as unknown as Record<string, unknown> };
  },
  fingerprint: (e) => e?.fingerprint ?? '',

  buildPrompt(utterance, _ctx, entity) {
    const p = entity!.fields as unknown as ProjectFields;
    const system = `你是项目管理系统的"项目字段编辑意图解析器"。把用户的话解析成对**项目本身属性**的结构化改动。
可改字段（只有这几项）：
- name：项目名称（字符串）
- status：项目状态，只能是 IN_PROGRESS(进行中) / COMPLETED(已完成) / ON_HOLD(已暂停)。**不能设为已归档**。
- priority：优先级，只能是 LOW(低) / MEDIUM(中) / HIGH(高) / CRITICAL(紧急)。
- startDate / endDate：计划起止日，格式 YYYY-MM-DD。
铁律：
- 只输出用户**明确表达**的字段改动；**绝不编造用户没说的值**。
- status/priority 必须映射到上面的枚举值之一；映射不了就不要输出该操作。
- 解析不出任何明确改动 → 返回空 operations。
- 有把握 confidence:"high"，含糊 confidence:"low"。
严格输出 JSON：{"operations":[{"field":"...","value":"..."}],"confidence":"high|low","unresolved":[]}`;
    const user = ['## 当前项目字段', `- 名称：${p.name}`, `- 状态：${STATUS_LABEL[p.status] ?? p.status}`, `- 优先级：${PRIORITY_LABEL[p.priority] ?? p.priority}`, `- 计划开始：${iso(p.startDate)}`, `- 计划结束：${iso(p.endDate)}`, '', '## 用户的话', utterance, '', '请输出 JSON 格式的结构化意图。'].join('\n');
    return { system, user };
  },

  parseArgs(rawLLM) {
    let s = rawLLM.trim();
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) s = fenced[1].trim();
    let raw: unknown;
    try { raw = JSON.parse(s); } catch { return { ok: false, kind: 'not_understood' }; }
    const parsed = projectChangeIntentSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, kind: 'not_understood' };
    return { ok: true, input: parsed.data };
  },

  buildPreview(intent, entity): AssistantPreview {
    const p = entity!.fields as unknown as ProjectFields;
    const rows: AssistantDiffRow[] = intent.operations.map((op) => ({ key: op.field, label: FIELD_LABEL[op.field], before: displayValue(op.field, currentValue(op.field, p)), after: displayValue(op.field, op.value) }));
    const risks: AssistantRisk[] = [];
    const { start, end } = resolveDates(intent, p);
    if (start && end && end.getTime() < start.getTime()) risks.push({ kind: '日期区间无效', severity: 'danger', text: `结束日 ${iso(end)} 早于开始日 ${iso(start)}` });
    return { rows, risks, confidence: intent.confidence };
  },

  narrate: (preview) => genericNarrateUserPrompt(preview),

  async execute(intent, _ctx: CapabilityContext, _req: Request, target) {
    const p = target!.entity.fields as unknown as ProjectFields;
    const { start, end } = resolveDates(intent, p);
    if (start && end && !isValidDateRange(iso(start), iso(end))) throw new CapabilityValidationError('结束日期不能早于开始日期');
    const data: Record<string, unknown> = {};
    for (const op of intent.operations) data[op.field] = (op.field === 'startDate' || op.field === 'endDate') ? new Date(`${op.value}T00:00:00.000Z`) : op.value;
    await prisma.project.update({ where: { id: target!.id }, data });
    const rows: AssistantDiffRow[] = intent.operations.map((op) => ({ key: op.field, label: FIELD_LABEL[op.field], before: displayValue(op.field, currentValue(op.field, p)), after: displayValue(op.field, op.value) }));
    return { rows, risks: [] };
  },
};
