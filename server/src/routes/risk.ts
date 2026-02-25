import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requirePermission, sanitizePagination } from '../middleware/permission';
import { assessProjectRisk } from '../utils/riskEngine';
import { callAi } from '../utils/aiClient';

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
    console.error('获取风险概览错误:', error);
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
    console.error('获取评估历史错误:', error);
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
    console.error('删除评估记录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/risk/project/:projectId/assess
 * 发起风险评估
 */
router.post('/project/:projectId/assess', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { activities: true },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    let riskLevel: string;
    let riskFactors: any[];
    let suggestions: string[];

    const analysisData = {
      project: {
        name: project.name,
        progress: project.progress,
        startDate: project.startDate,
        endDate: project.endDate,
        status: project.status,
      },
      activities: project.activities.map((a) => ({
        name: a.name,
        status: a.status,
        planStartDate: a.planStartDate,
        planEndDate: a.planEndDate,
        startDate: a.startDate,
        endDate: a.endDate,
      })),
    };

    try {
      const aiResult = await callAi({
        feature: 'risk',
        projectId,
        systemPrompt:
          '你是一个项目管理专家。请分析以下项目数据，评估风险等级，识别风险因素，并提供改进建议。返回JSON格式：{"riskLevel": "LOW|MEDIUM|HIGH|CRITICAL", "riskFactors": [{"factor": "因素名称", "severity": "LOW|MEDIUM|HIGH", "description": "描述"}], "suggestions": ["建议1", "建议2"]}',
        userPrompt: `请评估以下项目的风险：\n${JSON.stringify(analysisData, null, 2)}`,
      });

      if (aiResult?.content) {
        const parsed = JSON.parse(aiResult.content);
        riskLevel = parsed.riskLevel;
        riskFactors = parsed.riskFactors;
        suggestions = parsed.suggestions;
      } else {
        throw new Error('AI 未配置或返回为空');
      }
    } catch (aiError) {
      console.error('AI评估失败，回退到规则引擎:', aiError);
      const result = await assessProjectRisk(projectId);
      riskLevel = result.riskLevel;
      riskFactors = result.riskFactors;
      suggestions = result.suggestions;
    }

    const assessment = await prisma.riskAssessment.create({
      data: { projectId, riskLevel, riskFactors, suggestions },
    });

    res.json(assessment);
  } catch (error) {
    console.error('风险评估错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
