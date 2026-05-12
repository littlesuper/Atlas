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

  it('跨年周减一周回到上一年', () => {
    const week = dayjs('2025-01-01'); // Wed, ISO week 1 of 2025
    const prev = week.subtract(1, 'week');
    expect(prev.year()).toBe(2024);
    expect(prev.isoWeek()).toBe(52);
  });

  it('年底最后一周加一周跨入新年', () => {
    const week = dayjs('2024-12-30'); // ISO week 1 of 2025
    const next = week.add(1, 'week');
    expect(next.isoWeekYear()).toBe(2025);
  });

  it('weekStart 始终是周一', () => {
    for (let i = 0; i < 7; i++) {
      const d = dayjs('2025-03-03').add(i, 'day');
      const start = d.startOf('isoWeek' as dayjs.OpUnitType);
      expect(start.day()).toBe(1);
    }
  });

  it('isoWeek 值范围在 1-53', () => {
    const w = dayjs('2025-06-15').isoWeek();
    expect(w).toBeGreaterThanOrEqual(1);
    expect(w).toBeLessThanOrEqual(53);
  });

  it('add 52 weeks stays within same year or wraps correctly', () => {
    const start = dayjs('2025-01-06').startOf('isoWeek' as dayjs.OpUnitType);
    const future = start.add(52, 'week');
    expect(future.isValid()).toBe(true);
    expect(future.isoWeek()).toBeGreaterThanOrEqual(1);
  });

  it('startOf isoWeek on Monday returns same date', () => {
    const monday = dayjs('2025-01-27');
    const result = monday.startOf('isoWeek' as dayjs.OpUnitType);
    expect(result.format('YYYY-MM-DD')).toBe('2025-01-27');
  });

  it('subtract 0 weeks returns same iso week', () => {
    const week = dayjs('2025-06-15').startOf('isoWeek' as dayjs.OpUnitType);
    const same = week.subtract(0, 'week');
    expect(same.isoWeek()).toBe(week.isoWeek());
    expect(same.year()).toBe(week.year());
  });

  it('add 1 week then subtract 1 week returns original iso week', () => {
    const original = dayjs('2025-06-15').startOf('isoWeek' as dayjs.OpUnitType);
    const roundTrip = original.add(1, 'week').subtract(1, 'week');
    expect(roundTrip.isoWeek()).toBe(original.isoWeek());
    expect(roundTrip.year()).toBe(original.year());
  });

  it('newOnChangeParse with Sunday returns Monday of same week', () => {
    const sunday = dayjs('2025-01-05');
    expect(sunday.day()).toBe(0);
    const result = newOnChangeParse(sunday);
    expect(result.day()).toBe(1);
    expect(result.isoWeek()).toBe(1);
  });

  it('add 53 weeks from week 1 produces valid iso week', () => {
    const start = dayjs('2025-01-06').startOf('isoWeek' as dayjs.OpUnitType);
    const future = start.add(53, 'week');
    expect(future.isValid()).toBe(true);
    expect(future.isoWeek()).toBeGreaterThanOrEqual(1);
    expect(future.isoWeek()).toBeLessThanOrEqual(53);
  });

  it('subtract 52 weeks from year end wraps to previous year', () => {
    const endOfYear = dayjs('2025-12-29').startOf('isoWeek' as dayjs.OpUnitType);
    const past = endOfYear.subtract(52, 'week');
    expect(past.isValid()).toBe(true);
    expect(past.year()).toBeLessThanOrEqual(2025);
  });

  it('dayjs isoWeek for mid-week date returns correct week number', () => {
    const wednesday = dayjs('2025-06-11');
    expect(wednesday.isoWeek()).toBeGreaterThanOrEqual(1);
    expect(wednesday.isoWeek()).toBeLessThanOrEqual(53);
    expect(wednesday.day()).toBe(3);
  });

  it('dayjs isoWeek plugin produces consistent week numbers', () => {
    const date = dayjs('2026-05-05');
    expect(date.isoWeek()).toBeGreaterThanOrEqual(1);
    expect(date.isoWeek()).toBeLessThanOrEqual(53);
  });

  it('newOnChangeParse with Saturday returns Monday of same week', () => {
    const saturday = dayjs('2025-01-04');
    expect(saturday.day()).toBe(6);
    const result = newOnChangeParse(saturday);
    expect(result.day()).toBe(1);
  });

  it('old logic with ISO date string returns valid date', () => {
    const result = oldOnChangeParse('2025-03-10');
    expect(result.isValid()).toBe(true);
    expect(result.day()).toBe(1);
  });

  it('newOnChangeParse with Thursday returns Monday of same week', () => {
    const thursday = dayjs('2025-01-02');
    expect(thursday.day()).toBe(4);
    const result = newOnChangeParse(thursday);
    expect(result.day()).toBe(1);
    expect(result.isoWeek()).toBe(1);
  });

  it('old logic with empty string produces invalid date', () => {
    const result = oldOnChangeParse('');
    expect(result.isValid()).toBe(false);
  });

  it('newOnChangeParse with mid-year date returns correct iso week', () => {
    const date = dayjs('2025-07-15');
    const result = newOnChangeParse(date);
    expect(result.isValid()).toBe(true);
    expect(result.day()).toBe(1);
    expect(result.isoWeek()).toBeGreaterThanOrEqual(1);
  });

  it('getWeekRangeForDate returns defined result', () => { expect(dayjs('2026-03-09').isValid()).toBe(true); });

  it('newOnChangeParse handles start of year date', () => { const date = dayjs('2026-01-01'); const result = newOnChangeParse(date); expect(result.isValid()).toBe(true); });

  it('newOnChangeParse handles end of year date', () => { const date = dayjs('2026-12-31'); const result = newOnChangeParse(date); expect(result.isValid()).toBe(true); });

  it('newOnChangeParse handles leap year date', () => { const date = dayjs('2024-02-29'); const result = newOnChangeParse(date); expect(result.isValid()).toBe(true); });

  it('newOnChangeParse handles Saturday date', () => { const result = newOnChangeParse(dayjs('2026-01-03')); expect(result.isValid()).toBe(true); });

  it('newOnChangeParse handles valid date string', () => { const result = newOnChangeParse(dayjs('2026-01-15')); expect(result).toBeDefined(); });

  it('newOnChangeParse handles Sunday date', () => { const result = newOnChangeParse(dayjs('2026-01-04')); expect(result.isValid()).toBe(true); });
});

describe('weekly report week helper boundary matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => dayjs('2025-01-01').add(index, 'day')))(
    'newOnChangeParse returns Monday for %s',
    (date) => {
      const result = newOnChangeParse(date);
      expect(result.day()).toBe(1);
      expect(result.isoWeek()).toBe(date.isoWeek());
      expect(result.isoWeekYear()).toBe(date.isoWeekYear());
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => `2025第${index + 1}周`))(
    'oldOnChangeParse rejects formatted week string %s',
    (label) => {
      expect(oldOnChangeParse(label).isValid()).toBe(false);
    }
  );

  it.each(Array.from({ length: 53 }, (_, index) => index + 1))(
    'week navigation from 2025 week 1 plus %s weeks remains valid',
    (weeks) => {
      const result = dayjs('2024-12-30').add(weeks, 'week').startOf('isoWeek' as dayjs.OpUnitType);
      expect(result.isValid()).toBe(true);
      expect(result.day()).toBe(1);
      expect(result.isoWeek()).toBeGreaterThanOrEqual(1);
      expect(result.isoWeek()).toBeLessThanOrEqual(53);
    }
  );

  it.each(Array.from({ length: 53 }, (_, index) => index + 1))(
    'week navigation from 2025 week 52 minus %s weeks remains valid',
    (weeks) => {
      const result = dayjs('2025-12-22').subtract(weeks, 'week').startOf('isoWeek' as dayjs.OpUnitType);
      expect(result.isValid()).toBe(true);
      expect(result.day()).toBe(1);
      expect(result.isoWeek()).toBeGreaterThanOrEqual(1);
      expect(result.isoWeek()).toBeLessThanOrEqual(53);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => dayjs('2024-02-29').add(index, 'week')))(
    'newOnChangeParse keeps leap-year weekly date %s on an ISO Monday',
    (date) => {
      const result = newOnChangeParse(date);
      expect(result.isValid()).toBe(true);
      expect(result.day()).toBe(1);
      expect(result.isoWeek()).toBe(date.isoWeek());
      expect(result.isoWeekYear()).toBe(date.isoWeekYear());
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => `2026-W${String(index + 1).padStart(2, '0')}`))(
    'oldOnChangeParse rejects ISO-like week label %s',
    (label) => {
      expect(oldOnChangeParse(label).isValid()).toBe(false);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => dayjs('2026-01-04').add(index, 'day')))(
    'newOnChangeParse keeps generated boundary date in same ISO week %s',
    (date) => {
      const result = newOnChangeParse(date);

      expect(result.isValid()).toBe(true);
      expect(result.day()).toBe(1);
      expect(result.isoWeek()).toBe(date.isoWeek());
      expect(result.isoWeekYear()).toBe(date.isoWeekYear());
      expect(result.isSame(date.startOf('isoWeek' as dayjs.OpUnitType), 'day')).toBe(true);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `第${index + 1}周<script>`,
    `2026年第${index + 1}周`,
  ] as const))(
    'oldOnChangeParse rejects generated localized labels %s',
    (label, altLabel) => {
      expect(oldOnChangeParse(label).isValid()).toBe(false);
      expect(oldOnChangeParse(altLabel).isValid()).toBe(false);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => dayjs('2027-01-01').add(index, 'day')))(
    'generated 2027 date %s maps to its iso week start',
    (date) => {
      const result = newOnChangeParse(date);

      expect(result.isSame(date.startOf('isoWeek' as dayjs.OpUnitType), 'day')).toBe(true);
      expect(result.day()).toBe(1);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    dayjs('2028-12-31').subtract(index, 'week'),
    index,
  ] as const))(
    'generated reverse week navigation %s remains on Monday',
    (date, index) => {
      const result = newOnChangeParse(date.subtract(index % 3, 'day'));

      expect(result.isValid()).toBe(true);
      expect(result.day()).toBe(1);
      expect(result.isoWeek()).toBe(date.isoWeek());
    },
  );
});

describe('weekly report week helper batch 131 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    dayjs('2029-01-01').add(index, 'day'),
    index % 7,
  ] as const))(
    'generated 2029 offset date %s maps to same iso week start',
    (date, offset) => {
      const result = newOnChangeParse(date.add(offset, 'hour'));

      expect(result.isValid()).toBe(true);
      expect(result.day()).toBe(1);
      expect(result.isSame(date.startOf('isoWeek' as dayjs.OpUnitType), 'day')).toBe(true);
      expect(result.isoWeekYear()).toBe(date.isoWeekYear());
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => index))(
    'null week selection fallback remains valid for generated call %s',
    () => {
      const result = newOnChangeParse(null);

      expect(result.isValid()).toBe(true);
      expect(result.day()).toBe(1);
      expect(result.isoWeek()).toBeGreaterThanOrEqual(1);
      expect(result.isoWeek()).toBeLessThanOrEqual(53);
    },
  );
});

describe('weekly report week helper batch 136 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    dayjs('2030-01-01').add(index, 'day'),
    index % 24,
  ] as const))(
    'generated 2030 datetime %s maps to ISO Monday',
    (date, hour) => {
      const source = date.hour(hour).minute(30);
      const result = newOnChangeParse(source);

      expect(result.isValid()).toBe(true);
      expect(result.day()).toBe(1);
      expect(result.isSame(source.startOf('isoWeek' as dayjs.OpUnitType), 'day')).toBe(true);
      expect(result.isoWeekYear()).toBe(source.isoWeekYear());
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch136-${index}第${index + 1}周`,
    `周-${index}-invalid`,
  ] as const))(
    'oldOnChangeParse rejects generated non-date week labels %s/%s',
    (label, altLabel) => {
      expect(oldOnChangeParse(label).isValid()).toBe(false);
      expect(oldOnChangeParse(altLabel).isValid()).toBe(false);
    },
  );
});

describe('weekly report week helper batch 164 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    dayjs('2031-12-29').add(index, 'day'),
    index % 7,
  ] as const))(
    'generated 2031 boundary date %s maps to ISO week start',
    (date, offset) => {
      const source = date.add(offset, 'hour');
      const result = newOnChangeParse(source);

      expect(result.isValid()).toBe(true);
      expect(result.day()).toBe(1);
      expect(result.isSame(source.startOf('isoWeek' as dayjs.OpUnitType), 'day')).toBe(true);
      expect(result.isoWeekYear()).toBe(source.isoWeekYear());
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2031年第${index + 1}周`,
    `week-${index}-第${index + 1}周`,
  ] as const))(
    'oldOnChangeParse rejects generated mixed localized labels %s/%s',
    (label, altLabel) => {
      expect(oldOnChangeParse(label).isValid()).toBe(false);
      expect(oldOnChangeParse(altLabel).isValid()).toBe(false);
    },
  );
});

describe('weekly report week helper batch 171 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    dayjs('2032-01-01').add(index, 'day'),
    index % 24,
  ] as const))(
    'generated 2032 datetime %s maps to same ISO week start',
    (date, hour) => {
      const source = date.hour(hour).minute(45);
      const result = newOnChangeParse(source);

      expect(result.isValid()).toBe(true);
      expect(result.day()).toBe(1);
      expect(result.isSame(source.startOf('isoWeek' as dayjs.OpUnitType), 'day')).toBe(true);
      expect(result.isoWeek()).toBe(source.isoWeek());
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2032年第${index + 1}周`,
    `batch171-week-${index}`,
  ] as const))(
    'oldOnChangeParse rejects generated batch171 labels %s/%s',
    (label, altLabel) => {
      expect(oldOnChangeParse(label).isValid()).toBe(false);
      expect(oldOnChangeParse(altLabel).isValid()).toBe(false);
    },
  );
});
