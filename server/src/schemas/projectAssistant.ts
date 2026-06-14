/**
 * 项目字段编辑助手 · Zod 意图契约（assistant 框架 project 适配器用）
 *
 * 仅支持试点字段：名称 / 状态 / 优先级 / 起止日。状态枚举不含 ARCHIVED（归档走专门功能）。
 * 反幻觉：枚举/日期格式由 Zod 兜底，LLM 编造的值过不了校验。
 */
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期必须为 YYYY-MM-DD');

export const projectOperationSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('name'), value: z.string().min(1).max(200) }),
  z.object({ field: z.literal('status'), value: z.enum(['IN_PROGRESS', 'COMPLETED', 'ON_HOLD']) }),
  z.object({ field: z.literal('priority'), value: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) }),
  z.object({ field: z.literal('startDate'), value: isoDate }),
  z.object({ field: z.literal('endDate'), value: isoDate }),
]);

export const projectChangeIntentSchema = z.object({
  operations: z.array(projectOperationSchema),
  confidence: z.enum(['high', 'low']),
  unresolved: z.array(z.string()).default([]),
});

export type ProjectOperation = z.infer<typeof projectOperationSchema>;
export type ProjectChangeIntent = z.infer<typeof projectChangeIntentSchema>;
