/**
 * 周数计算工具
 * 用于计算日期所在的年份和周数，以及指定周的开始和结束日期
 */

/**
 * 获取日期所在的年份和周数
 * 使用ISO 8601标准：周一为一周的第一天，第一周包含1月4日
 *
 * @param date 日期
 * @returns { year: number, weekNumber: number }
 */
export function getWeekNumber(date: Date): { year: number; weekNumber: number } {
  const targetDate = new Date(date.valueOf());

  // 设置为当天的正午，避免夏令时问题
  targetDate.setHours(12, 0, 0, 0);

  // 获取周四的日期（ISO周的关键日期）
  const dayNum = (targetDate.getDay() + 6) % 7; // 周一=0, 周日=6
  targetDate.setDate(targetDate.getDate() - dayNum + 3); // 移到本周周四

  // 获取年份
  const year = targetDate.getFullYear();

  // 获取1月1日
  const jan1 = new Date(year, 0, 1);
  jan1.setHours(12, 0, 0, 0);

  // 计算周数
  const weekNumber = Math.ceil((((targetDate.getTime() - jan1.getTime()) / 86400000) + 1) / 7);

  return { year, weekNumber };
}

/**
 * 获取指定周的开始日期（周一）和结束日期（周日）
 *
 * @param year 年份
 * @param weekNumber 周数
 * @returns { weekStart: Date, weekEnd: Date }
 */
export function getWeekRange(year: number, weekNumber: number): { weekStart: Date; weekEnd: Date } {
  // 获取该年第一周的周四
  const jan4 = new Date(year, 0, 4);
  jan4.setHours(12, 0, 0, 0);

  // 找到第一周的周一
  const dayNum = (jan4.getDay() + 6) % 7; // 周一=0, 周日=6
  const firstMonday = new Date(jan4);
  firstMonday.setDate(jan4.getDate() - dayNum);

  // 计算目标周的周一
  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (weekNumber - 1) * 7);
  weekStart.setHours(0, 0, 0, 0);

  // 计算目标周的周日
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}
