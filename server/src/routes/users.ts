import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authenticate, invalidateUserCache } from '../middleware/auth';
import { requirePermission, sanitizePagination } from '../middleware/permission';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/users
 * 获取用户列表(分页、搜索)
 * 权限: user:read
 */
router.get(
  '/',
  authenticate,
  requirePermission('user', 'read'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        page = '1',
        pageSize = '20',
        keyword = '',
      } = req.query;

      const { pageNum, pageSizeNum } = sanitizePagination(page, pageSize);
      const skip = (pageNum - 1) * pageSizeNum;

      // 构建搜索条件(按用户名/姓名/邮箱模糊搜索,不区分大小写)
      const where = keyword
        ? {
            OR: [
              { username: { contains: keyword as string } },
              { realName: { contains: keyword as string } },
              { email: { contains: keyword as string } },
            ],
          }
        : {};

      // 查询用户列表
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: pageSizeNum,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            username: true,
            email: true,
            realName: true,
            phone: true,
            status: true,
            createdAt: true,
            userRoles: {
              include: {
                role: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                  },
                },
              },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

      // 格式化响应数据（roles 返回角色名称字符串数组，与 auth 接口格式一致）
      const data = users.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        realName: user.realName,
        phone: user.phone,
        status: user.status,
        createdAt: user.createdAt,
        roles: user.userRoles.map((ur) => ur.role.name),
      }));

      res.json({
        data,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
      });
    } catch (error) {
      console.error('获取用户列表错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * POST /api/users
 * 创建用户
 * 权限: user:create
 */
router.post(
  '/',
  authenticate,
  requirePermission('user', 'create'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, email, password, realName, phone, roleIds } = req.body;

      // 1. 验证必填字段
      if (!username || !email || !password || !realName) {
        res.status(400).json({ error: '用户名、邮箱、密码和姓名不能为空' });
        return;
      }

      // 2. 检查用户名是否已存在
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ username }, { email }],
        },
      });

      if (existingUser) {
        if (existingUser.username === username) {
          res.status(400).json({ error: '用户名已存在' });
          return;
        }
        if (existingUser.email === email) {
          res.status(400).json({ error: '邮箱已存在' });
          return;
        }
      }

      // 3. 加密密码
      const hashedPassword = await bcrypt.hash(password, 10);

      // 4. 创建用户（事务保证原子性）
      const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            username,
            email,
            password: hashedPassword,
            realName,
            phone: phone || null,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            username: true,
            email: true,
            realName: true,
            phone: true,
            status: true,
            createdAt: true,
          },
        });

        // 关联角色
        if (roleIds && Array.isArray(roleIds) && roleIds.length > 0) {
          await tx.userRole.createMany({
            data: roleIds.map((roleId: string) => ({
              userId: newUser.id,
              roleId,
            })),
          });
        }

        return newUser;
      });

      // 5. 查询完整用户信息(含角色)
      const userWithRoles = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          userRoles: {
            include: {
              role: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                },
              },
            },
          },
        },
      });

      res.status(201).json({
        id: userWithRoles!.id,
        username: userWithRoles!.username,
        email: userWithRoles!.email,
        realName: userWithRoles!.realName,
        phone: userWithRoles!.phone,
        status: userWithRoles!.status,
        createdAt: userWithRoles!.createdAt,
        roles: userWithRoles!.userRoles.map((ur) => ur.role.name),
      });
    } catch (error) {
      console.error('创建用户错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * PUT /api/users/:id
 * 更新用户
 * 权限: user:update
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('user', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { email, realName, phone, status, roleIds, password } = req.body;

      // 1. 检查用户是否存在
      const existingUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        res.status(404).json({ error: '用户不存在' });
        return;
      }

      // 2. 检查邮箱是否被其他用户使用
      if (email && email !== existingUser.email) {
        const emailExists = await prisma.user.findFirst({
          where: {
            email,
            id: { not: id },
          },
        });

        if (emailExists) {
          res.status(400).json({ error: '邮箱已被使用' });
          return;
        }
      }

      // 3. 准备更新数据
      const updateData: any = {};
      if (email) updateData.email = email;
      if (realName) updateData.realName = realName;
      if (phone !== undefined) updateData.phone = phone || null;
      if (status) updateData.status = status;
      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      // 4. 更新用户基本信息
      await prisma.user.update({
        where: { id },
        data: updateData,
      });

      // 状态变更时清除该用户缓存（如禁用账号需立即生效）
      if (status) {
        invalidateUserCache(id);
      }

      // 5. 更新角色关联(全量替换)
      if (roleIds && Array.isArray(roleIds)) {
        // 先删除所有旧关联
        await prisma.userRole.deleteMany({
          where: { userId: id },
        });

        // 创建新关联
        if (roleIds.length > 0) {
          await prisma.userRole.createMany({
            data: roleIds.map((roleId: string) => ({
              userId: id,
              roleId,
            })),
          });
        }

        // 角色变更后清除该用户的认证缓存
        invalidateUserCache(id);
      }

      // 6. 查询完整用户信息(含角色)
      const updatedUser = await prisma.user.findUnique({
        where: { id },
        include: {
          userRoles: {
            include: {
              role: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                },
              },
            },
          },
        },
      });

      res.json({
        id: updatedUser!.id,
        username: updatedUser!.username,
        email: updatedUser!.email,
        realName: updatedUser!.realName,
        phone: updatedUser!.phone,
        status: updatedUser!.status,
        createdAt: updatedUser!.createdAt,
        roles: updatedUser!.userRoles.map((ur) => ur.role.name),
      });
    } catch (error) {
      console.error('更新用户错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * DELETE /api/users/:id
 * 删除用户
 * 权限: user:delete
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('user', 'delete'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // 1. 检查用户是否存在
      const existingUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        res.status(404).json({ error: '用户不存在' });
        return;
      }

      // Check if user is project manager for any project
      const managedProjects = await prisma.project.count({
        where: { managerId: id },
      });
      if (managedProjects > 0) {
        res.status(400).json({ error: `该用户是 ${managedProjects} 个项目的项目经理，请先转移项目经理后再删除` });
        return;
      }

      // 2. 删除用户(级联删除userRoles)
      await prisma.user.delete({
        where: { id },
      });

      res.json({ success: true });
    } catch (error) {
      console.error('删除用户错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
