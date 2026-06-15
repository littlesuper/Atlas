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
}

/** update/delete 时目标实体快照（create 不用） */
export interface EntitySnapshot {
  id: string;
  fingerprint: string;
  fields: Record<string, unknown>;
}

export type CapabilityMode = 'create' | 'update' | 'delete' | 'custom';

export interface Capability<TInput = Record<string, unknown>> {
  name: string; // 命名空间化，如 'project.create'（不与现有 domain key 冲突）
  description: string; // 给 LLM 路由 + 填参
  permission: { resource: string; action: string };
  danger?: 'normal' | 'dangerous';
  mode: CapabilityMode;
  /** 全字段可选 + 枚举约束：用于 parse 阶段拦类型/枚举；业务必填交给 missingRequired */
  inputSchema: z.ZodType<TInput>;
  /** 填参 prompt（含字段说明 + 「绝不编造未陈述值」铁律） */
  buildPrompt(utterance: string, ctx: CapabilityContext): { system: string; user: string };
  /** 缺失必填字段的中文名清单；不提供则视为无缺失 */
  missingRequired?(input: TInput, ctx: CapabilityContext): string[];
  /** 在 missingRequired 通过后补默认值（如 managerId=当前用户），返回用于预览/写入的完整 input */
  applyDefaults?(input: TInput, ctx: CapabilityContext): TInput;
  /** genericPreview 的展示配置（mode!=custom 时建议提供） */
  previewLabels?: Record<string, string>;
  previewDisplay?(key: string, value: unknown, ctx: CapabilityContext): string;
  /** custom 模式自定义预览（排期等复杂领域）；提供则覆盖 genericPreview */
  buildPreview?(input: TInput, entity: EntitySnapshot | undefined, ctx: CapabilityContext): AssistantPreview;
  /** update/delete 取目标实体；create 不提供 */
  loadEntity?(id: string, ctx: CapabilityContext): Promise<EntitySnapshot | null>;
  /** update/delete 用实体快照哈希；create 默认用 args 哈希（编排里兜底） */
  fingerprint?(entity?: EntitySnapshot): string;
  /** 写入：调现有 service/prisma（自带校验+审计语义） */
  execute(input: TInput, ctx: CapabilityContext, req: Request): Promise<{ rows: AssistantDiffRow[]; risks: AssistantRisk[] }>;
}
