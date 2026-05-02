import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requireFeatureFlag } from '../middleware/featureFlag';
import { isAdmin } from '../middleware/permission';
import { validate } from '../middleware/validate';
import { logger } from '../utils/logger';
import { refreshHolidayCache } from '../utils/workday';
import { getHolidaysForYear, isYearKnown, KNOWN_YEARS } from '../utils/holidayData';
import {
  createHolidaySchema,
  updateHolidaySchema,
  generateHolidaySchema,
} from '../schemas/holidays';
import { FEATURE_FLAGS } from '../utils/featureFlags';

const router = express.Router();
const prisma = new PrismaClient();

router.use(requireFeatureFlag(FEATURE_FLAGS.HOLIDAY_MANAGEMENT));

function parseISODate(s: string): Date {
  // 强制 UTC 归零，避免时区导致跨日
  return new Date(`${s}T00:00:00.000Z`);
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * GET /api/holidays
 * 列出所有节假日（可按 year 过滤）
 * 任意已认证用户可读，便于前端日期组件高亮节假日
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const yearParam = req.query.year ? Number(req.query.year) : undefined;
    const where = yearParam && Number.isFinite(yearParam) ? { year: yearParam } : {};
    const list = await prisma.holiday.findMany({
      where,
      orderBy: { date: 'asc' },
    });
    res.json(
      list.map((h) => ({
        ...h,
        date: formatDate(h.date),
      }))
    );
  } catch (error) {
    logger.error({ err: error }, '获取节假日列表错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/holidays/known-years
 * 返回内置已收录的年份列表（用于前端"生成"按钮提示哪些年份是完整数据）
 */
router.get('/known-years', authenticate, async (_req: Request, res: Response): Promise<void> => {
  res.json({ knownYears: KNOWN_YEARS });
});

/**
 * POST /api/holidays
 * 新增单条节假日（管理员）
 */
router.post(
  '/',
  authenticate,
  validate({ body: createHolidaySchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAdmin(req)) {
        res.status(403).json({ error: '只有管理员可以管理节假日' });
        return;
      }

      const { date, name, type } = req.body;
      const d = parseISODate(date);
      const year = d.getUTCFullYear();

      try {
        const created = await prisma.holiday.create({
          data: { date: d, name, type, year, source: 'manual' },
        });
        await refreshHolidayCache();
        res.status(201).json({ ...created, date: formatDate(created.date) });
      } catch (e: unknown) {
        if (typeof e === 'object' && e && 'code' in e && (e as { code?: string }).code === 'P2002') {
          res.status(409).json({ error: '该日期已存在节假日记录' });
          return;
        }
        throw e;
      }
    } catch (error) {
      logger.error({ err: error }, '创建节假日错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * PUT /api/holidays/:id
 * 修改节假日（管理员）
 */
router.put(
  '/:id',
  authenticate,
  validate({ body: updateHolidaySchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAdmin(req)) {
        res.status(403).json({ error: '只有管理员可以管理节假日' });
        return;
      }

      const { id } = req.params;
      const data: Record<string, unknown> = {};
      if (req.body.date) {
        const d = parseISODate(req.body.date);
        data.date = d;
        data.year = d.getUTCFullYear();
      }
      if (req.body.name !== undefined) data.name = req.body.name;
      if (req.body.type !== undefined) data.type = req.body.type;

      const updated = await prisma.holiday.update({
        where: { id },
        data,
      });
      await refreshHolidayCache();
      res.json({ ...updated, date: formatDate(updated.date) });
    } catch (error) {
      logger.error({ err: error }, '更新节假日错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * DELETE /api/holidays/:id
 * 删除节假日（管理员）
 */
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: '只有管理员可以管理节假日' });
      return;
    }

    const { id } = req.params;
    await prisma.holiday.delete({ where: { id } });
    await refreshHolidayCache();
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, '删除节假日错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * DELETE /api/holidays/year/:year
 * 清空指定年份的全部节假日（管理员）
 */
router.delete('/year/:year', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: '只有管理员可以管理节假日' });
      return;
    }
    const year = Number(req.params.year);
    if (!Number.isFinite(year)) {
      res.status(400).json({ error: '年份非法' });
      return;
    }
    const result = await prisma.holiday.deleteMany({ where: { year } });
    await refreshHolidayCache();
    res.json({ success: true, deleted: result.count });
  } catch (error) {
    logger.error({ err: error }, '清空年份节假日错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/holidays/generate
 * 按年生成节假日（管理员）
 * Body: { year: number, replaceExisting?: boolean }
 * - replaceExisting=true（默认）：先清空当年数据，再批量插入
 * - replaceExisting=false：仅插入不存在的日期，已存在的跳过
 */
router.post(
  '/generate',
  authenticate,
  validate({ body: generateHolidaySchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAdmin(req)) {
        res.status(403).json({ error: '只有管理员可以管理节假日' });
        return;
      }

      const { year, replaceExisting } = req.body;
      const entries = getHolidaysForYear(year);

      if (entries.length === 0) {
        res.status(400).json({ error: `${year} 年暂无可生成的节假日数据` });
        return;
      }

      let inserted = 0;
      let skipped = 0;
      let deleted = 0;

      await prisma.$transaction(async (tx) => {
        if (replaceExisting) {
          const del = await tx.holiday.deleteMany({ where: { year } });
          deleted = del.count;
        }

        for (const e of entries) {
          const date = parseISODate(e.date);
          try {
            await tx.holiday.create({
              data: {
                date,
                name: e.name,
                type: e.type,
                year,
                source: 'generated',
              },
            });
            inserted++;
          } catch (err: unknown) {
            if (typeof err === 'object' && err && 'code' in err && (err as { code?: string }).code === 'P2002') {
              skipped++;
            } else {
              throw err;
            }
          }
        }
      });

      await refreshHolidayCache();

      res.json({
        success: true,
        year,
        known: isYearKnown(year),
        inserted,
        skipped,
        deleted,
        message: isYearKnown(year)
          ? `已生成 ${year} 年完整节假日数据（含调休）`
          : `${year} 年暂未收录国务院公告，已仅生成固定日期节假日，请手动补录春节/清明/端午/中秋等农历相关日期`,
      });
    } catch (error) {
      logger.error({ err: error }, '生成节假日错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
