import { z } from 'zod';

export const createCheckItemSchema = z.object({
  activityId: z.string().min(1, '活动ID不能为空'),
  title: z.string().min(1, '检查项标题不能为空'),
});

export const batchCreateCheckItemSchema = z.object({
  activityId: z.string().min(1, '活动ID不能为空'),
  items: z.array(z.object({
    title: z.string().min(1, '检查项标题不能为空'),
  })).min(1, '至少包含一个检查项'),
});

export const updateCheckItemSchema = z.object({
  title: z.string().min(1).optional(),
  checked: z.boolean().optional(),
});

export const reorderCheckItemSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    sortOrder: z.number().int(),
  })).min(1),
});
