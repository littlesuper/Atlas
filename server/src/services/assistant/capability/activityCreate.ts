import type { Request } from 'express';
import { z } from 'zod';
import prisma from '../../../db';
import { createActivityCore } from '../../../routes/activities/shared';
import type { AssistantDiffRow } from '../types';
import type { Capability, CapabilityContext } from './types';

export class ActivityCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivityCapabilityError';
  }
}

const activityCreateInputSchema = z.object({
  projectId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  type: z.enum(['TASK', 'MILESTONE', 'PHASE']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  planStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  planEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  roleId: z.string().min(1).optional(),
  description: z.string().optional(),
  phase: z.string().optional(),
});
type ActivityCreateInput = z.infer<typeof activityCreateInputSchema>;

const TYPE_LABEL: Record<string, string> = { TASK: '任务', MILESTONE: '里程碑', PHASE: '阶段' };
const PRIORITY_LABEL: Record<string, string> = { LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '紧急' };
const STATUS_LABEL: Record<string, string> = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', COMPLETED: '已完成', CANCELLED: '已取消' };

export const activityCreateCapability: Capability<ActivityCreateInput> = {
  name: 'activity.create',
  description: '在某个项目下新建一个活动/任务/里程碑（可指定负责角色，自动填入该角色的执行人）。当用户想"建/加一个活动、任务、里程碑"时用此能力。',
  permission: { resource: 'activity', action: 'create' },
  danger: 'normal',
  mode: 'create',
  inputSchema: activityCreateInputSchema,

  buildPrompt(utterance, ctx) {
    const projectList = ctx.projects.map((p) => `- id=${p.id} | 名称=${p.name}`).join('\n') || '（无可操作项目）';
    const roleList = (ctx.roles ?? []).map((r) => `- id=${r.id} | 名称=${r.name}`).join('\n') || '（无角色）';
    return {
      system: `你是项目管理系统的"新建活动意图解析器"。把用户的话解析成创建活动所需字段。
可填字段：
- projectId：必须从下方"项目清单"里选 id（用户点了哪个项目就选哪个）
- name：活动名称
- type：TASK(任务)/MILESTONE(里程碑)/PHASE(阶段)，不填默认 TASK
- priority：LOW/MEDIUM/HIGH/CRITICAL，不填默认 MEDIUM
- status：NOT_STARTED/IN_PROGRESS/COMPLETED/CANCELLED，一般不填（默认未开始）
- planStartDate/planEndDate：YYYY-MM-DD
- roleId：负责角色，必须从下方"角色清单"里选 id（用户说了角色名才填）
- description/phase：描述/阶段名
铁律：
- projectId 和 roleId **只能取下方清单里的 id**；清单里没有就**不要填**（绝不编造 id）。
- 只填用户**明确说出**的字段；绝不编造名称、日期、角色。映射不到的枚举不填。
严格输出 JSON（只含用户说了的键）：{"projectId":"...","name":"...","type":"...","priority":"...","planStartDate":"...","planEndDate":"...","roleId":"...","description":"...","phase":"..."}`,
      user: `## 项目清单（projectId 只能从这里选）\n${projectList}\n\n## 角色清单（roleId 只能从这里选）\n${roleList}\n\n## 用户的话\n${utterance}\n\n请输出 JSON。`,
    };
  },

  validateRefs(input, ctx) {
    const fabricated: string[] = [];
    if (input.projectId && !ctx.projects.some((p) => p.id === input.projectId)) fabricated.push(`projectId=${input.projectId}`);
    if (input.roleId && !(ctx.roles ?? []).some((r) => r.id === input.roleId)) fabricated.push(`roleId=${input.roleId}`);
    return fabricated.length ? { ok: false, fabricated } : { ok: true };
  },

  missingRequired(input) {
    const missing: string[] = [];
    if (!input.projectId) missing.push('项目');
    if (!input.name) missing.push('活动名称');
    return missing;
  },

  applyDefaults(input) {
    return { ...input, type: input.type ?? 'TASK', priority: input.priority ?? 'MEDIUM', status: input.status ?? 'NOT_STARTED' };
  },

  previewLabels: {
    projectId: '项目', name: '活动名称', type: '类型', priority: '优先级', status: '状态',
    planStartDate: '计划开始', planEndDate: '计划结束', roleId: '负责角色', description: '描述', phase: '阶段',
  },
  previewDisplay(key, value, ctx) {
    if (value == null || value === '') return '（空）';
    if (key === 'projectId') return ctx.projects.find((p) => p.id === value)?.name ?? String(value);
    if (key === 'roleId') {
      const name = (ctx.roles ?? []).find((r) => r.id === value)?.name ?? String(value);
      return `${name}（将自动填入该角色在职执行人）`;
    }
    if (key === 'type') return TYPE_LABEL[String(value)] ?? String(value);
    if (key === 'priority') return PRIORITY_LABEL[String(value)] ?? String(value);
    if (key === 'status') return STATUS_LABEL[String(value)] ?? String(value);
    return String(value);
  },

  async execute(input, _ctx: CapabilityContext, req: Request) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId! } });
    if (!project) throw new ActivityCapabilityError('项目不存在');

    const activity = await createActivityCore(
      project,
      {
        name: input.name!,
        type: input.type,
        priority: input.priority,
        status: input.status,
        phase: input.phase ?? null,
        description: input.description ?? null,
        roleId: input.roleId ?? null,
        planStartDate: input.planStartDate ? new Date(`${input.planStartDate}T00:00:00.000Z`) : null,
        planEndDate: input.planEndDate ? new Date(`${input.planEndDate}T00:00:00.000Z`) : null,
      },
      req
    );

    const executorCount = (activity as { executors?: unknown[] }).executors?.length ?? 0;
    const rows: AssistantDiffRow[] = [
      { key: 'name', label: '活动名称', before: '（空）', after: input.name! },
      { key: 'project', label: '项目', before: '（空）', after: project.name },
      { key: 'type', label: '类型', before: '（空）', after: TYPE_LABEL[input.type ?? 'TASK'] },
      { key: 'priority', label: '优先级', before: '（空）', after: PRIORITY_LABEL[input.priority ?? 'MEDIUM'] },
    ];
    if (input.roleId) {
      const roleName = (_ctx.roles ?? []).find((r) => r.id === input.roleId)?.name ?? input.roleId;
      rows.push({ key: 'executors', label: '执行人', before: '（空）', after: `按角色「${roleName}」自动填入 ${executorCount} 人` });
    }
    return { rows, risks: [] };
  },
};
