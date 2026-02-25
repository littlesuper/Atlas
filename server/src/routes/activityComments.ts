import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { sanitizePagination } from '../middleware/permission';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/activity-comments/activity/:activityId
 * 获取活动评论列表（分页）
 */
router.get('/activity/:activityId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const activityId = req.params.activityId as string;
    const { page, pageSize } = req.query;
    const { pageNum, pageSizeNum } = sanitizePagination(page, pageSize);
    const skip = (pageNum - 1) * pageSizeNum;

    const [comments, total] = await Promise.all([
      prisma.activityComment.findMany({
        where: { activityId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSizeNum,
        include: {
          user: { select: { id: true, realName: true, username: true } },
        },
      }),
      prisma.activityComment.count({ where: { activityId } }),
    ]);

    res.json({ data: comments, total, page: pageNum, pageSize: pageSizeNum });
  } catch (error) {
    console.error('获取评论列表错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/activity-comments
 * 创建评论
 */
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { activityId, content } = req.body as { activityId: string; content: string };
    if (!activityId || !content?.trim()) {
      res.status(400).json({ error: '活动ID和评论内容不能为空' });
      return;
    }

    const activity = await prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity) {
      res.status(404).json({ error: '活动不存在' });
      return;
    }

    const comment = await prisma.activityComment.create({
      data: {
        activityId,
        userId: req.user!.id,
        content: content.trim(),
      },
      include: {
        user: { select: { id: true, realName: true, username: true } },
      },
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error('创建评论错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * DELETE /api/activity-comments/:id
 * 删除评论（本人或管理员）
 */
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const comment = await prisma.activityComment.findUnique({ where: { id } });
    if (!comment) {
      res.status(404).json({ error: '评论不存在' });
      return;
    }

    // 只有本人或管理员可以删除
    const isAdmin = (req.user as any)?.permissions?.includes('user:delete');
    if (comment.userId !== req.user!.id && !isAdmin) {
      res.status(403).json({ error: '只能删除自己的评论' });
      return;
    }

    await prisma.activityComment.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('删除评论错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
