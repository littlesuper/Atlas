import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate, _mockBuildExec, mockProgress, mockCanManage, mockWorkdays } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  _mockBuildExec: vi.fn(),
  mockProgress: vi.fn(),
  mockCanManage: vi.fn(),
  mockWorkdays: vi.fn(),
}));

vi.mock('../../../db', () => ({ default: { activity: { create: mockCreate } } }));
vi.mock('../../../middleware/permission', () => ({ canManageProject: mockCanManage }));
vi.mock('../../../utils/projectProgress', () => ({ updateProjectProgress: mockProgress }));
vi.mock('../../../utils/workday', () => ({ calculateWorkdays: mockWorkdays }));
vi.mock('../../../utils/roleMembershipResolver', () => ({ autoAssignByRole: vi.fn(async () => []) }));

// buildExecutorsForActivity 来自同模块 shared.ts；用 spy 时直接 import 真实实现亦可，这里走真实（依赖 autoAssignByRole mock）
import { createActivityCore, ActivityCreateError } from '../shared';

const req = { user: { id: 'u1' } } as never;
const activeProject = { id: 'p1', managerId: 'u1', status: 'IN_PROGRESS' };

beforeEach(() => {
  vi.clearAllMocks();
  mockCanManage.mockReturnValue(true);
  mockCreate.mockResolvedValue({ id: 'a1', name: '结构打样', executors: [] });
  mockProgress.mockResolvedValue(undefined);
});

describe('createActivityCore', () => {
  it('归档项目 → 抛 PROJECT_ARCHIVED', async () => {
    await expect(
      createActivityCore({ ...activeProject, status: 'ARCHIVED' }, { name: 'x' }, req)
    ).rejects.toMatchObject({ code: 'PROJECT_ARCHIVED' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('非负责人 → 抛 FORBIDDEN', async () => {
    mockCanManage.mockReturnValue(false);
    await expect(createActivityCore(activeProject, { name: 'x' }, req)).rejects.toBeInstanceOf(ActivityCreateError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('正常 → 落库 + 刷新进度，使用 project.id 作 projectId', async () => {
    const out = await createActivityCore(activeProject, { name: '结构打样', roleId: 'r1' }, req);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].data.projectId).toBe('p1');
    expect(mockProgress).toHaveBeenCalledWith('p1');
    expect(out.id).toBe('a1');
  });
});
