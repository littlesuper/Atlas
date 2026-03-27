import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { sanitizePagination } from '../middleware/permission';
import { validate } from '../middleware/validate';
import { createRiskItemSchema, updateRiskItemSchema, riskItemCommentSchema } from '../schemas/riskItems';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/risk-items
 * 风险项列表（分页、筛选）
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, status, page = '1', pageSize = '20' } = req.query;
    const { pageNum, pageSizeNum } = sanitizePagination(page, pageSize);
    const skip = (pageNum - 1) * pageSizeNum;

    const where: any = {};
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.riskItem.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: pageSizeNum,
        include: {
          owner: { select: { id: true, realName: true } },
        },
      }),
      prisma.riskItem.count({ where }),
    ]);

    res.json({ data: items, total, page: pageNum, pageSize: pageSizeNum });
  } catch (error) {
    console.error('获取风险项列表错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/risk-items
 * 创建风险项
 */
router.post('/', authenticate, validate({ body: createRiskItemSchema }), async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, assessmentId, title, description, severity, ownerId, dueDate, source } = req.body;

    if (!projectId || !title || !severity) {
      res.status(400).json({ error: '项目ID、标题和严重度不能为空' });
      return;
    }

    const item = await prisma.riskItem.create({
      data: {
        projectId,
        assessmentId: assessmentId || null,
        title,
        description: description || null,
        severity,
        ownerId: ownerId || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        source: source || 'manual',
      },
      include: {
        owner: { select: { id: true, realName: true } },
      },
    });

    // Create CREATED log
    await prisma.riskItemLog.create({
      data: {
        riskItemId: item.id,
        action: 'CREATED',
        content: `创建风险项「${title}」，严重度: ${severity}`,
        userId: req.user!.id,
      },
    });

    res.status(201).json(item);
  } catch (error) {
    console.error('创建风险项错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/risk-items/:id
 * 风险项详情（含 logs）
 */
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const item = await prisma.riskItem.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, realName: true } },
        logs: {
          orderBy: { createdAt: 'desc' as const },
        },
      },
    });

    if (!item) {
      res.status(404).json({ error: '风险项不存在' });
      return;
    }

    // Fetch user info for logs
    const itemAny = item as any;
    const logs = (itemAny.logs || []) as any[];
    const userIds: string[] = [...new Set(logs.map((l) => l.userId as string))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, realName: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    const logsWithUser = logs.map((l) => ({
      ...l,
      user: userMap.get(l.userId) || { id: l.userId, realName: '未知用户' },
    }));

    res.json({ ...item, logs: logsWithUser });
  } catch (error) {
    console.error('获取风险项详情错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * PUT /api/risk-items/:id
 * 更新风险项（状态变更自动写 log）
 */
router.put('/:id', authenticate, validate({ body: updateRiskItemSchema }), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, severity, status, ownerId, dueDate } = req.body;

    const existing = await prisma.riskItem.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: '风险项不存在' });
      return;
    }

    const updateData: any = {};
    const logs: Array<{ action: string; content: string }> = [];

    if (title !== undefined && title !== existing.title) {
      updateData.title = title;
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (severity !== undefined && severity !== existing.severity) {
      updateData.severity = severity;
      logs.push({
        action: 'SEVERITY_CHANGED',
        content: `严重度从 ${existing.severity} 变更为 ${severity}`,
      });
    }
    if (status !== undefined && status !== existing.status) {
      updateData.status = status;
      if (status === 'RESOLVED') {
        updateData.resolvedAt = new Date();
      }
      logs.push({
        action: 'STATUS_CHANGED',
        content: `状态从 ${existing.status} 变更为 ${status}`,
      });
    }
    if (ownerId !== undefined && ownerId !== existing.ownerId) {
      updateData.ownerId = ownerId || null;
      logs.push({
        action: 'ASSIGNED',
        content: ownerId ? `分配负责人` : `移除负责人`,
      });
    }
    if (dueDate !== undefined) {
      updateData.dueDate = dueDate ? new Date(dueDate) : null;
    }

    const item = await prisma.riskItem.update({
      where: { id },
      data: updateData,
      include: {
        owner: { select: { id: true, realName: true } },
      },
    });

    // Create logs
    for (const log of logs) {
      await prisma.riskItemLog.create({
        data: {
          riskItemId: id,
          action: log.action,
          content: log.content,
          userId: req.user!.id,
        },
      });
    }

    res.json(item);
  } catch (error) {
    console.error('更新风险项错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * DELETE /api/risk-items/:id
 * 删除风险项
 */
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.riskItem.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: '风险项不存在' });
      return;
    }
    await prisma.riskItem.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('删除风险项错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/risk-items/:id/comment
 * 添加评论
 */
router.post('/:id/comment', authenticate, validate({ body: riskItemCommentSchema }), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      res.status(400).json({ error: '评论内容不能为空' });
      return;
    }

    const existing = await prisma.riskItem.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: '风险项不存在' });
      return;
    }

    const log = await prisma.riskItemLog.create({
      data: {
        riskItemId: id,
        action: 'COMMENTED',
        content,
        userId: req.user!.id,
      },
    });

    // Fetch user info
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, realName: true },
    });

    res.status(201).json({ ...log, user });
  } catch (error) {
    console.error('添加评论错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/risk-items/from-assessment/:assessmentId
 * 从 AI 评估的 actionItems 批量创建风险项
 */
router.post('/from-assessment/:assessmentId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { assessmentId } = req.params;

    const assessment = await prisma.riskAssessment.findUnique({
      where: { id: assessmentId },
    });

    if (!assessment) {
      res.status(404).json({ error: '评估记录不存在' });
      return;
    }

    const enhanced = assessment.aiEnhancedData as any;
    if (!enhanced?.actionItems || !Array.isArray(enhanced.actionItems)) {
      res.status(400).json({ error: '该评估无可导入的行动项' });
      return;
    }

    // Map priority to severity
    const priorityToSeverity: Record<string, string> = {
      HIGH: 'HIGH',
      MEDIUM: 'MEDIUM',
      LOW: 'LOW',
    };

    const created = [];
    for (const item of enhanced.actionItems) {
      // Dedup by title
      const existing = await prisma.riskItem.findFirst({
        where: {
          projectId: assessment.projectId,
          title: item.action,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
      });

      if (!existing) {
        const riskItem = await prisma.riskItem.create({
          data: {
            projectId: assessment.projectId,
            assessmentId,
            title: item.action,
            severity: priorityToSeverity[item.priority] || 'MEDIUM',
            source: 'ai',
          },
        });

        await prisma.riskItemLog.create({
          data: {
            riskItemId: riskItem.id,
            action: 'CREATED',
            content: `从 AI 评估自动创建`,
            userId: req.user!.id,
          },
        });

        created.push(riskItem);
      }
    }

    res.status(201).json({ created: created.length, items: created });
  } catch (error) {
    console.error('从评估创建风险项错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
