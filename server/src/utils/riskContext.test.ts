import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockProjectFindUnique,
  mockActivityFindMany,
  mockProjectMemberCount,
  mockRiskAssessmentFindMany,
  mockWeeklyReportFindFirst,
  mockAssessProjectRisk,
  mockCalculateCriticalPath,
} = vi.hoisted(() => ({
  mockProjectFindUnique: vi.fn(),
  mockActivityFindMany: vi.fn(),
  mockProjectMemberCount: vi.fn(),
  mockRiskAssessmentFindMany: vi.fn(),
  mockWeeklyReportFindFirst: vi.fn(),
  mockAssessProjectRisk: vi.fn(),
  mockCalculateCriticalPath: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    project = { findUnique: mockProjectFindUnique };
    activity = { findMany: mockActivityFindMany };
    projectMember = { count: mockProjectMemberCount };
    riskAssessment = { findMany: mockRiskAssessmentFindMany };
    weeklyReport = { findFirst: mockWeeklyReportFindFirst };
  },
  ActivityStatus: {
    COMPLETED: 'COMPLETED',
    IN_PROGRESS: 'IN_PROGRESS',
    NOT_STARTED: 'NOT_STARTED',
    CANCELLED: 'CANCELLED',
  },
}));

vi.mock('./riskEngine', () => ({
  assessProjectRisk: mockAssessProjectRisk,
}));

vi.mock('./criticalPath', () => ({
  calculateCriticalPath: mockCalculateCriticalPath,
}));

import { buildRiskContext } from './riskContext';

interface ActivityFixture {
  id: string;
  name: string;
  type: string;
  phase: string | null;
  status: string;
  priority: string;
  planStartDate: Date | null;
  planEndDate: Date | null;
  planDuration: number | null;
  startDate: Date | null;
  endDate: Date | null;
  duration: number | null;
  dependencies: unknown[];
  executors: Array<{ user: { id: string; realName: string } }>;
}

function makeActivity(overrides: Partial<ActivityFixture> = {}): ActivityFixture {
  return {
    id: 'activity-1',
    name: '测试活动',
    type: 'TASK',
    phase: null,
    status: 'NOT_STARTED',
    priority: 'MEDIUM',
    planStartDate: null,
    planEndDate: null,
    planDuration: null,
    startDate: null,
    endDate: null,
    duration: null,
    dependencies: [],
    executors: [],
    ...overrides,
  };
}

describe('buildRiskContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockProjectFindUnique.mockResolvedValue({
      id: 'project-1',
      name: '测试项目',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      progress: 35,
      startDate: null,
      endDate: null,
      manager: { realName: '项目经理' },
    });
    mockProjectMemberCount.mockResolvedValue(1);
    mockRiskAssessmentFindMany.mockResolvedValue([]);
    mockWeeklyReportFindFirst.mockResolvedValue(null);
    mockAssessProjectRisk.mockResolvedValue({
      riskLevel: 'LOW',
      riskScore: 0,
      riskFactors: [],
      suggestions: [],
    });
    mockCalculateCriticalPath.mockReturnValue(['activity-1']);
  });

  it('uses ActivityExecutor records as risk context assignees', async () => {
    mockActivityFindMany.mockResolvedValue([
      makeActivity({
        id: 'activity-1',
        status: 'IN_PROGRESS',
        executors: [{ user: { id: 'user-1', realName: '执行人A' } }],
      }),
      makeActivity({
        id: 'activity-2',
        status: 'NOT_STARTED',
      }),
    ]);

    const context = await buildRiskContext('project-1');

    expect(mockActivityFindMany).toHaveBeenCalledWith({
      where: { projectId: 'project-1' },
      include: {
        executors: {
          include: {
            user: { select: { id: true, realName: true } },
          },
        },
      },
    });
    expect(context.activities[0].assignees).toEqual(['执行人A']);
    expect(context.activities[1].assignees).toEqual([]);
    expect(context.summary.unassignedCount).toBe(1);
  });
});
