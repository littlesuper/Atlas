import { z } from 'zod';

export const createRiskItemSchema = z.object({
  projectId: z.string().min(1, '项目ID不能为空'),
  title: z.string().min(1, '风险项标题不能为空'),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], {
    error: '严重度必须为 LOW/MEDIUM/HIGH/CRITICAL',
  }),
  description: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export const updateRiskItemSchema = z.object({
  title: z.string().min(1).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED']).optional(),
  description: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export const riskItemCommentSchema = z.object({
  content: z.string().min(1, '评论内容不能为空'),
});

export const riskItemListQuerySchema = z.object({
  projectId: z.string().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED']).optional(),
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('20'),
});
