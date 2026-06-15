import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate, mockFindUser } = vi.hoisted(() => ({ mockCreate: vi.fn(), mockFindUser: vi.fn() }));
vi.mock('../../../db', () => ({ default: { project: { create: mockCreate }, user: { findUnique: mockFindUser } } }));

import { projectCreateCapability } from './projectCreate';
import type { CapabilityContext } from './types';

const ctx: CapabilityContext = { userId: 'u1', userName: '张三', permissions: ['project:create'], projects: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockFindUser.mockResolvedValue({ id: 'u1', realName: '张三' });
  mockCreate.mockResolvedValue({ id: 'newp', name: '项目甲' });
});

describe('projectCreateCapability', () => {
  it('inputSchema 接受部分字段、拦非法枚举', () => {
    expect(projectCreateCapability.inputSchema.safeParse({ productLine: '蒲公英' }).success).toBe(true);
    expect(projectCreateCapability.inputSchema.safeParse({ priority: 'WRONG' }).success).toBe(false);
  });

  it('missingRequired: 缺 name/productLine 时列出', () => {
    expect(projectCreateCapability.missingRequired!({ productLine: '蒲公英' }, ctx)).toEqual(['项目名称']);
    expect(projectCreateCapability.missingRequired!({}, ctx)).toEqual(['项目名称', '产品线']);
    expect(projectCreateCapability.missingRequired!({ name: '甲', productLine: '蒲公英' }, ctx)).toEqual([]);
  });

  it('applyDefaults: managerId=当前用户、status/priority 默认', () => {
    const full = projectCreateCapability.applyDefaults!({ name: '甲', productLine: '蒲公英' }, ctx);
    expect(full).toMatchObject({ name: '甲', productLine: '蒲公英', managerId: 'u1', status: 'IN_PROGRESS', priority: 'MEDIUM' });
  });

  it('execute: 调 prisma.project.create，校验负责人存在', async () => {
    const full = projectCreateCapability.applyDefaults!({ name: '甲', productLine: '蒲公英' }, ctx);
    const r = await projectCreateCapability.execute(full, ctx, {} as never);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(r.rows.find((x) => x.key === 'name')?.after).toBe('甲');
  });

  it('execute: 负责人不存在 → 抛错', async () => {
    mockFindUser.mockResolvedValueOnce(null);
    const full = projectCreateCapability.applyDefaults!({ name: '甲', productLine: '蒲公英', managerId: 'ghost' }, ctx);
    await expect(projectCreateCapability.execute(full, ctx, {} as never)).rejects.toThrow();
  });

  it('execute: 结束日早于开始日 → 抛错', async () => {
    const full = projectCreateCapability.applyDefaults!({ name: '甲', productLine: '蒲公英', startDate: '2026-06-10', endDate: '2026-06-01' }, ctx);
    await expect(projectCreateCapability.execute(full, ctx, {} as never)).rejects.toThrow();
  });
});
