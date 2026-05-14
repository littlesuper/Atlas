import express, { Request, Response } from 'express';
import { HolidaySource } from '../generated/prisma/client';
import { authenticate } from '../middleware/auth';
import { isAdmin } from '../middleware/permission';
import { validate } from '../middleware/validate';
import { logger } from '../utils/logger';
import { auditLog } from '../utils/auditLog';
import { refreshHolidayCache } from '../utils/workday';
import { getHolidaysForYear, isYearKnown, KNOWN_YEARS } from '../utils/holidayData';
import { fetchOfficialHolidays, HolidayCnData } from '../services/holidaySource';
import prisma from '../db';
import {
  createHolidaySchema,
  updateHolidaySchema,
  generateHolidaySchema,
} from '../schemas/holidays';

const router = express.Router();
function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function parseISODate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function convertHolidayCnToEntries(data: HolidayCnData): Array<{
  date: string;
  name: string;
  type: 'HOLIDAY' | 'MAKEUP';
}> {
  return data.days.map((d) => ({
    date: d.date,
    name: d.name,
    type: d.isOffDay ? 'HOLIDAY' as const : 'MAKEUP' as const,
  }));
}

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

router.get('/known-years', authenticate, async (_req: Request, res: Response): Promise<void> => {
  res.json({ knownYears: KNOWN_YEARS });
});

router.get('/source-status', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = Number(req.query.year);
    if (!Number.isFinite(year)) {
      res.status(400).json({ error: '年份参数非法' });
      return;
    }

    const existing = await prisma.holiday.count({ where: { year } });
    let officialAvailable = false;
    let officialPapers: string[] = [];
    let officialDaysCount = 0;
    let officialError: string | undefined;

    try {
      const data = await fetchOfficialHolidays(year);
      officialAvailable = true;
      officialPapers = data.papers;
      officialDaysCount = data.days.length;
    } catch (err: unknown) {
      officialError = err instanceof Error ? err.message : String(err);
    }

    const builtInAvailable = isYearKnown(year);

    res.json({
      year,
      existing,
      officialAvailable,
      officialPapers,
      officialDaysCount,
      officialError,
      builtInAvailable,
    });
  } catch (error) {
    logger.error({ err: error }, '获取节假日数据源状态错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

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
          data: { date: d, name, type, year, source: HolidaySource.MANUAL_INPUT },
        });
        await refreshHolidayCache();
        auditLog({ req, action: 'CREATE', resourceType: 'holiday', resourceId: created.id, resourceName: `${name} (${date})` });
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

      const id = routeParam(req.params.id);
      const existing = await prisma.holiday.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: '节假日不存在' });
        return;
      }

      const data: Record<string, unknown> = {};
      if (req.body.date) {
        const d = parseISODate(req.body.date);
        data.date = d;
        data.year = d.getUTCFullYear();
      }
      if (req.body.name !== undefined) data.name = req.body.name;
      if (req.body.type !== undefined) data.type = req.body.type;
      data.source = HolidaySource.MANUAL_INPUT;

      const updated = await prisma.holiday.update({
        where: { id },
        data,
      });
      await refreshHolidayCache();
      auditLog({
        req,
        action: 'UPDATE',
        resourceType: 'holiday',
        resourceId: id,
        resourceName: `${updated.name} (${formatDate(updated.date)})`,
        changes: {
          ...(req.body.date && { date: { from: formatDate(existing.date), to: req.body.date } }),
          ...(req.body.name !== undefined && { name: { from: existing.name, to: req.body.name } }),
          ...(req.body.type !== undefined && { type: { from: existing.type, to: req.body.type } }),
        },
      });
      res.json({ ...updated, date: formatDate(updated.date) });
    } catch (error) {
      logger.error({ err: error }, '更新节假日错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: '只有管理员可以管理节假日' });
      return;
    }

      const id = routeParam(req.params.id);
    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: '节假日不存在' });
      return;
    }
    const label = `${existing.name} (${formatDate(existing.date)})`;
    await prisma.holiday.delete({ where: { id } });
    await refreshHolidayCache();
    auditLog({ req, action: 'DELETE', resourceType: 'holiday', resourceId: id, resourceName: label });
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, '删除节假日错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

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
    auditLog({ req, action: 'HOLIDAY_CLEAR_YEAR', resourceType: 'holiday', resourceName: `${year} 年`, changes: { deletedCount: { from: null, to: result.count } } });
    res.json({ success: true, deleted: result.count });
  } catch (error) {
    logger.error({ err: error }, '清空年份节假日错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

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

      const { year, preferOfficial, overwrite } = req.body;

      const existing = await prisma.holiday.count({ where: { year } });
      if (existing > 0 && !overwrite) {
        res.status(409).json({
          error: `${year} 年已有 ${existing} 条节假日数据，确认覆盖请传 overwrite: true`,
          existing,
        });
        return;
      }

      let source: 'OFFICIAL_API' | 'BUILT_IN' = 'BUILT_IN';
      let sourceUrl: string | undefined;
      let warning: string | undefined;
      let entries: Array<{ date: string; name: string; type: 'HOLIDAY' | 'MAKEUP' }>;

      if (preferOfficial) {
        try {
          const data = await fetchOfficialHolidays(year);
          entries = convertHolidayCnToEntries(data);
          source = 'OFFICIAL_API';
          sourceUrl = data.papers[0];
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          warning = `官方数据源获取失败，已回退到系统内置数据: ${msg}`;
          logger.warn({ year, err: msg }, '官方数据源失败，回退内置');
          entries = getHolidaysForYear(year).map((e) => ({
            date: e.date,
            name: e.name,
            type: e.type,
          }));
          source = 'BUILT_IN';
        }
      } else {
        entries = getHolidaysForYear(year).map((e) => ({
          date: e.date,
          name: e.name,
          type: e.type,
        }));
        source = 'BUILT_IN';
      }

      if (entries.length === 0) {
        res.status(400).json({ error: `${year} 年暂无可生成的节假日数据` });
        return;
      }

      let inserted = 0;
      let deleted = 0;

      await prisma.$transaction(async (tx) => {
        if (overwrite) {
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
                source: source === 'OFFICIAL_API' ? HolidaySource.OFFICIAL_API : HolidaySource.BUILT_IN,
                sourceUrl: sourceUrl ?? null,
                syncedAt: source === 'OFFICIAL_API' ? new Date() : null,
              },
            });
            inserted++;
          } catch (err: unknown) {
            if (typeof err === 'object' && err && 'code' in err && (err as { code?: string }).code === 'P2002') {
              // duplicate date, skip
            } else {
              throw err;
            }
          }
        }
      });

      await refreshHolidayCache();

      auditLog({
        req,
        action: 'HOLIDAY_GENERATE',
        resourceType: 'holiday',
        resourceName: `${year} 年`,
        changes: {
          source: { from: null, to: source },
          count: { from: null, to: inserted },
          ...(sourceUrl ? { paper: { from: null, to: sourceUrl } } : {}),
          ...(deleted > 0 ? { overwritten: { from: null, to: deleted } } : {}),
        },
      });

      const message = source === 'OFFICIAL_API'
        ? `已从官方源生成 ${year} 年 ${inserted} 条节假日数据`
        : isYearKnown(year)
          ? `已使用系统内置数据生成 ${year} 年 ${inserted} 条节假日数据`
          : `${year} 年暂未收录完整数据，已生成 ${inserted} 条固定日期节假日，农历相关日期需手动补录`;

      res.json({
        success: true,
        source,
        count: inserted,
        sourceUrl,
        warning,
        year,
        deleted,
        message,
      });
    } catch (error) {
      logger.error({ err: error }, '生成节假日错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
