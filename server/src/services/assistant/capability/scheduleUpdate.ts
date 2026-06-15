import type { Request } from 'express';
import { z } from 'zod';
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
import type { AssistantPreview, AssistantDiffRow, AssistantRisk } from '../types';
import { genericNarrateUserPrompt, CapabilityForbiddenError } from './orchestrator';
import { canManageProject } from '../../../middleware/permission';
import prisma from '../../../db';
import type { Capability, CapabilityContext, EntitySnapshot } from './types';

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

interface ScheduleFields {
  snapshot: ProjectSnapshot;
  validIds: string[];
  promptActivities: IntentPromptActivity[];
}

export const scheduleUpdateCapability: Capability<ScheduleChangeIntent> = {
  name: 'schedule.update',
  description: '调整活动排期：推迟/提前某活动、设定活动计划起止日、改工期、增删活动之间的依赖关系。',
  permission: { resource: 'activity', action: 'update' },
  mode: 'custom',
  target: 'project',
  // 解析全由 parseArgs 接管，inputSchema 仅占位（不会被默认管线用到）
  inputSchema: z.any() as unknown as z.ZodType<ScheduleChangeIntent>,

  async loadEntity(id: string): Promise<EntitySnapshot | null> {
    const snapshot = await loadProjectSnapshot(id);
    if (!snapshot) return null;
    const fields: ScheduleFields = {
      snapshot,
      validIds: snapshot.activities.map((a) => a.id),
      promptActivities: toPromptActivities(snapshot),
    };
    return { id, fingerprint: computeSnapshotFingerprint(snapshot), fields: fields as unknown as Record<string, unknown> };
  },
  fingerprint: (e) => e?.fingerprint ?? '',

  buildPrompt(utterance, _ctx, entity) {
    const f = entity?.fields as unknown as ScheduleFields;
    return { system: buildIntentSystemPrompt(), user: buildIntentUserPrompt(utterance, f?.promptActivities ?? []) };
  },

  parseArgs(rawLLM, _ctx, entity) {
    const f = entity?.fields as unknown as ScheduleFields;
    const r = parseIntentResponse(rawLLM, f?.validIds ?? [], entity?.id ?? '');
    if (r.ok) return { ok: true, input: r.intent };
    return { ok: false, kind: r.kind === 'fabricated_id' ? 'fabricated' : 'not_understood' };
  },

  buildPreview(intent, entity): AssistantPreview {
    const f = entity!.fields as unknown as ScheduleFields;
    const dry = dryRunSchedule(f.snapshot, intent.operations);
    const risks = assessRisks(f.snapshot, dry.snapshot, dry.diff);
    const rows: AssistantDiffRow[] = dry.diff.items
      .filter((i) => i.changed)
      .map((i) => ({ key: i.activityId, label: i.name, before: `${iso(i.before.start)} ~ ${iso(i.before.end)}`, after: `${iso(i.after.start)} ~ ${iso(i.after.end)}` }));
    return { rows, risks: risks.map(riskToAssistant), confidence: intent.confidence, raw: { diff: dry.diff, risks } };
  },

  narrate(preview) {
    const raw = preview.raw as { diff: Parameters<typeof buildNarrateUserPrompt>[0]; risks: RiskFinding[] } | undefined;
    return raw ? buildNarrateUserPrompt(raw.diff, raw.risks) : genericNarrateUserPrompt(preview);
  },

  async execute(intent, _ctx: CapabilityContext, req: Request, target) {
    const f = target!.entity.fields as unknown as ScheduleFields;
    // 走现有校验路径：仅管理员/项目经理/协作者可调排期（与 /api/schedule-assistant 的 canManageProject 门控一致）
    const proj = await prisma.project.findUnique({ where: { id: target!.id }, select: { managerId: true } });
    if (!proj || !canManageProject(req, proj.managerId, target!.id)) throw new CapabilityForbiddenError('只能调整自己负责的项目');
    const { diff, risks } = await executeScheduleApply(target!.id, intent.operations, f.snapshot, req);
    const rows: AssistantDiffRow[] = diff.items
      .filter((i) => i.changed)
      .map((i) => ({ key: i.activityId, label: i.name, before: `${iso(i.before.start)} ~ ${iso(i.before.end)}`, after: `${iso(i.after.start)} ~ ${iso(i.after.end)}` }));
    return { rows, risks: risks.map(riskToAssistant) };
  },
};
