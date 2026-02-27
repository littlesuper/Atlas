/**
 * 工作日计算工具（客户端）
 * 排除周末和中国法定节假日，包含调休补班日
 */
import dayjs from 'dayjs';

/**
 * 中国法定节假日（放假日）
 */
const HOLIDAYS: Set<string> = new Set([
  // ===== 2025 年 =====
  '2025-01-01',
  '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
  '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
  '2025-04-04', '2025-04-05', '2025-04-06',
  '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
  '2025-05-31', '2025-06-01', '2025-06-02',
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04',
  '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',

  // ===== 2026 年 =====
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

/**
 * 调休补班日（周末但需要上班的日子）
 */
const WORKDAY_OVERRIDES: Set<string> = new Set([
  // ===== 2025 年 =====
  '2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11',

  // ===== 2026 年 =====
  '2026-02-14', '2026-02-28', '2026-04-26', '2026-06-28', '2026-09-27', '2026-10-10',
]);

/**
 * 判断某天是否为工作日
 */
function isWorkday(date: dayjs.Dayjs): boolean {
  const dateStr = date.format('YYYY-MM-DD');
  const dow = date.day();

  if (WORKDAY_OVERRIDES.has(dateStr)) return true;
  if (HOLIDAYS.has(dateStr)) return false;
  if (dow === 0 || dow === 6) return false;

  return true;
}

/**
 * 计算两个日期之间的工作日数（排除周末和中国法定节假日，包含调休补班日）
 */
export function calcWorkdays(start: dayjs.Dayjs, end: dayjs.Dayjs): number {
  let count = 0;
  let cur = start;
  while (cur.isBefore(end) || cur.isSame(end, 'day')) {
    if (isWorkday(cur)) count++;
    cur = cur.add(1, 'day');
  }
  return Math.max(count, 1);
}

/**
 * 根据开始日期和工期推算结束日期（跳过非工作日）
 * 保证 calcWorkdays(start, addWorkdays(start, n)) === n
 */
export function addWorkdays(start: dayjs.Dayjs, days: number): dayjs.Dayjs {
  let remaining = days;
  let cur = start;
  // 起始日如果是工作日，算作第1天
  if (isWorkday(cur)) remaining--;
  while (remaining > 0) {
    cur = cur.add(1, 'day');
    if (isWorkday(cur)) remaining--;
  }
  // 确保结束日期本身是工作日
  while (!isWorkday(cur)) cur = cur.add(1, 'day');
  return cur;
}

/**
 * 根据结束日期和工期反推开始日期（跳过非工作日，往前推）
 * 保证 calcWorkdays(subtractWorkdays(end, n), end) === n
 */
export function subtractWorkdays(end: dayjs.Dayjs, days: number): dayjs.Dayjs {
  let remaining = days;
  let cur = end;
  // 结束日如果是工作日，算作第1天
  if (isWorkday(cur)) remaining--;
  while (remaining > 0) {
    cur = cur.subtract(1, 'day');
    if (isWorkday(cur)) remaining--;
  }
  // 确保开始日期本身是工作日
  while (!isWorkday(cur)) cur = cur.subtract(1, 'day');
  return cur;
}
