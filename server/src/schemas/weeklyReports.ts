import { z } from 'zod';

export const createWeeklyReportSchema = z.object({
  projectId: z.string().min(1, '项目ID不能为空'),
  weekStart: z.string().min(1, '周开始日期不能为空'),
  weekEnd: z.string().min(1, '周结束日期不能为空'),
  progressStatus: z.enum(['ON_TRACK', 'MINOR_ISSUE', 'MAJOR_ISSUE']).default('ON_TRACK'),
  keyProgress: z.string().nullable().optional(),
  nextWeekPlan: z.string().nullable().optional(),
  riskWarning: z.string().nullable().optional(),
  changeOverview: z.string().nullable().optional(),
  demandAnalysis: z.string().nullable().optional(),
  risks: z.any().nullable().optional(),
  phaseProgress: z.any().nullable().optional(),
  attachments: z.any().nullable().optional(),
});

export const updateWeeklyReportSchema = createWeeklyReportSchema.partial();

export const weeklyReportListQuerySchema = z.object({
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('20'),
  projectId: z.string().optional(),
  year: z.string().optional(),
  weekNumber: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'ARCHIVED']).optional(),
});

export const aiSuggestionsSchema = z.object({
  weekStart: z.string().min(1, '周开始日期不能为空'),
  weekEnd: z.string().min(1, '周结束日期不能为空'),
});
