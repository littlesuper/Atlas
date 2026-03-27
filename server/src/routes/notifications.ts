import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { sanitizePagination, isAdmin } from '../middleware/permission';
import { logger } from '../utils/logger';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/notifications
 * 获取当前用户通知列表（分页 + 未读数）
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { page, pageSize } = req.query;
    const { pageNum, pageSizeNum } = sanitizePagination(page, pageSize);
    const skip = (pageNum - 1) * pageSizeNum;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSizeNum,
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    res.json({ data: notifications, total, page: pageNum, pageSize: pageSizeNum, unreadCount });
  } catch (error) {
    logger.error({ err: error }, '获取通知列表错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * PUT /api/notifications/:id/read
 * 标记通知已读
 */
router.put('/:id/read', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== req.user!.id) {
      res.status(404).json({ error: '通知不存在' });
      return;
    }
    await prisma.notification.update({ where: { id }, data: { isRead: true } });
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, '标记通知已读错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * PUT /api/notifications/read-all
 * 全部标记已读
 */
router.put('/read-all', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, '全部标记已读错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * DELETE /api/notifications/:id
 * 删除通知
 */
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== req.user!.id) {
      res.status(404).json({ error: '通知不存在' });
      return;
    }
    await prisma.notification.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, '删除通知错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/notifications/generate
 * 按需扫描生成通知（活动到期3天内、里程碑临近7天内、周五未提交周报）
 * 24h内去重
 */
router.post('/generate', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: '只有管理员可以触发通知生成' });
      return;
    }
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let generatedCount = 0;

    // 1. 活动到期3天内提醒
    const dueSoonActivities = await prisma.activity.findMany({
      where: {
        planEndDate: { gte: now, lte: threeDaysFromNow },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      include: {
        assignees: { select: { id: true } },
        project: { select: { name: true } },
      },
    });

    for (const a of dueSoonActivities) {
      for (const u of a.assignees) {
        // 24h 内去重
        const existing = await prisma.notification.findFirst({
          where: {
            userId: u.id,
            type: 'ACTIVITY_DUE',
            relatedId: a.id,
            createdAt: { gte: oneDayAgo },
          },
        });
        if (!existing) {
          await prisma.notification.create({
            data: {
              userId: u.id,
              type: 'ACTIVITY_DUE',
              title: '活动即将到期',
              content: `项目「${a.project.name}」中的活动「${a.name}」将在3天内到期`,
              relatedId: a.id,
            },
          });
          generatedCount++;
        }
      }
    }

    // 2. 里程碑临近7天内提醒
    const milestones = await prisma.activity.findMany({
      where: {
        type: 'MILESTONE',
        planEndDate: { gte: now, lte: sevenDaysFromNow },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      include: {
        assignees: { select: { id: true } },
        project: { select: { name: true, managerId: true } },
      },
    });

    for (const m of milestones) {
      const targetUserIds = [...m.assignees.map(u => u.id), m.project.managerId];
      const uniqueUserIds = [...new Set(targetUserIds)];
      for (const uid of uniqueUserIds) {
        const existing = await prisma.notification.findFirst({
          where: {
            userId: uid,
            type: 'MILESTONE_APPROACHING',
            relatedId: m.id,
            createdAt: { gte: oneDayAgo },
          },
        });
        if (!existing) {
          await prisma.notification.create({
            data: {
              userId: uid,
              type: 'MILESTONE_APPROACHING',
              title: '里程碑即将到来',
              content: `项目「${m.project.name}」中的里程碑「${m.name}」将在7天内到达`,
              relatedId: m.id,
            },
          });
          generatedCount++;
        }
      }
    }

    // 3. 周五未提交周报提醒
    if (now.getDay() === 5) {
      const projects = await prisma.project.findMany({
        where: { status: 'IN_PROGRESS' },
        select: { id: true, name: true, managerId: true },
      });

      // 获取本周的年份和周数
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() + 1);

      for (const p of projects) {
        const report = await prisma.weeklyReport.findFirst({
          where: {
            projectId: p.id,
            weekStart: { gte: weekStart },
          },
        });
        if (!report) {
          const existing = await prisma.notification.findFirst({
            where: {
              userId: p.managerId,
              type: 'REPORT_REMINDER',
              relatedId: p.id,
              createdAt: { gte: oneDayAgo },
            },
          });
          if (!existing) {
            await prisma.notification.create({
              data: {
                userId: p.managerId,
                type: 'REPORT_REMINDER',
                title: '周报提醒',
                content: `项目「${p.name}」本周尚未提交周报`,
                relatedId: p.id,
              },
            });
            generatedCount++;
          }
        }
      }
    }

    res.json({ success: true, generatedCount });
  } catch (error) {
    logger.error({ err: error }, '生成通知错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
