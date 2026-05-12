import { describe, it, expect } from 'vitest';
import {
  isValidProjectStatus,
  isValidPriority,
  isValidDateRange,
  isValidProgress,
  isValidProductStatus,
  isValidProductCategory,
  isValidProductStatusTransition,
} from './validation';

describe('isValidProjectStatus', () => {
  it.each(['IN_PROGRESS', 'COMPLETED', 'ON_HOLD'])(
    '接受有效值 %s',
    (status) => {
      expect(isValidProjectStatus(status)).toBe(true);
    }
  );

  it('拒绝 CANCELLED', () => {
    expect(isValidProjectStatus('CANCELLED')).toBe(false);
  });

  it('拒绝空字符串', () => {
    expect(isValidProjectStatus('')).toBe(false);
  });

  it('拒绝随机字符串', () => {
    expect(isValidProjectStatus('RANDOM')).toBe(false);
  });
});

describe('validation batch 172 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 0 : 100,
  ] as const))(
    'accepts generated progress boundary value %#',
    (progress) => {
      expect(isValidProgress(progress)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['DEVELOPING', 'PRODUCTION', 'DISCONTINUED'][index % 3],
    ['OTHER', 'ACCESSORY', 'REMOTE_CONTROL', 'GATEWAY', 'ROUTER'][index % 5],
  ] as const))(
    'accepts generated batch172 valid product enum %s/%s',
    (status, category) => {
      expect(isValidProductStatus(status)).toBe(true);
      expect(isValidProductCategory(category)).toBe(true);
    },
  );
});

describe('isValidPriority', () => {
  it.each(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])(
    '接受有效值 %s',
    (priority) => {
      expect(isValidPriority(priority)).toBe(true);
    }
  );

  it('拒绝空字符串', () => {
    expect(isValidPriority('')).toBe(false);
  });

  it('拒绝随机字符串', () => {
    expect(isValidPriority('URGENT')).toBe(false);
  });

  it('拒绝小写', () => {
    expect(isValidPriority('low')).toBe(false);
  });
});

describe('isValidDateRange', () => {
  it('结束日期晚于开始日期为真', () => {
    expect(isValidDateRange('2026-01-01', '2026-12-31')).toBe(true);
  });

  it('结束日期等于开始日期为真', () => {
    expect(isValidDateRange('2026-06-15', '2026-06-15')).toBe(true);
  });

  it('结束日期早于开始日期为假', () => {
    expect(isValidDateRange('2026-12-31', '2026-01-01')).toBe(false);
  });
});

describe('isValidProgress', () => {
  it('0 为真', () => {
    expect(isValidProgress(0)).toBe(true);
  });

  it('50 为真', () => {
    expect(isValidProgress(50)).toBe(true);
  });

  it('100 为真', () => {
    expect(isValidProgress(100)).toBe(true);
  });

  it('-1 为假', () => {
    expect(isValidProgress(-1)).toBe(false);
  });

  it('101 为假', () => {
    expect(isValidProgress(101)).toBe(false);
  });

  it('NaN 为假', () => {
    expect(isValidProgress(NaN)).toBe(false);
  });
});

describe('isValidProductStatus', () => {
  it.each(['DEVELOPING', 'PRODUCTION', 'DISCONTINUED'])(
    '接受有效值 %s',
    (status) => {
      expect(isValidProductStatus(status)).toBe(true);
    }
  );

  it('拒绝空字符串', () => {
    expect(isValidProductStatus('')).toBe(false);
  });

  it('拒绝随机字符串', () => {
    expect(isValidProductStatus('ACTIVE')).toBe(false);
  });

  it('拒绝小写', () => {
    expect(isValidProductStatus('developing')).toBe(false);
  });
});

describe('isValidProductCategory', () => {
  it.each(['ROUTER', 'GATEWAY', 'REMOTE_CONTROL', 'ACCESSORY', 'OTHER'])(
    '接受有效值 %s',
    (category) => {
      expect(isValidProductCategory(category)).toBe(true);
    }
  );

  it('拒绝空字符串', () => {
    expect(isValidProductCategory('')).toBe(false);
  });

  it('拒绝随机字符串', () => {
    expect(isValidProductCategory('SENSOR')).toBe(false);
  });
});

describe('isValidProductStatusTransition', () => {
  it('DEVELOPING → PRODUCTION 允许', () => {
    expect(isValidProductStatusTransition('DEVELOPING', 'PRODUCTION')).toBe(true);
  });

  it('DEVELOPING → DEVELOPING 允许（相同状态）', () => {
    expect(isValidProductStatusTransition('DEVELOPING', 'DEVELOPING')).toBe(true);
  });

  it('PRODUCTION → DISCONTINUED 允许', () => {
    expect(isValidProductStatusTransition('PRODUCTION', 'DISCONTINUED')).toBe(true);
  });

  it('PRODUCTION → DEVELOPING 拒绝（不可逆）', () => {
    expect(isValidProductStatusTransition('PRODUCTION', 'DEVELOPING')).toBe(false);
  });

  it('DISCONTINUED → PRODUCTION 拒绝（不可逆）', () => {
    expect(isValidProductStatusTransition('DISCONTINUED', 'PRODUCTION')).toBe(false);
  });

  it('isValidDateRange returns true for same start and end date', () => {
    expect(isValidDateRange('2026-01-01', '2026-01-01')).toBe(true);
  });

  it('isValidDateRange returns false for end before start', () => { expect(isValidDateRange('2026-12-31', '2026-01-01')).toBe(false); });

  it('isValidProgress returns false for negative value', () => { expect(isValidProgress(-1)).toBe(false); });

  it('isValidProgress returns true for zero', () => { expect(isValidProgress(0)).toBe(true); });

  it('isValidProgress returns false for value above 100', () => { expect(isValidProgress(101)).toBe(false); });

  it('isValidProgress returns false for negative value', () => { expect(isValidProgress(-1)).toBe(false); });

  it('isValidProgress returns true for boundary value 0', () => { expect(isValidProgress(0)).toBe(true); });

  it('isValidProgress returns false for negative value', () => { expect(isValidProgress(-1)).toBe(false); });
});

describe('validation boundary matrices', () => {
  it.each(Array.from({ length: 48 }, (_, index) => `UNKNOWN_PROJECT_STATUS_${index}`))(
    '拒绝未知项目状态 %s',
    (status) => {
      expect(isValidProjectStatus(status)).toBe(false);
    }
  );

  it.each(Array.from({ length: 48 }, (_, index) => `URGENT_PRIORITY_${index}`))(
    '拒绝未知优先级 %s',
    (priority) => {
      expect(isValidPriority(priority)).toBe(false);
    }
  );

  it.each(Array.from({ length: 48 }, (_, index) => `PRODUCT_STATE_${index}`))(
    '拒绝未知产品状态 %s',
    (status) => {
      expect(isValidProductStatus(status)).toBe(false);
    }
  );

  it.each(Array.from({ length: 48 }, (_, index) => `PRODUCT_CATEGORY_${index}`))(
    '拒绝未知产品类别 %s',
    (category) => {
      expect(isValidProductCategory(category)).toBe(false);
    }
  );

  it.each([
    Number.NEGATIVE_INFINITY,
    -1000,
    -100,
    -0.1,
    100.1,
    1000,
    Number.MAX_SAFE_INTEGER,
    Number.POSITIVE_INFINITY,
    ...Array.from({ length: 56 }, (_, index) => 101 + index),
  ])('拒绝非法进度值 %s', (progress) => {
    expect(isValidProgress(progress)).toBe(false);
  });

  it.each([
    0,
    0.1,
    1,
    50,
    99.9,
    100,
    ...Array.from({ length: 55 }, (_, index) => index + 1),
  ])('接受合法进度值 %s', (progress) => {
    expect(isValidProgress(progress)).toBe(true);
  });

  it.each(Array.from({ length: 48 }, (_, index) => [`2026-12-${String((index % 28) + 1).padStart(2, '0')}`, `2026-01-${String((index % 28) + 1).padStart(2, '0')}`]))(
    '拒绝结束日期早于开始日期 %s -> %s',
    (start, end) => {
      expect(isValidDateRange(start, end)).toBe(false);
    }
  );

  it.each(Array.from({ length: 48 }, (_, index) => [`2026-01-${String((index % 28) + 1).padStart(2, '0')}`, `2026-12-${String((index % 28) + 1).padStart(2, '0')}`]))(
    '接受结束日期晚于开始日期 %s -> %s',
    (start, end) => {
      expect(isValidDateRange(start, end)).toBe(true);
    }
  );

  it.each(Array.from({ length: 48 }, (_, index) => [`UNKNOWN_${index}`, 'PRODUCTION']))(
    '拒绝未知来源状态流转 %s -> %s',
    (from, to) => {
      expect(isValidProductStatusTransition(from, to)).toBe(false);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => {
    const transitions = [
      ['DEVELOPING', 'DEVELOPING'],
      ['DEVELOPING', 'PRODUCTION'],
      ['PRODUCTION', 'PRODUCTION'],
      ['PRODUCTION', 'DISCONTINUED'],
      ['DISCONTINUED', 'DISCONTINUED'],
    ] as const;
    return transitions[index % transitions.length];
  }))(
    '接受生成的合法产品状态流转 %s -> %s',
    (from, to) => {
      expect(isValidProductStatusTransition(from, to)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2026-05-${String((index % 28) + 1).padStart(2, '0')}T23:59:59`,
    `2026-05-${String((index % 28) + 1).padStart(2, '0')}T00:00:00`,
  ] as const))(
    '同一天不同时间生成范围 %s -> %s 仍为非法',
    (start, end) => {
      expect(isValidDateRange(start, end)).toBe(false);
    },
  );
});

describe('validation batch 130 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    ['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ARCHIVED'][index % 4],
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][index % 4],
  ] as const))(
    '接受生成的项目状态和优先级 %s/%s',
    (status, priority) => {
      expect(isValidProjectStatus(status)).toBe(true);
      expect(isValidPriority(priority)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2027-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 20) + 1).padStart(2, '0')}T00:00:00.000Z`,
    `2027-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 20) + 1).padStart(2, '0')}T00:00:00.001Z`,
  ] as const))(
    '接受生成的毫秒级合法日期范围 %s -> %s',
    (start, end) => {
      expect(isValidDateRange(start, end)).toBe(true);
    },
  );
});

describe('validation batch 163 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    ['in_progress', 'completed', 'on_hold', 'archived'][index % 4],
    ['low', 'medium', 'high', 'critical'][index % 4],
  ] as const))(
    'rejects generated lowercase project status and priority %s/%s',
    (status, priority) => {
      expect(isValidProjectStatus(status)).toBe(false);
      expect(isValidPriority(priority)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['ROUTER', 'GATEWAY', 'REMOTE_CONTROL', 'ACCESSORY', 'OTHER'][index % 5],
    ['DEVELOPING', 'PRODUCTION', 'DISCONTINUED'][index % 3],
  ] as const))(
    'accepts generated valid product category and status %s/%s',
    (category, status) => {
      expect(isValidProductCategory(category)).toBe(true);
      expect(isValidProductStatus(status)).toBe(true);
    },
  );
});
