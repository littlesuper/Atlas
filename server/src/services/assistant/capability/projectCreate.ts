import type { Request } from 'express';
import { z } from 'zod';
import prisma from '../../../db';
import { isValidDateRange } from '../../../utils/validation';
import type { AssistantDiffRow } from '../types';
import type { Capability } from './types';

export class CapabilityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityValidationError';
  }
}

// 全字段可选 + 枚举约束：parse 阶段只拦类型/枚举，业务必填交给 missingRequired
const projectCreateInputSchema = z.object({
  name: z.string().min(1).optional(),
  productLine: z.string().min(1).optional(),
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'ON_HOLD']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  managerId: z.string().min(1).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().optional(),
});
type ProjectCreateInput = z.infer<typeof projectCreateInputSchema>;

const STATUS_LABEL: Record<string, string> = { IN_PROGRESS: '进行中', COMPLETED: '已完成', ON_HOLD: '已暂停' };
const PRIORITY_LABEL: Record<string, string> = { LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '紧急' };

export const projectCreateCapability: Capability<ProjectCreateInput> = {
  name: 'project.create',
  description: '新建/创建一个项目。当用户想"建一个项目/新增项目/创建项目"时用此能力。',
  permission: { resource: 'project', action: 'create' },
  danger: 'normal',
  mode: 'create',
  inputSchema: projectCreateInputSchema,

  buildPrompt(utterance) {
    return {
      system: `你是项目管理系统的"新建项目意图解析器"。把用户的话解析成创建项目所需字段。
可填字段：
- name：项目名称（字符串）
- productLine：产品线（字符串，如"蒲公英""向日葵"）
- status：IN_PROGRESS(进行中)/COMPLETED(已完成)/ON_HOLD(已暂停)，一般不填（默认进行中）
- priority：LOW/MEDIUM/HIGH/CRITICAL，不填默认 MEDIUM
- startDate/endDate：YYYY-MM-DD
- description：描述
铁律：
- 只填用户**明确说出**的字段；**绝不编造**名称、产品线、日期。用户没说就不要填该字段（留空，交给系统追问）。
- status/priority 映射不到枚举就不要填。
严格输出 JSON：{"name":"...","productLine":"...","priority":"...","startDate":"...","endDate":"...","description":"..."}（只含用户说了的键）。`,
      user: `## 用户的话\n${utterance}\n\n请输出 JSON。`,
    };
  },

  missingRequired(input) {
    const missing: string[] = [];
    if (!input.name) missing.push('项目名称');
    if (!input.productLine) missing.push('产品线');
    return missing;
  },

  applyDefaults(input, ctx) {
    return {
      ...input,
      managerId: input.managerId ?? ctx.userId, // 默认负责人=当前用户
      status: input.status ?? 'IN_PROGRESS',
      priority: input.priority ?? 'MEDIUM',
    };
  },

  previewLabels: {
    name: '名称', productLine: '产品线', status: '状态', priority: '优先级',
    managerId: '负责人', startDate: '计划开始', endDate: '计划结束', description: '描述',
  },
  previewDisplay(key, value, ctx) {
    if (value == null || value === '') return '（空）';
    if (key === 'status') return STATUS_LABEL[String(value)] ?? String(value);
    if (key === 'priority') return PRIORITY_LABEL[String(value)] ?? String(value);
    if (key === 'managerId') return String(value) === ctx.userId ? `${ctx.userName}（我）` : String(value);
    return String(value);
  },

  async execute(input, _ctx, _req: Request) {
    const managerId = input.managerId!;
    if (input.startDate && input.endDate && !isValidDateRange(input.startDate, input.endDate)) {
      throw new CapabilityValidationError('结束日期不能早于开始日期');
    }
    const manager = await prisma.user.findUnique({ where: { id: managerId } });
    if (!manager) throw new CapabilityValidationError('项目负责人不存在');

    await prisma.project.create({
      data: {
        name: input.name!,
        productLine: input.productLine!,
        status: input.status ?? 'IN_PROGRESS',
        priority: input.priority ?? 'MEDIUM',
        managerId,
        startDate: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null,
        endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
        description: input.description ?? null,
      },
    });

    const rows: AssistantDiffRow[] = [
      { key: 'name', label: '名称', before: '（空）', after: input.name! },
      { key: 'productLine', label: '产品线', before: '（空）', after: input.productLine! },
      { key: 'status', label: '状态', before: '（空）', after: STATUS_LABEL[input.status ?? 'IN_PROGRESS'] },
      { key: 'priority', label: '优先级', before: '（空）', after: PRIORITY_LABEL[input.priority ?? 'MEDIUM'] },
    ];
    return { rows, risks: [] };
  },
};
