import express, { Request, Response } from 'express';
import { ActivityStatus } from '../../generated/prisma/client';
import { authenticate } from '../../middleware/auth';
import { requirePermission, isAdmin } from '../../middleware/permission';
import { callAi } from '../../utils/aiClient';
import { logger } from '../../utils/logger';
import prisma from '../../db';
import { isWeeklyReportRisk, isRiskFactor, type ActivityWithExecutors } from './shared';

const router = express.Router();

router.post(
  '/:id/submit',
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

    try {
      const risks = existingReport.risks;
      if (Array.isArray(risks)) {
        for (const risk of risks.filter(isWeeklyReportRisk)) {
          const title = risk.type || risk.description?.slice(0, 50);
          if (!title) continue;
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
    }

    res.json(report);
  } catch (error) {
    logger.error({ err: error }, '提交周报错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

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

router.get('/project/:projectId/risk-prefill', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const latestAssessment = await prisma.riskAssessment.findFirst({
      where: { projectId },
      orderBy: { assessedAt: 'desc' },
    });

    const openRiskItems = await prisma.riskItem.findMany({
      where: { projectId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      orderBy: { severity: 'asc' },
      take: 10,
    });

    let riskWarning = '';
    const risks: Array<{ type: string; description: string; status: string }> = [];

    if (latestAssessment?.aiInsights) {
      riskWarning += `<p>${latestAssessment.aiInsights}</p>`;
    }

    if (latestAssessment?.riskFactors) {
      const factors = Array.isArray(latestAssessment.riskFactors)
        ? latestAssessment.riskFactors.filter(isRiskFactor)
        : [];
      if (factors.length > 0) {
        riskWarning += '<ul>';
        for (const f of factors) {
          if (f.severity !== 'LOW') {
            riskWarning += `<li><strong>[${f.severity}]</strong> ${f.factor}：${f.description}</li>`;
            risks.push({
              type: f.factor || '风险因素',
              description: f.description || '',
              status: 'OPEN',
            });
          }
        }
        riskWarning += '</ul>';
      }
    }

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

router.post('/project/:projectId/ai-suggestions', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { weekStart, weekEnd } = req.body;

    if (!weekStart || !weekEnd) {
      res.status(400).json({ error: '周开始日期和周结束日期不能为空' });
      return;
    }

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

    const completedThisWeek = allActivities.filter(
      (a) =>
        a.endDate &&
        a.endDate >= weekStartDate &&
        a.endDate <= weekEndDate &&
        a.status === ActivityStatus.COMPLETED
    );

    const inProgressActivities = allActivities.filter((a) => a.status === ActivityStatus.IN_PROGRESS);

    const notStartedActivities = allActivities.filter((a) => a.status === ActivityStatus.NOT_STARTED);

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

    const getAssigneeNames = (a: ActivityWithExecutors) => {
      const executors = a.executors || [];
      return executors.length > 0
        ? executors.map((e) => e.user.realName).join(', ')
        : '未分配';
    };
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

    if (!keyProgress && !nextWeekPlan && !riskWarning) {
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
