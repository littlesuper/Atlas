import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * 权限检查中间件工厂函数
 * @param resource 资源名称 (如 'project', 'user', 'role')
 * @param action 操作名称 (如 'create', 'read', 'update', 'delete')
 * @returns Express中间件函数
 */
export const requirePermission = (resource: string, action: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // 1. 检查用户是否已认证
      if (!req.user) {
        res.status(401).json({ error: '未认证' });
        return;
      }

      // 2. 获取用户权限列表
      const userPermissions = req.user.permissions || [];

      // 3. 检查权限匹配(支持通配符)
      const hasPermission = userPermissions.some((permission) => {
        const [permResource, permAction] = permission.split(':');

        // 匹配规则:
        // 1. 全通配: *:*
        if (permResource === '*' && permAction === '*') {
          return true;
        }

        // 2. 资源通配: *:action (任意资源的指定操作)
        if (permResource === '*' && permAction === action) {
          return true;
        }

        // 3. 操作通配: resource:* (指定资源的任意操作)
        if (permResource === resource && permAction === '*') {
          return true;
        }

        // 4. 精确匹配: resource:action
        if (permResource === resource && permAction === action) {
          return true;
        }

        return false;
      });

      // 4. 权限不足时返回403
      if (!hasPermission) {
        res.status(403).json({ error: '权限不足' });
        return;
      }

      // 5. 权限验证通过,继续执行
      next();
    } catch (error) {
      logger.error({ err: error }, '权限检查中间件错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  };
};

/**
 * 检查用户是否为超级管理员 (*:*)
 */
export const isAdmin = (req: Request): boolean =>
  (req.user?.permissions || []).includes('*:*');

/**
 * 检查用户是否可以编辑指定项目（管理员、项目经理或协作者）
 */
export const canManageProject = (req: Request, managerId: string, projectId: string): boolean => {
  if (isAdmin(req)) return true;
  if (req.user?.id === managerId) return true;
  if (req.user?.collaboratingProjectIds?.includes(projectId)) return true;
  return false;
};

/**
 * 检查用户是否可以删除指定项目（仅管理员或项目经理，协作者不能删除）
 */
export const canDeleteProject = (req: Request, managerId: string): boolean => {
  if (isAdmin(req)) return true;
  if (req.user?.id === managerId) return true;
  return false;
};

/**
 * 安全校验分页参数，返回合法的 page / pageSize
 */
export const sanitizePagination = (page: unknown, pageSize: unknown): { pageNum: number; pageSizeNum: number } => {
  let pageNum = parseInt(page as string);
  let pageSizeNum = parseInt(pageSize as string);
  if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
  if (isNaN(pageSizeNum) || pageSizeNum < 1) pageSizeNum = 20;
  if (pageSizeNum > 100) pageSizeNum = 100;
  return { pageNum, pageSizeNum };
};
