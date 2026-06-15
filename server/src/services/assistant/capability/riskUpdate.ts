import type { Request } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../../../db';
import { riskChangeIntentSchema, type RiskChangeIntent } from '../../../schemas/riskAssistant';
import type { AssistantPreview, AssistantDiffRow } from '../types';
import { genericNarrateUserPrompt } from './orchestrator';
import type { Capability, CapabilityContext, EntitySnapshot } from './types';

interface RiskItemRef { id: string; title: string; severity: string; status: string; }
const SEVERITY_LABEL: Record<string, string> = { LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '严重' };
const STATUS_LABEL: Record<string, string> = { OPEN: '待处理', IN_PROGRESS: '处理中', RESOLVED: '已解决', ACCEPTED: '已接受' };

function fp(items: RiskItemRef[]): string {
  const blob = items.slice().sort((a, b) => a.id.localeCompare(b.id)).map((r) => `${r.id}:${r.severity}:${r.status}:${r.title}`).join('|');
  return crypto.createHash('sha256').update(blob).digest('hex').slice(0, 16);
}

export const riskUpdateCapability: Capability<RiskChangeIntent> = {
  name: 'risk.update',
  description: '管理项目的风险项：新建一条风险项；修改已有风险项的严重度(低/中/高/严重)或状态(待处理/处理中/已解决/已接受)。',
  permission: { resource: 'project', action: 'update' },
  mode: 'custom',
  target: 'project',
  inputSchema: z.any() as unknown as z.ZodType<RiskChangeIntent>,

  async loadEntity(id): Promise<EntitySnapshot | null> {
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return null;
    const items = await prisma.riskItem.findMany({ where: { projectId: id }, select: { id: true, title: true, severity: true, status: true }, orderBy: { createdAt: 'desc' } });
    return { id, fingerprint: fp(items), fields: { riskItems: items } as Record<string, unknown> };
  },
  fingerprint: (e) => e?.fingerprint ?? '',

  buildPrompt(utterance, _ctx, entity) {
    const items = (entity!.fields.riskItems as RiskItemRef[]) ?? [];
    const system = `你是项目管理系统的"风险项编辑意图解析器"。把用户的话解析成对**风险项**的结构化改动。
可执行的操作：
- create_risk：新建风险项。{ "type":"create_risk", "title":"<风险标题，来自用户原话>", "severity":"LOW|MEDIUM|HIGH|CRITICAL", "description":"<可选>" }
- update_risk：修改已有风险项的严重度/状态。{ "type":"update_risk", "riskItemId":"<从下方清单选>", "severity":"...(可选)", "status":"OPEN|IN_PROGRESS|RESOLVED|ACCEPTED(可选)" }
铁律：
- update_risk 的 riskItemId **只能**从下方清单里选；清单里没有就**不要编造 id**。
- severity/status 必须是上面的枚举值；映射不了就不要输出该操作。
- **不要编造用户没说的标题或内容**。解析不出明确改动 → 返回空 operations。confidence：有把握 high，含糊 low。
严格输出 JSON：{"operations":[...],"confidence":"high|low","unresolved":[]}`;
    const lines: string[] = ['## 现有风险项清单（update_risk 只能从这里选 riskItemId）'];
    if (items.length === 0) lines.push('（暂无风险项）');
    else for (const r of items) lines.push(`- id=${r.id} | 标题=${r.title} | 严重度=${SEVERITY_LABEL[r.severity] ?? r.severity} | 状态=${STATUS_LABEL[r.status] ?? r.status}`);
    lines.push('', '## 用户的话', utterance, '', '请输出 JSON 格式的结构化意图。');
    return { system, user: lines.join('\n') };
  },

  parseArgs(rawLLM, _ctx, entity) {
    let s = rawLLM.trim();
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) s = fenced[1].trim();
    let raw: unknown;
    try { raw = JSON.parse(s); } catch { return { ok: false, kind: 'not_understood' }; }
    const parsed = riskChangeIntentSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, kind: 'not_understood' };
    const validIds = new Set(((entity!.fields.riskItems as RiskItemRef[]) ?? []).map((r) => r.id));
    for (const op of parsed.data.operations) if (op.type === 'update_risk' && !validIds.has(op.riskItemId)) return { ok: false, kind: 'fabricated' };
    return { ok: true, input: parsed.data };
  },

  buildPreview(intent, entity): AssistantPreview {
    const items = (entity!.fields.riskItems as RiskItemRef[]) ?? [];
    const byId = new Map(items.map((r) => [r.id, r]));
    const rows: AssistantDiffRow[] = [];
    for (const op of intent.operations) {
      if (op.type === 'create_risk') {
        rows.push({ key: `new:${op.title}`, label: '新建风险项', before: '（无）', after: `${op.title}（严重度：${SEVERITY_LABEL[op.severity]}）` });
      } else {
        const existing = byId.get(op.riskItemId);
        if (!existing) continue;
        if (op.severity && op.severity !== existing.severity) rows.push({ key: `${op.riskItemId}:severity`, label: `「${existing.title}」严重度`, before: SEVERITY_LABEL[existing.severity] ?? existing.severity, after: SEVERITY_LABEL[op.severity] });
        if (op.status && op.status !== existing.status) rows.push({ key: `${op.riskItemId}:status`, label: `「${existing.title}」状态`, before: STATUS_LABEL[existing.status] ?? existing.status, after: STATUS_LABEL[op.status] });
      }
    }
    return { rows, risks: [], confidence: intent.confidence };
  },

  narrate: (preview) => genericNarrateUserPrompt(preview),

  async execute(intent, _ctx: CapabilityContext, req: Request, target) {
    const items = (target!.entity.fields.riskItems as RiskItemRef[]) ?? [];
    const byId = new Map(items.map((r) => [r.id, r]));
    const userId = req.user?.id || '';
    const rows: AssistantDiffRow[] = [];
    for (const op of intent.operations) {
      if (op.type === 'create_risk') {
        const item = await prisma.riskItem.create({ data: { projectId: target!.id, title: op.title, description: op.description || null, severity: op.severity, source: 'manual' } });
        await prisma.riskItemLog.create({ data: { riskItemId: item.id, action: 'CREATED', content: `创建风险项「${op.title}」，严重度: ${op.severity}`, userId } });
        rows.push({ key: `new:${item.id}`, label: '新建风险项', before: '（无）', after: `${op.title}（严重度：${SEVERITY_LABEL[op.severity]}）` });
      } else {
        const existing = byId.get(op.riskItemId);
        if (!existing) continue;
        const data: Record<string, unknown> = {};
        if (op.severity && op.severity !== existing.severity) {
          data.severity = op.severity;
          await prisma.riskItemLog.create({ data: { riskItemId: op.riskItemId, action: 'SEVERITY_CHANGED', content: `严重度从 ${existing.severity} 变更为 ${op.severity}`, userId } });
          rows.push({ key: `${op.riskItemId}:severity`, label: `「${existing.title}」严重度`, before: SEVERITY_LABEL[existing.severity] ?? existing.severity, after: SEVERITY_LABEL[op.severity] });
        }
        if (op.status && op.status !== existing.status) {
          data.status = op.status;
          if (op.status === 'RESOLVED') data.resolvedAt = new Date();
          await prisma.riskItemLog.create({ data: { riskItemId: op.riskItemId, action: 'STATUS_CHANGED', content: `状态从 ${existing.status} 变更为 ${op.status}`, userId } });
          rows.push({ key: `${op.riskItemId}:status`, label: `「${existing.title}」状态`, before: STATUS_LABEL[existing.status] ?? existing.status, after: STATUS_LABEL[op.status] });
        }
        if (Object.keys(data).length > 0) await prisma.riskItem.update({ where: { id: op.riskItemId }, data });
      }
    }
    return { rows, risks: [] };
  },
};
