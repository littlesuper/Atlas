import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    project: { findMany: vi.fn() },
    riskItem: { findMany: vi.fn() },
    activity: { groupBy: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock('../../../db', () => ({ default: mockPrisma, prisma: mockPrisma }));

import { buildAskContext } from './contextBuilder';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

beforeEach(() => vi.clearAllMocks());

describe('buildAskContext', () => {
  it('returns a no-data note when manageable is empty', async () => {
    const ctx = await buildAskContext({ manageable: [], focusProjectId: null });
    expect(ctx).toContain('没有可见的项目数据');
    expect(mockPrisma.project.findMany).not.toHaveBeenCalled();
  });

  it('builds cross-project summary with counts + max open severity', async () => {
    mockPrisma.project.findMany.mockResolvedValueOnce([
      { id: 'p1', name: '项目甲', status: 'IN_PROGRESS', priority: 'HIGH', startDate: d('2026-03-01'), endDate: d('2026-06-01'), progress: 45 },
    ]);
    mockPrisma.riskItem.findMany.mockResolvedValueOnce([
      { projectId: 'p1', severity: 'HIGH', status: 'OPEN' },
      { projectId: 'p1', severity: 'CRITICAL', status: 'IN_PROGRESS' },
      { projectId: 'p1', severity: 'LOW', status: 'RESOLVED' }, // not open → ignored
    ]);
    mockPrisma.activity.groupBy.mockResolvedValueOnce([{ projectId: 'p1', _count: { _all: 12 } }]);

    const ctx = await buildAskContext({ manageable: [{ id: 'p1', name: '项目甲' }], focusProjectId: null });
    expect(ctx).toContain('你权限内共 1 个项目');
    expect(ctx).toContain('项目甲');
    expect(ctx).toContain('进度:45%');
    expect(ctx).toContain('活动:12');
    expect(ctx).toContain('未解决风险:2(最高:CRITICAL)'); // 2 open, max CRITICAL
  });

  it('appends focus project detail (activities by phase + risks) when focusProjectId given', async () => {
    mockPrisma.project.findMany.mockResolvedValueOnce([
      { id: 'p1', name: '项目甲', status: 'IN_PROGRESS', priority: 'HIGH', startDate: d('2026-03-01'), endDate: d('2026-06-01'), progress: 45 },
    ]);
    mockPrisma.riskItem.findMany
      .mockResolvedValueOnce([{ projectId: 'p1', severity: 'HIGH', status: 'OPEN' }]) // summary
      .mockResolvedValueOnce([{ title: '电源散热', severity: 'HIGH', status: 'OPEN' }]); // focus detail
    mockPrisma.activity.groupBy.mockResolvedValueOnce([{ projectId: 'p1', _count: { _all: 2 } }]);
    mockPrisma.activity.findMany.mockResolvedValueOnce([
      { name: '硬件打样', phase: 'EVT', status: 'COMPLETED', planStartDate: d('2026-03-02'), planEndDate: d('2026-03-06'), startDate: d('2026-03-02'), endDate: d('2026-03-07') },
    ]);

    const ctx = await buildAskContext({ manageable: [{ id: 'p1', name: '项目甲' }], focusProjectId: 'p1' });
    expect(ctx).toContain('项目「项目甲」明细');
    expect(ctx).toContain('[EVT] 硬件打样');
    expect(ctx).toContain('实际 2026-03-02~2026-03-07');
    expect(ctx).toContain('[HIGH/待处理] 电源散热');
  });

  it('ignores focusProjectId not in the permitted list (no detail leak)', async () => {
    mockPrisma.project.findMany.mockResolvedValueOnce([
      { id: 'p1', name: '项目甲', status: 'IN_PROGRESS', priority: 'HIGH', startDate: null, endDate: null, progress: 0 },
    ]);
    mockPrisma.riskItem.findMany.mockResolvedValueOnce([]);
    mockPrisma.activity.groupBy.mockResolvedValueOnce([]);
    const ctx = await buildAskContext({ manageable: [{ id: 'p1', name: '项目甲' }], focusProjectId: 'p999' });
    expect(ctx).not.toContain('明细');
    expect(mockPrisma.activity.findMany).not.toHaveBeenCalled();
  });
});
