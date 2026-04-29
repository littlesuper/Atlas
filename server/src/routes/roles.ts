import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, invalidateAllUserCache } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { logger } from '../utils/logger';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/roles
 * 获取角色列表
 * 权限: 已认证即可
 */
router.get(
  '/',
  authenticate,
  requirePermission('role', 'read'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const roles = await prisma.role.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          rolePermissions: {
            include: {
              permission: {
                select: {
                  id: true,
                  resource: true,
                  action: true,
                },
              },
            },
          },
          _count: {
            select: {
              userRoles: true,
            },
          },
        },
      });

      // 转换为前端期望的格式：rolePermissions[].permission → permissions[]
      const result = roles.map((role) => ({
        ...role,
        permissions: role.rolePermissions.map((rp) => rp.permission),
        rolePermissions: undefined,
      }));

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, '获取角色列表错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * GET /api/roles/permissions
 * 获取所有权限列表
 * 权限: 已认证即可
 */
router.get(
  '/permissions',
  authenticate,
  requirePermission('role', 'read'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const permissions = await prisma.permission.findMany({
        orderBy: [
          { resource: 'asc' },
          { action: 'asc' },
        ],
        select: {
          id: true,
          resource: true,
          action: true,
        },
      });

      res.json(permissions);
    } catch (error) {
      logger.error({ err: error }, '获取权限列表错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * POST /api/roles
 * 创建角色
 * 权限: role:create
 */
router.post(
  '/',
  authenticate,
  requirePermission('role', 'create'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, description, permissionIds } = req.body;

      // 1. 验证必填字段
      if (!name) {
        res.status(400).json({ error: '角色名称不能为空' });
        return;
      }

      // 2. 检查角色名称是否已存在
      const existingRole = await prisma.role.findUnique({
        where: { name },
      });

      if (existingRole) {
        res.status(400).json({ error: '角色名称已存在' });
        return;
      }

      // 3. 创建角色
      const role = await prisma.role.create({
        data: {
          name,
          description: description || null,
        },
      });

      // 4. 关联权限
      if (permissionIds && Array.isArray(permissionIds) && permissionIds.length > 0) {
        // Validate all permissionIds exist
        const existingPermissions = await prisma.permission.count({
          where: { id: { in: permissionIds } },
        });
        if (existingPermissions !== permissionIds.length) {
          res.status(400).json({ error: '部分权限ID不存在' });
          return;
        }

        await prisma.rolePermission.createMany({
          data: permissionIds.map((permissionId: string) => ({
            roleId: role.id,
            permissionId,
          })),
        });
      }

      // 5. 查询完整角色信息(含权限)
      const roleWithPermissions = await prisma.role.findUnique({
        where: { id: role.id },
        include: {
          rolePermissions: {
            include: {
              permission: {
                select: {
                  id: true,
                  resource: true,
                  action: true,
                },
              },
            },
          },
          _count: {
            select: {
              userRoles: true,
            },
          },
        },
      });

      res.status(201).json(roleWithPermissions);
    } catch (error) {
      logger.error({ err: error }, '创建角色错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * PUT /api/roles/:id
 * 更新角色
 * 权限: role:update
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('role', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { name, description, permissionIds } = req.body;

      // 1. 检查角色是否存在
      const existingRole = await prisma.role.findUnique({
        where: { id },
      });

      if (!existingRole) {
        res.status(404).json({ error: '角色不存在' });
        return;
      }

      // 2. 检查新角色名称是否与其他角色冲突
      if (name && name !== existingRole.name) {
        const nameExists = await prisma.role.findFirst({
          where: {
            name,
            id: { not: id },
          },
        });

        if (nameExists) {
          res.status(400).json({ error: '角色名称已存在' });
          return;
        }
      }

      // 3. 更新角色基本信息
      const updateData: any = {};
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description || null;

      await prisma.role.update({
        where: { id },
        data: updateData,
      });

      // 4. 更新权限关联(全量替换)
      if (permissionIds && Array.isArray(permissionIds)) {
        // 先删除所有旧关联
        await prisma.rolePermission.deleteMany({
          where: { roleId: id },
        });

        // 创建新关联
        if (permissionIds.length > 0) {
          await prisma.rolePermission.createMany({
            data: permissionIds.map((permissionId: string) => ({
              roleId: id,
              permissionId,
            })),
          });
        }

        // 角色权限变更影响所有拥有该角色的用户，清除全部缓存
        invalidateAllUserCache();
      }

      // 5. 查询完整角色信息(含权限)
      const updatedRole = await prisma.role.findUnique({
        where: { id },
        include: {
          rolePermissions: {
            include: {
              permission: {
                select: {
                  id: true,
                  resource: true,
                  action: true,
                },
              },
            },
          },
          _count: {
            select: {
              userRoles: true,
            },
          },
        },
      });

      res.json(updatedRole);
    } catch (error) {
      logger.error({ err: error }, '更新角色错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * DELETE /api/roles/:id
 * 删除角色
 * 权限: role:delete
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('role', 'delete'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // 1. 检查角色是否存在
      const existingRole = await prisma.role.findUnique({
        where: { id },
      });

      if (!existingRole) {
        res.status(404).json({ error: '角色不存在' });
        return;
      }

      // Check if role is assigned to any users
      const userCount = await prisma.userRole.count({
        where: { roleId: id },
      });
      if (userCount > 0) {
        res.status(400).json({ error: `该角色已分配给 ${userCount} 个用户，请先取消分配后再删除` });
        return;
      }

      // 2. 删除角色(级联删除userRoles和rolePermissions)
      await prisma.role.delete({
        where: { id },
      });

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, '删除角色错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
