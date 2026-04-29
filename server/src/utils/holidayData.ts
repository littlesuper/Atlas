/**
 * 中国法定节假日基础数据（依据国务院办公厅每年公告）
 *
 * 已收录年份：2025、2026
 * 未收录年份会通过 fallback 算法仅生成固定日期节假日（元旦/劳动节/国庆）+ 周末，
 * 春节/清明/端午/中秋等农历相关节假日需管理员手动补录。
 */

export type HolidayKind = 'HOLIDAY' | 'MAKEUP';

export interface HolidayEntry {
  date: string; // YYYY-MM-DD
  name: string;
  type: HolidayKind;
}

const HOLIDAY_DATA: Record<number, HolidayEntry[]> = {
  2025: [
    { date: '2025-01-01', name: '元旦', type: 'HOLIDAY' },
    { date: '2025-01-26', name: '春节调休补班', type: 'MAKEUP' },
    { date: '2025-01-28', name: '春节', type: 'HOLIDAY' },
    { date: '2025-01-29', name: '春节', type: 'HOLIDAY' },
    { date: '2025-01-30', name: '春节', type: 'HOLIDAY' },
    { date: '2025-01-31', name: '春节', type: 'HOLIDAY' },
    { date: '2025-02-01', name: '春节', type: 'HOLIDAY' },
    { date: '2025-02-02', name: '春节', type: 'HOLIDAY' },
    { date: '2025-02-03', name: '春节', type: 'HOLIDAY' },
    { date: '2025-02-04', name: '春节', type: 'HOLIDAY' },
    { date: '2025-02-08', name: '春节调休补班', type: 'MAKEUP' },
    { date: '2025-04-04', name: '清明节', type: 'HOLIDAY' },
    { date: '2025-04-05', name: '清明节', type: 'HOLIDAY' },
    { date: '2025-04-06', name: '清明节', type: 'HOLIDAY' },
    { date: '2025-04-27', name: '劳动节调休补班', type: 'MAKEUP' },
    { date: '2025-05-01', name: '劳动节', type: 'HOLIDAY' },
    { date: '2025-05-02', name: '劳动节', type: 'HOLIDAY' },
    { date: '2025-05-03', name: '劳动节', type: 'HOLIDAY' },
    { date: '2025-05-04', name: '劳动节', type: 'HOLIDAY' },
    { date: '2025-05-05', name: '劳动节', type: 'HOLIDAY' },
    { date: '2025-05-31', name: '端午节', type: 'HOLIDAY' },
    { date: '2025-06-01', name: '端午节', type: 'HOLIDAY' },
    { date: '2025-06-02', name: '端午节', type: 'HOLIDAY' },
    { date: '2025-09-28', name: '国庆调休补班', type: 'MAKEUP' },
    { date: '2025-10-01', name: '国庆节', type: 'HOLIDAY' },
    { date: '2025-10-02', name: '国庆节', type: 'HOLIDAY' },
    { date: '2025-10-03', name: '国庆节', type: 'HOLIDAY' },
    { date: '2025-10-04', name: '国庆节', type: 'HOLIDAY' },
    { date: '2025-10-05', name: '国庆节', type: 'HOLIDAY' },
    { date: '2025-10-06', name: '国庆节', type: 'HOLIDAY' },
    { date: '2025-10-07', name: '国庆节', type: 'HOLIDAY' },
    { date: '2025-10-08', name: '国庆节', type: 'HOLIDAY' },
    { date: '2025-10-11', name: '国庆调休补班', type: 'MAKEUP' },
  ],
  2026: [
    { date: '2026-01-01', name: '元旦', type: 'HOLIDAY' },
    { date: '2026-01-02', name: '元旦', type: 'HOLIDAY' },
    { date: '2026-01-03', name: '元旦', type: 'HOLIDAY' },
    { date: '2026-02-14', name: '春节调休补班', type: 'MAKEUP' },
    { date: '2026-02-16', name: '春节', type: 'HOLIDAY' },
    { date: '2026-02-17', name: '春节', type: 'HOLIDAY' },
    { date: '2026-02-18', name: '春节', type: 'HOLIDAY' },
    { date: '2026-02-19', name: '春节', type: 'HOLIDAY' },
    { date: '2026-02-20', name: '春节', type: 'HOLIDAY' },
    { date: '2026-02-21', name: '春节', type: 'HOLIDAY' },
    { date: '2026-02-22', name: '春节', type: 'HOLIDAY' },
    { date: '2026-02-28', name: '春节调休补班', type: 'MAKEUP' },
    { date: '2026-04-04', name: '清明节', type: 'HOLIDAY' },
    { date: '2026-04-05', name: '清明节', type: 'HOLIDAY' },
    { date: '2026-04-06', name: '清明节', type: 'HOLIDAY' },
    { date: '2026-04-26', name: '劳动节调休补班', type: 'MAKEUP' },
    { date: '2026-05-01', name: '劳动节', type: 'HOLIDAY' },
    { date: '2026-05-02', name: '劳动节', type: 'HOLIDAY' },
    { date: '2026-05-03', name: '劳动节', type: 'HOLIDAY' },
    { date: '2026-05-04', name: '劳动节', type: 'HOLIDAY' },
    { date: '2026-05-05', name: '劳动节', type: 'HOLIDAY' },
    { date: '2026-06-19', name: '端午节', type: 'HOLIDAY' },
    { date: '2026-06-20', name: '端午节', type: 'HOLIDAY' },
    { date: '2026-06-21', name: '端午节', type: 'HOLIDAY' },
    { date: '2026-06-28', name: '端午调休补班', type: 'MAKEUP' },
    { date: '2026-09-25', name: '中秋节', type: 'HOLIDAY' },
    { date: '2026-09-26', name: '中秋节', type: 'HOLIDAY' },
    { date: '2026-09-27', name: '中秋节', type: 'HOLIDAY' },
    { date: '2026-10-01', name: '国庆节', type: 'HOLIDAY' },
    { date: '2026-10-02', name: '国庆节', type: 'HOLIDAY' },
    { date: '2026-10-03', name: '国庆节', type: 'HOLIDAY' },
    { date: '2026-10-04', name: '国庆节', type: 'HOLIDAY' },
    { date: '2026-10-05', name: '国庆节', type: 'HOLIDAY' },
    { date: '2026-10-06', name: '国庆节', type: 'HOLIDAY' },
    { date: '2026-10-07', name: '国庆节', type: 'HOLIDAY' },
    { date: '2026-10-08', name: '国庆节', type: 'HOLIDAY' },
    { date: '2026-10-10', name: '国庆调休补班', type: 'MAKEUP' },
  ],
};

/**
 * 获取指定年份的节假日数据。
 * 已收录年份返回完整数据；未收录年份返回固定日期节假日（元旦/劳动节/国庆），
 * 春节/清明/端午/中秋需管理员手动补录。
 */
export function getHolidaysForYear(year: number): HolidayEntry[] {
  if (HOLIDAY_DATA[year]) {
    return HOLIDAY_DATA[year];
  }

  // Fallback：仅固定日期
  const fallback: HolidayEntry[] = [
    { date: `${year}-01-01`, name: '元旦', type: 'HOLIDAY' },
    { date: `${year}-05-01`, name: '劳动节', type: 'HOLIDAY' },
    { date: `${year}-10-01`, name: '国庆节', type: 'HOLIDAY' },
    { date: `${year}-10-02`, name: '国庆节', type: 'HOLIDAY' },
    { date: `${year}-10-03`, name: '国庆节', type: 'HOLIDAY' },
  ];
  return fallback;
}

export function isYearKnown(year: number): boolean {
  return Boolean(HOLIDAY_DATA[year]);
}

export const KNOWN_YEARS = Object.keys(HOLIDAY_DATA).map((y) => Number(y)).sort();
