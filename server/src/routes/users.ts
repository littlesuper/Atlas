import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authenticate, invalidateUserCache } from '../middleware/auth';
import { requirePermission, sanitizePagination } from '../middleware/permission';
import { auditLog, diffFields } from '../utils/auditLog';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [用户管理]
 *     summary: 获取用户列表
 *     description: 分页获取用户列表，支持关键字搜索和登录类型过滤
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: 每页数量
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: 搜索关键字（匹配用户名或姓名）
 *       - in: query
 *         name: canLogin
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: 按登录权限过滤
 *     responses:
 *       200:
 *         description: 用户列表
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/User'
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限
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
        canLogin,
      } = req.query;

      const { pageNum, pageSizeNum } = sanitizePagination(page, pageSize);
      const skip = (pageNum - 1) * pageSizeNum;

      const where: any = {};
      if (keyword) {
        where.OR = [
          { username: { contains: keyword as string } },
          { realName: { contains: keyword as string } },
        ];
      }
      if (canLogin === 'true') {
        where.canLogin = true;
      } else if (canLogin === 'false') {
        where.canLogin = false;
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: pageSizeNum,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            username: true,
            realName: true,
            wecomUserId: true,
            canLogin: true,
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

      const data = users.map((user) => ({
        id: user.id,
        username: user.username,
        realName: user.realName,
        wecomUserId: user.wecomUserId,
        canLogin: user.canLogin,
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
 * @openapi
 * /users:
 *   post:
 *     tags: [用户管理]
 *     summary: 创建用户
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [realName]
 *             properties:
 *               realName:
 *                 type: string
 *                 description: 姓名
 *               username:
 *                 type: string
 *                 description: 用户名（允许登录时必填）
 *               password:
 *                 type: string
 *                 description: 密码（允许登录时必填）
 *               canLogin:
 *                 type: boolean
 *                 default: true
 *                 description: 是否允许登录
 *               roleIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 角色 ID 列表
 *     responses:
 *       201:
 *         description: 创建成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: 参数错误或用户名已存在
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限
 */
router.post(
  '/',
  authenticate,
  requirePermission('user', 'create'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, password, realName, roleIds, canLogin = true } = req.body;

      if (!realName) {
        res.status(400).json({ error: '姓名不能为空' });
        return;
      }
      if (canLogin) {
        if (!username || !password) {
          res.status(400).json({ error: '允许登录的用户需填写用户名和密码' });
          return;
        }
      }

      // 检查用户名唯一性
      if (username) {
        const existingUser = await prisma.user.findUnique({
          where: { username },
        });
        if (existingUser) {
          res.status(400).json({ error: '用户名已存在' });
          return;
        }
      }

      const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;

      const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            username: username || null,
            password: hashedPassword || null,
            realName,
            canLogin: !!canLogin,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            username: true,
            realName: true,
            canLogin: true,
            status: true,
            createdAt: true,
          },
        });

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

      const userWithRoles = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          userRoles: {
            include: {
              role: {
                select: { id: true, name: true, description: true },
              },
            },
          },
        },
      });

      auditLog({ req, action: 'CREATE', resourceType: 'user', resourceId: user.id, resourceName: userWithRoles!.realName });

      res.status(201).json({
        id: userWithRoles!.id,
        username: userWithRoles!.username,
        realName: userWithRoles!.realName,
        canLogin: userWithRoles!.canLogin,
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
 * @openapi
 * /users/{id}:
 *   put:
 *     tags: [用户管理]
 *     summary: 更新用户
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 用户 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               realName:
 *                 type: string
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               wecomUserId:
 *                 type: string
 *                 nullable: true
 *               canLogin:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, DISABLED]
 *               roleIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: 参数错误
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限
 *       404:
 *         description: 用户不存在
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('user', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { realName, wecomUserId, status, roleIds, password, canLogin } = req.body;

      const existingUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        res.status(404).json({ error: '用户不存在' });
        return;
      }

      // 如果开启登录，校验必填字段
      if (canLogin === true && !existingUser.canLogin) {
        const finalUsername = req.body.username || existingUser.username;
        const finalPassword = password || existingUser.password;
        if (!finalUsername || !finalPassword) {
          res.status(400).json({ error: '开启登录需要填写用户名和密码' });
          return;
        }
      }

      // 检查用户名唯一性
      if (req.body.username && req.body.username !== existingUser.username) {
        const usernameExists = await prisma.user.findFirst({
          where: { username: req.body.username, id: { not: id } },
        });
        if (usernameExists) {
          res.status(400).json({ error: '用户名已被使用' });
          return;
        }
      }

      const updateData: any = {};
      if (req.body.username) updateData.username = req.body.username;
      if (realName) updateData.realName = realName;
      if (wecomUserId !== undefined) updateData.wecomUserId = wecomUserId || null;
      if (canLogin !== undefined) updateData.canLogin = !!canLogin;
      if (status) updateData.status = status;
      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      const userChanges = diffFields(
        existingUser as unknown as Record<string, unknown>,
        updateData,
        ['realName', 'wecomUserId', 'canLogin', 'status'],
      );

      await prisma.user.update({
        where: { id },
        data: updateData,
      });

      if (status || canLogin !== undefined) {
        invalidateUserCache(id);
      }

      if (roleIds && Array.isArray(roleIds)) {
        await prisma.userRole.deleteMany({ where: { userId: id } });
        if (roleIds.length > 0) {
          await prisma.userRole.createMany({
            data: roleIds.map((roleId: string) => ({ userId: id, roleId })),
          });
        }
        invalidateUserCache(id);
      }

      const updatedUser = await prisma.user.findUnique({
        where: { id },
        include: {
          userRoles: {
            include: {
              role: {
                select: { id: true, name: true, description: true },
              },
            },
          },
        },
      });

      auditLog({ req, action: 'UPDATE', resourceType: 'user', resourceId: id, resourceName: existingUser.realName, changes: userChanges });

      res.json({
        id: updatedUser!.id,
        username: updatedUser!.username,
        realName: updatedUser!.realName,
        wecomUserId: updatedUser!.wecomUserId,
        canLogin: updatedUser!.canLogin,
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
 * @openapi
 * /users/{id}:
 *   delete:
 *     tags: [用户管理]
 *     summary: 删除用户
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 用户 ID
 *     responses:
 *       200:
 *         description: 删除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 用户是项目经理，无法删除
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限
 *       404:
 *         description: 用户不存在
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('user', 'delete'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const existingUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        res.status(404).json({ error: '用户不存在' });
        return;
      }

      const managedProjects = await prisma.project.count({
        where: { managerId: id },
      });
      if (managedProjects > 0) {
        res.status(400).json({ error: `该用户是 ${managedProjects} 个项目的项目经理，请先转移项目经理后再删除` });
        return;
      }

      await prisma.user.delete({ where: { id } });

      auditLog({ req, action: 'DELETE', resourceType: 'user', resourceId: id, resourceName: existingUser.realName });

      res.json({ success: true });
    } catch (error) {
      console.error('删除用户错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
