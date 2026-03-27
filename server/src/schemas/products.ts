import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1, '产品名称不能为空'),
  model: z.string().nullable().optional(),
  revision: z.string().nullable().optional(),
  category: z.enum(['ROUTER', 'GATEWAY', 'REMOTE_CONTROL', 'ACCESSORY', 'OTHER']).nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['DEVELOPING', 'PRODUCTION', 'DISCONTINUED']).default('DEVELOPING'),
  specifications: z.record(z.string(), z.unknown()).nullable().optional(),
  performance: z.record(z.string(), z.unknown()).nullable().optional(),
  images: z.array(z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    uploadedAt: z.string(),
  })).nullable().optional(),
  documents: z.array(z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    uploadedAt: z.string(),
  })).nullable().optional(),
  projectId: z.string().nullable().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const copyProductSchema = z.object({
  revision: z.string().min(1, '版本号不能为空'),
});

export const productListQuerySchema = z.object({
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('20'),
  status: z.enum(['DEVELOPING', 'PRODUCTION', 'DISCONTINUED']).optional(),
  category: z.enum(['ROUTER', 'GATEWAY', 'REMOTE_CONTROL', 'ACCESSORY', 'OTHER']).optional(),
  keyword: z.string().optional(),
  projectId: z.string().optional(),
  projectStatus: z.string().optional(),
  specKeyword: z.string().optional(),
});
