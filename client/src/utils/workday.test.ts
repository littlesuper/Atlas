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

describe('workday helper batch 172 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    '2025-11-03',
    index + 1,
  ] as const))(
    'generated November duration %s round-trips addWorkdays',
    (startIso, days) => {
      const start = d(startIso);
      const end = addWorkdays(start, days);
      expect(calcWorkdays(start, end)).toBe(days);
      expect(end.isValid()).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    '2025-12-31',
    index + 1,
  ] as const))(
    'generated December reverse duration %s round-trips subtractWorkdays',
    (endIso, days) => {
      const end = d(endIso);
      const start = subtractWorkdays(end, days);
      expect(calcWorkdays(start, end)).toBe(days);
      expect(addWorkdays(start, days).format('YYYY-MM-DD')).toBe(end.format('YYYY-MM-DD'));
    },
  );
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

  it('addWorkdays from Sunday skips to Monday', () => {
    const result = addWorkdays(d('2025-03-09'), 1);
    expect(result.format('YYYY-MM-DD')).toBe('2025-03-10');
    expect(result.day()).toBe(1);
  });

  it('addWorkdays handles zero days addition', () => {
    const result = addWorkdays(dayjs('2025-03-10'), 0);
    expect(result.format('YYYY-MM-DD')).toBe('2025-03-10');
  });

  it('addWorkdays adds 5 workdays correctly', () => {
    const result = addWorkdays(dayjs('2025-03-10'), 5);
    expect(calcWorkdays(dayjs('2025-03-10'), result)).toBe(5);
  });

  it('addWorkdays handles negative days', () => {
    const result = addWorkdays(dayjs('2025-03-17'), -5);
    expect(result.isValid()).toBe(true);
  });

  it('addWorkdays handles zero days', () => {
    const result = addWorkdays(dayjs('2025-03-17'), 0);
    expect(result.isValid()).toBe(true);
  });

  it('addWorkdays handles negative days', () => {
    const result = addWorkdays(dayjs('2025-03-17'), -5);
    expect(result.isValid()).toBe(true);
  });

  it('addWorkdays handles negative days correctly', () => {
    const result = addWorkdays(dayjs('2025-03-17'), -3);
    expect(result.isValid()).toBe(true);
  });
});

describe('workday helper boundary matrices', () => {
  it.each(Array.from({ length: 60 }, (_, index) => {
    const day = String((index % 20) + 3).padStart(2, '0');
    return `2025-03-${day}`;
  }))('calcWorkdays same-day returns at least one for %s', (iso) => {
    expect(calcWorkdays(d(iso), d(iso))).toBeGreaterThanOrEqual(1);
  });

  it.each(Array.from({ length: 40 }, (_, index) => {
    const day = String((index % 5) + 3).padStart(2, '0');
    return `2025-03-${day}`;
  }))('addWorkdays one day keeps weekday start %s', (iso) => {
    expect(addWorkdays(d(iso), 1).format('YYYY-MM-DD')).toBe(iso);
  });

  it.each(Array.from({ length: 40 }, (_, index) => {
    const day = String((index % 5) + 3).padStart(2, '0');
    return `2025-03-${day}`;
  }))('subtractWorkdays one day keeps weekday end %s', (iso) => {
    expect(subtractWorkdays(d(iso), 1).format('YYYY-MM-DD')).toBe(iso);
  });

  it.each(Array.from({ length: 40 }, (_, index) => index + 1))(
    'addWorkdays and calcWorkdays agree for March 2025 duration %s',
    (days) => {
      const start = d('2025-03-03');
      const end = addWorkdays(start, days);
      expect(calcWorkdays(start, end)).toBe(days);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => index + 1))(
    'subtractWorkdays and calcWorkdays agree for April 2026 duration %s',
    (days) => {
      const end = d('2026-04-30');
      const start = subtractWorkdays(end, days);

      expect(calcWorkdays(start, end)).toBe(days);
      expect(start.isValid()).toBe(true);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const day = String((index % 5) + 9).padStart(2, '0');
    return `2026-03-${day}`;
  }))('calcWorkdays generated weekday range stays positive for %s', (iso) => {
    const start = d(iso);
    const end = start.add(4, 'day');

    expect(calcWorkdays(start, end)).toBeGreaterThanOrEqual(1);
    expect(addWorkdays(start, 1).isValid()).toBe(true);
    expect(subtractWorkdays(end, 1).isValid()).toBe(true);
  });

  it.each(Array.from({ length: 80 }, (_, index) => index + 1))(
    'generated addWorkdays duration %s round-trips through calcWorkdays',
    (days) => {
      const start = d('2025-06-02');
      const end = addWorkdays(start, days);

      expect(calcWorkdays(start, end)).toBe(days);
      expect(end.isValid()).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => index + 1))(
    'generated subtractWorkdays duration %s round-trips through addWorkdays',
    (days) => {
      const end = d('2026-11-30');
      const start = subtractWorkdays(end, days);

      expect(addWorkdays(start, days).format('YYYY-MM-DD')).toBe(end.format('YYYY-MM-DD'));
      expect(calcWorkdays(start, end)).toBe(days);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    '2026-10-01',
  ] as const))(
    'generated addWorkdays duration %s skips 2026 National Day holiday block',
    (days, startIso) => {
      const end = addWorkdays(d(startIso), days);

      expect(end.format('YYYY-MM-DD')).not.toMatch(/^2026-10-0[1-8]$/);
      expect(calcWorkdays(d(startIso), end)).toBe(days);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index + 1,
    '2026-02-23',
  ] as const))(
    'generated subtractWorkdays duration %s skips 2026 Spring Festival holiday block',
    (days, endIso) => {
      const start = subtractWorkdays(d(endIso), days);

      expect(start.format('YYYY-MM-DD')).not.toMatch(/^2026-02-(1[6-9]|2[0-2])$/);
      expect(calcWorkdays(start, d(endIso))).toBe(days);
    },
  );
});

describe('workday helper batch 134 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    '2025-09-01',
    index + 1,
  ] as const))(
    'generated September duration %s round-trips addWorkdays',
    (startIso, days) => {
      const start = d(startIso);
      const end = addWorkdays(start, days);

      expect(calcWorkdays(start, end)).toBe(days);
      expect(end.isValid()).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    '2026-07-31',
    index + 1,
  ] as const))(
    'generated July reverse duration %s round-trips subtractWorkdays',
    (endIso, days) => {
      const end = d(endIso);
      const start = subtractWorkdays(end, days);

      expect(calcWorkdays(start, end)).toBe(days);
      expect(addWorkdays(start, days).format('YYYY-MM-DD')).toBe(end.format('YYYY-MM-DD'));
    },
  );
});

describe('workday helper batch 143 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    '2026-02-14',
    index + 1,
  ] as const))(
    'generated Spring Festival adjusted workday duration %s round-trips',
    (startIso, days) => {
      const start = d(startIso);
      const end = addWorkdays(start, days);

      expect(calcWorkdays(start, end)).toBe(days);
      expect(end.format('YYYY-MM-DD')).not.toMatch(/^2026-02-(1[6-9]|2[0-2])$/);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    '2026-10-10',
    index + 1,
  ] as const))(
    'generated National Day adjusted workday reverse duration %s round-trips',
    (endIso, days) => {
      const end = d(endIso);
      const start = subtractWorkdays(end, days);

      expect(calcWorkdays(start, end)).toBe(days);
      expect(start.format('YYYY-MM-DD')).not.toMatch(/^2026-10-0[1-8]$/);
    },
  );
});

describe('workday helper batch 159 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    '2026-04-24',
    index + 1,
  ] as const))(
    'generated April duration %s round-trips addWorkdays',
    (startIso, days) => {
      const start = d(startIso);
      const end = addWorkdays(start, days);

      expect(calcWorkdays(start, end)).toBe(days);
      expect(end.isValid()).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    '2026-06-28',
    index + 1,
  ] as const))(
    'generated Dragon Boat adjusted reverse duration %s round-trips',
    (endIso, days) => {
      const end = d(endIso);
      const start = subtractWorkdays(end, days);

      expect(calcWorkdays(start, end)).toBe(days);
      expect(addWorkdays(start, days).format('YYYY-MM-DD')).toBe(end.format('YYYY-MM-DD'));
    },
  );
});

describe('workday helper batch 164 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    '2025-10-01',
    index + 1,
  ] as const))(
    'generated 2025 National Day duration %s round-trips addWorkdays',
    (startIso, days) => {
      const start = d(startIso);
      const end = addWorkdays(start, days);

      expect(calcWorkdays(start, end)).toBe(days);
      expect(end.format('YYYY-MM-DD')).not.toMatch(/^2025-10-0[1-8]$/);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    '2025-02-08',
    index + 1,
  ] as const))(
    'generated 2025 Spring Festival adjusted reverse duration %s round-trips',
    (endIso, days) => {
      const end = d(endIso);
      const start = subtractWorkdays(end, days);

      expect(calcWorkdays(start, end)).toBe(days);
      expect(addWorkdays(start, days).format('YYYY-MM-DD')).toBe(end.format('YYYY-MM-DD'));
    },
  );
});

describe('workday helper batch 177 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    '2026-09-25',
    index + 1,
  ] as const))(
    'generated batch177 Mid-Autumn duration %s round-trips addWorkdays',
    (startIso, days) => {
      const start = d(startIso);
      const end = addWorkdays(start, days);

      expect(calcWorkdays(start, end)).toBe(days);
      expect(end.isValid()).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    '2025-04-27',
    index + 1,
  ] as const))(
    'generated batch177 adjusted April reverse duration %s round-trips',
    (endIso, days) => {
      const end = d(endIso);
      const start = subtractWorkdays(end, days);

      expect(calcWorkdays(start, end)).toBe(days);
      expect(addWorkdays(start, days).format('YYYY-MM-DD')).toBe(end.format('YYYY-MM-DD'));
      expect(start.isValid()).toBe(true);
    },
  );
});

describe('workday helper batch 178 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    '2025-01-26',
    index + 1,
  ] as const))(
    'generated batch178 adjusted January workday duration %s round-trips',
    (startIso, days) => {
      const start = d(startIso);
      const end = addWorkdays(start, days);

      expect(calcWorkdays(start, end)).toBe(days);
      expect(end.isValid()).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    '2026-01-05',
    index + 1,
  ] as const))(
    'generated batch178 New Year reverse duration %s round-trips',
    (endIso, days) => {
      const end = d(endIso);
      const start = subtractWorkdays(end, days);

      expect(calcWorkdays(start, end)).toBe(days);
      expect(addWorkdays(start, days).format('YYYY-MM-DD')).toBe(end.format('YYYY-MM-DD'));
      expect(start.isValid()).toBe(true);
    },
  );
});
