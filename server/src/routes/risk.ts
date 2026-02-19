import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { assessProjectRisk } from '../utils/riskEngine';
import { callAi } from '../utils/aiClient';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/risk/project/:projectId
 * 获取评估历史（最近10条）
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

    // 获取最近10条评估记录
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
 * POST /api/risk/project/:projectId/assess
 * 发起风险评估
 * 支持AI API调用（如配置了AI_API_KEY和AI_API_URL）
 * 回退到内置规则引擎
 */
router.post('/project/:projectId/assess', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    // 检查项目是否存在
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        activities: true,
      },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    let riskLevel: string;
    let riskFactors: any[];
    let suggestions: string[];

    // 准备分析数据
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

    // 保存评估结果
    const assessment = await prisma.riskAssessment.create({
      data: {
        projectId,
        riskLevel,
        riskFactors,
        suggestions,
      },
    });

    res.json(assessment);
  } catch (error) {
    console.error('风险评估错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
