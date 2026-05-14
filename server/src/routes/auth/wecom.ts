import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { auditLog } from '../../utils/auditLog';
import { isWecomEnabled, getWecomConfig, getUserInfoByCode, getUserDetail } from '../../utils/wecom';
import { logger } from '../../utils/logger';
import prisma from '../../db';
import { JWT_SECRET, JWT_REFRESH_SECRET, ACCESS_TOKEN_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN } from './shared';

const router = express.Router();

router.get('/wecom/config', async (_req: Request, res: Response): Promise<void> => {
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

    let wecomUserId: string;
    try {
      wecomUserId = await getUserInfoByCode(code);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '企微授权失败';
      res.status(401).json({ error: message });
      return;
    }

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

    if (!user) {
      const detail = await getUserDetail(wecomUserId);

      user = await prisma.user.create({
        data: {
          realName: detail.name || wecomUserId,
          wecomUserId,
          canLogin: false,
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

    if (user.status === 'DISABLED') {
      res.status(403).json({ error: '账号已被禁用' });
      return;
    }

    const tokenPayload = { userId: user.id, username: user.username };

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
      },
    });
  } catch (error) {
    logger.error({ err: error }, '企微登录错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
