/**
 * 定时任务调度器
 * - 每日风险评估（工作日 8:00）
 * - 阈值预警检查（工作日 9:00）
 */

import cron from 'node-cron';
import { PrismaClient, ActivityStatus } from '@prisma/client';
import { assessProjectRisk } from './riskEngine';
import { callAi } from './aiClient';
import { buildRiskContext, trimContextForAI } from './riskContext';
import { buildRiskSystemPrompt, buildRiskUserPrompt, parseAIResponse, validateRiskLevel } from './riskPrompts';

const prisma = new PrismaClient();

const LEVEL_ORDER: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

/**
 * 启动所有定时任务
 */
export function startScheduledJobs(): void {
  const enabled = process.env.RISK_SCHEDULER_ENABLED === 'true';
  if (!enabled) {
    console.log('[Scheduler] 定时风险评估未启用（RISK_SCHEDULER_ENABLED !== true）');
    return;
  }

  const riskCron = process.env.RISK_SCHEDULER_CRON || '0 8 * * 1-5';
  const alertCron = process.env.RISK_ALERT_CRON || '0 9 * * 1-5';

  // Daily risk assessment
  cron.schedule(riskCron, async () => {
    console.log('[Scheduler] 开始每日风险评估...');
    await runDailyRiskAssessment();
    console.log('[Scheduler] 每日风险评估完成');
  });

  // Threshold alert check
  cron.schedule(alertCron, async () => {
    console.log('[Scheduler] 开始阈值预警检查...');
    await runThresholdAlerts();
    console.log('[Scheduler] 阈值预警检查完成');
  });

  console.log(`[Scheduler] 已启动定时任务 - 风险评估: ${riskCron}, 预警检查: ${alertCron}`);
}

/**
 * 每日风险评估：遍历所有进行中项目
 */
async function runDailyRiskAssessment(): Promise<void> {
  const projects = await prisma.project.findMany({
    where: { status: 'IN_PROGRESS' },
    select: { id: true, name: true, managerId: true },
  });

  // Serial execution for SQLite compatibility
  for (const project of projects) {
    try {
      await assessSingleProject(project.id, project.name, project.managerId);
    } catch (error) {
      console.error(`[Scheduler] 项目 ${project.name} 评估失败:`, error);
    }
  }
}

/**
 * 对单个项目执行评估
 */
async function assessSingleProject(projectId: string, projectName: string, managerId: string): Promise<void> {
  // Get previous assessment for comparison
  const previousAssessment = await prisma.riskAssessment.findFirst({
    where: { projectId },
    orderBy: { assessedAt: 'desc' },
    select: { riskLevel: true },
  });

  let riskLevel: string;
  let riskFactors: any[];
  let suggestions: string[];
  let source: string;
  let aiInsights: string | null = null;
  let aiEnhancedData: any = null;

  try {
    const context = await buildRiskContext(projectId);
    const trimmed = trimContextForAI(context);

    const aiResult = await callAi({
      feature: 'risk',
      projectId,
      systemPrompt: buildRiskSystemPrompt(),
      userPrompt: buildRiskUserPrompt(trimmed),
      temperature: 0.3,
    });

    if (aiResult?.content) {
      const parsed = parseAIResponse(aiResult.content);
      riskLevel = validateRiskLevel(parsed.riskLevel);
      riskFactors = Array.isArray(parsed.riskFactors) ? parsed.riskFactors : context.ruleEngineMetrics.factors;
      suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
      source = 'scheduled_ai';
      aiInsights = parsed.aiInsights || null;
      aiEnhancedData = {
        trendPrediction: parsed.trendPrediction || null,
        criticalPathAnalysis: parsed.criticalPathAnalysis || null,
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        resourceBottlenecks: Array.isArray(parsed.resourceBottlenecks) ? parsed.resourceBottlenecks : [],
      };
    } else {
      throw new Error('AI 未配置或返回为空');
    }
  } catch {
    // Fallback to rule engine
    const result = await assessProjectRisk(projectId);
    riskLevel = result.riskLevel;
    riskFactors = result.riskFactors;
    suggestions = result.suggestions;
    source = 'scheduled_rule';
  }

  // Save assessment
  await prisma.riskAssessment.create({
    data: { projectId, riskLevel, riskFactors, suggestions, source, aiInsights, aiEnhancedData },
  });

  // Check for risk escalation
  if (previousAssessment) {
    const prevLevel = LEVEL_ORDER[previousAssessment.riskLevel] || 0;
    const curLevel = LEVEL_ORDER[riskLevel] || 0;

    if (curLevel > prevLevel) {
      // Create RISK_ESCALATION notification for project manager
      await createNotificationIfNotDuplicate({
        userId: managerId,
        type: 'RISK_ESCALATION',
        title: `项目「${projectName}」风险升级`,
        content: `风险等级从 ${previousAssessment.riskLevel} 升至 ${riskLevel}`,
        relatedId: projectId,
      });
    }
  }
}

/**
 * 阈值预警检查
 */
async function runThresholdAlerts(): Promise<void> {
  const now = new Date();
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Find overdue activities (> 7 days)
  const overdueActivities = await prisma.activity.findMany({
    where: {
      planEndDate: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      status: { in: [ActivityStatus.NOT_STARTED, ActivityStatus.IN_PROGRESS] },
    },
    include: {
      assignees: { select: { id: true, realName: true } },
      project: { select: { id: true, name: true } },
    },
  });

  for (const activity of overdueActivities) {
    const overdueDays = Math.ceil((now.getTime() - activity.planEndDate!.getTime()) / (1000 * 60 * 60 * 24));
    for (const assignee of activity.assignees) {
      await createNotificationIfNotDuplicate({
        userId: assignee.id,
        type: 'RISK_ALERT',
        title: `活动「${activity.name}」逾期 ${overdueDays} 天`,
        content: `项目「${activity.project.name}」中的活动已逾期超过 7 天，请尽快处理`,
        relatedId: activity.project.id,
      });
    }
  }

  // Find activities due in 3 days but not IN_PROGRESS
  const upcomingActivities = await prisma.activity.findMany({
    where: {
      planEndDate: { gte: now, lte: threeDaysLater },
      status: ActivityStatus.NOT_STARTED,
    },
    include: {
      assignees: { select: { id: true, realName: true } },
      project: { select: { id: true, name: true } },
    },
  });

  for (const activity of upcomingActivities) {
    for (const assignee of activity.assignees) {
      await createNotificationIfNotDuplicate({
        userId: assignee.id,
        type: 'RISK_ALERT',
        title: `活动「${activity.name}」即将到期`,
        content: `项目「${activity.project.name}」中的活动将在 3 天内到期，但尚未开始`,
        relatedId: activity.project.id,
      });
    }
  }
}

/**
 * 创建通知（24 小时去重）
 */
async function createNotificationIfNotDuplicate(data: {
  userId: string;
  type: string;
  title: string;
  content: string;
  relatedId?: string;
}): Promise<void> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const existing = await prisma.notification.findFirst({
    where: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      createdAt: { gte: oneDayAgo },
    },
  });

  if (!existing) {
    await prisma.notification.create({ data });
  }
}
