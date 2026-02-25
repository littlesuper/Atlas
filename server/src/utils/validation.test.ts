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
});
