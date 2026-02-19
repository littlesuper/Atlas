import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { calcWorkdays, addWorkdays, subtractWorkdays } from './workday';

const d = (iso: string) => dayjs(iso);

// ==================== calcWorkdays ====================
describe('calcWorkdays', () => {
  // ===== 边界情况 =====

  it('同一天（周一）返回 1', () => {
    expect(calcWorkdays(d('2025-01-06'), d('2025-01-06'))).toBe(1);
  });

  it('同一天（周六）返回 min 1', () => {
    // calcWorkdays 的 Math.max(count, 1) 保底
    expect(calcWorkdays(d('2025-01-04'), d('2025-01-04'))).toBe(1);
  });

  it('周一至周五 = 5', () => {
    expect(calcWorkdays(d('2025-03-03'), d('2025-03-07'))).toBe(5);
  });

  it('跨越完整一周（Mon~Sun）= 5', () => {
    expect(calcWorkdays(d('2025-01-06'), d('2025-01-12'))).toBe(5);
  });

  // ===== 中国法定节假日 =====

  it('元旦当天返回 min 1（节假日但 Math.max 保底）', () => {
    expect(calcWorkdays(d('2025-01-01'), d('2025-01-01'))).toBe(1);
  });

  it('包含元旦的一周：2024-12-30 ~ 2025-01-03 = 4', () => {
    expect(calcWorkdays(d('2024-12-30'), d('2025-01-03'))).toBe(4);
  });

  it('春节假期（2025-01-28 ~ 02-04）= min 1', () => {
    expect(calcWorkdays(d('2025-01-28'), d('2025-02-04'))).toBe(1);
  });

  it('包含春节假期的区间：2025-01-27 ~ 02-07 = 4', () => {
    expect(calcWorkdays(d('2025-01-27'), d('2025-02-07'))).toBe(4);
  });

  it('劳动节假期（2025-05-01 ~ 05-05）= min 1', () => {
    expect(calcWorkdays(d('2025-05-01'), d('2025-05-05'))).toBe(1);
  });

  it('包含劳动节的区间：2025-04-28 ~ 05-09 = 7', () => {
    expect(calcWorkdays(d('2025-04-28'), d('2025-05-09'))).toBe(7);
  });

  // ===== 调休补班日 =====

  it('春节调休 2025-01-26（周日）计为工作日', () => {
    expect(calcWorkdays(d('2025-01-26'), d('2025-01-26'))).toBe(1);
  });

  it('春节调休 2025-02-08（周六）计为工作日', () => {
    expect(calcWorkdays(d('2025-02-08'), d('2025-02-08'))).toBe(1);
  });

  it('国庆调休 2025-09-28（周日）计为工作日', () => {
    expect(calcWorkdays(d('2025-09-28'), d('2025-09-28'))).toBe(1);
  });

  it('普通周六周日仍计为 min 1（保底）', () => {
    expect(calcWorkdays(d('2025-03-08'), d('2025-03-09'))).toBe(1);
  });
});

// ==================== addWorkdays ====================
describe('addWorkdays', () => {
  it('从周一加 1 天 = 周一本身', () => {
    const result = addWorkdays(d('2025-03-03'), 1);
    expect(result.format('YYYY-MM-DD')).toBe('2025-03-03');
  });

  it('从周一加 5 天 = 周五', () => {
    const result = addWorkdays(d('2025-03-03'), 5);
    expect(result.format('YYYY-MM-DD')).toBe('2025-03-07');
  });

  it('从周五加 2 天 = 下周一', () => {
    const result = addWorkdays(d('2025-03-07'), 2);
    expect(result.format('YYYY-MM-DD')).toBe('2025-03-10');
  });

  it('从周六开始 → 跳到下周一', () => {
    const result = addWorkdays(d('2025-03-08'), 1);
    expect(result.format('YYYY-MM-DD')).toBe('2025-03-10');
  });

  it('跨越春节假期（2025-01-27 + 4天）', () => {
    // 01-27(Mon)=1, 01-28~02-04=春节假期, 02-05(Wed)=2, 02-06=3, 02-07=4
    const result = addWorkdays(d('2025-01-27'), 4);
    expect(result.format('YYYY-MM-DD')).toBe('2025-02-07');
  });

  it('从调休补班日开始加天数', () => {
    // 2025-01-26(Sun 补班) + 2 = 01-26(1), 01-27(Mon)(2)
    const result = addWorkdays(d('2025-01-26'), 2);
    expect(result.format('YYYY-MM-DD')).toBe('2025-01-27');
  });

  it('跨越劳动节假期', () => {
    // 2025-04-30(Wed) + 3: 04-30(1), 05-01~05-05=假期, 05-06(Tue)(2), 05-07(3)
    const result = addWorkdays(d('2025-04-30'), 3);
    expect(result.format('YYYY-MM-DD')).toBe('2025-05-07');
  });

  it('addWorkdays 与 calcWorkdays 互逆', () => {
    const start = d('2025-03-03');
    const days = 10;
    const end = addWorkdays(start, days);
    expect(calcWorkdays(start, end)).toBe(days);
  });
});

// ==================== subtractWorkdays ====================
describe('subtractWorkdays', () => {
  it('从周五减 1 天 = 周五本身', () => {
    const result = subtractWorkdays(d('2025-03-07'), 1);
    expect(result.format('YYYY-MM-DD')).toBe('2025-03-07');
  });

  it('从周五减 5 天 = 周一', () => {
    const result = subtractWorkdays(d('2025-03-07'), 5);
    expect(result.format('YYYY-MM-DD')).toBe('2025-03-03');
  });

  it('从周一减 2 天 = 上周四', () => {
    const result = subtractWorkdays(d('2025-03-10'), 2);
    expect(result.format('YYYY-MM-DD')).toBe('2025-03-07');
  });

  it('从周日开始 → 跳到上周五', () => {
    const result = subtractWorkdays(d('2025-03-09'), 1);
    expect(result.format('YYYY-MM-DD')).toBe('2025-03-07');
  });

  it('跨越春节假期往前推', () => {
    // 从 02-07(Fri) 往前推 4 天:
    // 02-07(1), 02-06(2), 02-05(3), 02-04~01-28=春节假期, 01-27(Mon)(4)
    const result = subtractWorkdays(d('2025-02-07'), 4);
    expect(result.format('YYYY-MM-DD')).toBe('2025-01-27');
  });

  it('从调休补班日往前推', () => {
    // 2025-02-08(Sat 补班) - 2: 02-08(1), 02-07(Fri)(2)
    const result = subtractWorkdays(d('2025-02-08'), 2);
    expect(result.format('YYYY-MM-DD')).toBe('2025-02-07');
  });

  it('跨越劳动节假期往前推', () => {
    // 2025-05-07(Wed) - 3: 05-07(1), 05-06(Tue)(2), 05-05~05-01=假期, 04-30(Wed)(3)
    const result = subtractWorkdays(d('2025-05-07'), 3);
    expect(result.format('YYYY-MM-DD')).toBe('2025-04-30');
  });

  it('subtractWorkdays 与 addWorkdays 互逆', () => {
    const end = d('2025-06-20');
    const days = 10;
    const start = subtractWorkdays(end, days);
    expect(addWorkdays(start, days).format('YYYY-MM-DD')).toBe(end.format('YYYY-MM-DD'));
  });

  it('subtractWorkdays 与 calcWorkdays 一致', () => {
    const end = d('2025-03-14');
    const days = 8;
    const start = subtractWorkdays(end, days);
    expect(calcWorkdays(start, end)).toBe(days);
  });

  // ===== 2026 年 =====

  it('2026 春节假期往前推', () => {
    // 从 02-23(Mon) 往前推 2 天:
    // 02-23(1), 02-22~02-16=春节假期, 02-15(Sun)=普通周末, 02-14(Sat 补班)(2)
    const result = subtractWorkdays(d('2026-02-23'), 2);
    expect(result.format('YYYY-MM-DD')).toBe('2026-02-14');
  });
});
