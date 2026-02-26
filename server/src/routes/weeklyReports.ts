import express, { Request, Response } from 'express';
import { PrismaClient, ActivityStatus } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requirePermission, isAdmin, canManageProject, sanitizePagination } from '../middleware/permission';
import { getWeekNumber } from '../utils/weekNumber';
import { callAi } from '../utils/aiClient';
import { sanitizeRichText } from '../utils/sanitize';

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
    console.error('获取周报列表错误:', error);
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
    console.error('获取最新周报状态错误:', error);
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
    console.error('获取项目周报错误:', error);
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
    console.error('获取最新周报错误:', error);
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
    console.error('获取周报详情错误:', error);
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
    console.error('获取指定周次周报错误:', error);
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
        keyProgress,
        nextWeekPlan,
        riskWarning,
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
          keyProgress: sanitizeRichText(keyProgress),
          nextWeekPlan: sanitizeRichText(nextWeekPlan),
          riskWarning: sanitizeRichText(riskWarning),
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
      console.error('创建周报错误:', error);
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
        keyProgress,
        nextWeekPlan,
        riskWarning,
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

      if (keyProgress !== undefined) updateData.keyProgress = sanitizeRichText(keyProgress);
      if (nextWeekPlan !== undefined) updateData.nextWeekPlan = sanitizeRichText(nextWeekPlan);
      if (riskWarning !== undefined) updateData.riskWarning = sanitizeRichText(riskWarning);
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
      console.error('更新周报错误:', error);
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

    res.json(report);
  } catch (error) {
    console.error('提交周报错误:', error);
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
    console.error('归档周报错误:', error);
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
      console.error('删除周报错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

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
        assignees: {
          select: {
            realName: true,
          },
        },
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

    // 尝试 AI 生成
    try {
      const analysisData = {
        completedThisWeek: completedThisWeek.map((a) => ({
          name: a.name,
          assignee: (a as any).assignees?.map((u: any) => u.realName).join(', ') || '未分配',
        })),
        inProgress: inProgressActivities.map((a) => ({
          name: a.name,
          assignee: (a as any).assignees?.map((u: any) => u.realName).join(', ') || '未分配',
        })),
        notStarted: notStartedActivities.map((a) => ({
          name: a.name,
          assignee: (a as any).assignees?.map((u: any) => u.realName).join(', ') || '未分配',
        })),
        overdue: overdueActivities.map((a) => ({
          name: a.name,
          assignee: (a as any).assignees?.map((u: any) => u.realName).join(', ') || '未分配',
        })),
      };

      const aiResult = await callAi({
        feature: 'weekly_report',
        projectId,
        systemPrompt:
          '你是一个项目管理助手。请根据提供的活动数据，生成周报内容。返回JSON格式：{"keyProgress": "本周重要进展HTML", "nextWeekPlan": "下周工作计划HTML", "riskWarning": "风险预警HTML"}。使用<ul><li>标签组织内容。',
        userPrompt: `请为以下项目生成周报建议：\n${JSON.stringify(analysisData, null, 2)}`,
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
      console.error('AI生成失败，回退到规则引擎:', aiError);
    }

    // 如果AI未生成内容，使用规则引擎
    if (!keyProgress && !nextWeekPlan && !riskWarning) {
      // 生成本周重要进展
      if (completedThisWeek.length > 0) {
        keyProgress = '<ul>';
        completedThisWeek.forEach((activity) => {
          const assignee = (activity as any).assignees?.map((u: any) => u.realName).join(', ') || '未分配';
          keyProgress += `<li><strong>${activity.name}</strong>已完成（负责人：${assignee}）</li>`;
        });
        if (inProgressActivities.length > 0) {
          const top3 = inProgressActivities.slice(0, 3);
          top3.forEach((activity) => {
            const assignee = (activity as any).assignees?.map((u: any) => u.realName).join(', ') || '未分配';
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
          const assignee = (activity as any).assignees?.map((u: any) => u.realName).join(', ') || '未分配';
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
    console.error('生成AI建议错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
