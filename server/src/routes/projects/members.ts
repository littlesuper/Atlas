import express, { Request, Response } from 'express';
import { authenticate, invalidateUserCache } from '../../middleware/auth';
import { requirePermission, isAdmin } from '../../middleware/permission';
import { logger } from '../../utils/logger';
import prisma from '../../db';
import { PROJECT_MEMBER_ROLES } from './shared';

const router = express.Router();

router.get('/:id/members', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const members = await prisma.projectMember.findMany({
      where: { projectId: id },
      include: {
        user: {
          select: {
            id: true,
            realName: true,
            username: true,
          },
        },
      },
    });

    res.json(members);
  } catch (error) {
    logger.error({ err: error }, '获取协作者列表错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post(
  '/:id/members',
  authenticate,
  requirePermission('project', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { userId, role = 'COLLABORATOR' } = req.body;

      if (!userId) {
        res.status(400).json({ error: '用户ID不能为空' });
        return;
      }

      if (!PROJECT_MEMBER_ROLES.includes(role)) {
        res.status(400).json({ error: '角色值非法' });
        return;
      }

      const project = await prisma.project.findUnique({
        where: { id },
      });

      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (!isAdmin(req) && project.managerId !== req.user!.id) {
        res.status(403).json({ error: '只有项目经理或管理员可以添加协作者' });
        return;
      }

      if (userId === project.managerId && role === 'PROJECT_MANAGER') {
        res.status(400).json({ error: '项目经理已是该项目负责人' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        res.status(400).json({ error: '用户不存在' });
        return;
      }

      const existing = await prisma.projectMember.findUnique({
        where: { projectId_userId_role: { projectId: id, userId, role } },
      });

      if (existing) {
        res.status(400).json({ error: '该用户已在此角色下' });
        return;
      }

      const member = await prisma.projectMember.create({
        data: { projectId: id, userId, role },
        include: {
          user: {
            select: {
              id: true,
              realName: true,
              username: true,
            },
          },
        },
      });

      invalidateUserCache(userId);

      res.status(201).json(member);
    } catch (error) {
      logger.error({ err: error }, '添加协作者错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.put(
  '/:id/members',
  authenticate,
  requirePermission('project', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { members } = req.body as { members?: Array<{ userId: string; role: string }> };

      if (!Array.isArray(members)) {
        res.status(400).json({ error: 'members 必须是数组' });
        return;
      }

      for (const m of members) {
        if (!m.userId || !PROJECT_MEMBER_ROLES.includes(m.role as typeof PROJECT_MEMBER_ROLES[number])) {
          res.status(400).json({ error: '成员或角色值非法' });
          return;
        }
      }

      const project = await prisma.project.findUnique({ where: { id } });
      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (!isAdmin(req) && project.managerId !== req.user!.id) {
        res.status(403).json({ error: '只有项目经理或管理员可以编辑项目成员' });
        return;
      }

      const seen = new Set<string>();
      const dedup = members.filter((m) => {
        const k = `${m.userId}::${m.role}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      const oldMembers = await prisma.projectMember.findMany({ where: { projectId: id } });
      const oldUserIds = new Set(oldMembers.map((m) => m.userId));

      await prisma.$transaction([
        prisma.projectMember.deleteMany({ where: { projectId: id } }),
        ...(dedup.length > 0
          ? [
              prisma.projectMember.createMany({
                data: dedup.map((m) => ({ projectId: id, userId: m.userId, role: m.role })),
              }),
            ]
          : []),
      ]);

      const affectedUserIds = new Set<string>([...oldUserIds, ...dedup.map((m) => m.userId)]);
      affectedUserIds.forEach((uid) => invalidateUserCache(uid));

      const result = await prisma.projectMember.findMany({
        where: { projectId: id },
        include: {
          user: { select: { id: true, realName: true, username: true } },
        },
      });

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, '批量替换项目成员错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.delete(
  '/:id/members/:userId',
  authenticate,
  requirePermission('project', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, userId } = req.params;
      const role = typeof req.query.role === 'string' ? req.query.role : undefined;

      const project = await prisma.project.findUnique({
        where: { id },
      });

      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (!isAdmin(req) && project.managerId !== req.user!.id) {
        res.status(403).json({ error: '只有项目经理或管理员可以移除协作者' });
        return;
      }

      if (role) {
        if (!PROJECT_MEMBER_ROLES.includes(role as typeof PROJECT_MEMBER_ROLES[number])) {
          res.status(400).json({ error: '角色值非法' });
          return;
        }
        const existing = await prisma.projectMember.findUnique({
          where: { projectId_userId_role: { projectId: id, userId, role } },
        });
        if (!existing) {
          res.status(404).json({ error: '该用户不在此角色下' });
          return;
        }
        await prisma.projectMember.delete({
          where: { projectId_userId_role: { projectId: id, userId, role } },
        });
      } else {
        const result = await prisma.projectMember.deleteMany({
          where: { projectId: id, userId },
        });
        if (result.count === 0) {
          res.status(404).json({ error: '该用户不是协作者' });
          return;
        }
      }

      invalidateUserCache(userId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, '移除协作者错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
