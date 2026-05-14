import express, { Request, Response } from 'express';
import { ProjectStatus, type Prisma } from '../../generated/prisma/client';
import { authenticate } from '../../middleware/auth';
import { requirePermission, canManageProject, canDeleteProject, sanitizePagination } from '../../middleware/permission';
import { VALID_PROJECT_STATUSES, VALID_PRIORITIES, isValidProjectStatus, isValidPriority, isValidDateRange, isValidProgress } from '../../utils/validation';
import { logger } from '../../utils/logger';
import { businessMetrics, recordBusinessEvent } from '../../utils/businessMetrics';
import prisma from '../../db';

const router = express.Router();

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = '1',
      pageSize = '20',
      status,
      keyword,
      productLine,
    } = req.query;

    const { pageNum, pageSizeNum } = sanitizePagination(page, pageSize);
    const skip = (pageNum - 1) * pageSizeNum;

    const where: Prisma.ProjectWhereInput = {};

    if (status) {
      where.status = status as ProjectStatus;
    }

    if (keyword) {
      where.OR = [
        { name: { contains: keyword as string } },
        { description: { contains: keyword as string } },
      ];
    }

    if (productLine) {
      const lines = (productLine as string).split(',').map(l => l.trim());
      const existingAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
      where.AND = [
        ...existingAnd,
        { OR: [{ productLine: { in: lines } }, { productLine: null }] },
      ];
    }

    const statsWhere: Prisma.ProjectWhereInput = {};
    if (keyword) {
      statsWhere.OR = [
        { name: { contains: keyword as string } },
        { description: { contains: keyword as string } },
      ];
    }
    if (productLine) {
      const lines = (productLine as string).split(',').map(l => l.trim());
      const existingStatsAnd = Array.isArray(statsWhere.AND) ? statsWhere.AND : statsWhere.AND ? [statsWhere.AND] : [];
      statsWhere.AND = [
        ...existingStatsAnd,
        { OR: [{ productLine: { in: lines } }, { productLine: null }] },
      ];
    }

    const [all, inProgress, completed, onHold, archived] = await Promise.all([
      prisma.project.count({ where: statsWhere }),
      prisma.project.count({ where: { ...statsWhere, status: ProjectStatus.IN_PROGRESS } }),
      prisma.project.count({ where: { ...statsWhere, status: ProjectStatus.COMPLETED } }),
      prisma.project.count({ where: { ...statsWhere, status: ProjectStatus.ON_HOLD } }),
      prisma.project.count({ where: { ...statsWhere, status: ProjectStatus.ARCHIVED } }),
    ]);

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: pageSizeNum,
        orderBy: {
          startDate: 'asc',
        },
        include: {
          manager: {
            select: {
              id: true,
              realName: true,
              username: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  realName: true,
                  username: true,
                },
              },
            },
          },
          _count: {
            select: {
              activities: true,
              products: true,
            },
          },
        },
      }),
      prisma.project.count({ where }),
    ]);

    res.json({
      data: projects,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      stats: {
        all,
        inProgress,
        completed,
        onHold,
        archived,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '获取项目列表错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/archives/:archiveId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { archiveId } = req.params;
    const archive = await prisma.projectArchive.findUnique({
      where: { id: archiveId },
    });
    if (!archive) {
      res.status(404).json({ error: '归档记录不存在' });
      return;
    }
    res.json(archive);
  } catch (error) {
    logger.error({ err: error }, '获取归档快照错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        manager: {
          select: {
            id: true,
            realName: true,
            username: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                realName: true,
                username: true,
              },
            },
          },
        },
        _count: {
          select: {
            activities: true,
            products: true,
          },
        },
      },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    res.json(project);
  } catch (error) {
    logger.error({ err: error }, '获取项目详情错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post(
  '/',
  authenticate,
  requirePermission('project', 'create'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        name,
        description,
        productLine,
        status,
        priority,
        startDate,
        endDate,
        managerId,
      } = req.body;

      if (!name || !productLine || !status || !priority || !managerId) {
        res.status(400).json({ error: '缺少必填字段' });
        return;
      }

      if (!isValidProjectStatus(status)) {
        res.status(400).json({ error: `无效的状态值，允许的值为: ${VALID_PROJECT_STATUSES.join(', ')}` });
        return;
      }

      if (!isValidPriority(priority)) {
        res.status(400).json({ error: `无效的优先级值，允许的值为: ${VALID_PRIORITIES.join(', ')}` });
        return;
      }

      if (startDate && endDate && !isValidDateRange(startDate, endDate)) {
        res.status(400).json({ error: '结束日期不能早于开始日期' });
        return;
      }

      const manager = await prisma.user.findUnique({
        where: { id: managerId },
      });

      if (!manager) {
        res.status(400).json({ error: '项目经理不存在' });
        return;
      }

      const project = await prisma.project.create({
        data: {
          name,
          description,
          productLine,
          status,
          priority,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          managerId,
        },
        include: {
          manager: {
            select: {
              id: true,
              realName: true,
              username: true,
            },
          },
          _count: {
            select: {
              activities: true,
              products: true,
            },
          },
        },
      });

      recordBusinessEvent(businessMetrics, 'project.created');
      res.status(201).json(project);
    } catch (error) {
      logger.error({ err: error }, '创建项目错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.put(
  '/:id',
  authenticate,
  requirePermission('project', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const {
        name,
        description,
        productLine,
        status,
        priority,
        startDate,
        endDate,
        managerId,
        progress,
      } = req.body;

      const existingProject = await prisma.project.findUnique({
        where: { id },
      });

      if (!existingProject) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (existingProject.status === ProjectStatus.ARCHIVED) {
        res.status(403).json({ error: '归档项目不可编辑，请先取消归档' });
        return;
      }

      if (!canManageProject(req, existingProject.managerId, id)) {
        res.status(403).json({ error: '只能修改自己负责的项目' });
        return;
      }

      if (progress !== undefined && !isValidProgress(progress)) {
        res.status(400).json({ error: '进度值必须在 0 到 100 之间' });
        return;
      }

      if (status !== undefined && !isValidProjectStatus(status)) {
        res.status(400).json({ error: `无效的状态值，允许的值为: ${VALID_PROJECT_STATUSES.join(', ')}` });
        return;
      }

      if (status === 'ARCHIVED') {
        res.status(400).json({ error: '请使用归档功能来归档项目' });
        return;
      }

      if (priority !== undefined && !isValidPriority(priority)) {
        res.status(400).json({ error: `无效的优先级值，允许的值为: ${VALID_PRIORITIES.join(', ')}` });
        return;
      }

      if (startDate !== undefined && endDate !== undefined && startDate && endDate && !isValidDateRange(startDate, endDate)) {
        res.status(400).json({ error: '结束日期不能早于开始日期' });
        return;
      }

      if (managerId) {
        const manager = await prisma.user.findUnique({
          where: { id: managerId },
        });

        if (!manager) {
          res.status(400).json({ error: '项目经理不存在' });
          return;
        }
      }

      const updateData: Prisma.ProjectUncheckedUpdateInput = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (productLine !== undefined) updateData.productLine = productLine;
      if (status !== undefined) updateData.status = status;
      if (priority !== undefined) updateData.priority = priority;
      if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
      if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
      if (managerId !== undefined) updateData.managerId = managerId;
      if (progress !== undefined) updateData.progress = progress;

      const project = await prisma.project.update({
        where: { id },
        data: updateData,
        include: {
          manager: {
            select: {
              id: true,
              realName: true,
              username: true,
            },
          },
          _count: {
            select: {
              activities: true,
              products: true,
            },
          },
        },
      });

      res.json(project);
    } catch (error) {
      logger.error({ err: error }, '更新项目错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('project', 'delete'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const existingProject = await prisma.project.findUnique({
        where: { id },
      });

      if (!existingProject) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      if (!canDeleteProject(req, existingProject.managerId)) {
        res.status(403).json({ error: '只有项目经理或管理员可以删除项目' });
        return;
      }

      await prisma.project.delete({
        where: { id },
      });

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, '删除项目错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
