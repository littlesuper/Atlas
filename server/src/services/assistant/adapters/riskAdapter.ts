/**
 * 助手框架 · 风险项编辑适配器（Phase 3）
 *
 * 目标对象是项目（targetId = projectId，由 resolveProjectTarget 定位）；
 * 在该项目下新建风险项 / 修改已有风险项的严重度·状态。
 *
 * 安全：
 *  - 严重度/状态枚举由 Zod 兜底；update 的 riskItemId 对**本项目风险项**做白名单校验（拦造假 id）；
 *  - 写入复用风险项写库语义：prisma.riskItem.create/update + RiskItemLog（与 PUT/POST /api/risk-items 一致）；
 *  - create 的 source 标记为 'manual'（人确认后写入）；变更溯源另由 orchestrator 的 assistant 审计记录。
 */
import type { Request } from 'express';
import crypto from 'crypto';
import prisma from '../../../db';
import {
  riskChangeIntentSchema,
  type RiskChangeIntent,
} from '../../../schemas/riskAssistant';
import type {
  AssistantActionAdapter,
  AdapterContext,
  AssistantPreview,
  AssistantDiffRow,
  IntentParseResult,
} from '../types';

interface RiskItemRef {
  id: string;
  title: string;
  severity: string;
  status: string;
}
interface RiskContext extends AdapterContext {
  riskItems: RiskItemRef[];
}

const SEVERITY_LABEL: Record<string, string> = { LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '严重' };
const STATUS_LABEL: Record<string, string> = {
  OPEN: '待处理',
  IN_PROGRESS: '处理中',
  RESOLVED: '已解决',
  ACCEPTED: '已接受',
};

function fingerprint(items: RiskItemRef[]): string {
  const blob = items
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => `${r.id}:${r.severity}:${r.status}:${r.title}`)
    .join('|');
  return crypto.createHash('sha256').update(blob).digest('hex').slice(0, 16);
}

export const riskAdapter: AssistantActionAdapter<RiskChangeIntent> = {
  domain: 'risk',
  description: '管理项目的风险项：新建一条风险项；修改已有风险项的严重度(低/中/高/严重)或状态(待处理/处理中/已解决/已接受)。',
  permission: { resource: 'project', action: 'update' },

  async loadContext(targetId: string): Promise<RiskContext | null> {
    const project = await prisma.project.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!project) return null;
    const items = await prisma.riskItem.findMany({
      where: { projectId: targetId },
      select: { id: true, title: true, severity: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
    return { targetId, fingerprint: fingerprint(items), riskItems: items };
  },

  buildIntentSystemPrompt() {
    return `你是项目管理系统的"风险项编辑意图解析器"。把用户的话解析成对**风险项**的结构化改动。
可执行的操作：
- create_risk：新建风险项。{ "type":"create_risk", "title":"<风险标题，来自用户原话>", "severity":"LOW|MEDIUM|HIGH|CRITICAL", "description":"<可选>" }
- update_risk：修改已有风险项的严重度/状态。{ "type":"update_risk", "riskItemId":"<从下方清单选>", "severity":"...(可选)", "status":"OPEN|IN_PROGRESS|RESOLVED|ACCEPTED(可选)" }

铁律：
- update_risk 的 riskItemId **只能**从下方"现有风险项清单"里选；清单里没有就**不要编造 id**（改用 create_risk 或放进 unresolved）。
- severity/status 必须是上面的枚举值；映射不了就不要输出该操作。
- **不要编造用户没说的标题或内容**；create_risk 的 title 用用户原话里的风险描述。
- 解析不出明确改动 → 返回空 operations。confidence：有把握 high，含糊 low。
严格输出 JSON：{"operations":[...],"confidence":"high|low","unresolved":[]}`;
  },

  buildIntentUserPrompt(utterance: string, ctx: AdapterContext) {
    const c = ctx as RiskContext;
    const lines: string[] = ['## 现有风险项清单（update_risk 只能从这里选 riskItemId）'];
    if (c.riskItems.length === 0) lines.push('（暂无风险项）');
    else
      for (const r of c.riskItems)
        lines.push(`- id=${r.id} | 标题=${r.title} | 严重度=${SEVERITY_LABEL[r.severity] ?? r.severity} | 状态=${STATUS_LABEL[r.status] ?? r.status}`);
    lines.push('', '## 用户的话', utterance, '', '请输出 JSON 格式的结构化意图。');
    return lines.join('\n');
  },

  parseIntent(rawLLM: string, ctx: AdapterContext): IntentParseResult<RiskChangeIntent> {
    let jsonStr = rawLLM.trim();
    const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) jsonStr = fenced[1].trim();
    let raw: unknown;
    try {
      raw = JSON.parse(jsonStr);
    } catch {
      return { ok: false, kind: 'unparseable' };
    }
    const parsed = riskChangeIntentSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, kind: 'invalid_schema', detail: parsed.error.issues.map((i) => i.message).join('; ') };
    }
    // 反幻觉：update_risk 的 riskItemId 必须在本项目风险项清单内
    const validIds = new Set((ctx as RiskContext).riskItems.map((r) => r.id));
    for (const op of parsed.data.operations) {
      if (op.type === 'update_risk' && !validIds.has(op.riskItemId)) {
        return { ok: false, kind: 'fabricated_id', detail: op.riskItemId };
      }
    }
    return { ok: true, intent: parsed.data };
  },

  buildPreview(intent: RiskChangeIntent, ctx: AdapterContext): AssistantPreview {
    const byId = new Map((ctx as RiskContext).riskItems.map((r) => [r.id, r]));
    const rows: AssistantDiffRow[] = [];
    for (const op of intent.operations) {
      if (op.type === 'create_risk') {
        rows.push({
          key: `new:${op.title}`,
          label: '新建风险项',
          before: '（无）',
          after: `${op.title}（严重度：${SEVERITY_LABEL[op.severity]}）`,
        });
      } else {
        const existing = byId.get(op.riskItemId);
        if (!existing) continue;
        if (op.severity && op.severity !== existing.severity) {
          rows.push({
            key: `${op.riskItemId}:severity`,
            label: `「${existing.title}」严重度`,
            before: SEVERITY_LABEL[existing.severity] ?? existing.severity,
            after: SEVERITY_LABEL[op.severity],
          });
        }
        if (op.status && op.status !== existing.status) {
          rows.push({
            key: `${op.riskItemId}:status`,
            label: `「${existing.title}」状态`,
            before: STATUS_LABEL[existing.status] ?? existing.status,
            after: STATUS_LABEL[op.status],
          });
        }
      }
    }
    return { rows, risks: [], confidence: intent.confidence };
  },

  async apply(intent: RiskChangeIntent, freshCtx: AdapterContext, req: Request) {
    const c = freshCtx as RiskContext;
    const byId = new Map(c.riskItems.map((r) => [r.id, r]));
    const userId = req.user?.id || '';
    const rows: AssistantDiffRow[] = [];

    for (const op of intent.operations) {
      if (op.type === 'create_risk') {
        const item = await prisma.riskItem.create({
          data: {
            projectId: c.targetId,
            title: op.title,
            description: op.description || null,
            severity: op.severity,
            source: 'manual',
          },
        });
        await prisma.riskItemLog.create({
          data: {
            riskItemId: item.id,
            action: 'CREATED',
            content: `创建风险项「${op.title}」，严重度: ${op.severity}`,
            userId,
          },
        });
        rows.push({ key: `new:${item.id}`, label: '新建风险项', before: '（无）', after: `${op.title}（严重度：${SEVERITY_LABEL[op.severity]}）` });
      } else {
        const existing = byId.get(op.riskItemId);
        if (!existing) continue;
        const data: Record<string, unknown> = {};
        if (op.severity && op.severity !== existing.severity) {
          data.severity = op.severity;
          await prisma.riskItemLog.create({
            data: { riskItemId: op.riskItemId, action: 'SEVERITY_CHANGED', content: `严重度从 ${existing.severity} 变更为 ${op.severity}`, userId },
          });
          rows.push({ key: `${op.riskItemId}:severity`, label: `「${existing.title}」严重度`, before: SEVERITY_LABEL[existing.severity] ?? existing.severity, after: SEVERITY_LABEL[op.severity] });
        }
        if (op.status && op.status !== existing.status) {
          data.status = op.status;
          if (op.status === 'RESOLVED') data.resolvedAt = new Date();
          await prisma.riskItemLog.create({
            data: { riskItemId: op.riskItemId, action: 'STATUS_CHANGED', content: `状态从 ${existing.status} 变更为 ${op.status}`, userId },
          });
          rows.push({ key: `${op.riskItemId}:status`, label: `「${existing.title}」状态`, before: STATUS_LABEL[existing.status] ?? existing.status, after: STATUS_LABEL[op.status] });
        }
        if (Object.keys(data).length > 0) {
          await prisma.riskItem.update({ where: { id: op.riskItemId }, data });
        }
      }
    }
    return { rows, risks: [] };
  },
};
