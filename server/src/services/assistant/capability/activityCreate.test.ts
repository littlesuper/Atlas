import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockProjectFind, mockRoleFind, mockCreateCore } = vi.hoisted(() => ({
  mockProjectFind: vi.fn(),
  mockRoleFind: vi.fn(),
  mockCreateCore: vi.fn(),
}));
vi.mock('../../../db', () => ({
  default: { project: { findUnique: mockProjectFind }, role: { findUnique: mockRoleFind } },
}));
vi.mock('../../../routes/activities/shared', () => ({ createActivityCore: mockCreateCore }));

import { activityCreateCapability } from './activityCreate';
import type { CapabilityContext } from './types';

const ctx: CapabilityContext = {
  userId: 'u1', userName: '张三', permissions: ['activity:create'],
  projects: [{ id: 'p1', name: 'GW-X500' }],
  roles: [{ id: 'r1', name: '结构组' }],
};

describe('activity.create · parse 护栏（纯函数）', () => {
  it('missingRequired：缺项目/名称都列出', () => {
    expect(activityCreateCapability.missingRequired!({}, ctx)).toEqual(['项目', '活动名称']);
    expect(activityCreateCapability.missingRequired!({ projectId: 'p1', name: '打样' }, ctx)).toEqual([]);
  });

  it('validateRefs：编造 projectId/roleId 被拦', () => {
    expect(activityCreateCapability.validateRefs!({ projectId: 'pX' }, ctx).ok).toBe(false);
    expect(activityCreateCapability.validateRefs!({ projectId: 'p1', roleId: 'rX' }, ctx).ok).toBe(false);
    expect(activityCreateCapability.validateRefs!({ projectId: 'p1', roleId: 'r1' }, ctx).ok).toBe(true);
  });

  it('inputSchema：非法枚举被拦', () => {
    expect(activityCreateCapability.inputSchema.safeParse({ type: 'WRONG' }).success).toBe(false);
    expect(activityCreateCapability.inputSchema.safeParse({ type: 'MILESTONE', priority: 'HIGH' }).success).toBe(true);
  });

  it('applyDefaults：补 TASK/MEDIUM/NOT_STARTED', () => {
    expect(activityCreateCapability.applyDefaults!({ projectId: 'p1', name: '打样' }, ctx))
      .toMatchObject({ type: 'TASK', priority: 'MEDIUM', status: 'NOT_STARTED' });
  });

  it('previewDisplay：roleId 显示角色名 + 自动填入提示', () => {
    expect(activityCreateCapability.previewDisplay!('roleId', 'r1', ctx)).toContain('结构组');
    expect(activityCreateCapability.previewDisplay!('projectId', 'p1', ctx)).toBe('GW-X500');
  });
});

describe('activity.create · execute（DB 权威角色名 + diff 字段集）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectFind.mockResolvedValue({ id: 'p1', name: 'GW-X500', managerId: 'u1', status: 'IN_PROGRESS' });
    mockRoleFind.mockResolvedValue({ name: '结构组' });
    mockCreateCore.mockResolvedValue({ id: 'a1', executors: [{}, {}, {}] });
  });

  it('执行人行用 DB 角色名（不用 ctx、不暴露 id），并列出状态/日期行', async () => {
    const execCtx: CapabilityContext = { ...ctx, roles: [{ id: 'r1', name: '不该用的CTX名' }] };
    const input = {
      projectId: 'p1', name: '结构打样', type: 'TASK', priority: 'MEDIUM',
      status: 'NOT_STARTED', planStartDate: '2026-06-01', roleId: 'r1',
    };
    const out = await activityCreateCapability.execute(input as never, execCtx, { user: { id: 'u1' } } as never);
    const exec = out.rows.find((r) => r.key === 'executors');
    expect(exec?.after).toContain('结构组');
    expect(exec?.after).not.toContain('CTX');
    expect(exec?.after).toContain('3 人');
    expect(out.rows.find((r) => r.key === 'status')).toBeTruthy();
    expect(out.rows.find((r) => r.key === 'planStartDate')?.after).toBe('2026-06-01');
  });
});
