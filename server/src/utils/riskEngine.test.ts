import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindUnique, mockActivityFindMany } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockActivityFindMany: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    project = { findUnique: mockFindUnique };
    activity = { findMany: mockActivityFindMany };
  },
  ActivityStatus: {
    COMPLETED: 'COMPLETED',
    IN_PROGRESS: 'IN_PROGRESS',
    NOT_STARTED: 'NOT_STARTED',
    DELAYED: 'DELAYED',
    CANCELLED: 'CANCELLED',
  },
}));

import { assessProjectRisk } from './riskEngine';

function makeProject(overrides = {}) {
  return {
    id: 'proj-001', name: '测试项目', progress: 80,
    startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'),
    activities: [],
    ...overrides,
  };
}

function makeActivity(overrides = {}) {
  return {
    id: Math.random().toString(),
    status: 'NOT_STARTED',
    assigneeId: 'user-1',
    planEndDate: null,
    ...overrides,
  };
}

describe('assessProjectRisk', () => {
  beforeEach(() => vi.clearAllMocks());

  it('项目不存在时抛出错误', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockActivityFindMany.mockResolvedValue([]);
    await expect(assessProjectRisk('non-existent')).rejects.toThrow('项目不存在');
  });

  it('没有活动时返回低风险', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ activities: [] }));
    mockActivityFindMany.mockResolvedValue([]);
    const result = await assessProjectRisk('proj-001');
    expect(result.riskLevel).toBe('LOW');
    expect(result.riskFactors[0].factor).toBe('项目初期');
  });

  it('无延期、有负责人、无日期限制 → 低风险且因子为"项目运行正常"', async () => {
    // 不设置日期，跳过进度偏差计算，确保测试结果不受当前日期影响
    mockFindUnique.mockResolvedValue(makeProject({ progress: 80, startDate: null, endDate: null }));
    mockActivityFindMany.mockResolvedValue([
      makeActivity({ status: 'COMPLETED', assigneeId: 'u1' }),
    ]);
    const result = await assessProjectRisk('proj-001');
    expect(result.riskLevel).toBe('LOW');
    expect(result.riskFactors[0].factor).toBe('项目运行正常');
  });

  it('时间进度与实际进度差 >30% → 高风险因子', async () => {
    // 项目从 2020 年开始，现在已过大半，但进度只有 10%
    const start = new Date('2020-01-01');
    const end = new Date('2026-12-31');
    mockFindUnique.mockResolvedValue(makeProject({ progress: 10, startDate: start, endDate: end }));
    mockActivityFindMany.mockResolvedValue([makeActivity({ assigneeId: 'u1' })]);
    const result = await assessProjectRisk('proj-001');
    const progressFactor = result.riskFactors.find((f) => f.factor.includes('进度'));
    expect(progressFactor?.severity).toBe('HIGH');
  });

  it('多个逾期任务 → 高风险因子"存在逾期任务"', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50 }));
    const past = new Date('2020-01-01');
    const acts = [
      ...Array(4).fill(null).map(() => makeActivity({ status: 'IN_PROGRESS', planEndDate: past })),
      ...Array(6).fill(null).map(() => makeActivity({ status: 'NOT_STARTED' })),
    ];
    mockActivityFindMany.mockResolvedValue(acts);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('逾期'));
    expect(f?.severity).toBe('HIGH');
  });

  it('少量逾期任务 → 低风险因子"存在逾期任务"', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50 }));
    const past = new Date('2020-01-01');
    const acts = [
      ...Array(1).fill(null).map(() => makeActivity({ status: 'IN_PROGRESS', planEndDate: past })),
      ...Array(8).fill(null).map(() => makeActivity({ status: 'NOT_STARTED' })),
    ];
    mockActivityFindMany.mockResolvedValue(acts);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('逾期'));
    expect(f?.severity).toBe('LOW');
  });

  it('>3 个逾期未完成任务 → 高风险因子', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50 }));
    const past = new Date('2020-01-01');
    const acts = Array(4).fill(null).map(() =>
      makeActivity({ status: 'IN_PROGRESS', planEndDate: past })
    );
    mockActivityFindMany.mockResolvedValue(acts);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('逾期'));
    expect(f?.severity).toBe('HIGH');
  });

  it('1 个逾期未完成任务 → 低风险因子', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50 }));
    const past = new Date('2020-01-01');
    mockActivityFindMany.mockResolvedValue([
      makeActivity({ status: 'IN_PROGRESS', planEndDate: past }),
      makeActivity({ status: 'COMPLETED', planEndDate: past }),
    ]);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('逾期'));
    expect(f?.severity).toBe('LOW');
  });

  it('>30% 未分配负责人 → 中风险因子"资源分配不足"', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50 }));
    const acts = [
      ...Array(4).fill(null).map(() => makeActivity({ status: 'NOT_STARTED', assigneeId: null })),
      ...Array(6).fill(null).map(() => makeActivity({ status: 'NOT_STARTED', assigneeId: 'u1' })),
    ];
    mockActivityFindMany.mockResolvedValue(acts);
    const result = await assessProjectRisk('proj-001');
    const f = result.riskFactors.find((r) => r.factor.includes('资源'));
    expect(f?.severity).toBe('MEDIUM');
  });

  it('多因子叠加分数 ≥7 → 极高风险', async () => {
    mockFindUnique.mockResolvedValue(makeProject({ progress: 50 }));
    const past = new Date('2020-01-01');
    // 延期>30%(+3) + 逾期>3(+3) + 未分配>30%(+2) = 8
    const acts = [
      ...Array(4).fill(null).map(() => makeActivity({ status: 'DELAYED', assigneeId: null, planEndDate: past })),
      ...Array(4).fill(null).map(() => makeActivity({ status: 'IN_PROGRESS', assigneeId: null, planEndDate: past })),
      ...Array(2).fill(null).map(() => makeActivity({ status: 'NOT_STARTED', assigneeId: 'u1' })),
    ];
    mockActivityFindMany.mockResolvedValue(acts);
    const result = await assessProjectRisk('proj-001');
    expect(result.riskLevel).toBe('CRITICAL');
  });

  it('返回结果包含必要字段结构', async () => {
    mockFindUnique.mockResolvedValue(makeProject());
    mockActivityFindMany.mockResolvedValue([makeActivity()]);
    const result = await assessProjectRisk('proj-001');
    expect(result).toHaveProperty('riskLevel');
    expect(Array.isArray(result.riskFactors)).toBe(true);
    expect(Array.isArray(result.suggestions)).toBe(true);
    result.riskFactors.forEach((f) => {
      expect(f).toHaveProperty('factor');
      expect(f).toHaveProperty('severity');
      expect(f).toHaveProperty('description');
    });
  });
});
