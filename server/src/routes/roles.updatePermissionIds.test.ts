import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';

type AuthRequest = Request & { user?: unknown };

// ─── Hoisted mocks（沿用 roles.test.ts 的 main 风格 mock 集）──────────────────
const { mockPrisma, mockInvalidateAllUserCache } = vi.hoisted(() => {
  const mockPrisma = {
    role: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    permission: { findMany: vi.fn(), count: vi.fn() },
    rolePermission: { createMany: vi.fn(), deleteMany: vi.fn() },
    userRole: { count: vi.fn() },
  };
  return { mockPrisma, mockInvalidateAllUserCache: vi.fn() };
});

// main 走 `import { PrismaClient } from '@prisma/client'`（非 ../db 单例、非 generated/prisma）
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as unknown as PrismaClient;
    }
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = {
      id: 'user-1',
      username: 'admin',
      realName: 'Admin',
      roles: [{ id: 'r1', name: 'admin', description: null }],
      permissions: ['*:*'],
      collaboratingProjectIds: [],
    };
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
  // 对比 POST 会在 createMany 前 `permission.count` 校验 → 400「部分权限ID不存在」。
  // PUT 原本无此校验：传不存在的 permissionId 会让 createMany 抛 Prisma P2003（外键约束），
  // 被通用 catch 吞成 500；更糟的是 deleteMany 已先执行 → 角色权限被清空（数据损坏），客户端却只看到 500。
  // 修复：在 deleteMany 之前补 count 校验，!==length → 400，旧权限不动。
  it('传不存在的 permissionId 返回 400「部分权限ID不存在」，且未先清空角色权限', async () => {
    // 修复后用 permission.count 校验；这里 2 个 id 只有 1 个存在
    mockPrisma.permission.count.mockResolvedValue(1);
    // 兜底：即便误走到旧路径，createMany 也会抛 P2003
    mockPrisma.rolePermission.createMany.mockRejectedValue({ code: 'P2003' });
    mockPrisma.rolePermission.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .put('/api/roles/r1')
      .send({ permissionIds: ['perm-real', 'perm-does-not-exist'] });

    // 期望（修复后，与 POST 对齐）：400「部分权限ID不存在」
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('部分权限ID不存在');
    // 校验入参与 POST 端点一致
    expect(mockPrisma.permission.count).toHaveBeenCalledWith({
      where: { id: { in: ['perm-real', 'perm-does-not-exist'] } },
    });
    // 关键：校验必须在 deleteMany 之前——绝不能先清空权限（避免失败时数据损坏）
    expect(mockPrisma.rolePermission.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.rolePermission.createMany).not.toHaveBeenCalled();
  });

  it('全部 permissionId 合法时正常替换（deleteMany + createMany 均调用）', async () => {
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
