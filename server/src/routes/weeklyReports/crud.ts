import express, { Request, Response } from 'express';
import { ReportStatus, type Prisma } from '../../generated/prisma/client';
import { authenticate } from '../../middleware/auth';
import { requirePermission, canManageProject, isAdmin, sanitizePagination } from '../../middleware/permission';
import { getWeekNumber } from '../../utils/weekNumber';
import { sanitizeRichText } from '../../utils/sanitize';
import { logger } from '../../utils/logger';
import prisma from '../../db';
import { queryString } from './shared';

const router = express.Router();

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = '1',
      pageSize = '20',
      projectId,
      year,
      weekNumber,
      status,
      productLine,
    } = req.query;
    const projectIdFilter = queryString(projectId);
    const statusFilter = queryString(status);

    const { pageNum, pageSizeNum } = sanitizePagination(page, pageSize);
    const skip = (pageNum - 1) * pageSizeNum;

    const where: Prisma.WeeklyReportWhereInput = {};

    if (projectIdFilter) {
      where.projectId = projectIdFilter;
    }

    if (year) {
      where.year = parseInt(year as string);
    }

    if (weekNumber) {
      where.weekNumber = parseInt(weekNumber as string);
    }

    if (statusFilter) {
      where.status = statusFilter as ReportStatus;
    } else {
      where.status = { in: ['SUBMITTED', 'ARCHIVED'] };
    }

    if (productLine) {
      where.project = { productLine: productLine as string };
    }

    const total = await prisma.weeklyReport.count({ where });

    const reports = await prisma.weeklyReport.findMany({
      where,
      skip,
      take: pageSizeNum,
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
      include: {
        project: {
          select: {
            id: true,
            name: true,
            productLine: true,
            managerId: true,
          },
        },
        creator: {
          select: {
            id: true,
            realName: true,
            username: true,
          },
        },
      },
    });

    res.json({
      data: reports,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    });
  } catch (error) {
    logger.error({ err: error }, '获取周报列表错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const report = await prisma.weeklyReport.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            productLine: true,
            managerId: true,
          },
        },
        creator: {
          select: {
            id: true,
            realName: true,
            username: true,
          },
        },
      },
    });

    if (!report) {
      res.status(404).json({ error: '周报不存在' });
      return;
    }

    res.json(report);
  } catch (error) {
    logger.error({ err: error }, '获取周报详情错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post(
  '/',
  authenticate,
  requirePermission('weekly_report', 'create'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectId,
        weekStart,
        weekEnd,
        changeOverview,
        demandAnalysis,
        keyProgress,
        nextWeekPlan,
        riskWarning,
        risks,
        phaseProgress,
        attachments,
        progressStatus,
      } = req.body;

      if (!projectId || !weekStart || !weekEnd) {
        res.status(400).json({ error: '项目ID、周开始日期和周结束日期不能为空' });
        return;
      }

      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        res.status(400).json({ error: '项目不存在' });
        return;
      }

      if (project.status === 'ARCHIVED') {
        res.status(403).json({ error: '归档项目不可修改' });
        return;
      }

      if (!canManageProject(req, project.managerId, projectId)) {
        res.status(403).json({ error: '只能为自己负责的项目创建周报' });
        return;
      }

      const weekStartDate = new Date(weekStart);
      const { year, weekNumber } = getWeekNumber(weekStartDate);

      const report = await prisma.weeklyReport.create({
        data: {
          projectId,
          weekStart: new Date(weekStart),
          weekEnd: new Date(weekEnd),
          year,
          weekNumber,
          changeOverview: sanitizeRichText(changeOverview),
          demandAnalysis: sanitizeRichText(demandAnalysis),
          keyProgress: sanitizeRichText(keyProgress),
          nextWeekPlan: sanitizeRichText(nextWeekPlan),
          riskWarning: sanitizeRichText(riskWarning),
          risks: risks || null,
          phaseProgress: phaseProgress || null,
          attachments: attachments || null,
          progressStatus: progressStatus || 'ON_TRACK',
          createdBy: req.user!.id,
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              productLine: true,
            },
          },
          creator: {
            select: {
              id: true,
              realName: true,
              username: true,
            },
          },
        },
      });

      res.status(201).json(report);
    } catch (error) {
      logger.error({ err: error }, '创建周报错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.put(
  '/:id',
  authenticate,
  requirePermission('weekly_report', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const {
        weekStart,
        weekEnd,
        changeOverview,
        demandAnalysis,
        keyProgress,
        nextWeekPlan,
        riskWarning,
        risks,
        phaseProgress,
        attachments,
        status,
        progressStatus,
      } = req.body;

      const existingReport = await prisma.weeklyReport.findUnique({
        where: { id },
      });

      if (!existingReport) {
        res.status(404).json({ error: '周报不存在' });
        return;
      }

      const reportProj = await prisma.project.findUnique({
        where: { id: existingReport.projectId },
        select: { status: true },
      });
      if (reportProj?.status === 'ARCHIVED') {
        res.status(403).json({ error: '归档项目不可修改' });
        return;
      }

      if (!isAdmin(req)) {
        const isCreator = existingReport.createdBy === req.user!.id;
        const reportProject = await prisma.project.findUnique({
          where: { id: existingReport.projectId },
          select: { managerId: true },
        });
        const isCollaborator = req.user!.collaboratingProjectIds?.includes(existingReport.projectId);
        const isManager = reportProject?.managerId === req.user!.id;
        if (!isCreator && !isManager && !isCollaborator) {
          res.status(403).json({ error: '只能修改自己创建的或自己负责项目的周报' });
          return;
        }
      }

      const updateData: Prisma.WeeklyReportUncheckedUpdateInput = {};

      if (weekStart !== undefined || weekEnd !== undefined) {
        const newWeekStart = weekStart ? new Date(weekStart) : existingReport.weekStart;
        const newWeekEnd = weekEnd ? new Date(weekEnd) : existingReport.weekEnd;

        const { year, weekNumber } = getWeekNumber(newWeekStart);

        if (year !== existingReport.year || weekNumber !== existingReport.weekNumber) {
          updateData.year = year;
          updateData.weekNumber = weekNumber;
        }

        if (weekStart !== undefined) updateData.weekStart = newWeekStart;
        if (weekEnd !== undefined) updateData.weekEnd = newWeekEnd;
      }

      if (changeOverview !== undefined) updateData.changeOverview = sanitizeRichText(changeOverview);
      if (demandAnalysis !== undefined) updateData.demandAnalysis = sanitizeRichText(demandAnalysis);
      if (keyProgress !== undefined) updateData.keyProgress = sanitizeRichText(keyProgress);
      if (nextWeekPlan !== undefined) updateData.nextWeekPlan = sanitizeRichText(nextWeekPlan);
      if (riskWarning !== undefined) updateData.riskWarning = sanitizeRichText(riskWarning);
      if (risks !== undefined) updateData.risks = risks;
      if (phaseProgress !== undefined) updateData.phaseProgress = phaseProgress;
      if (attachments !== undefined) updateData.attachments = attachments;
      if (status !== undefined) updateData.status = status;
      if (progressStatus !== undefined) updateData.progressStatus = progressStatus;

      const report = await prisma.weeklyReport.update({
        where: { id },
        data: updateData,
        include: {
          project: {
            select: {
              id: true,
              name: true,
              productLine: true,
            },
          },
          creator: {
            select: {
              id: true,
              realName: true,
              username: true,
            },
          },
        },
      });

      res.json(report);
    } catch (error) {
      logger.error({ err: error }, '更新周报错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('weekly_report', 'delete'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const existingReport = await prisma.weeklyReport.findUnique({
        where: { id },
      });

      if (!existingReport) {
        res.status(404).json({ error: '周报不存在' });
        return;
      }

      if (!isAdmin(req)) {
        const isCreator = existingReport.createdBy === req.user!.id;
        const reportProject = await prisma.project.findUnique({
          where: { id: existingReport.projectId },
          select: { managerId: true },
        });
        const isCollaborator = req.user!.collaboratingProjectIds?.includes(existingReport.projectId);
        const isManager = reportProject?.managerId === req.user!.id;
        if (!isCreator && !isManager && !isCollaborator) {
          res.status(403).json({ error: '只能删除自己创建的或自己负责项目的周报' });
          return;
        }
      }

      await prisma.weeklyReport.delete({
        where: { id },
      });

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, '删除周报错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
