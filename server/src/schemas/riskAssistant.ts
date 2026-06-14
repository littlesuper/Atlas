/**
 * 风险项编辑助手 · Zod 意图契约（assistant 框架 risk 适配器用）
 *
 * 支持：新建风险项、修改已有风险项的严重度/状态。
 * 反幻觉：严重度/状态枚举由 Zod 兜底；update 的 riskItemId 由适配器对项目内风险项白名单校验。
 */
import { z } from 'zod';

const severity = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const status = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED']);

export const riskOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_risk'),
    title: z.string().min(1).max(200),
    severity,
    description: z.string().max(2000).optional(),
  }),
  z.object({
    type: z.literal('update_risk'),
    riskItemId: z.string().min(1),
    severity: severity.optional(),
    status: status.optional(),
  }),
]);

export const riskChangeIntentSchema = z.object({
  operations: z.array(riskOperationSchema),
  confidence: z.enum(['high', 'low']),
  unresolved: z.array(z.string()).default([]),
});

export type RiskOperation = z.infer<typeof riskOperationSchema>;
export type RiskChangeIntent = z.infer<typeof riskChangeIntentSchema>;
