import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

// ---- 复现 onChange 中的解析逻辑 ----

/**
 * 旧逻辑：WeekPicker onChange 第一个参数是格式化字符串（如 "2025第5周"），
 * 直接传给 dayjs() 解析会得到无效日期。
 */
function oldOnChangeParse(dateString: string) {
  return dayjs(dateString).startOf('isoWeek' as dayjs.OpUnitType);
}

/**
 * 新逻辑：使用 onChange 第二个参数（Dayjs 对象），直接取 startOf('isoWeek')。
 * date 为 null 时（点击 X 清空）回退到当前周。
 */
function newOnChangeParse(date: dayjs.Dayjs | null) {
  return date
    ? date.startOf('isoWeek' as dayjs.OpUnitType)
    : dayjs().startOf('isoWeek' as dayjs.OpUnitType);
}

describe('WeekPicker onChange 解析', () => {
  it('旧逻辑：YYYY-wo 格式字符串解析为无效日期', () => {
    // WeekPicker format="YYYY-wo" 输出类似 "2025第5周"，dayjs 无法解析
    const result = oldOnChangeParse('2025第5周');
    expect(result.isValid()).toBe(false);
  });

  it('旧逻辑：即使是标准日期字符串也未必是周一', () => {
    // 若碰巧传入一个合法字符串，startOf 结果仍可能是错误的周
    const result = oldOnChangeParse('2025-01-03'); // 周五
    // startOf('isoWeek') 会给周一，不是原本想要的周
    expect(result.day()).toBe(1); // 还是周一，但原始字符串本身不是 WeekPicker 的真实输出
  });

  it('新逻辑：直接使用 Dayjs 对象，startOf(isoWeek) 返回正确周一', () => {
    // WeekPicker 选中 2025 年第 5 周，dayjs 内部会给出该周任意一天（通常周一）
    const selectedDate = dayjs('2025-01-27'); // 2025W05 周一
    const result = newOnChangeParse(selectedDate);
    expect(result.isValid()).toBe(true);
    expect(result.isoWeek()).toBe(5);
    expect(result.year()).toBe(2025);
    expect(result.day()).toBe(1); // 周一
  });

  it('新逻辑：date 为 null（点 X 清空）→ 回退到当前周', () => {
    const result = newOnChangeParse(null);
    expect(result.isValid()).toBe(true);
    // 回退到当前周，isoWeek 必须是合法周数 (1-53)
    expect(result.isoWeek()).toBeGreaterThanOrEqual(1);
    expect(result.isoWeek()).toBeLessThanOrEqual(53);
    expect(result.day()).toBe(1); // 周一
  });

  it('新逻辑：选中跨年周（2025W01，周一在 2024-12-30）', () => {
    const selectedDate = dayjs('2024-12-30');
    const result = newOnChangeParse(selectedDate);
    expect(result.isValid()).toBe(true);
    expect(result.isoWeek()).toBe(1);
    // ISO 周年 = 2025（第 1 周属于 2025）
    expect(result.isoWeekYear()).toBe(2025);
  });
});

describe('周导航逻辑', () => {
  it('加一周后 isoWeek +1', () => {
    const week = dayjs('2025-01-27'); // W05
    const next = week.add(1, 'week');
    expect(next.isoWeek()).toBe(6);
  });

  it('减一周后 isoWeek -1', () => {
    const week = dayjs('2025-01-27'); // W05
    const prev = week.subtract(1, 'week');
    expect(prev.isoWeek()).toBe(4);
  });

  it('year 和 weekNumber 与 API 参数一致', () => {
    const currentWeek = dayjs('2025-01-27').startOf('isoWeek' as dayjs.OpUnitType);
    const year = currentWeek.year();
    const weekNumber = currentWeek.isoWeek();
    expect(year).toBe(2025);
    expect(weekNumber).toBe(5);
  });

  it('weekStart/weekEnd 范围计算正确', () => {
    const currentWeek = dayjs('2025-01-27').startOf('isoWeek' as dayjs.OpUnitType);
    const weekStart = currentWeek.startOf('isoWeek' as dayjs.OpUnitType);
    const weekEnd = weekStart.add(6, 'day');
    expect(weekStart.format('YYYY-MM-DD')).toBe('2025-01-27');
    expect(weekEnd.format('YYYY-MM-DD')).toBe('2025-02-02');
  });
});
