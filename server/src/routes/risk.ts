import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requireFeatureFlag } from '../middleware/featureFlag';
import { requirePermission, sanitizePagination } from '../middleware/permission';
import { assessProjectRisk } from '../utils/riskEngine';
import { callAi } from '../utils/aiClient';
import { buildRiskContext, trimContextForAI } from '../utils/riskContext';
import { buildRiskSystemPrompt, buildRiskUserPrompt, parseAIResponse, validateRiskLevel } from '../utils/riskPrompts';
import { logger } from '../utils/logger';
import { FEATURE_FLAGS, isFeatureEnabled } from '../utils/featureFlags';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/risk/summary
 * 风险概览：每个项目的最新风险评估
 */
router.get('/summary', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const projects = await prisma.project.findMany({
      where: { status: 'IN_PROGRESS' },
      select: { id: true, name: true },
    });

    const summaries: Array<{ projectId: string; projectName: string; riskLevel: string; assessedAt: Date }> = [];

    for (const p of projects) {
      const latest = await prisma.riskAssessment.findFirst({
        where: { projectId: p.id },
        orderBy: { assessedAt: 'desc' },
        select: { riskLevel: true, assessedAt: true },
      });
      if (latest) {
        summaries.push({
          projectId: p.id,
          projectName: p.name,
          riskLevel: latest.riskLevel,
          assessedAt: latest.assessedAt,
        });
      }
    }

    res.json(summaries);
  } catch (error) {
    logger.error({ err: error }, '获取风险概览错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/risk/dashboard
 * 风险仪表盘：跨项目风险全景
 */
router.get('/dashboard', authenticate, requireFeatureFlag(FEATURE_FLAGS.RISK_DASHBOARD), async (req: Request, res: Response): Promise<void> => {
  try {
    const projects = await prisma.project.findMany({
      where: { status: 'IN_PROGRESS' },
      select: { id: true, name: true, productLine: true },
    });

    const riskDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    const projectRisks: Array<{
      projectId: string;
      projectName: string;
      productLine: string | null;
      riskLevel: string;
      assessedAt: string;
      source: string;
      aiInsights: string | null;
      trendDirection: string;
    }> = [];
    const topActionItems: Array<{ projectId: string; projectName: string; action: string; priority: string }> = [];

    for (const p of projects) {
      const assessments = await prisma.riskAssessment.findMany({
        where: { projectId: p.id },
        orderBy: { assessedAt: 'desc' },
        take: 2,
      });

      if (assessments.length === 0) continue;

      const latest = assessments[0];
      const level = latest.riskLevel as keyof typeof riskDistribution;
      if (level in riskDistribution) riskDistribution[level]++;

      // Trend direction
      let trendDirection = 'STABLE';
      if (assessments.length >= 2) {
        const levelOrder: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
        const cur = levelOrder[latest.riskLevel] || 2;
        const prev = levelOrder[assessments[1].riskLevel] || 2;
        if (cur > prev) trendDirection = 'WORSENING';
        else if (cur < prev) trendDirection = 'IMPROVING';
      }

      projectRisks.push({
        projectId: p.id,
        projectName: p.name,
        productLine: p.productLine,
        riskLevel: latest.riskLevel,
        assessedAt: latest.assessedAt.toISOString(),
        source: latest.source,
        aiInsights: latest.aiInsights,
        trendDirection,
      });

      // Collect action items from AI enhanced data
      if (latest.aiEnhancedData) {
        const enhanced = latest.aiEnhancedData as any;
        if (Array.isArray(enhanced.actionItems)) {
          for (const item of enhanced.actionItems.slice(0, 3)) {
            topActionItems.push({
              projectId: p.id,
              projectName: p.name,
              action: item.action,
              priority: item.priority || 'MEDIUM',
            });
          }
        }
      }
    }

    // Sort action items by priority
    const priorityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    topActionItems.sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));

    res.json({
      projects: projectRisks,
      riskDistribution,
      topActionItems: topActionItems.slice(0, 10),
    });
  } catch (error) {
    logger.error({ err: error }, '获取风险仪表盘错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/risk/dashboard/insights
 * 跨项目 AI 洞察
 */
router.get('/dashboard/insights', authenticate, requireFeatureFlag(FEATURE_FLAGS.RISK_DASHBOARD), async (req: Request, res: Response): Promise<void> => {
  try {
    const projects = await prisma.project.findMany({
      where: { status: 'IN_PROGRESS' },
      select: { id: true, name: true },
    });

    const improvements: string[] = [];
    const deteriorations: string[] = [];
    const topConcerns: string[] = [];

    for (const p of projects) {
      const assessments = await prisma.riskAssessment.findMany({
        where: { projectId: p.id },
        orderBy: { assessedAt: 'desc' },
        take: 2,
        select: { riskLevel: true, aiInsights: true },
      });

      if (assessments.length < 2) continue;

      const levelOrder: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
      const cur = levelOrder[assessments[0].riskLevel] || 2;
      const prev = levelOrder[assessments[1].riskLevel] || 2;

      if (cur < prev) improvements.push(`${p.name}：风险从${assessments[1].riskLevel}降至${assessments[0].riskLevel}`);
      if (cur > prev) deteriorations.push(`${p.name}：风险从${assessments[1].riskLevel}升至${assessments[0].riskLevel}`);

      if (cur >= 3) {
        topConcerns.push(`${p.name}当前风险等级为${assessments[0].riskLevel}${assessments[0].aiInsights ? '：' + assessments[0].aiInsights.slice(0, 80) : ''}`);
      }
    }

    // If no high-risk concerns, add general overview
    if (topConcerns.length === 0) {
      topConcerns.push('当前所有项目风险等级在可控范围内');
    }

    res.json({
      topConcerns: topConcerns.slice(0, 3),
      improvements,
      deteriorations,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, '获取风险洞察错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/risk/project/:projectId/comparison
 * 风险变化对比
 */
router.get('/project/:projectId/comparison', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const assessments = await prisma.riskAssessment.findMany({
      where: { projectId },
      orderBy: { assessedAt: 'desc' },
      take: 2,
    });

    if (assessments.length === 0) {
      res.json({ previous: null, current: null, changes: null });
      return;
    }

    const current = assessments[0];
    const previous = assessments.length >= 2 ? assessments[1] : null;

    const currentFactors = (current.riskFactors as any[]).map(f => f.factor);
    const previousFactors = previous ? (previous.riskFactors as any[]).map(f => f.factor) : [];

    const newRisks = currentFactors.filter(f => !previousFactors.includes(f));
    const resolvedRisks = previousFactors.filter(f => !currentFactors.includes(f));
    const persistingRisks = currentFactors.filter(f => previousFactors.includes(f));

    let levelChange = 'UNCHANGED';
    if (previous) {
      const levelOrder: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
      const cur = levelOrder[current.riskLevel] || 2;
      const prev = levelOrder[previous.riskLevel] || 2;
      if (cur < prev) levelChange = 'IMPROVED';
      else if (cur > prev) levelChange = 'WORSENED';
    }

    res.json({
      previous: previous ? {
        riskLevel: previous.riskLevel,
        assessedAt: previous.assessedAt.toISOString(),
        keyFactors: previousFactors,
      } : null,
      current: {
        riskLevel: current.riskLevel,
        assessedAt: current.assessedAt.toISOString(),
        keyFactors: currentFactors,
      },
      changes: {
        levelChange,
        newRisks,
        resolvedRisks,
        persistingRisks,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '获取风险对比错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/risk/project/:projectId
 * 获取评估历史（分页）
 */
router.get('/project/:projectId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { page, pageSize } = req.query;

    // 检查项目是否存在
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    // 分页模式
    if (page !== undefined || pageSize !== undefined) {
      const { pageNum, pageSizeNum } = sanitizePagination(page, pageSize);
      const skip = (pageNum - 1) * pageSizeNum;

      const [assessments, total] = await Promise.all([
        prisma.riskAssessment.findMany({
          where: { projectId },
          orderBy: { assessedAt: 'desc' },
          skip,
          take: pageSizeNum,
        }),
        prisma.riskAssessment.count({ where: { projectId } }),
      ]);

      res.json({ data: assessments, total, page: pageNum, pageSize: pageSizeNum });
      return;
    }

    // 向后兼容：不传分页参数时返回最近10条
    const assessments = await prisma.riskAssessment.findMany({
      where: { projectId },
      orderBy: { assessedAt: 'desc' },
      take: 10,
    });

    res.json(assessments);
  } catch (error) {
    logger.error({ err: error }, '获取评估历史错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * DELETE /api/risk/:id
 * 删除风险评估记录
 */
router.delete('/:id', authenticate, requirePermission('activity', 'delete'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const assessment = await prisma.riskAssessment.findUnique({ where: { id } });
    if (!assessment) {
      res.status(404).json({ error: '评估记录不存在' });
      return;
    }
    await prisma.riskAssessment.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, '删除评估记录错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/risk/project/:projectId/assess
 * 发起风险评估（增强版）
 */
router.post('/project/:projectId/assess', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    // Build full context
    const context = await buildRiskContext(projectId);
    const trimmedContext = trimContextForAI(context);

    let riskLevel: string;
    let riskFactors: any[];
    let suggestions: string[];
    let source: string = 'rule_engine';
    let aiInsights: string | null = null;
    let aiEnhancedData: any = null;

    try {
      if (!isFeatureEnabled(FEATURE_FLAGS.AI_ASSISTANCE, { userId: req.user?.id, remoteAddress: req.ip })) {
        throw new Error('AI assistance feature is disabled');
      }

      const aiResult = await callAi({
        feature: 'risk',
        projectId,
        systemPrompt: buildRiskSystemPrompt(),
        userPrompt: buildRiskUserPrompt(trimmedContext),
        temperature: 0.3,
      });

      if (aiResult?.content) {
        const parsed = parseAIResponse(aiResult.content);
        riskLevel = validateRiskLevel(parsed.riskLevel);
        riskFactors = Array.isArray(parsed.riskFactors) ? parsed.riskFactors : context.ruleEngineMetrics.factors;
        suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
        source = 'ai';
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
    } catch (aiError) {
      logger.error({ err: aiError }, 'AI评估失败，回退到规则引擎');
      // Use rule engine results from context (already computed)
      riskLevel = context.ruleEngineMetrics.riskLevel;
      riskFactors = context.ruleEngineMetrics.factors;
      suggestions = [];
      // Generate basic suggestions from rule engine
      const ruleResult = await assessProjectRisk(projectId);
      suggestions = ruleResult.suggestions;
      source = 'rule_engine';
    }

    const assessment = await prisma.riskAssessment.create({
      data: { projectId, riskLevel, riskFactors, suggestions, source, aiInsights, aiEnhancedData },
    });

    res.json(assessment);
  } catch (error) {
    logger.error({ err: error }, '风险评估错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
