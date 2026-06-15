import { z } from 'zod';

export const assistantProposeSchema = z.object({
  utterance: z.string().min(1, '请输入要表达的意图').max(2000, '单次输入过长'),
  // 当前页面的项目上下文（可空）；用户没点明别的项目时作为默认目标
  contextProjectId: z.string().nullish(),
  /** 多轮续填：上一轮 need_input 返回的不透明 token */
  pendingId: z.string().nullish(),
});

export const assistantApplySchema = z.object({
  proposalId: z.string().min(1, '提议 ID 不能为空'),
});

export type AssistantProposeRequest = z.infer<typeof assistantProposeSchema>;
export type AssistantApplyRequest = z.infer<typeof assistantApplySchema>;
