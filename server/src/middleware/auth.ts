import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { isTokenBlacklisted } from '../utils/tokenBlacklist';

const prisma = new PrismaClient();

// ============ 用户信息缓存（TTL 5 分钟） ============
interface CachedUser {
  data: Express.Request['user'];
  expiresAt: number;
}
const userCache = new Map<string, CachedUser>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** 清除指定用户的缓存（角色/权限变更后调用） */
export const invalidateUserCache = (userId: string) => {
  userCache.delete(userId);
};

/** 清除所有用户缓存 */
export const invalidateAllUserCache = () => {
  userCache.clear();
};

// 扩展Express Request类型,添加user属性
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string | null;
        realName: string;
        roles: Array<{
          id: string;
          name: string;
          description: string | null;
        }>;
        permissions: string[];
        collaboratingProjectIds: string[];
      };
    }
  }
}

// JWT Payload接口
interface JwtPayload {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}

/**
 * JWT认证中间件
 * 验证access token并将用户信息附加到req.user
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. 从请求头或 query 参数中获取 token（query 参数仅用于文件下载等无法设置 header 的场景）
    const authHeader = req.headers.authorization;
    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (typeof req.query.token === 'string') {
      token = req.query.token;
    }
    if (!token) {
      res.status(401).json({ error: '未提供认证令牌' });
      return;
    }

    // 1.5 检查 token 黑名单（退出登录/改密码后的 token）
    if (isTokenBlacklisted(token)) {
      res.status(401).json({ error: '令牌已失效，请重新登录' });
      return;
    }

    // 2. 验证token
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      logger.error('JWT_SECRET 环境变量未设置');
      res.status(500).json({ error: '服务器配置错误' });
      return;
    }
    let payload: JwtPayload;

    try {
      payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        res.status(401).json({ error: '令牌已过期' });
        return;
      }
      res.status(401).json({ error: '无效的令牌' });
      return;
    }

    // 3. 检查缓存
    const now = Date.now();
    const cached = userCache.get(payload.userId);
    if (cached && cached.expiresAt > now) {
      req.user = cached.data;
      next();
      return;
    }

    // 4. 从数据库获取用户完整信息
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
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
      res.status(401).json({ error: '用户不存在' });
      return;
    }

    // 检查用户状态
    if (user.status === 'DISABLED') {
      userCache.delete(payload.userId);
      res.status(403).json({ error: '账号已被禁用' });
      return;
    }

    // 5. 提取角色和权限
    const roles = user.userRoles.map((ur) => ({
      id: ur.role.id,
      name: ur.role.name,
      description: ur.role.description,
    }));

    // 收集所有权限(去重)
    const permissionSet = new Set<string>();
    user.userRoles.forEach((ur) => {
      ur.role.rolePermissions.forEach((rp) => {
        permissionSet.add(`${rp.permission.resource}:${rp.permission.action}`);
      });
    });
    const permissions = Array.from(permissionSet);

    // 6. 查询协作项目 ID 列表
    const projectMembers = await prisma.projectMember.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    });
    const collaboratingProjectIds = projectMembers.map((pm) => pm.projectId);

    // 7. 将用户信息附加到req.user并缓存
    const userData: Express.Request['user'] = {
      id: user.id,
      username: user.username,
      realName: user.realName,
      roles,
      permissions,
      collaboratingProjectIds,
    };
    userCache.set(payload.userId, { data: userData, expiresAt: now + CACHE_TTL_MS });
    req.user = userData;

    next();
  } catch (error) {
    logger.error({ err: error }, '认证中间件错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
};
