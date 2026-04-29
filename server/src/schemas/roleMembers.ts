import { z } from 'zod';

export const createRoleMemberSchema = z.object({
  roleId: z.string().min(1, '角色ID不能为空'),
  userId: z.string().min(1, '用户ID不能为空'),
  sortOrder: z.number().int().default(0),
});

export const updateRoleMemberSchema = z.object({
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const batchSetSchema = z.object({
  roleId: z.string().min(1, '角色ID不能为空'),
  members: z.array(z.object({
    userId: z.string().min(1),
    sortOrder: z.number().int().default(0),
  })).min(0),
});

export const deleteRoleMemberSchema = z.object({
  cascadeMode: z.enum(['keep', 'removeAll', 'selective']).default('keep'),
  cascadeActivityIds: z.array(z.string()).optional(),
});
