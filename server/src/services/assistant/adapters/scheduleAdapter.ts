/**
 * 助手框架 · 排期适配器（首个领域）
 *
 * 完全复用既有排期纯逻辑与共享写入核心：
 *   - 解析：scheduleAssistantPrompts（prompt + parseIntentResponse 护栏）
 *   - 预览：scheduleEngine.dryRunSchedule + scheduleRisks.assessRisks（干跑=实算）
 *   - 写入：scheduleAssistant.executeScheduleApply（与老 /api/schedule-assistant 同一份）
 */
import type { Request } from 'express';
import {
  loadProjectSnapshot,
  computeSnapshotFingerprint,
  executeScheduleApply,
} from '../../scheduleAssistant';
import { dryRunSchedule, type ProjectSnapshot } from '../../../utils/scheduleEngine';
import { assessRisks, type RiskFinding } from '../../../utils/scheduleRisks';
import {
  buildIntentSystemPrompt,
  buildIntentUserPrompt,
  parseIntentResponse,
  buildNarrateUserPrompt,
  type IntentPromptActivity,
} from '../../../utils/scheduleAssistantPrompts';
import type { ScheduleChangeIntent } from '../../../schemas/scheduleAssistant';
import type {
  AssistantActionAdapter,
  AdapterContext,
  AssistantPreview,
  AssistantDiffRow,
  AssistantRisk,
  IntentParseResult,
} from '../types';

interface ScheduleContext extends AdapterContext {
  snapshot: ProjectSnapshot;
  promptActivities: IntentPromptActivity[];
  validIds: string[];
}

const iso = (d: Date | null) => (d ? d.toISOString().split('T')[0] : '—');

function toPromptActivities(snapshot: ProjectSnapshot): IntentPromptActivity[] {
  return snapshot.activities.map((a) => ({
    id: a.id,
    name: a.name,
    isMilestone: a.type === 'MILESTONE',
    planStartDate: a.planStartDate ? iso(a.planStartDate) : null,
    planEndDate: a.planEndDate ? iso(a.planEndDate) : null,
    dependsOn: a.dependencies.map((d) => d.id),
  }));
}

function riskToAssistant(r: RiskFinding): AssistantRisk {
  switch (r.kind) {
    case 'milestone_slip':
      return { kind: r.kind, severity: 'warning', text: `里程碑「${r.name}」从 ${iso(r.before)} 移到 ${iso(r.after)}` };
    case 'hard_node_breach':
      return { kind: r.kind, severity: 'danger', text: `「${r.name}」预计 ${iso(r.projected)} 完成，晚于硬节点 ${iso(r.deadline)}` };
    case 'project_overdue':
      return { kind: r.kind, severity: 'danger', text: `项目预计 ${iso(r.projectedEnd)} 结束，晚于截止 ${iso(r.projectDeadline)}` };
  }
}

export const scheduleAdapter: AssistantActionAdapter<ScheduleChangeIntent> = {
  domain: 'schedule',
  description: '调整活动排期：推迟/提前某活动、设定活动计划起止日、改工期、增删活动之间的依赖关系。',
  permission: { resource: 'activity', action: 'update' },

  async loadContext(targetId: string): Promise<ScheduleContext | null> {
    const snapshot = await loadProjectSnapshot(targetId);
    if (!snapshot) return null;
    return {
      targetId,
      fingerprint: computeSnapshotFingerprint(snapshot),
      snapshot,
      promptActivities: toPromptActivities(snapshot),
      validIds: snapshot.activities.map((a) => a.id),
    };
  },

  buildIntentSystemPrompt() {
    return buildIntentSystemPrompt();
  },

  buildIntentUserPrompt(utterance: string, ctx: AdapterContext) {
    return buildIntentUserPrompt(utterance, (ctx as ScheduleContext).promptActivities);
  },

  parseIntent(rawLLM: string, ctx: AdapterContext): IntentParseResult<ScheduleChangeIntent> {
    const c = ctx as ScheduleContext;
    return parseIntentResponse(rawLLM, c.validIds, c.targetId);
  },

  buildPreview(intent: ScheduleChangeIntent, ctx: AdapterContext): AssistantPreview {
    const c = ctx as ScheduleContext;
    const dry = dryRunSchedule(c.snapshot, intent.operations);
    const risks = assessRisks(c.snapshot, dry.snapshot, dry.diff);
    const rows: AssistantDiffRow[] = dry.diff.items
      .filter((i) => i.changed)
      .map((i) => ({
        key: i.activityId,
        label: i.name,
        before: `${iso(i.before.start)} ~ ${iso(i.before.end)}`,
        after: `${iso(i.after.start)} ~ ${iso(i.after.end)}`,
      }));
    return { rows, risks: risks.map(riskToAssistant), confidence: intent.confidence, raw: { diff: dry.diff, risks } };
  },

  async apply(intent: ScheduleChangeIntent, freshCtx: AdapterContext, req: Request) {
    const c = freshCtx as ScheduleContext;
    const { diff, risks } = await executeScheduleApply(c.targetId, intent.operations, c.snapshot, req);
    const rows: AssistantDiffRow[] = diff.items
      .filter((i) => i.changed)
      .map((i) => ({
        key: i.activityId,
        label: i.name,
        before: `${iso(i.before.start)} ~ ${iso(i.before.end)}`,
        after: `${iso(i.after.start)} ~ ${iso(i.after.end)}`,
      }));
    return { rows, risks: risks.map(riskToAssistant) };
  },

  describeForNarration(preview: AssistantPreview): string {
    const raw = preview.raw as { diff: Parameters<typeof buildNarrateUserPrompt>[0]; risks: RiskFinding[] } | undefined;
    if (raw) return buildNarrateUserPrompt(raw.diff, raw.risks);
    // 兜底：通用格式
    const lines = ['## 改动清单'];
    for (const r of preview.rows) lines.push(`- ${r.label}：${r.before} → ${r.after}`);
    return lines.join('\n');
  },
};
