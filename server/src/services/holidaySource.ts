import { z } from 'zod';
import { logger } from '../utils/logger';

const HOLIDAY_CN_SOURCES = [
  'https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/{year}.json',
  'https://gcore.jsdelivr.net/gh/NateScarlet/holiday-cn@master/{year}.json',
  'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/{year}.json',
];

const TIMEOUT_MS = 8000;

const HolidayCnDay = z.object({
  name: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isOffDay: z.boolean(),
});

const HolidayCnYearData = z.object({
  year: z.number().int(),
  papers: z.array(z.string().url()),
  days: z.array(HolidayCnDay),
});

export type HolidayCnData = z.infer<typeof HolidayCnYearData>;

export interface SourceCheckResult {
  available: boolean;
  source?: string;
  papers?: string[];
  daysCount?: number;
  error?: string;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOfficialHolidays(year: number): Promise<HolidayCnData> {
  const errors: string[] = [];

  for (const template of HOLIDAY_CN_SOURCES) {
    const url = template.replace('{year}', String(year));
    try {
      logger.info({ url, year }, '尝试获取 holiday-cn 数据');
      const resp = await fetchWithTimeout(url, TIMEOUT_MS);

      if (!resp.ok) {
        errors.push(`${url} → HTTP ${resp.status}`);
        continue;
      }

      const raw = await resp.json();
      const parsed = HolidayCnYearData.safeParse(raw);

      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        errors.push(`${url} → 数据校验失败: ${issues}`);
        continue;
      }

      if (parsed.data.year !== year) {
        errors.push(`${url} → 返回年份 ${parsed.data.year} 与请求年份 ${year} 不匹配`);
        continue;
      }

      logger.info({ year, daysCount: parsed.data.days.length, papers: parsed.data.papers }, '成功获取 holiday-cn 数据');
      return parsed.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${url} → ${msg}`);
    }
  }

  const detail = errors.join('\n  ');
  logger.warn({ year, errors }, '所有 holiday-cn 数据源均失败');
  throw new Error(`所有 holiday-cn 数据源均不可用 (year=${year}):\n  ${detail}`);
}

export async function checkOfficialDataAvailable(year: number): Promise<SourceCheckResult> {
  try {
    const data = await fetchOfficialHolidays(year);
    return {
      available: true,
      source: HOLIDAY_CN_SOURCES[0].replace('{year}', String(year)),
      papers: data.papers,
      daysCount: data.days.length,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      error: msg,
    };
  }
}
