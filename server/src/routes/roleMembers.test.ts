import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    roleMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    role: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    activityExecutor: {
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    activity: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn({
      roleMember: {
        update: vi.fn(),
        create: vi.fn(),
      },
    })),
  };
  return { mockPrisma };
});

const mockAutoAssignByRole = vi.fn().mockResolvedValue([]);
const mockFindActiveActivitiesByExecutor = vi.fn().mockResolvedValue([]);

vi.mock('@prisma/client', () => ({
  PrismaClient: class { constructor() { return mockPrisma as any; } },
}));

vi.mock('../utils/roleMembershipResolver', () => ({
  autoAssignByRole: (...args: any[]) => mockAutoAssignByRole(...args),
  findActiveActivitiesByExecutor: (...args: any[]) => mockFindActiveActivitiesByExecutor(...args),
  resolveRoleMembers: vi.fn().mockResolvedValue([]),
  findRolesByUser: vi.fn().mockResolvedValue([]),
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', username: 'admin', realName: 'Admin', roles: [], permissions: ['*:*'], collaboratingProjectIds: [] };
    next();
  },
}));

vi.mock('../middleware/permission', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  isAdmin: vi.fn().mockReturnValue(true),
}));

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import roleMembersRoutes from './roleMembers';

const app = express();
app.use(express.json());
app.use('/api/role-members', roleMembersRoutes);

describe('GET /api/role-members', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all active members', async () => {
    mockPrisma.roleMember.findMany.mockResolvedValue([
      { roleId: 'r1', user: { id: 'u1', realName: '张三', canLogin: true }, role: { id: 'r1', name: '硬件工程师' }, sortOrder: 0, isActive: true, createdAt: new Date() },
    ]);
    const res = await request(app).get('/api/role-members');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by roleId', async () => {
    mockPrisma.roleMember.findMany.mockResolvedValue([]);
    await request(app).get('/api/role-members?roleId=r1');
    expect(mockPrisma.roleMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ roleId: 'r1' }) })
    );
  });
});

describe('POST /api/role-members', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a new member', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1', name: '硬件工程师' });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', realName: '张三' });
    mockPrisma.roleMember.findUnique.mockResolvedValue(null);
    mockPrisma.roleMember.create.mockResolvedValue({ id: 'rm1', roleId: 'r1', userId: 'u1', role: { id: 'r1', name: '硬件工程师' }, user: { id: 'u1', realName: '张三', canLogin: true } });

    const res = await request(app).post('/api/role-members').send({ roleId: 'r1', userId: 'u1', sortOrder: 0 });
    expect(res.status).toBe(201);
  });

  it('returns 409 for duplicate active member', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1', name: '硬件工程师' });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', realName: '张三' });
    mockPrisma.roleMember.findUnique.mockResolvedValue({ id: 'rm1', roleId: 'r1', userId: 'u1', isActive: true });

    const res = await request(app).post('/api/role-members').send({ roleId: 'r1', userId: 'u1' });
    expect(res.status).toBe(409);
  });

  it('restores soft-deleted member', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1', name: '硬件工程师' });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', realName: '张三' });
    mockPrisma.roleMember.findUnique.mockResolvedValue({ id: 'rm1', roleId: 'r1', userId: 'u1', isActive: false, sortOrder: 0 });
    mockPrisma.roleMember.update.mockResolvedValue({ id: 'rm1', isActive: true, role: { id: 'r1', name: '硬件工程师' }, user: { id: 'u1', realName: '张三', canLogin: true } });

    const res = await request(app).post('/api/role-members').send({ roleId: 'r1', userId: 'u1' });
    expect(res.status).toBe(201);
    expect(mockPrisma.roleMember.update).toHaveBeenCalled();
  });
});

describe('PATCH /api/role-members/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates sortOrder', async () => {
    mockPrisma.roleMember.findUnique.mockResolvedValue({ id: 'rm1', sortOrder: 0 });
    mockPrisma.roleMember.update.mockResolvedValue({ id: 'rm1', sortOrder: 1, role: { id: 'r1', name: '硬件工程师' }, user: { id: 'u1', realName: '张三', canLogin: true } });

    const res = await request(app).patch('/api/role-members/rm1').send({ sortOrder: 1 });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/role-members/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('soft-deletes with keep mode (default)', async () => {
    mockPrisma.roleMember.findUnique.mockResolvedValue({ id: 'rm1', roleId: 'r1', userId: 'u1', role: { name: '硬件工程师' }, user: { realName: '张三' } });
    mockPrisma.roleMember.update.mockResolvedValue({ id: 'rm1', isActive: false });
    mockFindActiveActivitiesByExecutor.mockResolvedValue([]);

    const res = await request(app).delete('/api/role-members/rm1');
    expect(res.status).toBe(200);
    expect(res.body.cascadedActivityCount).toBe(0);
  });

  it('cascades removeAll mode', async () => {
    mockPrisma.roleMember.findUnique.mockResolvedValue({ id: 'rm1', roleId: 'r1', userId: 'u1', role: { name: '硬件工程师' }, user: { realName: '张三' } });
    mockPrisma.roleMember.update.mockResolvedValue({ id: 'rm1', isActive: false });
    mockFindActiveActivitiesByExecutor.mockResolvedValue([
      { activityId: 'act-1', activityName: 'PCB打样', projectId: 'proj-1', projectName: '项目A' },
    ]);
    mockPrisma.activityExecutor.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.activityExecutor.count.mockResolvedValue(0);
    mockPrisma.activity.findUnique.mockResolvedValue({ id: 'act-1', name: 'PCB打样' });

    const res = await request(app).delete('/api/role-members/rm1?cascadeMode=removeAll');
    expect(res.status).toBe(200);
    expect(res.body.cascadedActivityCount).toBe(1);
  });
});

describe('POST /api/role-members/batch-set', () => {
  beforeEach(() => vi.clearAllMocks());

  it('performs batch set (add, update, soft-delete)', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1', name: '硬件工程师' });
    mockPrisma.roleMember.findMany.mockResolvedValue([
      { id: 'rm-old', userId: 'u-old', isActive: true },
      { id: 'rm-existing', userId: 'u1', isActive: true },
    ]);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      return fn({
        roleMember: { update: vi.fn(), create: vi.fn() },
      });
    });
    mockPrisma.roleMember.findMany.mockResolvedValueOnce([
      { id: 'rm-old', userId: 'u-old', isActive: true },
      { id: 'rm-existing', userId: 'u1', isActive: true },
    ]).mockResolvedValueOnce([
      { id: 'rm-existing', userId: 'u1', sortOrder: 0, isActive: true, role: { id: 'r1', name: '硬件工程师' }, user: { id: 'u1', realName: '张三', canLogin: true } },
      { id: 'rm-new', userId: 'u2', sortOrder: 1, isActive: true, role: { id: 'r1', name: '硬件工程师' }, user: { id: 'u2', realName: '李四', canLogin: true } },
    ]);

    const res = await request(app).post('/api/role-members/batch-set').send({
      roleId: 'r1',
      members: [{ userId: 'u1', sortOrder: 0 }, { userId: 'u2', sortOrder: 1 }],
    });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/role-members/preview/:roleId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns preview with members', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1', name: '硬件工程师' });
    mockPrisma.roleMember.findMany.mockResolvedValue([
      { user: { id: 'u1', realName: '张三', canLogin: true }, sortOrder: 0 },
    ]);

    const res = await request(app).get('/api/role-members/preview/r1');
    expect(res.status).toBe(200);
    expect(res.body.isEmpty).toBe(false);
    expect(res.body.members).toHaveLength(1);
  });

  it('returns isEmpty=true for empty role', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1', name: '空角色' });
    mockPrisma.roleMember.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/role-members/preview/r1');
    expect(res.status).toBe(200);
    expect(res.body.isEmpty).toBe(true);
  });
});
