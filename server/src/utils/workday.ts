/**
 * 工作日计算工具
 * 计算两个日期之间的工作日数量，排除周末和中国法定节假日，包含调休补班日
 *
 * 数据来源：
 * - 主源：数据库 `holidays` 表（支持后台管理与按年生成）
 * - 备源：内置 2025/2026 国务院公告数据（DB 未初始化或测试场景下兜底）
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FALLBACK_HOLIDAYS: Set<string> = new Set([
  // 2025
  '2025-01-01',
  '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
  '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
  '2025-04-04', '2025-04-05', '2025-04-06',
  '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
  '2025-05-31', '2025-06-01', '2025-06-02',
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04',
  '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
  // 2026
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
]);

const FALLBACK_WORKDAY_OVERRIDES: Set<string> = new Set([
  '2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11',
  '2026-02-14', '2026-02-28', '2026-04-26', '2026-06-28', '2026-09-27', '2026-10-10',
]);

let holidayCache: Set<string> = new Set(FALLBACK_HOLIDAYS);
let workdayOverrideCache: Set<string> = new Set(FALLBACK_WORKDAY_OVERRIDES);
let cacheLoaded = false;

function dateToISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 从数据库加载节假日并刷新内存缓存。
 * 服务启动时调用一次；管理员变更节假日数据后再次调用以失效缓存。
 */
export async function refreshHolidayCache(): Promise<void> {
  try {
    const rows = await prisma.holiday.findMany();
    if (rows.length === 0) {
      // 表为空时退回内置兜底（避免上线初期排期全乱）
      holidayCache = new Set(FALLBACK_HOLIDAYS);
      workdayOverrideCache = new Set(FALLBACK_WORKDAY_OVERRIDES);
    } else {
      const h = new Set<string>();
      const w = new Set<string>();
      for (const r of rows) {
        const iso = dateToISO(r.date);
        if (r.type === 'MAKEUP') w.add(iso);
        else h.add(iso);
      }
      holidayCache = h;
      workdayOverrideCache = w;
    }
    cacheLoaded = true;
  } catch {
    // 数据库查询失败时保持现有缓存（首次启动则为内置兜底）
  }
}

export function isCacheLoaded(): boolean {
  return cacheLoaded;
}

/**
 * 判断某天是否为工作日（考虑中国法定节假日和调休）
 */
export function isWorkday(date: Date): boolean {
  const dateStr = dateToISO(date);
  const dayOfWeek = date.getDay();

  if (workdayOverrideCache.has(dateStr)) return true;
  if (holidayCache.has(dateStr)) return false;
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  return true;
}

/**
 * 从基准日期偏移指定工作日数
 */
export function offsetWorkdays(baseDate: Date, offsetDays: number): Date {
  const result = new Date(baseDate);

  if (offsetDays === 0) {
    while (!isWorkday(result)) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  const direction = offsetDays > 0 ? 1 : -1;
  let remaining = Math.abs(offsetDays);

  while (remaining > 0) {
    result.setDate(result.getDate() + direction);
    if (isWorkday(result)) {
      remaining--;
    }
  }

  return result;
}

/**
 * 计算两个日期之间的工作日数（排除周末和中国法定节假日，包含调休补班日）
 */
export function calculateWorkdays(startDate: Date, endDate: Date): number {
  if (startDate > endDate) {
    return 0;
  }

  let workdays = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    if (isWorkday(current)) {
      workdays++;
    }
    current.setDate(current.getDate() + 1);
  }

  return workdays;
}
