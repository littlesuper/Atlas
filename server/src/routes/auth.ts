import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth';

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

    // 7. 返回响应
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

export default router;
