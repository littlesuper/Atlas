import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth';
import { auditLog } from '../utils/auditLog';
import { isWecomEnabled, getWecomConfig, getUserInfoByCode, getUserDetail } from '../utils/wecom';

const router = express.Router();
const prisma = new PrismaClient();

// 环境变量（启动时验证必要配置）
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  console.error('错误：JWT_SECRET 和 JWT_REFRESH_SECRET 环境变量必须设置');
  process.exit(1);
}

// Access Token有效期: 8小时 (28800秒)
const ACCESS_TOKEN_EXPIRES_IN = '8h';
// Refresh Token有效期: 7天 (604800秒)
const REFRESH_TOKEN_EXPIRES_IN = '7d';

/**
 * POST /api/auth/login
 * 用户登录
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    // 1. 验证必填字段
    if (!username || !password) {
      res.status(400).json({ error: '用户名和密码不能为空' });
      return;
    }

    // 2. 查找用户
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }

    // 3. 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }

    // 4. 检查账号状态
    if (user.status === 'DISABLED') {
      res.status(403).json({ error: '账号已被禁用' });
      return;
    }

    // 5. 生成JWT tokens
    const tokenPayload = {
      userId: user.id,
      username: user.username,
    };

    const accessToken = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    });

    const refreshToken = jwt.sign(tokenPayload, JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    });

    // 6. 提取角色和权限
    const roles = user.userRoles.map((ur) => ur.role.name);

    const permissionSet = new Set<string>();
    user.userRoles.forEach((ur) => {
      ur.role.rolePermissions.forEach((rp) => {
        permissionSet.add(`${rp.permission.resource}:${rp.permission.action}`);
      });
    });
    const permissions = Array.from(permissionSet);

    // 6.5. 查询协作项目
    const projectMembers = await prisma.projectMember.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    });
    const collaboratingProjectIds = projectMembers.map((pm) => pm.projectId);

    // 7. 记录登录日志
    auditLog({
      req,
      action: 'LOGIN',
      resourceType: 'auth',
      resourceId: user.id,
      resourceName: user.realName,
      userId: user.id,
      userName: user.realName,
    });

    // 8. 返回响应
    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        realName: user.realName,
        roles,
        permissions,
        collaboratingProjectIds,
      },
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/auth/refresh
 * 刷新访问令牌
 */
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    // 1. 验证必填字段
    if (!refreshToken) {
      res.status(400).json({ error: '刷新令牌不能为空' });
      return;
    }

    // 2. 验证refresh token
    let payload: { userId: string; username: string };
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as {
        userId: string;
        username: string;
      };
    } catch (err) {
      res.status(401).json({ error: '刷新令牌无效' });
      return;
    }

    // 3. 检查用户是否存在且状态正常
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      res.status(401).json({ error: '用户不存在' });
      return;
    }

    if (user.status === 'DISABLED') {
      res.status(403).json({ error: '账号已被禁用' });
      return;
    }

    // 4. 生成新的access token
    const newAccessToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
      },
      JWT_SECRET,
      {
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      }
    );

    // 5. 返回新的access token
    res.json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error('刷新令牌错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/auth/me
 * 获取当前用户信息
 */
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    // authenticate中间件已经将用户信息附加到req.user
    if (!req.user) {
      res.status(401).json({ error: '未认证' });
      return;
    }

    // 获取完整的用户信息(包含phone字段)
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        realName: true,
        phone: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      realName: user.realName,
      phone: user.phone,
      roles: req.user.roles.map((r) => r.name),
      permissions: req.user.permissions,
      collaboratingProjectIds: req.user.collaboratingProjectIds,
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * PUT /api/auth/profile
 * 修改个人信息（仅限当前用户自己）
 */
router.put('/profile', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: '未认证' });
      return;
    }

    const { realName, email, phone } = req.body;
    const data: Record<string, string | null> = {};

    if (realName !== undefined) {
      if (!realName || !realName.trim()) {
        res.status(400).json({ error: '姓名不能为空' });
        return;
      }
      data.realName = realName.trim();
    }

    if (email !== undefined) {
      if (!email || !email.trim()) {
        res.status(400).json({ error: '邮箱不能为空' });
        return;
      }
      // 检查邮箱是否被其他用户占用
      const existingUser = await prisma.user.findFirst({
        where: { email: email.trim(), id: { not: req.user.id } },
      });
      if (existingUser) {
        res.status(400).json({ error: '该邮箱已被其他用户使用' });
        return;
      }
      data.email = email.trim();
    }

    if (phone !== undefined) {
      data.phone = phone?.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: '没有需要更新的字段' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, username: true, email: true, realName: true, phone: true },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('更新个人信息错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/auth/change-password
 * 修改密码（需验证当前密码）
 */
router.post('/change-password', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: '未认证' });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: '当前密码和新密码不能为空' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: '新密码长度不能少于6位' });
      return;
    }

    // 获取用户当前密码哈希
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { password: true },
    });

    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    // 验证当前密码
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      res.status(400).json({ error: '当前密码不正确' });
      return;
    }

    // 更新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('修改密码错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 用户偏好设置 ====================

/**
 * GET /api/auth/preferences
 * 获取当前用户的偏好设置
 */
router.get('/preferences', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: '未认证' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { preferences: true },
    });

    res.json(user?.preferences || {});
  } catch (error) {
    console.error('获取偏好设置错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * PUT /api/auth/preferences
 * 更新当前用户的偏好设置（浅合并）
 */
router.put('/preferences', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: '未认证' });
      return;
    }

    const { preferences } = req.body;
    if (!preferences || typeof preferences !== 'object') {
      res.status(400).json({ error: '偏好设置格式不正确' });
      return;
    }

    // 获取现有偏好设置
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { preferences: true },
    });

    const existing = (user?.preferences as Record<string, unknown>) || {};
    const merged = { ...existing, ...preferences };

    await prisma.user.update({
      where: { id: req.user.id },
      data: { preferences: merged },
    });

    res.json(merged);
  } catch (error) {
    console.error('更新偏好设置错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 企业微信扫码登录 ====================

/**
 * GET /api/auth/wecom/config
 * 返回前端初始化企微二维码所需的配置
 */
router.get('/wecom/config', async (req: Request, res: Response): Promise<void> => {
  const enabled = await isWecomEnabled();
  if (!enabled) {
    res.json({ enabled: false });
    return;
  }

  const config = await getWecomConfig();
  const state = crypto.randomBytes(16).toString('hex');

  res.json({
    enabled: true,
    corpId: config.corpId,
    agentId: config.agentId,
    redirectUri: config.redirectUri,
    state,
  });
});

/**
 * POST /api/auth/wecom/login
 * 企微 OAuth code 换取 JWT
 */
router.post('/wecom/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: '授权码不能为空' });
      return;
    }

    if (!(await isWecomEnabled())) {
      res.status(400).json({ error: '企业微信登录未配置' });
      return;
    }

    // 1. 用 code 换取企微 userid
    let wecomUserId: string;
    try {
      wecomUserId = await getUserInfoByCode(code);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '企微授权失败';
      res.status(401).json({ error: message });
      return;
    }

    // 2. 按 wecomUserId 查找本地用户
    let user = await prisma.user.findUnique({
      where: { wecomUserId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    // 3. 未找到则自动创建用户
    if (!user) {
      const detail = await getUserDetail(wecomUserId);

      // 查找「只读成员」角色
      const readonlyRole = await prisma.role.findFirst({
        where: { name: '只读成员' },
      });

      const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      const username = `wecom_${wecomUserId}`;
      const email = detail.email || `${wecomUserId}@wecom.local`;

      user = await prisma.user.create({
        data: {
          username,
          email,
          password: randomPassword,
          realName: detail.name || wecomUserId,
          phone: detail.mobile || null,
          wecomUserId,
          userRoles: readonlyRole
            ? { create: { roleId: readonlyRole.id } }
            : undefined,
        },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
        },
      });
    }

    // 4. 检查账号状态
    if (user.status === 'DISABLED') {
      res.status(403).json({ error: '账号已被禁用' });
      return;
    }

    // 5. 生成 JWT tokens
    const tokenPayload = { userId: user.id, username: user.username };

    const accessToken = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    });

    const refreshToken = jwt.sign(tokenPayload, JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    });

    // 6. 提取角色和权限
    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissionSet = new Set<string>();
    user.userRoles.forEach((ur) => {
      ur.role.rolePermissions.forEach((rp) => {
        permissionSet.add(`${rp.permission.resource}:${rp.permission.action}`);
      });
    });
    const permissions = Array.from(permissionSet);

    // 6.5. 查询协作项目
    const projectMembers = await prisma.projectMember.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    });
    const collaboratingProjectIds = projectMembers.map((pm) => pm.projectId);

    // 7. 记录审计日志
    auditLog({
      req,
      action: 'LOGIN',
      resourceType: 'auth',
      resourceId: user.id,
      resourceName: user.realName,
      userId: user.id,
      userName: user.realName,
    });

    // 8. 返回响应（与密码登录格式一致）
    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        realName: user.realName,
        roles,
        permissions,
        collaboratingProjectIds,
      },
    });
  } catch (error) {
    console.error('企微登录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
