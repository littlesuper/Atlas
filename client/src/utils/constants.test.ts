import { describe, it, expect } from 'vitest';
import {
  STATUS_MAP,
  PRIORITY_MAP,
  ACTIVITY_STATUS_MAP,
  ACTIVITY_TYPE_MAP,
  PRODUCT_LINE_MAP,
  PRODUCT_CATEGORY_MAP,
  PRODUCT_STATUS_MAP,
  PROGRESS_STATUS_MAP,
  REPORT_STATUS_MAP,
  RISK_LEVEL_MAP,
  USER_STATUS_MAP,
} from './constants';

// ===== 映射结构辅助断言 =====
function assertMapEntry(map: Record<string, { label: string; color: string }>, key: string) {
  expect(map).toHaveProperty(key);
  expect(typeof map[key].label).toBe('string');
  expect(map[key].label.length).toBeGreaterThan(0);
  expect(typeof map[key].color).toBe('string');
}

// ============ STATUS_MAP（项目状态）============

describe('STATUS_MAP', () => {
  const keys = ['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'] as const;

  it('包含所有 4 个项目状态', () => {
    expect(Object.keys(STATUS_MAP)).toHaveLength(4);
  });

  keys.forEach((key) => {
    it(`${key} 有正确的 label 和 color`, () => {
      assertMapEntry(STATUS_MAP, key);
    });
  });

  it('PLANNING 标签为"规划中"', () => {
    expect(STATUS_MAP.PLANNING.label).toBe('规划中');
  });

  it('IN_PROGRESS 颜色为 green', () => {
    expect(STATUS_MAP.IN_PROGRESS.color).toBe('green');
  });
});

// ============ PRIORITY_MAP（优先级）============

describe('PRIORITY_MAP', () => {
  const keys = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

  it('包含所有 4 个优先级', () => {
    expect(Object.keys(PRIORITY_MAP)).toHaveLength(4);
  });

  keys.forEach((key) => {
    it(`${key} 有正确的 label 和 color`, () => {
      assertMapEntry(PRIORITY_MAP, key);
    });
  });

  it('CRITICAL 标签为"紧急"', () => {
    expect(PRIORITY_MAP.CRITICAL.label).toBe('紧急');
  });

  it('CRITICAL 颜色为 red', () => {
    expect(PRIORITY_MAP.CRITICAL.color).toBe('red');
  });

  it('LOW 颜色为 gray', () => {
    expect(PRIORITY_MAP.LOW.color).toBe('gray');
  });
});

// ============ ACTIVITY_STATUS_MAP（活动状态）============

describe('ACTIVITY_STATUS_MAP', () => {
  const keys = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'CANCELLED'] as const;

  it('包含所有 5 个活动状态', () => {
    expect(Object.keys(ACTIVITY_STATUS_MAP)).toHaveLength(5);
  });

  keys.forEach((key) => {
    it(`${key} 有正确的 label 和 color`, () => {
      assertMapEntry(ACTIVITY_STATUS_MAP, key);
    });
  });

  it('COMPLETED 颜色为 green', () => {
    expect(ACTIVITY_STATUS_MAP.COMPLETED.color).toBe('green');
  });

  it('DELAYED 颜色为 red', () => {
    expect(ACTIVITY_STATUS_MAP.DELAYED.color).toBe('red');
  });
});

// ============ ACTIVITY_TYPE_MAP（活动类型）============

describe('ACTIVITY_TYPE_MAP', () => {
  it('包含 MILESTONE、TASK、PHASE 三种类型', () => {
    expect(Object.keys(ACTIVITY_TYPE_MAP)).toHaveLength(3);
    expect(ACTIVITY_TYPE_MAP).toHaveProperty('MILESTONE');
    expect(ACTIVITY_TYPE_MAP).toHaveProperty('TASK');
    expect(ACTIVITY_TYPE_MAP).toHaveProperty('PHASE');
  });

  it('MILESTONE 标签为"里程碑"，颜色为 purple', () => {
    expect(ACTIVITY_TYPE_MAP.MILESTONE.label).toBe('里程碑');
    expect(ACTIVITY_TYPE_MAP.MILESTONE.color).toBe('purple');
  });
});

// ============ PRODUCT_LINE_MAP（产品线）============

describe('PRODUCT_LINE_MAP', () => {
  it('包含 DANDELION 和 SUNFLOWER', () => {
    expect(PRODUCT_LINE_MAP).toHaveProperty('DANDELION');
    expect(PRODUCT_LINE_MAP).toHaveProperty('SUNFLOWER');
  });

  it('DANDELION 标签为"蒲公英"', () => {
    expect(PRODUCT_LINE_MAP.DANDELION.label).toBe('蒲公英');
  });

  it('SUNFLOWER 颜色为 orange', () => {
    expect(PRODUCT_LINE_MAP.SUNFLOWER.color).toBe('orange');
  });
});

// ============ PRODUCT_CATEGORY_MAP（产品类别）============

describe('PRODUCT_CATEGORY_MAP', () => {
  const keys = ['ROUTER', 'GATEWAY', 'REMOTE_CONTROL', 'ACCESSORY', 'OTHER'] as const;

  it('包含所有 5 个产品类别', () => {
    expect(Object.keys(PRODUCT_CATEGORY_MAP)).toHaveLength(5);
  });

  keys.forEach((key) => {
    it(`${key} 有正确结构`, () => {
      assertMapEntry(PRODUCT_CATEGORY_MAP, key);
    });
  });
});

// ============ PRODUCT_STATUS_MAP（产品状态）============

describe('PRODUCT_STATUS_MAP', () => {
  it('包含 DEVELOPING、PRODUCTION、DISCONTINUED', () => {
    expect(Object.keys(PRODUCT_STATUS_MAP)).toHaveLength(3);
  });

  it('PRODUCTION 颜色为 green', () => {
    expect(PRODUCT_STATUS_MAP.PRODUCTION.color).toBe('green');
  });
});

// ============ PROGRESS_STATUS_MAP（周报进展状态）============

describe('PROGRESS_STATUS_MAP', () => {
  it('包含 ON_TRACK、MINOR_ISSUE、MAJOR_ISSUE', () => {
    expect(PROGRESS_STATUS_MAP).toHaveProperty('ON_TRACK');
    expect(PROGRESS_STATUS_MAP).toHaveProperty('MINOR_ISSUE');
    expect(PROGRESS_STATUS_MAP).toHaveProperty('MAJOR_ISSUE');
  });

  it('ON_TRACK 标签为"正常"，颜色为 green', () => {
    expect(PROGRESS_STATUS_MAP.ON_TRACK.label).toBe('正常');
    expect(PROGRESS_STATUS_MAP.ON_TRACK.color).toBe('green');
  });

  it('MAJOR_ISSUE 颜色为 red', () => {
    expect(PROGRESS_STATUS_MAP.MAJOR_ISSUE.color).toBe('red');
  });
});

// ============ REPORT_STATUS_MAP（周报状态）============

describe('REPORT_STATUS_MAP', () => {
  it('包含 DRAFT、SUBMITTED、ARCHIVED', () => {
    expect(REPORT_STATUS_MAP).toHaveProperty('DRAFT');
    expect(REPORT_STATUS_MAP).toHaveProperty('SUBMITTED');
    expect(REPORT_STATUS_MAP).toHaveProperty('ARCHIVED');
  });

  it('DRAFT 标签为"草稿"', () => {
    expect(REPORT_STATUS_MAP.DRAFT.label).toBe('草稿');
  });
});

// ============ RISK_LEVEL_MAP（风险等级）============

describe('RISK_LEVEL_MAP', () => {
  it('包含 LOW、MEDIUM、HIGH、CRITICAL', () => {
    expect(Object.keys(RISK_LEVEL_MAP)).toHaveLength(4);
  });

  it('HIGH 和 CRITICAL 均为红色', () => {
    expect(RISK_LEVEL_MAP.HIGH.color).toBe('red');
    expect(RISK_LEVEL_MAP.CRITICAL.color).toBe('red');
  });

  it('LOW 颜色为 green', () => {
    expect(RISK_LEVEL_MAP.LOW.color).toBe('green');
  });
});

// ============ USER_STATUS_MAP（用户状态）============

describe('USER_STATUS_MAP', () => {
  it('包含 ACTIVE 和 DISABLED', () => {
    expect(USER_STATUS_MAP).toHaveProperty('ACTIVE');
    expect(USER_STATUS_MAP).toHaveProperty('DISABLED');
  });

  it('ACTIVE 颜色为 green，DISABLED 颜色为 red', () => {
    expect(USER_STATUS_MAP.ACTIVE.color).toBe('green');
    expect(USER_STATUS_MAP.DISABLED.color).toBe('red');
  });
});
