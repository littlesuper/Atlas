import { z } from 'zod';

const dependencySchema = z.object({
  id: z.string().min(1),
  type: z.string().default('0'),
  lag: z.number().optional(),
});

export const createActivitySchema = z.object({
  projectId: z.string().min(1, '项目ID不能为空'),
  parentId: z.string().nullable().optional(),
  name: z.string().min(1, '活动名称不能为空'),
  description: z.string().optional(),
  type: z.enum(['TASK', 'MILESTONE', 'PHASE']).default('TASK'),
  phase: z.string().nullable().optional(),
  assigneeIds: z.array(z.string()).optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('NOT_STARTED'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  planStartDate: z.string().nullable().optional(),
  planEndDate: z.string().nullable().optional(),
  planDuration: z.number().int().positive().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  duration: z.number().int().positive().nullable().optional(),
  dependencies: z.array(dependencySchema).nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
});

export const updateActivitySchema = createActivitySchema.partial().omit({ projectId: true });

export const batchUpdateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, '至少选择一个活动'),
  updates: z.object({
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    phase: z.string().nullable().optional(),
    assigneeIds: z.array(z.string()).optional(),
  }),
});

export const batchDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, '至少选择一个活动'),
});

export const batchCreateSchema = z.object({
  activities: z.array(z.object({
    projectId: z.string().min(1),
    name: z.string().min(1),
  }).passthrough()).min(1),
});

export const reorderSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    sortOrder: z.number().int(),
    parentId: z.string().nullable().optional(),
  })).min(1),
});

export const whatIfSchema = z.object({
  activityId: z.string().min(1, '活动ID不能为空'),
  delayDays: z.number().int(),
});

export const applyWhatIfSchema = z.object({
  affected: z.array(z.object({
    id: z.string().min(1),
    newStart: z.string(),
    newEnd: z.string(),
  })).min(1),
  archiveLabel: z.string().optional(),
});

export const rescheduleSchema = z.object({
  baseDate: z.string().optional(),
});

export const undoImportSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});
