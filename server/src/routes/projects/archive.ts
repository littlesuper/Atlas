import express, { Request, Response } from 'express';
import { ProjectStatus, type Prisma } from '../../generated/prisma/client';
import { authenticate } from '../../middleware/auth';
import { requirePermission, canManageProject } from '../../middleware/permission';
import { logger } from '../../utils/logger';
import prisma from '../../db';
import { readArchivedProjectStatus, type ProjectMemberSnapshot } from './shared';

const router = express.Router();

router.post(
  '/:id/archive',
  authenticate,
  requirePermission('project', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { remark } = req.body;

      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          manager: { select: { id: true, realName: true, username: true } },
          members: { include: { user: { select: { id: true, realName: true, username: true } } } },
        },
      });

      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (project.status === ProjectStatus.ARCHIVED) {
        res.status(400).json({ error: '项目已处于归档状态' });
        return;
      }

      if (!canManageProject(req, project.managerId, id)) {
        res.status(403).json({ error: '只有项目经理或管理员可以归档项目' });
        return;
      }

      const [activities, products, weeklyReports, riskAssessments, activityComments] = await Promise.all([
        prisma.activity.findMany({
          where: { projectId: id },
          include: { executors: { include: { user: { select: { id: true, realName: true } } } } },
          orderBy: { sortOrder: 'asc' },
        }),
        prisma.product.findMany({ where: { projectId: id } }),
        prisma.weeklyReport.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' } }),
        prisma.riskAssessment.findMany({ where: { projectId: id }, orderBy: { assessedAt: 'desc' } }),
        prisma.activityComment.findMany({
          where: { activity: { projectId: id } },
          include: { user: { select: { id: true, realName: true, username: true } } },
        }),
      ]);

      const snapshot = {
        project: {
          name: project.name,
          description: project.description,
          productLine: project.productLine,
          status: project.status,
          priority: project.priority,
          startDate: project.startDate,
          endDate: project.endDate,
          progress: project.progress,
          managerId: project.managerId,
          managerName: project.manager?.realName || project.manager?.username,
          members: project.members.map((m: ProjectMemberSnapshot) => ({
            userId: m.user.id,
            realName: m.user.realName,
            role: 'member',
          })),
        },
        activities,
        products,
        weeklyReports,
        riskAssessments,
        activityComments,
      };

      const archive = await prisma.$transaction(async (tx) => {
        const arc = await tx.projectArchive.create({
          data: {
            projectId: id,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            archivedBy: req.user!.id,
            remark: remark || null,
          },
        });
        await tx.project.update({
          where: { id },
          data: { status: ProjectStatus.ARCHIVED },
        });
        return arc;
      });

      res.json(archive);
    } catch (error) {
      logger.error({ err: error }, '归档项目错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.post(
  '/:id/unarchive',
  authenticate,
  requirePermission('project', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const project = await prisma.project.findUnique({ where: { id } });

      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (project.status !== ProjectStatus.ARCHIVED) {
        res.status(400).json({ error: '项目未处于归档状态' });
        return;
      }

      if (!canManageProject(req, project.managerId, id)) {
        res.status(403).json({ error: '只有项目经理或管理员可以取消归档' });
        return;
      }

      const latestArchive = await prisma.projectArchive.findFirst({
        where: { projectId: id },
        orderBy: { archivedAt: 'desc' },
      });

      const previousStatus = readArchivedProjectStatus(latestArchive?.snapshot);
      if (!previousStatus) {
        // 无归档快照（记录丢失/被删/绕过 archive 端点直接改库）→ 没有可信的原状态可恢复，
        // 显式拒绝而非静默回落 COMPLETED（ARC-009）。
        res.status(400).json({ error: '无归档快照，无法恢复原状态' });
        return;
      }
      const restoredStatus = (['IN_PROGRESS', 'COMPLETED', 'ON_HOLD'].includes(previousStatus))
        ? previousStatus as ProjectStatus
        : ProjectStatus.COMPLETED;

      const updated = await prisma.project.update({
        where: { id },
        data: { status: restoredStatus },
        include: {
          manager: { select: { id: true, realName: true, username: true } },
          _count: { select: { activities: true, products: true } },
        },
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, '取消归档错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.post(
  '/:id/snapshot',
  authenticate,
  requirePermission('project', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { remark } = req.body;

      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          manager: { select: { id: true, realName: true, username: true } },
          members: { include: { user: { select: { id: true, realName: true, username: true } } } },
        },
      });

      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (!canManageProject(req, project.managerId, id)) {
        res.status(403).json({ error: '只有项目经理或管理员可以创建快照' });
        return;
      }

      const [activities, products, weeklyReports, riskAssessments, activityComments] = await Promise.all([
        prisma.activity.findMany({
          where: { projectId: id },
          include: { executors: { include: { user: { select: { id: true, realName: true } } } } },
          orderBy: { sortOrder: 'asc' },
        }),
        prisma.product.findMany({ where: { projectId: id } }),
        prisma.weeklyReport.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' } }),
        prisma.riskAssessment.findMany({ where: { projectId: id }, orderBy: { assessedAt: 'desc' } }),
        prisma.activityComment.findMany({
          where: { activity: { projectId: id } },
          include: { user: { select: { id: true, realName: true, username: true } } },
        }),
      ]);

      const snapshot = {
        project: {
          name: project.name,
          description: project.description,
          productLine: project.productLine,
          status: project.status,
          priority: project.priority,
          startDate: project.startDate,
          endDate: project.endDate,
          progress: project.progress,
          managerId: project.managerId,
          managerName: project.manager?.realName || project.manager?.username,
          members: project.members.map((m: ProjectMemberSnapshot) => ({
            userId: m.user.id,
            realName: m.user.realName,
            role: 'member',
          })),
        },
        activities,
        products,
        weeklyReports,
        riskAssessments,
        activityComments,
      };

      const archive = await prisma.projectArchive.create({
        data: {
          projectId: id,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          archivedBy: req.user!.id,
          remark: remark || null,
        },
      });

      res.json(archive);
    } catch (error) {
      logger.error({ err: error }, '创建项目快照错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.get('/:id/archives', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const archives = await prisma.projectArchive.findMany({
      where: { projectId: id },
      select: {
        id: true,
        archivedBy: true,
        archivedAt: true,
        remark: true,
      },
      orderBy: { archivedAt: 'desc' },
    });

    const userIds = [...new Set(archives.map(a => a.archivedBy))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, realName: true, username: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    const result = archives.map(a => ({
      ...a,
      creator: userMap.get(a.archivedBy) || null,
    }));

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, '获取归档历史错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
