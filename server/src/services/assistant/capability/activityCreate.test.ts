import { describe, it, expect } from 'vitest';
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
