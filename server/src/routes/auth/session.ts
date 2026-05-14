import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticate } from '../../middleware/auth';
import { auditLog } from '../../utils/auditLog';
import { logger } from '../../utils/logger';
import { blacklistToken } from '../../utils/tokenBlacklist';
import prisma from '../../db';
import { JWT_SECRET, JWT_REFRESH_SECRET, ACCESS_TOKEN_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN } from './shared';

const router = express.Router();

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: '用户名和密码不能为空' });
      return;
    }

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

    if (!user.canLogin) {
      res.status(403).json({ error: '该账号未开启登录权限' });
      return;
    }

    if (!user.password) {
      res.status(403).json({ error: '该账号不支持密码登录' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }

    if (user.status === 'DISABLED') {
      res.status(403).json({ error: '账号已被禁用' });
      return;
    }

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

    const roles = user.userRoles.map((ur) => ur.role.name);

    const permissionSet = new Set<string>();
    user.userRoles.forEach((ur) => {
      ur.role.rolePermissions.forEach((rp) => {
        permissionSet.add(`${rp.permission.resource}:${rp.permission.action}`);
      });
    });
    const permissions = Array.from(permissionSet);

    const projectMembers = await prisma.projectMember.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    });
    const collaboratingProjectIds = projectMembers.map((pm) => pm.projectId);

    auditLog({
      req,
      action: 'LOGIN',
      resourceType: 'auth',
      resourceId: user.id,
      resourceName: user.realName,
      userId: user.id,
      userName: user.realName,
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        roles,
        permissions,
        collaboratingProjectIds,
        mustChangePassword: user.mustChangePassword ?? false,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '登录错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: '刷新令牌不能为空' });
      return;
    }

    let payload: { userId: string; username: string };
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as {
        userId: string;
        username: string;
      };
    } catch {
      res.status(401).json({ error: '刷新令牌无效' });
      return;
    }

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

    res.json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    logger.error({ err: error }, '刷新令牌错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: '未认证' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        realName: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    res.json({
      id: user.id,
      username: user.username,
      realName: user.realName,
      roles: req.user.roles.map((r) => r.name),
      permissions: req.user.permissions,
      collaboratingProjectIds: req.user.collaboratingProjectIds,
    });
  } catch (error) {
    logger.error({ err: error }, '获取用户信息错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/logout', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      blacklistToken(token);
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, '退出登录错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
