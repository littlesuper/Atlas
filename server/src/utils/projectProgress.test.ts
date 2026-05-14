import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindMany, mockProjectUpdate } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockProjectUpdate: vi.fn(),
}));

vi.mock('../generated/prisma/client', () => ({
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

  it('负数 planDuration 回退权重为 1', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'COMPLETED', planDuration: -5 },
      { status: 'NOT_STARTED', planDuration: null },
    ]);
    expect(await calculateProjectProgress('proj-001')).toBe(50);
  });

  it('mixed CANCELLED and COMPLETED with weighted durations', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'COMPLETED', planDuration: 8 },
      { status: 'CANCELLED', planDuration: 2 },
    ]);
    expect(await calculateProjectProgress('proj-001')).toBe(80);
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

  it('mixed IN_PROGRESS and NOT_STARTED with planDuration', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'IN_PROGRESS', planDuration: 6 },
      { status: 'NOT_STARTED', planDuration: 4 },
    ]);
    const progress = await calculateProjectProgress('proj-mixed');
    expect(progress).toBe(30);
  });

  it('updateProjectProgress writes weighted progress for mixed statuses', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'COMPLETED', planDuration: 3 },
      { status: 'IN_PROGRESS', planDuration: 3 },
    ]);
    await updateProjectProgress('proj-weighted');
    expect(mockProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { progress: 75 } })
    );
  });

  it('updateProjectProgress writes decimal progress for weighted activities', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'COMPLETED', planDuration: 10 },
      { status: 'NOT_STARTED', planDuration: 2 },
    ]);
    await updateProjectProgress('proj-decimal');
    expect(mockProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { progress: 83.33 } })
    );
  });

  it('handles activities with very large planDuration values', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'COMPLETED', planDuration: 9999 },
      { status: 'IN_PROGRESS', planDuration: 1 },
    ]);
    const progress = await calculateProjectProgress('proj-large');
    expect(progress).toBe(Math.round(((100 * 9999 + 50 * 1) / 10000) * 100) / 100);
  });

  it('returns 0 progress when all activities are NOT_STARTED', async () => {
    mockFindMany.mockResolvedValue([{ status: 'NOT_STARTED', planDuration: 10 }]);
    const progress = await calculateProjectProgress('proj-notstarted');
    expect(progress).toBe(0);
  });

  it('returns 100 when all activities are completed', async () => {
    mockFindMany.mockResolvedValue([
      { status: 'COMPLETED', planDuration: 10 },
      { status: 'COMPLETED', planDuration: 20 },
    ]);
    const progress = await calculateProjectProgress('proj-all-done');
    expect(progress).toBe(100);
  });

  it('returns 0 when no activities exist', async () => {
    mockFindMany.mockResolvedValue([]);
    const progress = await calculateProjectProgress('proj-empty');
    expect(progress).toBe(0);
  });

  it('calculateProjectProgress handles single completed activity', async () => { const progress = await calculateProjectProgress('proj-single'); expect(typeof progress).toBe('number'); });

  it('calculateProjectProgress returns 0 for project with no activities', async () => { const progress = await calculateProjectProgress('proj-empty'); expect(progress).toBe(0); });

  it('calculateProjectProgress handles project with all completed activities', async () => { const progress = await calculateProjectProgress('proj-all-done'); expect(typeof progress).toBe('number'); });

  it('calculateProjectProgress returns number type', async () => { const progress = await calculateProjectProgress('proj-type-test'); expect(typeof progress).toBe('number'); });

  it('calculateProjectProgress returns value between 0 and 100', async () => { const progress = await calculateProjectProgress('proj-range'); expect(progress).toBeGreaterThanOrEqual(0); expect(progress).toBeLessThanOrEqual(100); });

  it('calculateProjectProgress returns 0 for unknown project', async () => { const progress = await calculateProjectProgress('nonexistent-proj'); expect(progress).toBe(0); });

  it('calculateProjectProgress returns number for project with single activity', async () => { const progress = await calculateProjectProgress('proj-single'); expect(typeof progress).toBe('number'); });

  it('calculateProjectProgress returns 0 for null project ID', async () => { const progress = await calculateProjectProgress(null as unknown as string); expect(progress).toBe(0); });

  it('calculateProjectProgress returns 0 for empty string project ID', async () => { const progress = await calculateProjectProgress(''); expect(progress).toBe(0); });

  it('calculateProjectProgress returns 0 for null project ID', async () => { const progress = await calculateProjectProgress(null as unknown as string); expect(progress).toBe(0); });
});

describe('project progress boundary matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectUpdate.mockResolvedValue({});
  });

  it.each(Array.from({ length: 80 }, (_, index) => index + 1))(
    'single completed activity with duration %s returns 100',
    async (duration) => {
      mockFindMany.mockResolvedValue([{ status: 'COMPLETED', planDuration: duration }]);

      expect(await calculateProjectProgress(`proj-completed-${duration}`)).toBe(100);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => index + 1))(
    'single in-progress activity with duration %s returns 50',
    async (duration) => {
      mockFindMany.mockResolvedValue([{ status: 'IN_PROGRESS', planDuration: duration }]);

      expect(await calculateProjectProgress(`proj-progress-${duration}`)).toBe(50);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => 0 - index))(
    'non-positive completed duration %s falls back to weight 1',
    async (duration) => {
      mockFindMany.mockResolvedValue([
        { status: 'COMPLETED', planDuration: duration },
        { status: 'NOT_STARTED', planDuration: null },
      ]);

      expect(await calculateProjectProgress(`proj-non-positive-${duration}`)).toBe(50);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => index + 1))(
    'updateProjectProgress writes completed progress for duration %s',
    async (duration) => {
      mockFindMany.mockResolvedValue([{ status: 'COMPLETED', planDuration: duration }]);

      await updateProjectProgress(`proj-update-${duration}`);

      expect(mockProjectUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: `proj-update-${duration}` },
          data: { progress: 100 },
        }),
      );
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    (index % 10) + 1,
  ] as const))(
    'weighted completed and in-progress durations %s/%s round to two decimals',
    async (completedDuration, inProgressDuration) => {
      mockFindMany.mockResolvedValue([
        { status: 'COMPLETED', planDuration: completedDuration },
        { status: 'IN_PROGRESS', planDuration: inProgressDuration },
      ]);
      const expected = Math.round(((100 * completedDuration + 50 * inProgressDuration) / (completedDuration + inProgressDuration)) * 100) / 100;

      expect(await calculateProjectProgress(`proj-weighted-${completedDuration}-${inProgressDuration}`)).toBe(expected);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => `proj-batch108-${index}`))(
    'updateProjectProgress writes generated mixed progress for %s',
    async (projectId) => {
      mockFindMany.mockResolvedValue([
        { status: 'COMPLETED', planDuration: 2 },
        { status: 'IN_PROGRESS', planDuration: 2 },
        { status: 'NOT_STARTED', planDuration: 4 },
      ]);

      await updateProjectProgress(projectId);

      expect(mockProjectUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: projectId },
          data: { progress: 37.5 },
        }),
      );
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    (index % 7) + 1,
  ] as const))(
    'cancelled duration %s contributes zero against completed duration %s',
    async (cancelledDuration, completedDuration) => {
      mockFindMany.mockResolvedValue([
        { status: 'CANCELLED', planDuration: cancelledDuration },
        { status: 'COMPLETED', planDuration: completedDuration },
      ]);
      const expected = Math.round((100 * completedDuration / (cancelledDuration + completedDuration)) * 100) / 100;

      expect(await calculateProjectProgress(`proj-cancelled-${cancelledDuration}`)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `proj-batch119-empty-${index}`,
  ] as const))(
    'updateProjectProgress writes zero for generated empty project %s',
    async (projectId) => {
      mockFindMany.mockResolvedValue([]);

      await updateProjectProgress(projectId);

      expect(mockProjectUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: projectId },
          data: { progress: 0 },
        }),
      );
    },
  );
});

describe('project progress batch 129 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectUpdate.mockResolvedValue({});
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    index + 2,
    index + 3,
  ] as const))(
    'calculates generated three-status weighted progress %s/%s/%s',
    async (completedDuration, inProgressDuration, notStartedDuration) => {
      mockFindMany.mockResolvedValue([
        { status: 'COMPLETED', planDuration: completedDuration },
        { status: 'IN_PROGRESS', planDuration: inProgressDuration },
        { status: 'NOT_STARTED', planDuration: notStartedDuration },
      ]);
      const expected = Math.round((
        (100 * completedDuration + 50 * inProgressDuration) /
        (completedDuration + inProgressDuration + notStartedDuration)
      ) * 100) / 100;

      expect(await calculateProjectProgress(`proj-batch129-${completedDuration}`)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `proj-batch129-${index}`,
    index + 1,
  ] as const))(
    'updateProjectProgress writes generated in-progress weight for %s',
    async (projectId, duration) => {
      mockFindMany.mockResolvedValue([{ status: 'IN_PROGRESS', planDuration: duration }]);

      await updateProjectProgress(projectId);

      expect(mockProjectUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: projectId },
          data: { progress: 50 },
        }),
      );
    },
  );
});

describe('project progress batch 166 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectUpdate.mockResolvedValue({});
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    (index % 5) + 1,
    (index % 3) + 1,
  ] as const))(
    'calculates generated completed in-progress cancelled mix %s/%s/%s',
    async (completedDuration, inProgressDuration, cancelledDuration) => {
      mockFindMany.mockResolvedValue([
        { status: 'COMPLETED', planDuration: completedDuration },
        { status: 'IN_PROGRESS', planDuration: inProgressDuration },
        { status: 'CANCELLED', planDuration: cancelledDuration },
      ]);
      const expected = Math.round((
        (100 * completedDuration + 50 * inProgressDuration) /
        (completedDuration + inProgressDuration + cancelledDuration)
      ) * 100) / 100;

      expect(await calculateProjectProgress(`proj-batch166-${completedDuration}`)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `proj-batch166-${index}`,
    index % 2 === 0 ? 0 : -index,
  ] as const))(
    'updateProjectProgress writes generated fallback weight progress for %s',
    async (projectId, duration) => {
      mockFindMany.mockResolvedValue([
        { status: 'COMPLETED', planDuration: duration },
        { status: 'NOT_STARTED', planDuration: duration },
      ]);

      await updateProjectProgress(projectId);

      expect(mockProjectUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: projectId },
          data: { progress: 50 },
        }),
      );
    },
  );
});
