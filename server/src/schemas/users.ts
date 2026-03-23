import { z } from 'zod';

export const createUserSchema = z.object({
  realName: z.string().min(1, '姓名不能为空'),
  username: z.string().optional(),
  password: z.string().optional(),
  roleIds: z.array(z.string()).optional(),
  canLogin: z.boolean().default(true),
}).refine(
  (data) => {
    if (data.canLogin) {
      return !!data.username && !!data.password;
    }
    return true;
  },
  { message: '允许登录的用户需填写用户名和密码', path: ['username'] }
);

export const updateUserSchema = z.object({
  username: z.string().optional(),
  realName: z.string().optional(),
  wecomUserId: z.string().nullable().optional(),
  canLogin: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  password: z.string().min(6, '密码长度不能少于6位').optional(),
  roleIds: z.array(z.string()).optional(),
});

export const userIdParamSchema = z.object({
  id: z.string().min(1),
});
