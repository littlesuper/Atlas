import type { Request } from 'express';
import type { z } from 'zod';
import type { AssistantPreview, AssistantDiffRow, AssistantRisk } from '../types';

/** 调用方上下文：权限边界 + 默认值来源 */
export interface CapabilityContext {
  userId: string;
  userName: string;
  permissions: string[];
  contextProjectId?: string | null;
  projects: { id: string; name: string }[]; // 该用户权限可见的项目（id 白名单/默认值用）
  roles?: { id: string; name: string }[]; // 角色名解析/展示（activity.create 等用）；未提供视为空
}

/** update/delete 时目标实体快照（create 不用） */
export interface EntitySnapshot {
  id: string;
  fingerprint: string;
  fields: Record<string, unknown>;
}

export type CapabilityMode = 'create' | 'update' | 'delete' | 'custom';

export type CapabilityParseResult<TInput> =
  | { ok: true; input: TInput }
  | { ok: false; kind: 'not_understood' | 'fabricated' };

export interface Capability<TInput = Record<string, unknown>> {
  name: string; // 命名空间化，如 'project.create'（不与现有 domain key 冲突）
  description: string; // 给 LLM 路由 + 填参
  permission: { resource: string; action: string };
  danger?: 'normal' | 'dangerous';
  mode: CapabilityMode;
  /** 全字段可选 + 枚举约束：用于 parse 阶段拦类型/枚举；业务必填交给 missingRequired */
  inputSchema: z.ZodType<TInput>;
  /** 填参 prompt（含字段说明 + 「绝不编造未陈述值」铁律） */
  buildPrompt(utterance: string, ctx: CapabilityContext, entity?: EntitySnapshot): { system: string; user: string };
  /** 缺失必填字段的中文名清单；不提供则视为无缺失 */
  missingRequired?(input: TInput, ctx: CapabilityContext): string[];
  /** 在 missingRequired 通过后补默认值（如 managerId=当前用户），返回用于预览/写入的完整 input */
  applyDefaults?(input: TInput, ctx: CapabilityContext): TInput;
  /** genericPreview 的展示配置（mode!=custom 时建议提供） */
  previewLabels?: Record<string, string>;
  previewDisplay?(key: string, value: unknown, ctx: CapabilityContext): string;
  /** custom 模式自定义预览（排期等复杂领域）；提供则覆盖 genericPreview */
  buildPreview?(input: TInput, entity: EntitySnapshot | undefined, ctx: CapabilityContext): AssistantPreview;
  /** 'project' = 作用于某个项目的 update/custom 能力：编排会 resolveProjectTarget + loadEntity。
   *  缺省 = create 类，无目标实体（projectId 等以输入字段形式出现，经 validateRefs 白名单）。 */
  target?: 'project';
  /** 默认解析管线（extractJson → inputSchema → validateRefs）中的引用 id 白名单钩子。
   *  target 类能力会收到 loadEntity 得到的 entity（如 risk.update 用它校验 riskItemId）。 */
  validateRefs?(input: TInput, ctx: CapabilityContext, entity?: EntitySnapshot):
    | { ok: true }
    | { ok: false; fabricated: string[] };
  /** 复杂解析能力整体接管解析；提供则跳过默认管线（inputSchema/validateRefs 不再调用）。 */
  parseArgs?(rawLLM: string, ctx: CapabilityContext, entity?: EntitySnapshot): CapabilityParseResult<TInput>;
  /** 自定义叙述 user prompt；提供则触发 LLM 复述，缺省走确定性叙述。 */
  narrate?(preview: AssistantPreview): string;
  /** update/delete 取目标实体；create 不提供 */
  loadEntity?(id: string, ctx: CapabilityContext): Promise<EntitySnapshot | null>;
  /** update/delete 用实体快照哈希；create 默认用 args 哈希（编排里兜底） */
  fingerprint?(entity?: EntitySnapshot): string;
  /** 写入：调现有 service/prisma（自带校验+审计语义）。target 类能力额外收到新鲜目标 {id, entity}。 */
  execute(
    input: TInput,
    ctx: CapabilityContext,
    req: Request,
    target?: { id: string; entity: EntitySnapshot }
  ): Promise<{ rows: AssistantDiffRow[]; risks: AssistantRisk[] }>;
}
