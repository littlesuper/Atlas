/**
 * 排期助手 · 请求/意图 Zod schema
 *
 * 与 docs/specs/ai-scheduling-beacon/01 §D.1 对齐。
 * ScheduleChangeIntent 是 LLM 边缘 1（意图解析）的结构化输出契约，
 * 同时也是反幻觉的代码层兜底（见 03 §2）：LLM 必须输出能通过这里 Zod 校验的结构。
 */
import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期必须为 YYYY-MM-DD');

export const scheduleOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('shift_activity'),
    activityId: z.string().min(1),
    deltaDays: z.number().int(),
  }),
  z.object({
    type: z.literal('set_planned'),
    activityId: z.string().min(1),
    field: z.enum(['start', 'end']),
    date: isoDate,
  }),
  z.object({
    type: z.literal('set_duration'),
    activityId: z.string().min(1),
    durationDays: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('add_dependency'),
    activityId: z.string().min(1),
    dependsOnId: z.string().min(1),
    depType: z.string().optional(),
    lag: z.number().int().optional(),
  }),
  z.object({
    type: z.literal('remove_dependency'),
    activityId: z.string().min(1),
    dependsOnId: z.string().min(1),
  }),
]);

export const scheduleChangeIntentSchema = z.object({
  projectId: z.string().min(1),
  operations: z.array(scheduleOperationSchema), // 允许为空：空操作走"没听懂"降级
  confidence: z.enum(['high', 'low']),
  unresolved: z.array(z.string()).default([]),
});

export const proposeRequestSchema = z.object({
  projectId: z.string().min(1, '项目 ID 不能为空'),
  utterance: z.string().min(1, '请输入要表达的意图').max(2000, '单次输入过长'),
});

export const applyRequestSchema = z.object({
  proposalId: z.string().min(1, '提议 ID 不能为空'),
});

export type ScheduleOperation = z.infer<typeof scheduleOperationSchema>;
export type ScheduleChangeIntent = z.infer<typeof scheduleChangeIntentSchema>;
export type ProposeRequest = z.infer<typeof proposeRequestSchema>;
export type ApplyRequest = z.infer<typeof applyRequestSchema>;
