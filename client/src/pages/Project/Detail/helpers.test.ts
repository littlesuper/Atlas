import { describe, it, expect } from 'vitest';
import { planInsertSortOrder } from './helpers';

// planInsertSortOrder 是 computeSortOrder（floor 平均在稠密序列上塌缩到下界）的根治替代品。
// 契约：
//   planInsertSortOrder(activities: { id; sortOrder }[], atIndex)
//     => { newSortOrder: number; reindex: { id; sortOrder }[] }
//   STEP = 10。有空隙则取中点、不重排；稠密/0 值则把全部重排成 (i+1)*STEP 的等距序列。
// 本文件为 test-first：函数尚未实现 → 下面所有用例应红（planInsertSortOrder 为 undefined）。

type Act = { id: string; sortOrder: number };
type Plan = { newSortOrder: number; reindex: { id: string; sortOrder: number }[] };

const sortById = (arr: { id: string; sortOrder: number }[]) =>
  [...arr].sort((a, b) => a.id.localeCompare(b.id));

describe('planInsertSortOrder (test-first, 应红)', () => {
  it('有空隙不重排：[{a,10},{b,30}] @1 → newSortOrder=20, reindex=[]', () => {
    const plan = planInsertSortOrder([{ id: 'a', sortOrder: 10 }, { id: 'b', sortOrder: 30 }], 1) as Plan;
    expect(plan.newSortOrder).toBe(20);
    expect(plan.reindex).toEqual([]);
  });

  it('末尾追加：[{a,10}] @1 → newSortOrder=20, reindex=[]', () => {
    const plan = planInsertSortOrder([{ id: 'a', sortOrder: 10 }], 1) as Plan;
    expect(plan.newSortOrder).toBe(20);
    expect(plan.reindex).toEqual([]);
  });

  it('开头有余量：[{a,40}] @0 → newSortOrder=20, reindex=[]', () => {
    const plan = planInsertSortOrder([{ id: 'a', sortOrder: 40 }], 0) as Plan;
    expect(plan.newSortOrder).toBe(20);
    expect(plan.reindex).toEqual([]);
  });

  it('空列表：[] @0 → newSortOrder=10, reindex=[]', () => {
    const plan = planInsertSortOrder([], 0) as Plan;
    expect(plan.newSortOrder).toBe(10);
    expect(plan.reindex).toEqual([]);
  });

  it('稠密重排（核心）：[{a,1},{b,2},{c,3}] @1 → newSortOrder=20，reindex 使 a/b/c=10/30/40', () => {
    const plan = planInsertSortOrder(
      [{ id: 'a', sortOrder: 1 }, { id: 'b', sortOrder: 2 }, { id: 'c', sortOrder: 3 }],
      1,
    ) as Plan;
    expect(plan.newSortOrder).toBe(20);
    // 最终顺序 a, 新(20), b, c → a=10, b=30, c=40
    expect(sortById(plan.reindex)).toEqual(
      sortById([{ id: 'a', sortOrder: 10 }, { id: 'b', sortOrder: 30 }, { id: 'c', sortOrder: 40 }]),
    );
  });

  it('0 值开头重排：[{a,0},{b,10},{c,20}] @0 → newSortOrder=10，reindex 使 a/b/c=20/30/40', () => {
    const plan = planInsertSortOrder(
      [{ id: 'a', sortOrder: 0 }, { id: 'b', sortOrder: 10 }, { id: 'c', sortOrder: 20 }],
      0,
    ) as Plan;
    expect(plan.newSortOrder).toBe(10);
    // 最终顺序 新(10), a, b, c → a=20, b=30, c=40
    expect(sortById(plan.reindex)).toEqual(
      sortById([{ id: 'a', sortOrder: 20 }, { id: 'b', sortOrder: 30 }, { id: 'c', sortOrder: 40 }]),
    );
  });

  it('通用不变量：newSortOrder 与所有最终 sortOrder 互不相同、均为正整数、保持原相对顺序', () => {
    // 把 plan 应用回去得到最终序列（含占位新活动 __NEW__），校验唯一/正/保序
    const applyPlan = (acts: Act[], atIndex: number, plan: Plan) => {
      const seq = [...acts];
      seq.splice(atIndex, 0, { id: '__NEW__', sortOrder: plan.newSortOrder });
      const m = new Map(plan.reindex.map((r) => [r.id, r.sortOrder]));
      return seq.map((a) => ({ id: a.id, sortOrder: m.get(a.id) ?? a.sortOrder }));
    };

    const cases: Array<{ acts: Act[]; atIndex: number }> = [
      { acts: [{ id: 'a', sortOrder: 10 }, { id: 'b', sortOrder: 30 }], atIndex: 1 },
      { acts: [{ id: 'a', sortOrder: 1 }, { id: 'b', sortOrder: 2 }, { id: 'c', sortOrder: 3 }], atIndex: 1 },
      { acts: [{ id: 'a', sortOrder: 0 }, { id: 'b', sortOrder: 10 }, { id: 'c', sortOrder: 20 }], atIndex: 0 },
    ];

    for (const { acts, atIndex } of cases) {
      const plan = planInsertSortOrder(acts, atIndex) as Plan;
      const final = applyPlan(acts, atIndex, plan);

      // 均为正整数
      expect(final.every((x) => Number.isInteger(x.sortOrder) && x.sortOrder > 0)).toBe(true);
      // 互不相同
      const orders = final.map((x) => x.sortOrder);
      expect(new Set(orders).size).toBe(orders.length);
      // 按 sortOrder 升序后，去掉 __NEW__，其余保持原相对顺序
      const ordered = [...final].sort((a, b) => a.sortOrder - b.sortOrder);
      const withoutNew = ordered.filter((x) => x.id !== '__NEW__').map((x) => x.id);
      expect(withoutNew).toEqual(acts.map((a) => a.id));
    }
  });
});
