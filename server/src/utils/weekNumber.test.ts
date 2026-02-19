import { describe, it, expect } from 'vitest';
import { getWeekNumber, getWeekRange } from './weekNumber';

describe('getWeekNumber', () => {
  // ===== ISO 8601 标准：周一为第一天，第一周包含 1 月 4 日 =====

  it('2025-01-01（周三）属于 2025 年第 1 周', () => {
    const { year, weekNumber } = getWeekNumber(new Date('2025-01-01T12:00:00'));
    expect(year).toBe(2025);
    expect(weekNumber).toBe(1);
  });

  it('2025-01-06（周一）属于 2025 年第 2 周', () => {
    const { year, weekNumber } = getWeekNumber(new Date('2025-01-06T12:00:00'));
    expect(year).toBe(2025);
    expect(weekNumber).toBe(2);
  });

  it('2025-01-05（周日）属于 2025 年第 1 周', () => {
    // ISO: 周日是一周的最后一天，仍属第 1 周
    const { year, weekNumber } = getWeekNumber(new Date('2025-01-05T12:00:00'));
    expect(year).toBe(2025);
    expect(weekNumber).toBe(1);
  });

  it('2025-12-29（周一）属于 2026 年第 1 周', () => {
    // 2025-12-29 是 2026 年 ISO 第 1 周的周一
    const { year, weekNumber } = getWeekNumber(new Date('2025-12-29T12:00:00'));
    expect(year).toBe(2026);
    expect(weekNumber).toBe(1);
  });

  it('2020-12-28（周一）属于 2020 年第 53 周', () => {
    // 2020 年是 53 周的年份
    const { year, weekNumber } = getWeekNumber(new Date('2020-12-28T12:00:00'));
    expect(year).toBe(2020);
    expect(weekNumber).toBe(53);
  });

  it('2021-01-01（周五）属于 2020 年第 53 周', () => {
    // 跨年：2021-01-01 仍属于 2020 年的最后一周
    const { year, weekNumber } = getWeekNumber(new Date('2021-01-01T12:00:00'));
    expect(year).toBe(2020);
    expect(weekNumber).toBe(53);
  });

  it('2024-02-26（周一）属于 2024 年第 9 周', () => {
    const { year, weekNumber } = getWeekNumber(new Date('2024-02-26T12:00:00'));
    expect(year).toBe(2024);
    expect(weekNumber).toBe(9);
  });
});

describe('getWeekRange', () => {
  it('2025 年第 1 周从 2024-12-30（周一）开始', () => {
    // ISO W1 2025 的周一是 2024-12-30
    const { weekStart } = getWeekRange(2025, 1);
    expect(weekStart.getFullYear()).toBe(2024);
    expect(weekStart.getMonth()).toBe(11); // December
    expect(weekStart.getDate()).toBe(30);
  });

  it('2025 年第 1 周在 2025-01-05（周日）结束', () => {
    const { weekEnd } = getWeekRange(2025, 1);
    expect(weekEnd.getFullYear()).toBe(2025);
    expect(weekEnd.getMonth()).toBe(0); // January
    expect(weekEnd.getDate()).toBe(5);
  });

  it('2025 年第 2 周从 2025-01-06（周一）开始', () => {
    const { weekStart } = getWeekRange(2025, 2);
    expect(weekStart.getFullYear()).toBe(2025);
    expect(weekStart.getMonth()).toBe(0); // January
    expect(weekStart.getDate()).toBe(6);
  });

  it('任意一周的跨度必须是 7 天', () => {
    const { weekStart, weekEnd } = getWeekRange(2025, 10);
    const diffMs = weekEnd.getTime() - weekStart.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7); // weekEnd = 23:59:59.999，Math.round → 7
  });

  it('getWeekRange 与 getWeekNumber 互为逆运算', () => {
    // 对 2025-W8 的周一验证
    const { weekStart } = getWeekRange(2025, 8);
    const { year, weekNumber } = getWeekNumber(weekStart);
    expect(year).toBe(2025);
    expect(weekNumber).toBe(8);
  });

  it('weekStart 时间为 00:00:00', () => {
    const { weekStart } = getWeekRange(2025, 5);
    expect(weekStart.getHours()).toBe(0);
    expect(weekStart.getMinutes()).toBe(0);
    expect(weekStart.getSeconds()).toBe(0);
  });

  it('weekEnd 时间为 23:59:59', () => {
    const { weekEnd } = getWeekRange(2025, 5);
    expect(weekEnd.getHours()).toBe(23);
    expect(weekEnd.getMinutes()).toBe(59);
    expect(weekEnd.getSeconds()).toBe(59);
  });
});
