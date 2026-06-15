import { describe, it, expect, vi } from 'vitest';

// 适配器经 db 间接依赖 prisma；测试只验证注册，mock 掉 db 即可
vi.mock('../../db', () => ({ default: {}, prisma: {} }));

import './bootstrap'; // 触发注册
import { listDomains, getAdapter } from './registry';

describe('assistant bootstrap', () => {
  it('has no remaining adapters (all migrated to capability layer)', () => {
    const domains = listDomains();
    // schedule → schedule.update (Task 2)
    // project → project.update (Task 3)
    // risk → risk.update (Task 4)
    // This whole bootstrap.ts will be deleted in Task 5
    expect(domains).toHaveLength(0);
  });

  it('every registered adapter declares domain/description/permission (classifier+route depend on it)', () => {
    for (const d of listDomains()) {
      const a = getAdapter(d)!;
      expect(a.domain).toBe(d);
      expect(typeof a.description).toBe('string');
      expect(a.description.length).toBeGreaterThan(0);
      expect(a.permission.resource).toBeTruthy();
      expect(a.permission.action).toBeTruthy();
    }
  });
});
