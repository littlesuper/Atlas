import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createCheckItemSchema, batchCreateCheckItemSchema, updateCheckItemSchema, reorderCheckItemSchema } from '../schemas/checkItems';
import { logger } from '../utils/logger';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/check-items/activity/:activityId
 * 获取活动的检查项列表
 */
router.get('/activity/:activityId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const activityId = req.params.activityId as string;
    const items = await prisma.checkItem.findMany({
      where: { activityId },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(items);
  } catch (error) {
    logger.error({ err: error }, '获取检查项列表错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/check-items
 * 创建检查项
 */
router.post('/', authenticate, validate({ body: createCheckItemSchema }), async (req: Request, res: Response): Promise<void> => {
  try {
    const { activityId, title } = req.body;

    // 获取当前最大 sortOrder
    const maxSort = await prisma.checkItem.aggregate({
      where: { activityId },
      _max: { sortOrder: true },
    });

    const item = await prisma.checkItem.create({
      data: {
        activityId,
        title: title.trim(),
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
    res.status(201).json(item);
  } catch (error) {
    logger.error({ err: error }, '创建检查项错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/check-items/batch
 * 批量创建检查项
 */
router.post('/batch', authenticate, validate({ body: batchCreateCheckItemSchema }), async (req: Request, res: Response): Promise<void> => {
  try {
    const { activityId, items } = req.body;

    const maxSort = await prisma.checkItem.aggregate({
      where: { activityId },
      _max: { sortOrder: true },
    });
    let nextOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const created = [];
    for (const item of items) {
      if (!item.title?.trim()) continue;
      const ci = await prisma.checkItem.create({
        data: {
          activityId,
          title: item.title.trim(),
          checked: item.checked ?? false,
          sortOrder: nextOrder++,
        },
      });
      created.push(ci);
    }

    res.status(201).json(created);
  } catch (error) {
    logger.error({ err: error }, '批量创建检查项错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * PUT /api/check-items/:id
 * 更新检查项（修改标题、切换勾选状态）
 */
router.put('/:id', authenticate, validate({ body: updateCheckItemSchema }), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { title, checked } = req.body;

    const data: any = {};
    if (title !== undefined) data.title = title.trim();
    if (checked !== undefined) data.checked = checked;

    const item = await prisma.checkItem.update({
      where: { id },
      data,
    });
    res.json(item);
  } catch (error: any) {
    if (error.code === 'P2025') {
      res.status(404).json({ error: '检查项不存在' });
      return;
    }
    logger.error({ err: error }, '更新检查项错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * DELETE /api/check-items/:id
 * 删除检查项
 */
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await prisma.checkItem.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
      res.status(404).json({ error: '检查项不存在' });
      return;
    }
    logger.error({ err: error }, '删除检查项错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * PUT /api/check-items/activity/:activityId/reorder
 * 重新排序检查项
 */
router.put('/activity/:activityId/reorder', authenticate, validate({ body: reorderCheckItemSchema }), async (req: Request, res: Response): Promise<void> => {
  try {
    const { items } = req.body;

    await prisma.$transaction(
      items.map((item: { id: string; sortOrder: number }) =>
        prisma.checkItem.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    );

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, '重排检查项错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
