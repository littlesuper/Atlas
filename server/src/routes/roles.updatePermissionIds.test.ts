import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { PrismaClient } from '../generated/prisma/client';

type AuthRequest = Request & { user?: unknown };

// ─── Hoisted mocks（沿用 roles.test.ts 的成熟 mock 集）─────────────────────────
const { mockPrisma, mockInvalidateAllUserCache } = vi.hoisted(() => {
  const mockPrisma = {
    role: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    permission: { findMany: vi.fn(), count: vi.fn() },
    rolePermission: { createMany: vi.fn(), deleteMany: vi.fn() },
    userRole: { count: vi.fn() },
  };
  return { mockPrisma, mockInvalidateAllUserCache: vi.fn() };
});

vi.mock('../generated/prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as unknown as PrismaClient;
    }
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = { id: 'user-1', username: 'admin', realName: 'Admin', roles: [{ id: 'r1', name: 'admin', description: null }], permissions: ['*:*'], collaboratingProjectIds: [] };
    next();
  },
  invalidateAllUserCache: mockInvalidateAllUserCache,
}));

vi.mock('../middleware/permission', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  isAdmin: vi.fn().mockReturnValue(true),
}));

import rolesRoutes from './roles';

const app = express();
app.use(express.json());
app.use('/api/roles', rolesRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1', name: '研发组', description: null });
  mockPrisma.role.update.mockResolvedValue({});
});

describe('PUT /api/roles/:id — permissionIds 校验', () => {
  // ── BUG: PUT 更新权限关联时不校验 permissionId 是否存在，且先 deleteMany 再 createMany ──
  // 对比 POST（roles.ts:126-134）会在 createMany 前 `permission.count` 校验 → 400「部分权限ID不存在」。
  // PUT（roles.ts:225-239）无此校验：传不存在的 permissionId 会让 createMany 抛 Prisma P2003（外键约束），
  // 被通用 catch 吞成 500；更糟的是 deleteMany 已先执行 → 角色权限被清空（数据损坏），客户端却只看到 500。
  it('BUG: PUT 传不存在的 permissionId 返回 500 且先清空了角色权限（缺 count 校验 + 顺序错误）', async () => {
    // permission.count 在修复后用于校验；这里 2 个 id 只有 1 个存在
    mockPrisma.permission.count.mockResolvedValue(1);
    // 当前 bug 路径：createMany 抛 P2003
    mockPrisma.rolePermission.createMany.mockRejectedValue({ code: 'P2003' });
    mockPrisma.rolePermission.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .put('/api/roles/r1')
      .send({ permissionIds: ['perm-real', 'perm-does-not-exist'] });

    // 期望（修复后，与 POST 对齐）：400「部分权限ID不存在」
    expect(res.status).toBe(400);
    // 且绝不能先清空权限（避免失败时数据损坏）——校验必须在 deleteMany 之前
    expect(mockPrisma.permission.count).toHaveBeenCalledWith({
      where: { id: { in: ['perm-real', 'perm-does-not-exist'] } },
    });
    expect(mockPrisma.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('全部 permissionId 合法时正常替换（修复后回归保护）', async () => {
    mockPrisma.permission.count.mockResolvedValue(2); // 两个都存在
    mockPrisma.rolePermission.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.rolePermission.createMany.mockResolvedValue({ count: 2 });

    const res = await request(app)
      .put('/api/roles/r1')
      .send({ permissionIds: ['perm-a', 'perm-b'] });

    expect(res.status).toBe(200);
    expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.rolePermission.createMany).toHaveBeenCalled();
  });
});
