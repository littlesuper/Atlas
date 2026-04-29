import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const createHolidaySchema = z.object({
  date: z.string().regex(ISO_DATE, '日期格式应为 YYYY-MM-DD'),
  name: z.string().min(1, '名称不能为空').max(50),
  type: z.enum(['HOLIDAY', 'MAKEUP']).default('HOLIDAY'),
});

export const updateHolidaySchema = z.object({
  date: z.string().regex(ISO_DATE).optional(),
  name: z.string().min(1).max(50).optional(),
  type: z.enum(['HOLIDAY', 'MAKEUP']).optional(),
});

export const generateHolidaySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  replaceExisting: z.boolean().optional().default(true),
});
