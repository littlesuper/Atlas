import { describe, it, expect } from 'vitest';
import { computeSortOrder } from './helpers';

// computeSortOrder 用 Math.floor((prev + next) / 2) 算插入位的 sortOrder。
// 对「相邻整数」的稠密 sortOrder（seed/服务端默认 sortOrder||0 都会产出稠密/0 值），
// floor 平均会塌缩到下界 → 新值与 prev 冲突，破坏排序。

describe('computeSortOrder (GLM QA bug repro #9)', () => {
  it('相邻整数 sortOrder 之间插入，新值不得等于 prev 或 next（floor 平均会塌缩到下界）', () => {
    // 现有 sortOrder 为相邻整数 [1,2,3]；在 index 1（1 和 2 之间）插入。
    // 期望：新 sortOrder 严格大于 prev(1) 且严格小于 next(2)，保证不破坏排序。
    // 现状：Math.floor((1+2)/2)=1 → 等于 prev，新活动与 sortOrder=1 的活动抢位 → 顺序错乱。
    const activities = [{ sortOrder: 1 }, { sortOrder: 2 }, { sortOrder: 3 }];
    const result = computeSortOrder(activities, 1);
    expect(result).toBeGreaterThan(1);
    expect(result).toBeLessThan(2);
  });

  it('两端为 0 的退化情况：index 0 且首项 sortOrder=0 时，新值不得与首项冲突', () => {
    // 服务端默认 sortOrder||0 → 实际数据里 sortOrder=0 很常见。
    // activities[0].sortOrder=0；index 0：prev=0（atIndex>0? 否 → 0），next=activities[0].sortOrder=0。
    // Math.floor((0+0)/2)=0 → 新值=0，与现有 sortOrder=0 的活动冲突。
    const activities = [{ sortOrder: 0 }, { sortOrder: 10 }, { sortOrder: 20 }];
    const result = computeSortOrder(activities, 0);
    expect(result).toBeGreaterThan(0);
  });
});
