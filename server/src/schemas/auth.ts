import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, '刷新令牌不能为空'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '当前密码不能为空'),
  newPassword: z.string().min(6, '新密码长度不能少于6位'),
});

export const updateProfileSchema = z.object({
  realName: z.string().min(1, '姓名不能为空').transform((s) => s.trim()),
});

export const updatePreferencesSchema = z.object({
  preferences: z.record(z.string(), z.unknown()).refine((val) => typeof val === 'object', {
    message: '偏好设置格式不正确',
  }),
});

export const wecomLoginSchema = z.object({
  code: z.string().min(1, '授权码不能为空'),
});
