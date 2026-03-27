import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requirePermission, sanitizePagination } from '../middleware/permission';
import { logger } from '../utils/logger';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/audit-logs
 * 获取审计日志列表（分页、筛选）
 * 权限: audit_log:read
 */
router.get(
  '/',
  authenticate,
  requirePermission('system', 'audit_log'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        page = '1',
        pageSize = '20',
        userId,
        action,
        resourceType,
        startDate,
        endDate,
        keyword,
      } = req.query;

      const { pageNum, pageSizeNum } = sanitizePagination(page, pageSize);
      const skip = (pageNum - 1) * pageSizeNum;

      const where: any = {};

      if (userId) {
        where.userId = userId as string;
      }

      if (action) {
        where.action = action as string;
      }

      if (resourceType) {
        where.resourceType = resourceType as string;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(startDate as string);
        }
        if (endDate) {
          // Include the entire end date
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        }
      }

      if (keyword) {
        where.OR = [
          { userName: { contains: keyword as string } },
          { resourceName: { contains: keyword as string } },
        ];
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          skip,
          take: pageSizeNum,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.json({
        data: logs,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
      });
    } catch (error) {
      logger.error({ err: error }, '获取审计日志错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * GET /api/audit-logs/users
 * 获取有日志记录的用户列表（用于筛选下拉）
 * 权限: audit_log:read
 */
router.get(
  '/users',
  authenticate,
  requirePermission('system', 'audit_log'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const users = await prisma.auditLog.findMany({
        select: {
          userId: true,
          userName: true,
        },
        distinct: ['userId'],
        orderBy: { userName: 'asc' },
      });

      res.json(users);
    } catch (error) {
      logger.error({ err: error }, '获取审计用户列表错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
