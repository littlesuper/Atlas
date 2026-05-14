import express, { Request, Response } from 'express';
import { type Prisma } from '../../generated/prisma/client';
import { authenticate } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import { businessMetrics, recordBusinessEvent } from '../../utils/businessMetrics';
import prisma from '../../db';

const router = express.Router();

router.get('/latest-status', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const projects = await prisma.project.findMany({ select: { id: true } });
    const map: Record<string, string> = {};
    await Promise.all(projects.map(async (p) => {
      const report = await prisma.weeklyReport.findFirst({
        where: { projectId: p.id, status: { in: ['SUBMITTED', 'ARCHIVED'] } },
        orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
        select: { progressStatus: true },
      });
      if (report) map[p.id] = report.progressStatus;
    }));
    res.json(map);
  } catch (error) {
    logger.error({ err: error }, '获取最新周报状态错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/drafts', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const reports = await prisma.weeklyReport.findMany({
      where: {
        status: 'DRAFT',
      },
      orderBy: { updatedAt: 'desc' },
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

    res.json(reports);
  } catch (error) {
    logger.error({ err: error }, '获取草稿列表错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/project/:projectId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    const reports = await prisma.weeklyReport.findMany({
      where: { projectId },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
      include: {
        creator: {
          select: {
            id: true,
            realName: true,
            username: true,
          },
        },
      },
    });

    res.json(reports);
  } catch (error) {
    logger.error({ err: error }, '获取项目周报错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/project/:projectId/latest', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    const report = await prisma.weeklyReport.findFirst({
      where: { projectId },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
      include: {
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
      res.status(404).json({ error: '暂无周报' });
      return;
    }

    recordBusinessEvent(businessMetrics, 'weekly_report.submitted');
    res.json(report);
  } catch (error) {
    logger.error({ err: error }, '获取最新周报错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/project/:projectId/previous', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { year, weekNumber } = req.query;

    if (!year || !weekNumber) {
      res.status(400).json({ error: '年份和周次不能为空' });
      return;
    }

    const yearNum = parseInt(year as string);
    const weekNum = parseInt(weekNumber as string);

    const report = await prisma.weeklyReport.findFirst({
      where: {
        projectId,
        status: { in: ['SUBMITTED', 'ARCHIVED'] },
        OR: [
          { year: { lt: yearNum } },
          { year: yearNum, weekNumber: { lt: weekNum } },
        ],
      },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
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

    if (!report) {
      res.status(404).json({ error: '暂无历史周报' });
      return;
    }

    res.json(report);
  } catch (error) {
    logger.error({ err: error }, '获取上一周次周报错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/week/:year/:weekNumber', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, weekNumber } = req.params;
    const { productLine } = req.query;

    const yearNum = parseInt(year);
    const weekNum = parseInt(weekNumber);

    const where: Prisma.WeeklyReportWhereInput = {
      year: yearNum,
      weekNumber: weekNum,
    };

    if (productLine) {
      where.project = { productLine: productLine as string };
    }

    const reports = await prisma.weeklyReport.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
    });

    res.json(reports);
  } catch (error) {
    logger.error({ err: error }, '获取指定周次周报错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
