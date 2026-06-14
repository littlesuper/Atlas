import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    activity: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    riskItem: { findMany: vi.fn() },
  },
}));
vi.mock('../../../db', () => ({ default: mockPrisma, prisma: mockPrisma }));
// 用真实工作日历计算，但避免节假日缓存依赖：mock calculateWorkdays 为简单工作日计数
vi.mock('../../../utils/workday', () => ({
  calculateWorkdays: (s: Date, e: Date) => {
    let n = 0;
    const cur = new Date(s);
    while (cur <= e) {
      const day = cur.getUTCDay();
      if (day !== 0 && day !== 6) n++;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return n;
  },
}));

import { computePhaseDuration, computeProjectTimeline, computeRiskSummary, computeOverdueCount } from './queryCompute';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

beforeEach(() => vi.clearAllMocks());

describe('computePhaseDuration', () => {
  it('found=false when no activities of that phase', async () => {
    mockPrisma.activity.findMany.mockResolvedValueOnce([]);
    const r = await computePhaseDuration('p1', 'EVT');
    expect(r.found).toBe(false);
  });

  it('uses ACTUAL dates + spans min start → max end when all activities have actual dates', async () => {
    mockPrisma.activity.findMany.mockResolvedValueOnce([
      { planStartDate: d('2025-10-01'), planEndDate: d('2025-12-15'), startDate: d('2025-10-06'), endDate: d('2025-10-10') },
      { planStartDate: d('2025-10-01'), planEndDate: d('2025-12-15'), startDate: d('2025-10-13'), endDate: d('2025-10-17') },
    ]);
    const r = await computePhaseDuration('p1', 'evt'); // lowercase → uppercased
    expect(r.found).toBe(true);
    expect(r.phase).toBe('EVT');
    expect(r.basis).toBe('actual');
    expect(r.start).toBe('2025-10-06');
    expect(r.end).toBe('2025-10-17');
    // 2025-10-06(Mon) .. 2025-10-17(Fri) = 10 workdays
    expect(r.workdays).toBe(10);
  });

  it('falls back to PLAN dates when actual incomplete', async () => {
    mockPrisma.activity.findMany.mockResolvedValueOnce([
      { planStartDate: d('2025-10-06'), planEndDate: d('2025-10-10'), startDate: null, endDate: null },
    ]);
    const r = await computePhaseDuration('p1', 'EVT');
    expect(r.basis).toBe('plan');
    expect(r.workdays).toBe(5);
  });

  it('workdays null when no usable dates', async () => {
    mockPrisma.activity.findMany.mockResolvedValueOnce([
      { planStartDate: null, planEndDate: null, startDate: null, endDate: null },
    ]);
    const r = await computePhaseDuration('p1', 'EVT');
    expect(r.found).toBe(true);
    expect(r.workdays).toBeNull();
  });
});

describe('computeProjectTimeline', () => {
  it('returns start/end + workdays', async () => {
    mockPrisma.project.findUnique.mockResolvedValueOnce({ startDate: d('2025-10-06'), endDate: d('2025-10-10') });
    const r = await computeProjectTimeline('p1');
    expect(r.start).toBe('2025-10-06');
    expect(r.workdays).toBe(5);
  });
  it('null workdays when dates missing', async () => {
    mockPrisma.project.findUnique.mockResolvedValueOnce({ startDate: null, endDate: null });
    expect((await computeProjectTimeline('p1')).workdays).toBeNull();
  });
});

describe('computeRiskSummary', () => {
  it('counts by severity + open', async () => {
    mockPrisma.riskItem.findMany.mockResolvedValueOnce([
      { severity: 'HIGH', status: 'OPEN' },
      { severity: 'HIGH', status: 'RESOLVED' },
      { severity: 'LOW', status: 'IN_PROGRESS' },
    ]);
    const r = await computeRiskSummary('p1');
    expect(r.total).toBe(3);
    expect(r.bySeverity.HIGH).toBe(2);
    expect(r.open).toBe(2); // OPEN + IN_PROGRESS
  });
});

describe('computeOverdueCount', () => {
  it('counts unfinished activities whose planEnd is before now', async () => {
    mockPrisma.activity.findMany.mockResolvedValueOnce([
      { status: 'IN_PROGRESS', planEndDate: d('2026-01-01') }, // overdue
      { status: 'NOT_STARTED', planEndDate: d('2026-01-01') }, // overdue
      { status: 'COMPLETED', planEndDate: d('2026-01-01') }, // done → not overdue
      { status: 'IN_PROGRESS', planEndDate: d('2026-12-31') }, // future → not overdue
      { status: 'IN_PROGRESS', planEndDate: null }, // no date → not overdue
    ]);
    const r = await computeOverdueCount('p1', d('2026-06-01'));
    expect(r.count).toBe(2);
  });
});
