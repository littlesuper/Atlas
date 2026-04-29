import express, { Request, Response } from 'express';
import { PrismaClient, ActivityStatus } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requirePermission, isAdmin, canManageProject, sanitizePagination } from '../middleware/permission';
import { getWeekNumber } from '../utils/weekNumber';
import { callAi } from '../utils/aiClient';
import { sanitizeRichText } from '../utils/sanitize';
import { logger } from '../utils/logger';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/weekly-reports
 * 获取周报列表（分页、项目筛选、年份筛选、周数筛选、状态筛选）
 */
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

    const { pageNum, pageSizeNum } = sanitizePagination(page, pageSize);
    const skip = (pageNum - 1) * pageSizeNum;

    // 构建筛选条件
    const where: any = {};

    if (projectId) {
      where.projectId = projectId;
    }

    if (year) {
      where.year = parseInt(year as string);
    }

    if (weekNumber) {
      where.weekNumber = parseInt(weekNumber as string);
    }

    if (status) {
      where.status = status;
    } else {
      // 默认排除草稿，只返回已提交和已归档的周报
      where.status = { in: ['SUBMITTED', 'ARCHIVED'] };
    }

    if (productLine) {
      where.project = { productLine: productLine as string };
    }

    // 获取总数
    const total = await prisma.weeklyReport.count({ where });

    // 获取周报列表
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

/**
 * GET /api/weekly-reports/latest-status
 * 批量获取所有项目的最新周报进展状态
 */
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

/**
 * GET /api/weekly-reports/drafts
 * 获取所有草稿周报
 */
router.get('/drafts', authenticate, async (req: Request, res: Response): Promise<void> => {
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

/**
 * GET /api/weekly-reports/project/:projectId
 * 获取项目所有周报
 */
router.get('/project/:projectId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    // 检查项目是否存在
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    // 获取所有周报
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

/**
 * GET /api/weekly-reports/project/:projectId/latest
 * 获取项目最新周报
 */
router.get('/project/:projectId/latest', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    // 检查项目是否存在
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    // 获取最新周报
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

    res.json(report);
  } catch (error) {
    logger.error({ err: error }, '获取最新周报错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/weekly-reports/project/:projectId/previous
 * 获取指定项目、指定周次之前最近一份已提交的周报
 */
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

    // 查找 year+weekNumber 小于指定值的最近一份已提交/已归档周报
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

/**
 * GET /api/weekly-reports/:id
 * 获取单个周报
 */
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

/**
 * GET /api/weekly-reports/week/:year/:weekNumber
 * 获取指定周次的周报
 */
router.get('/week/:year/:weekNumber', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, weekNumber } = req.params;
    const { productLine } = req.query;

    const yearNum = parseInt(year);
    const weekNum = parseInt(weekNumber);

    // 构建筛选条件
    const where: any = {
      year: yearNum,
      weekNumber: weekNum,
    };

    // 产品线筛选在数据库层完成
    if (productLine) {
      where.project = { productLine: productLine as string };
    }

    // 获取周报
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

/**
 * POST /api/weekly-reports
 * 创建周报（自动计算year和weekNumber）
 * 权限：weekly_report:create
 */
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

      // 验证必填字段
      if (!projectId || !weekStart || !weekEnd) {
        res.status(400).json({ error: '项目ID、周开始日期和周结束日期不能为空' });
        return;
      }

      // 检查项目是否存在
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        res.status(400).json({ error: '项目不存在' });
        return;
      }

      // 归档项目检查
      if (project.status === 'ARCHIVED') {
        res.status(403).json({ error: '归档项目不可修改' });
        return;
      }

      // 归属检查：管理员、项目经理或协作者可以创建该项目的周报
      if (!canManageProject(req, project.managerId, projectId)) {
        res.status(403).json({ error: '只能为自己负责的项目创建周报' });
        return;
      }

      // 自动计算年份和周数
      const weekStartDate = new Date(weekStart);
      const { year, weekNumber } = getWeekNumber(weekStartDate);

      // 创建周报
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

/**
 * PUT /api/weekly-reports/:id
 * 更新周报
 * 权限：weekly_report:update
 */
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

      // 检查周报是否存在
      const existingReport = await prisma.weeklyReport.findUnique({
        where: { id },
      });

      if (!existingReport) {
        res.status(404).json({ error: '周报不存在' });
        return;
      }

      // 归档项目检查
      const reportProj = await prisma.project.findUnique({
        where: { id: existingReport.projectId },
        select: { status: true },
      });
      if (reportProj?.status === 'ARCHIVED') {
        res.status(403).json({ error: '归档项目不可修改' });
        return;
      }

      // 归属检查：管理员、周报创建人、项目经理或协作者可以修改
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

      // 构建更新数据
      const updateData: any = {};

      if (weekStart !== undefined || weekEnd !== undefined) {
        const newWeekStart = weekStart ? new Date(weekStart) : existingReport.weekStart;
        const newWeekEnd = weekEnd ? new Date(weekEnd) : existingReport.weekEnd;

        // 重新计算年份和周数
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

      // 更新周报
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

/**
 * POST /api/weekly-reports/:id/submit
 * 提交周报
 * 权限：weekly_report:update
 */
router.post(
  '/:id/submit',
  authenticate,
  requirePermission('weekly_report', 'update'),
  async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // 检查周报是否存在
    const existingReport = await prisma.weeklyReport.findUnique({
      where: { id },
    });

    if (!existingReport) {
      res.status(404).json({ error: '周报不存在' });
      return;
    }

    // 归属检查：管理员、周报创建人、项目经理或协作者可以提交
    if (!isAdmin(req)) {
      const isCreator = existingReport.createdBy === req.user!.id;
      const reportProject = await prisma.project.findUnique({
        where: { id: existingReport.projectId },
        select: { managerId: true },
      });
      const isCollaborator = req.user!.collaboratingProjectIds?.includes(existingReport.projectId);
      const isManager = reportProject?.managerId === req.user!.id;
      if (!isCreator && !isManager && !isCollaborator) {
        res.status(403).json({ error: '只能提交自己创建的或自己负责项目的周报' });
        return;
      }
    }

    // 更新状态为已提交
    const report = await prisma.weeklyReport.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
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

    // Auto-create RiskItems from weekly report risks array
    try {
      const risks = existingReport.risks as any[] | null;
      if (risks && Array.isArray(risks)) {
        for (const risk of risks) {
          const title = risk.type || risk.description?.slice(0, 50);
          if (!title) continue;
          // Dedup by title
          const existing2 = await prisma.riskItem.findFirst({
            where: {
              projectId: existingReport.projectId,
              title,
              status: { in: ['OPEN', 'IN_PROGRESS'] },
            },
          });
          if (!existing2) {
            await prisma.riskItem.create({
              data: {
                projectId: existingReport.projectId,
                title,
                description: risk.description || null,
                severity: risk.severity || 'MEDIUM',
                source: 'weekly_report',
              },
            });
          }
        }
      }
    } catch (riskError) {
      logger.error({ err: riskError }, '周报提交同步风险项失败');
      // Non-blocking: don't fail the submit
    }

    res.json(report);
  } catch (error) {
    logger.error({ err: error }, '提交周报错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/weekly-reports/:id/archive
 * 归档周报
 * 权限：weekly_report:update
 */
router.post(
  '/:id/archive',
  authenticate,
  requirePermission('weekly_report', 'update'),
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

    // 归属检查：管理员、项目经理可以归档
    if (!isAdmin(req)) {
      const reportProject = await prisma.project.findUnique({
        where: { id: existingReport.projectId },
        select: { managerId: true },
      });
      const isManager = reportProject?.managerId === req.user!.id;
      if (!isManager) {
        res.status(403).json({ error: '只有管理员或项目经理可以归档周报' });
        return;
      }
    }

    const report = await prisma.weeklyReport.update({
      where: { id },
      data: { status: 'ARCHIVED' },
      include: {
        project: {
          select: { id: true, name: true, productLine: true, managerId: true },
        },
        creator: {
          select: { id: true, realName: true, username: true },
        },
      },
    });

    res.json(report);
  } catch (error) {
    logger.error({ err: error }, '归档周报错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * DELETE /api/weekly-reports/:id
 * 删除周报
 * 权限：weekly_report:delete
 */

router.delete(
  '/:id',
  authenticate,
  requirePermission('weekly_report', 'delete'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // 检查周报是否存在
      const existingReport = await prisma.weeklyReport.findUnique({
        where: { id },
      });

      if (!existingReport) {
        res.status(404).json({ error: '周报不存在' });
        return;
      }

      // 归属检查：管理员、周报创建人、项目经理或协作者可以删除
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

      // 删除周报
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

/**
 * GET /api/weekly-reports/project/:projectId/risk-prefill
 * 从风险评估生成预填充的风险预警内容
 */
router.get('/project/:projectId/risk-prefill', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    // Get latest risk assessment
    const latestAssessment = await prisma.riskAssessment.findFirst({
      where: { projectId },
      orderBy: { assessedAt: 'desc' },
    });

    // Get open risk items
    const openRiskItems = await prisma.riskItem.findMany({
      where: { projectId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      orderBy: { severity: 'asc' },
      take: 10,
    });

    let riskWarning = '';
    const risks: Array<{ type: string; description: string; status: string }> = [];

    // Build from assessment insights
    if (latestAssessment?.aiInsights) {
      riskWarning += `<p>${latestAssessment.aiInsights}</p>`;
    }

    // Build from risk factors
    if (latestAssessment?.riskFactors) {
      const factors = latestAssessment.riskFactors as any[];
      if (factors.length > 0) {
        riskWarning += '<ul>';
        for (const f of factors) {
          if (f.severity !== 'LOW') {
            riskWarning += `<li><strong>[${f.severity}]</strong> ${f.factor}：${f.description}</li>`;
            risks.push({
              type: f.factor,
              description: f.description,
              status: 'OPEN',
            });
          }
        }
        riskWarning += '</ul>';
      }
    }

    // Add open risk items
    if (openRiskItems.length > 0) {
      riskWarning += '<p>待处理风险项：</p><ul>';
      for (const item of openRiskItems) {
        riskWarning += `<li>[${item.severity}] ${item.title}${item.description ? '：' + item.description : ''}</li>`;
      }
      riskWarning += '</ul>';
    }

    res.json({ riskWarning, risks });
  } catch (error) {
    logger.error({ err: error }, '获取风险预填充错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/weekly-reports/project/:projectId/ai-suggestions
 * AI智能建议
 */
router.post('/project/:projectId/ai-suggestions', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { weekStart, weekEnd } = req.body;

    if (!weekStart || !weekEnd) {
      res.status(400).json({ error: '周开始日期和周结束日期不能为空' });
      return;
    }

    // 检查项目是否存在
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekEnd);
    const now = new Date();

    // 获取活动数据
    const allActivities = await prisma.activity.findMany({
      where: { projectId },
      include: {
        executors: {
          include: {
            user: { select: { realName: true } },
          },
        },
        role: { select: { id: true, name: true } },
      },
    });

    // 本周已完成的活动
    const completedThisWeek = allActivities.filter(
      (a) =>
        a.endDate &&
        a.endDate >= weekStartDate &&
        a.endDate <= weekEndDate &&
        a.status === ActivityStatus.COMPLETED
    );

    // 进行中的活动
    const inProgressActivities = allActivities.filter((a) => a.status === ActivityStatus.IN_PROGRESS);

    // 未开始的活动
    const notStartedActivities = allActivities.filter((a) => a.status === ActivityStatus.NOT_STARTED);

    // 逾期未完成的活动
    const overdueActivities = allActivities.filter(
      (a) =>
        a.planEndDate &&
        a.planEndDate < now &&
        a.status !== ActivityStatus.COMPLETED &&
        a.status !== ActivityStatus.CANCELLED
    );

    let keyProgress = '';
    let nextWeekPlan = '';
    let riskWarning = '';

    // Fetch risk context for AI suggestions
    let riskContextStr = '';
    try {
      const latestAssessment = await prisma.riskAssessment.findFirst({
        where: { projectId },
        orderBy: { assessedAt: 'desc' },
        select: { riskLevel: true, aiInsights: true, riskFactors: true },
      });
      const openRiskItems = await prisma.riskItem.findMany({
        where: { projectId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        select: { title: true, severity: true, status: true },
        take: 5,
      });
      if (latestAssessment) {
        riskContextStr += `\n\n最新风险评估等级: ${latestAssessment.riskLevel}`;
        if (latestAssessment.aiInsights) riskContextStr += `\nAI风险洞察: ${latestAssessment.aiInsights}`;
      }
      if (openRiskItems.length > 0) {
        riskContextStr += `\n待处理风险项: ${openRiskItems.map(r => `[${r.severity}]${r.title}`).join('; ')}`;
      }
    } catch { /* risk context optional */ }

    // 尝试 AI 生成
    const getAssigneeNames = (a: any) =>
      a.executors?.length > 0
        ? a.executors.map((e: any) => e.user.realName).join(', ')
        : '未分配';
    try {
      const analysisData = {
        completedThisWeek: completedThisWeek.map((a) => ({
          name: a.name,
          assignee: getAssigneeNames(a),
        })),
        inProgress: inProgressActivities.map((a) => ({
          name: a.name,
          assignee: getAssigneeNames(a),
        })),
        notStarted: notStartedActivities.map((a) => ({
          name: a.name,
          assignee: getAssigneeNames(a),
        })),
        overdue: overdueActivities.map((a) => ({
          name: a.name,
          assignee: getAssigneeNames(a),
        })),
      };

      const aiResult = await callAi({
        feature: 'weekly_report',
        projectId,
        systemPrompt:
          '你是一个项目管理助手。请根据提供的活动数据和风险信息，生成周报内容。返回JSON格式：{"keyProgress": "本周重要进展HTML", "nextWeekPlan": "下周工作计划HTML", "riskWarning": "风险预警HTML"}。使用<ul><li>标签组织内容。风险预警部分应结合风险评估数据生成更准确的内容。',
        userPrompt: `请为以下项目生成周报建议：\n${JSON.stringify(analysisData, null, 2)}${riskContextStr}`,
      });

      if (aiResult?.content) {
        // 提取 JSON（AI 有时在 JSON 外包裹 ```json ... ```）
        let jsonStr = aiResult.content;
        const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenced) jsonStr = fenced[1];
        const parsed = JSON.parse(jsonStr.trim());
        keyProgress = parsed.keyProgress || '';
        nextWeekPlan = parsed.nextWeekPlan || '';
        riskWarning = parsed.riskWarning || '';
      }
    } catch (aiError) {
      logger.error({ err: aiError }, 'AI生成失败，回退到规则引擎');
    }

    // 如果AI未生成内容，使用规则引擎
    if (!keyProgress && !nextWeekPlan && !riskWarning) {
      // 生成本周重要进展
      if (completedThisWeek.length > 0) {
        keyProgress = '<ul>';
        completedThisWeek.forEach((activity) => {
          const assignee = getAssigneeNames(activity);
          keyProgress += `<li><strong>${activity.name}</strong>已完成（负责人：${assignee}）</li>`;
        });
        if (inProgressActivities.length > 0) {
          const top3 = inProgressActivities.slice(0, 3);
          top3.forEach((activity) => {
            const assignee = getAssigneeNames(activity);
            keyProgress += `<li>正在推进<strong>${activity.name}</strong>（负责人：${assignee}）</li>`;
          });
        }
        keyProgress += '</ul>';
      } else {
        keyProgress = '<p>本周暂无重大进展</p>';
      }

      // 生成下周工作计划
      const planActivities = [...inProgressActivities, ...notStartedActivities].slice(0, 5);
      if (planActivities.length > 0) {
        nextWeekPlan = '<ul>';
        planActivities.forEach((activity) => {
          const assignee = getAssigneeNames(activity);
          const action = activity.status === ActivityStatus.IN_PROGRESS ? '继续推进' : '计划启动';
          nextWeekPlan += `<li>${action}<strong>${activity.name}</strong>（负责人：${assignee}）</li>`;
        });
        nextWeekPlan += '</ul>';
      } else {
        nextWeekPlan = '<p>暂无计划任务</p>';
      }

      // 生成风险预警
      if (overdueActivities.length > 0) {
        riskWarning = '<ul>';
        riskWarning += `<li><span style="color: #ff4d4f;">⚠️ 存在${overdueActivities.length}个逾期任务</span>：`;
        const overdueNames = overdueActivities.slice(0, 3).map((a) => a.name);
        riskWarning += overdueNames.join('、');
        if (overdueActivities.length > 3) {
          riskWarning += `等`;
        }
        riskWarning += '</li>';
        riskWarning += '</ul>';
      } else {
        riskWarning = '';
      }
    }

    res.json({
      keyProgress,
      nextWeekPlan,
      riskWarning,
    });
  } catch (error) {
    logger.error({ err: error }, '生成AI建议错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
