import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindMany, mockProjectUpdate } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockProjectUpdate: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    activity = { findMany: mockFindMany };
    project = { update: mockProjectUpdate };
  },
  ActivityStatus: {
    COMPLETED: 'COMPLETED',
    IN_PROGRESS: 'IN_PROGRESS',
    NOT_STARTED: 'NOT_STARTED',
    CANCELLED: 'CANCELLED',
  },
}));

import { calculateProjectProgress, updateProjectProgress } from './projectProgress';

describe('calculateProjectProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectUpdate.mockResolvedValue({});
  });

  it('没有活动时返回 0', async () => {
    mockFindMany.mockResolvedValue([]);
    expect(await calculateProjectProgress('proj-001')).toBe(0);
  });

  it('全部 COMPLETED（无工期）→ 100%', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'COMPLETED', planDuration: null },
      { status: 'COMPLETED', planDuration: null },
      { status: 'COMPLETED', planDuration: null },
    ]);
    expect(await calculateProjectProgress('proj-001')).toBe(100);
  });

  it('全部 IN_PROGRESS（无工期）→ 50%', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'IN_PROGRESS', planDuration: null },
      { status: 'IN_PROGRESS', planDuration: null },
    ]);
    expect(await calculateProjectProgress('proj-001')).toBe(50);
  });

  it('全部 NOT_STARTED → 0%', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'NOT_STARTED', planDuration: null },
      { status: 'NOT_STARTED', planDuration: null },
    ]);
    expect(await calculateProjectProgress('proj-001')).toBe(0);
  });

  it('全部 CANCELLED → 0%', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'CANCELLED', planDuration: null },
    ]);
    expect(await calculateProjectProgress('proj-001')).toBe(0);
  });

  it('1 COMPLETED + 1 NOT_STARTED（等权重）→ 50%', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'COMPLETED', planDuration: null },
      { status: 'NOT_STARTED', planDuration: null },
    ]);
    expect(await calculateProjectProgress('proj-001')).toBe(50);
  });

  it('1 COMPLETED + 1 IN_PROGRESS（等权重）→ 75%', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'COMPLETED', planDuration: null },
      { status: 'IN_PROGRESS', planDuration: null },
    ]);
    expect(await calculateProjectProgress('proj-001')).toBe(75);
  });

  it('4 COMPLETED + 1 IN_PROGRESS（等权重）→ 90%', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'COMPLETED', planDuration: null },
      { status: 'COMPLETED', planDuration: null },
      { status: 'COMPLETED', planDuration: null },
      { status: 'COMPLETED', planDuration: null },
      { status: 'IN_PROGRESS', planDuration: null },
    ]);
    expect(await calculateProjectProgress('proj-001')).toBe(90);
  });

  it('按 planDuration 加权：长任务完成影响更大', async () => {
    // COMPLETED(10天) + NOT_STARTED(2天) → (100*10 + 0*2) / 12 = 83.33
    mockFindMany.mockResolvedValue([
      { status: 'COMPLETED', planDuration: 10 },
      { status: 'NOT_STARTED', planDuration: 2 },
    ]);
    expect(await calculateProjectProgress('proj-001')).toBe(83.33);
  });

  it('无 planDuration 的活动回退权重为 1', async () => {
    // COMPLETED(5天) + IN_PROGRESS(null=1天) → (100*5 + 50*1) / 6 = 91.67
    mockFindMany.mockResolvedValue([
      { status: 'COMPLETED', planDuration: 5 },
      { status: 'IN_PROGRESS', planDuration: null },
    ]);
    expect(await calculateProjectProgress('proj-001')).toBe(91.67);
  });

  it('planDuration=0 回退权重为 1', async () => {
    // COMPLETED(0→1) + NOT_STARTED(0→1) → 50%
    mockFindMany.mockResolvedValue([
      { status: 'COMPLETED', planDuration: 0 },
      { status: 'NOT_STARTED', planDuration: 0 },
    ]);
    expect(await calculateProjectProgress('proj-001')).toBe(50);
  });

  it('调用 findMany 一次', async () => {
    mockFindMany.mockResolvedValue([]);
    await calculateProjectProgress('proj-abc');
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { projectId: 'proj-abc' },
      select: { status: true, planDuration: true },
    });
  });
});

describe('updateProjectProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectUpdate.mockResolvedValue({});
  });

  it('调用 project.update 写入进度', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'COMPLETED', planDuration: null },
    ]);
    await updateProjectProgress('proj-001');
    expect(mockProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'proj-001' }, data: { progress: 100 } })
    );
  });

  it('空项目时写入 progress: 0', async () => {
    mockFindMany.mockResolvedValue([]);
    await updateProjectProgress('proj-empty');
    expect(mockProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { progress: 0 } })
    );
  });
});
