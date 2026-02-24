import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requirePermission, canManageProject } from '../middleware/permission';
import { auditLog } from '../utils/auditLog';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/activity-archives/project/:projectId
 * 创建活动归档快照
 */
router.post(
  '/project/:projectId',
  authenticate,
  requirePermission('activity', 'create'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;
      const { label } = req.body;

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, managerId: true, name: true },
      });

      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (!canManageProject(req, project.managerId, projectId)) {
        res.status(403).json({ error: '无权操作此项目' });
        return;
      }

      // 查询全部活动（含负责人姓名）
      const activities = await prisma.activity.findMany({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
        include: {
          assignee: { select: { id: true, realName: true } },
        },
      });

      // 计算下一个版本号
      const latest = await prisma.activityArchive.findFirst({
        where: { projectId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      const user = (req as any).user;

      const archive = await prisma.activityArchive.create({
        data: {
          projectId,
          version: nextVersion,
          label: label || null,
          snapshot: JSON.parse(JSON.stringify(activities)),
          activityCount: activities.length,
          createdBy: user.id,
          createdByName: user.realName || user.username,
        },
      });

      auditLog({
        req,
        action: 'CREATE',
        resourceType: 'activity',
        resourceId: archive.id,
        resourceName: `归档 v${nextVersion}${label ? ' - ' + label : ''} (${project.name})`,
      });

      // 返回时不含 snapshot
      const { snapshot: _, ...meta } = archive;
      res.status(201).json(meta);
    } catch (error) {
      console.error('创建活动归档错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * GET /api/activity-archives/project/:projectId
 * 获取归档列表（仅元数据，不含 snapshot）
 */
router.get(
  '/project/:projectId',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;

      const archives = await prisma.activityArchive.findMany({
        where: { projectId },
        orderBy: { version: 'desc' },
        select: {
          id: true,
          projectId: true,
          version: true,
          label: true,
          activityCount: true,
          createdBy: true,
          createdByName: true,
          createdAt: true,
        },
      });

      res.json(archives);
    } catch (error) {
      console.error('获取归档列表错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * GET /api/activity-archives/:id
 * 获取单个归档（含 snapshot）
 */
router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const archive = await prisma.activityArchive.findUnique({
        where: { id },
      });

      if (!archive) {
        res.status(404).json({ error: '归档不存在' });
        return;
      }

      res.json(archive);
    } catch (error) {
      console.error('获取归档详情错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * DELETE /api/activity-archives/:id
 * 删除归档
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('activity', 'delete'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const archive = await prisma.activityArchive.findUnique({
        where: { id },
        select: { id: true, projectId: true, version: true, label: true, project: { select: { managerId: true, name: true } } },
      });

      if (!archive) {
        res.status(404).json({ error: '归档不存在' });
        return;
      }

      if (!canManageProject(req, archive.project.managerId, archive.projectId)) {
        res.status(403).json({ error: '无权操作此项目' });
        return;
      }

      await prisma.activityArchive.delete({ where: { id } });

      auditLog({
        req,
        action: 'DELETE',
        resourceType: 'activity',
        resourceId: id,
        resourceName: `归档 v${archive.version}${archive.label ? ' - ' + archive.label : ''} (${archive.project.name})`,
      });

      res.json({ success: true });
    } catch (error) {
      console.error('删除归档错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
