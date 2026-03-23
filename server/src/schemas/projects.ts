import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1, '项目名称不能为空'),
  description: z.string().optional(),
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ARCHIVED']).default('IN_PROGRESS'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  startDate: z.string().min(1, '开始日期不能为空'),
  endDate: z.string().min(1, '结束日期不能为空'),
  managerId: z.string().min(1, '项目经理不能为空'),
  productLine: z.string().nullable().optional(),
  progress: z.number().min(0).max(100).default(0),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ARCHIVED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  managerId: z.string().optional(),
  productLine: z.string().nullable().optional(),
  progress: z.number().min(0).max(100).optional(),
});

export const projectIdParamSchema = z.object({
  id: z.string().min(1),
});

export const projectListQuerySchema = z.object({
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('20'),
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ARCHIVED']).optional(),
  keyword: z.string().optional(),
  productLine: z.string().optional(),
});
