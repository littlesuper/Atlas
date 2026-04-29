import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockPrisma, mockInvalidateAllUserCache, mockPermissionMiddleware } = vi.hoisted(() => {
  const mockPrisma = {
    role: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    permission: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    rolePermission: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    userRole: {
      count: vi.fn(),
    },
  };
  const mockInvalidateAllUserCache = vi.fn();
  const mockPermissionMiddleware = vi.fn().mockImplementation((_req: any, _res: any, next: any) => next());
  return { mockPrisma, mockInvalidateAllUserCache, mockPermissionMiddleware };
});

// ─── vi.mock calls ────────────────────────────────────────────────────────────

vi.mock('@prisma/client', () => ({
  PrismaClient: class { constructor() { return mockPrisma as any; } },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
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
  requirePermission: () => mockPermissionMiddleware,
  isAdmin: vi.fn().mockReturnValue(true),
}));

// ─── App setup ────────────────────────────────────────────────────────────────

import rolesRoutes from './roles';

const app = express();
app.use(express.json());
app.use('/api/roles', rolesRoutes);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns roles with permissions and user count', async () => {
    const roles = [
      {
        id: 'r1',
        name: '系统管理员',
        description: '全部权限',
        createdAt: new Date(),
        updatedAt: new Date(),
        rolePermissions: [
          { permission: { id: 'perm1', resource: 'project', action: 'create' } },
          { permission: { id: 'perm2', resource: 'user', action: 'read' } },
        ],
        _count: { userRoles: 3 },
      },
      {
        id: 'r2',
        name: '普通用户',
        description: '基础权限',
        createdAt: new Date(),
        updatedAt: new Date(),
        rolePermissions: [
          { permission: { id: 'perm2', resource: 'user', action: 'read' } },
        ],
        _count: { userRoles: 10 },
      },
    ];
    mockPrisma.role.findMany.mockResolvedValue(roles);

    const res = await request(app).get('/api/roles');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('系统管理员');
    expect(res.body[0].permissions).toHaveLength(2);
    expect(res.body[0].permissions[0].resource).toBe('project');
    expect(res.body[0]._count.userRoles).toBe(3);
    // rolePermissions should be transformed away
    expect(res.body[0].rolePermissions).toBeUndefined();
  });
});

describe('GET /api/roles - error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissionMiddleware.mockImplementation((_req: any, _res: any, next: any) => next());
  });

  it('returns 500 on database error', async () => {
    mockPrisma.role.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/roles');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('服务器内部错误');
  });

  it('RBAC-012: User without role:read permission gets 403 on GET /api/roles', async () => {
    mockPermissionMiddleware.mockImplementationOnce((_req: any, res: any, _next: any) => {
      res.status(403).json({ error: '权限不足' });
    });

    const res = await request(app).get('/api/roles');

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
    expect(mockPrisma.role.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/roles/permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all permissions', async () => {
    const permissions = [
      { id: 'perm1', resource: 'project', action: 'create' },
      { id: 'perm2', resource: 'project', action: 'read' },
      { id: 'perm3', resource: 'user', action: 'read' },
    ];
    mockPrisma.permission.findMany.mockResolvedValue(permissions);

    const res = await request(app).get('/api/roles/permissions');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].resource).toBe('project');
    expect(res.body[0].action).toBe('create');
    expect(mockPrisma.permission.findMany).toHaveBeenCalledWith({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      select: { id: true, resource: true, action: true },
    });
  });
});

describe('POST /api/roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates role successfully', async () => {
    mockPrisma.role.findUnique
      .mockResolvedValueOnce(null) // no duplicate name
      .mockResolvedValueOnce({     // final query with permissions
        id: 'r-new',
        name: '测试角色',
        description: '测试用',
        rolePermissions: [
          { permission: { id: 'perm1', resource: 'project', action: 'create' } },
        ],
        _count: { userRoles: 0 },
      });
    mockPrisma.role.create.mockResolvedValue({ id: 'r-new', name: '测试角色' });
    mockPrisma.permission.count.mockResolvedValue(1);
    mockPrisma.rolePermission.createMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/roles')
      .send({ name: '测试角色', description: '测试用', permissionIds: ['perm1'] });

    expect(res.status).toBe(201);
    expect(mockPrisma.role.create).toHaveBeenCalledWith({
      data: { name: '测试角色', description: '测试用' },
    });
    expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when name is empty', async () => {
    const res = await request(app)
      .post('/api/roles')
      .send({ description: '没有名称' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('角色名称不能为空');
    expect(mockPrisma.role.create).not.toHaveBeenCalled();
  });

  it('returns 400 when name is duplicate', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'r-existing', name: '已存在角色' });

    const res = await request(app)
      .post('/api/roles')
      .send({ name: '已存在角色' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('角色名称已存在');
    expect(mockPrisma.role.create).not.toHaveBeenCalled();
  });

  it('returns 400 when permissionIds contains invalid ids', async () => {
    mockPrisma.role.findUnique.mockResolvedValue(null);
    mockPrisma.role.create.mockResolvedValue({ id: 'r-new', name: '新角色' });
    mockPrisma.permission.count.mockResolvedValue(1); // only 1 exists but 2 provided

    const res = await request(app)
      .post('/api/roles')
      .send({ name: '新角色', permissionIds: ['perm1', 'perm-invalid'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('部分权限ID不存在');
  });
});

describe('PUT /api/roles/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates role successfully', async () => {
    mockPrisma.role.findUnique
      .mockResolvedValueOnce({ id: 'r1', name: '旧名称' }) // existence check
      .mockResolvedValueOnce({                                // final query
        id: 'r1',
        name: '新名称',
        description: '更新描述',
        rolePermissions: [],
        _count: { userRoles: 2 },
      });
    mockPrisma.role.findFirst.mockResolvedValue(null); // no name conflict
    mockPrisma.role.update.mockResolvedValue({});

    const res = await request(app)
      .put('/api/roles/r1')
      .send({ name: '新名称', description: '更新描述' });

    expect(res.status).toBe(200);
    expect(mockPrisma.role.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { name: '新名称', description: '更新描述' },
    });
  });

  it('returns 404 when role does not exist', async () => {
    mockPrisma.role.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/roles/nonexistent')
      .send({ name: '新名称' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('角色不存在');
    expect(mockPrisma.role.update).not.toHaveBeenCalled();
  });

  it('returns 400 when new name is duplicate', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1', name: '旧名称' });
    mockPrisma.role.findFirst.mockResolvedValue({ id: 'r2', name: '冲突名称' });

    const res = await request(app)
      .put('/api/roles/r1')
      .send({ name: '冲突名称' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('角色名称已存在');
    expect(mockPrisma.role.update).not.toHaveBeenCalled();
  });

  it('replaces permissions and invalidates cache', async () => {
    mockPrisma.role.findUnique
      .mockResolvedValueOnce({ id: 'r1', name: '角色A' })
      .mockResolvedValueOnce({
        id: 'r1',
        name: '角色A',
        rolePermissions: [
          { permission: { id: 'perm3', resource: 'role', action: 'read' } },
        ],
        _count: { userRoles: 5 },
      });
    mockPrisma.role.update.mockResolvedValue({});
    mockPrisma.rolePermission.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.rolePermission.createMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .put('/api/roles/r1')
      .send({ permissionIds: ['perm3'] });

    expect(res.status).toBe(200);
    expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { roleId: 'r1' },
    });
    expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
      data: [{ roleId: 'r1', permissionId: 'perm3' }],
    });
    expect(mockInvalidateAllUserCache).toHaveBeenCalledTimes(1);
  });

  it('RBAC-015: Assign 50 permissions at once, verify cache is flushed', async () => {
    const permissionIds = Array.from({ length: 50 }, (_, i) => `perm-${i + 1}`);

    mockPrisma.role.findUnique
      .mockResolvedValueOnce({ id: 'r1', name: '大权限角色' })
      .mockResolvedValueOnce({
        id: 'r1',
        name: '大权限角色',
        rolePermissions: permissionIds.map((pid) => ({
          permission: { id: pid, resource: `res-${pid}`, action: 'read' },
        })),
        _count: { userRoles: 5 },
      });
    mockPrisma.role.update.mockResolvedValue({});
    mockPrisma.rolePermission.deleteMany.mockResolvedValue({ count: 50 });
    mockPrisma.rolePermission.createMany.mockResolvedValue({ count: 50 });

    const res = await request(app)
      .put('/api/roles/r1')
      .send({ permissionIds });

    expect(res.status).toBe(200);
    expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { roleId: 'r1' },
    });
    expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
      data: permissionIds.map((pid) => ({ roleId: 'r1', permissionId: pid })),
    });
    expect(mockInvalidateAllUserCache).toHaveBeenCalledTimes(1);
  });
});

describe('DELETE /api/roles/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes role successfully', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1', name: '待删除' });
    mockPrisma.userRole.count.mockResolvedValue(0);
    mockPrisma.role.delete.mockResolvedValue({});

    const res = await request(app).delete('/api/roles/r1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPrisma.role.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('returns 404 when role does not exist', async () => {
    mockPrisma.role.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/roles/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('角色不存在');
    expect(mockPrisma.role.delete).not.toHaveBeenCalled();
  });

  it('returns 500 on database error', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1', name: '角色' });
    mockPrisma.userRole.count.mockResolvedValue(0);
    mockPrisma.role.delete.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).delete('/api/roles/r1');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('服务器内部错误');
  });

  it('returns 400 when role has assigned users', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1', name: '已分配角色' });
    mockPrisma.userRole.count.mockResolvedValue(3);

    const res = await request(app).delete('/api/roles/r1');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/已分配给 3 个用户/);
    expect(mockPrisma.role.delete).not.toHaveBeenCalled();
  });
});
