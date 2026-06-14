/**
 * 只读问答助手 · Zod 查询契约
 *
 * 安全：LLM 只把问题解析成"白名单查询类型 + 参数"，绝不自己算/答数字；
 * 答案由确定性代码（queryCompute）算出。无法映射到白名单 → 老实说不支持。
 */
import { z } from 'zod';

export const queryIntentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('phase_duration'), phase: z.string().min(1).max(20) }),
  z.object({ type: z.literal('project_timeline') }),
  z.object({ type: z.literal('risk_summary') }),
  z.object({ type: z.literal('overdue_count') }),
]);

export type QueryIntent = z.infer<typeof queryIntentSchema>;
