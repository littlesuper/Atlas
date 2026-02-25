/**
 * 工作日计算工具
 * 计算两个日期之间的工作日数量，排除周末和中国法定节假日，包含调休补班日
 */

/**
 * 中国法定节假日（放假日）
 * 格式: 'YYYY-MM-DD'
 */
const HOLIDAYS: Set<string> = new Set([
  // ===== 2025 年 =====
  // 元旦
  '2025-01-01',
  // 春节
  '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
  '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
  // 清明节
  '2025-04-04', '2025-04-05', '2025-04-06',
  // 劳动节
  '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
  // 端午节
  '2025-05-31', '2025-06-01', '2025-06-02',
  // 中秋节 + 国庆节
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04',
  '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',

  // ===== 2026 年 =====
  // 元旦
  '2026-01-01', '2026-01-02', '2026-01-03',
  // 春节
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22',
  // 清明节
  '2026-04-04', '2026-04-05', '2026-04-06',
  // 劳动节
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  // 端午节
  '2026-06-19', '2026-06-20', '2026-06-21',
  // 中秋节
  '2026-09-25', '2026-09-26', '2026-09-27',
  // 国庆节
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
]);

/**
 * 调休补班日（周末但需要上班的日子）
 * 格式: 'YYYY-MM-DD'
 */
const WORKDAY_OVERRIDES: Set<string> = new Set([
  // ===== 2025 年 =====
  '2025-01-26', // 春节调休（周日补班）
  '2025-02-08', // 春节调休（周六补班）
  '2025-04-27', // 劳动节调休（周日补班）
  '2025-09-28', // 国庆调休（周日补班）
  '2025-10-11', // 国庆调休（周六补班）

  // ===== 2026 年 =====
  '2026-02-14', // 春节调休（周六补班）
  '2026-02-28', // 春节调休（周六补班）
  '2026-04-26', // 劳动节调休（周日补班）
  '2026-06-28', // 端午调休（周日补班）
  '2026-09-27', // 中秋调休（周日补班）
  '2026-10-10', // 国庆调休（周六补班）
]);

/**
 * 判断某天是否为工作日（考虑中国法定节假日和调休）
 */
export function isWorkday(date: Date): boolean {
  const dateStr = date.toISOString().split('T')[0];
  const dayOfWeek = date.getDay();

  // 调休补班日（周末但要上班）
  if (WORKDAY_OVERRIDES.has(dateStr)) return true;

  // 法定节假日
  if (HOLIDAYS.has(dateStr)) return false;

  // 周末
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  return true;
}

/**
 * 从基准日期偏移指定工作日数
 * @param baseDate 基准日期
 * @param offsetDays 偏移工作日数（正数向未来，负数向过去，0 返回最近工作日）
 * @returns 偏移后的日期
 */
export function offsetWorkdays(baseDate: Date, offsetDays: number): Date {
  const result = new Date(baseDate);

  if (offsetDays === 0) {
    // 若非工作日，向未来找最近的工作日
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
 * @param startDate 开始日期
 * @param endDate 结束日期
 * @returns 工作日数量（包含起止日期）
 */
export function calculateWorkdays(startDate: Date, endDate: Date): number {
  // 确保开始日期不晚于结束日期
  if (startDate > endDate) {
    return 0;
  }

  let workdays = 0;
  const current = new Date(startDate);

  // 遍历每一天，统计工作日
  while (current <= endDate) {
    if (isWorkday(current)) {
      workdays++;
    }

    // 前进到下一天
    current.setDate(current.getDate() + 1);
  }

  return workdays;
}
