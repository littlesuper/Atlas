import { z } from 'zod';

const weeklyReportRiskSchema = z.object({
  type: z.string().optional(),
  description: z.string().optional(),
  severity: z.string().optional(),
});

const phaseProgressItemSchema = z.object({
  progress: z.string(),
  risks: z.string(),
  schedule: z.string(),
});

const reportAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  uploadedAt: z.string(),
  section: z.string(),
});

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
  risks: z.array(weeklyReportRiskSchema).nullable().optional(),
  phaseProgress: z.record(z.string(), phaseProgressItemSchema).nullable().optional(),
  attachments: z.array(reportAttachmentSchema).nullable().optional(),
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
