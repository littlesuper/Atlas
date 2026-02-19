import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCount, mockProjectUpdate } = vi.hoisted(() => ({
  mockCount: vi.fn(),
  mockProjectUpdate: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    activity = { count: mockCount };
    project = { update: mockProjectUpdate };
  },
  ActivityStatus: {
    COMPLETED: 'COMPLETED',
    IN_PROGRESS: 'IN_PROGRESS',
    NOT_STARTED: 'NOT_STARTED',
    DELAYED: 'DELAYED',
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
    // total=0, completed=0, inProgress=0
    mockCount.mockResolvedValue(0);
    expect(await calculateProjectProgress('proj-001')).toBe(0);
  });

  it('全部 COMPLETED → 100%', async () => {
    // total=3, completed=3, inProgress=0
    mockCount.mockImplementation(({ where }: any) => {
      if (where.status === 'COMPLETED') return Promise.resolve(3);
      if (where.status === 'IN_PROGRESS') return Promise.resolve(0);
      return Promise.resolve(3); // total
    });
    expect(await calculateProjectProgress('proj-001')).toBe(100);
  });

  it('全部 IN_PROGRESS → 50%', async () => {
    // total=2, completed=0, inProgress=2
    mockCount.mockImplementation(({ where }: any) => {
      if (where.status === 'COMPLETED') return Promise.resolve(0);
      if (where.status === 'IN_PROGRESS') return Promise.resolve(2);
      return Promise.resolve(2); // total
    });
    expect(await calculateProjectProgress('proj-001')).toBe(50);
  });

  it('全部 NOT_STARTED → 0%', async () => {
    // total=2, completed=0, inProgress=0
    mockCount.mockImplementation(({ where }: any) => {
      if (where.status === 'COMPLETED') return Promise.resolve(0);
      if (where.status === 'IN_PROGRESS') return Promise.resolve(0);
      return Promise.resolve(2); // total
    });
    expect(await calculateProjectProgress('proj-001')).toBe(0);
  });

  it('全部 DELAYED → 0%', async () => {
    // total=1, completed=0, inProgress=0
    mockCount.mockImplementation(({ where }: any) => {
      if (where.status === 'COMPLETED') return Promise.resolve(0);
      if (where.status === 'IN_PROGRESS') return Promise.resolve(0);
      return Promise.resolve(1); // total
    });
    expect(await calculateProjectProgress('proj-001')).toBe(0);
  });

  it('全部 CANCELLED → 0%', async () => {
    // total=1, completed=0, inProgress=0
    mockCount.mockImplementation(({ where }: any) => {
      if (where.status === 'COMPLETED') return Promise.resolve(0);
      if (where.status === 'IN_PROGRESS') return Promise.resolve(0);
      return Promise.resolve(1); // total
    });
    expect(await calculateProjectProgress('proj-001')).toBe(0);
  });

  it('1 COMPLETED + 1 NOT_STARTED → 50%', async () => {
    // total=2, completed=1, inProgress=0
    mockCount.mockImplementation(({ where }: any) => {
      if (where.status === 'COMPLETED') return Promise.resolve(1);
      if (where.status === 'IN_PROGRESS') return Promise.resolve(0);
      return Promise.resolve(2); // total
    });
    expect(await calculateProjectProgress('proj-001')).toBe(50);
  });

  it('1 COMPLETED + 1 IN_PROGRESS → 75%', async () => {
    // total=2, completed=1, inProgress=1
    mockCount.mockImplementation(({ where }: any) => {
      if (where.status === 'COMPLETED') return Promise.resolve(1);
      if (where.status === 'IN_PROGRESS') return Promise.resolve(1);
      return Promise.resolve(2); // total
    });
    expect(await calculateProjectProgress('proj-001')).toBe(75);
  });

  it('4 COMPLETED + 1 IN_PROGRESS → 90%', async () => {
    // total=5, completed=4, inProgress=1
    mockCount.mockImplementation(({ where }: any) => {
      if (where.status === 'COMPLETED') return Promise.resolve(4);
      if (where.status === 'IN_PROGRESS') return Promise.resolve(1);
      return Promise.resolve(5); // total
    });
    expect(await calculateProjectProgress('proj-001')).toBe(90);
  });

  it('调用 count 3 次（total / completed / inProgress）', async () => {
    mockCount.mockResolvedValue(0);
    await calculateProjectProgress('proj-abc');
    expect(mockCount).toHaveBeenCalledTimes(3);
  });
});

describe('updateProjectProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectUpdate.mockResolvedValue({});
  });

  it('调用 project.update 写入进度', async () => {
    // total=1, completed=1, inProgress=0 → 100%
    mockCount.mockImplementation(({ where }: any) => {
      if (where.status === 'COMPLETED') return Promise.resolve(1);
      if (where.status === 'IN_PROGRESS') return Promise.resolve(0);
      return Promise.resolve(1); // total
    });
    await updateProjectProgress('proj-001');
    expect(mockProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'proj-001' }, data: { progress: 100 } })
    );
  });

  it('空项目时写入 progress: 0', async () => {
    mockCount.mockResolvedValue(0);
    await updateProjectProgress('proj-empty');
    expect(mockProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { progress: 0 } })
    );
  });
});
