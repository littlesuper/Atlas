import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockPrisma, mockBcrypt } = vi.hoisted(() => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    userRole: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    project: {
      count: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn(mockPrisma)),
  };

  const mockBcrypt = { compare: vi.fn(), hash: vi.fn(() => 'hashed-pw') };

  return { mockPrisma, mockBcrypt };
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
  invalidateUserCache: vi.fn(),
}));

vi.mock('../middleware/permission', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  sanitizePagination: (page: any, pageSize: any) => ({
    pageNum: parseInt(page) || 1,
    pageSizeNum: parseInt(pageSize) || 20,
  }),
}));

vi.mock('../utils/auditLog', () => ({
  auditLog: vi.fn(),
  diffFields: vi.fn(() => ({})),
}));

vi.mock('bcryptjs', () => ({ default: mockBcrypt }));

// ─── App setup ────────────────────────────────────────────────────────────────

import userRoutes from './users';

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated user list', async () => {
    const users = [
      {
        id: 'u1',
        username: 'zhangsan',
        realName: '张三',
        wecomUserId: null,
        canLogin: true,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        userRoles: [{ role: { id: 'r1', name: 'admin', description: null } }],
      },
    ];
    mockPrisma.user.findMany.mockResolvedValue(users);
    mockPrisma.user.count.mockResolvedValue(1);

    const res = await request(app).get('/api/users?page=1&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total', 1);
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('pageSize', 10);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toHaveProperty('roles');
  });

  it('filters by canLogin query param', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(0);

    await request(app).get('/api/users?canLogin=true');

    const callArgs = mockPrisma.user.findMany.mock.calls[0][0];
    expect(callArgs.where.canLogin).toBe(true);
  });

  it('supports keyword search', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(0);

    await request(app).get('/api/users?keyword=test');
    const callArgs = mockPrisma.user.findMany.mock.calls[0][0];
    expect(callArgs.where.OR).toBeDefined();
  });

  it('returns 500 on unexpected error', async () => {
    mockPrisma.user.findMany.mockRejectedValue(new Error('DB fail'));
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(500);
  });
});

describe('POST /api/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
  });

  it('returns 400 when realName is missing', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ username: 'test', password: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/姓名不能为空/);
  });

  it('returns 400 when canLogin=true but username/password missing', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ realName: '测试', canLogin: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/用户名和密码/);
  });

  it('returns 400 when username already exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    const res = await request(app)
      .post('/api/users')
      .send({ realName: '测试', username: 'taken', password: '123456', canLogin: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/用户名已存在/);
  });

  it('creates a user successfully (canLogin=true)', async () => {
    const newUser = {
      id: 'new-1',
      username: 'newuser',
      realName: '新用户',
      canLogin: true,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null) // username uniqueness check
      .mockResolvedValueOnce({
        ...newUser,
        userRoles: [{ role: { id: 'r1', name: 'member', description: null } }],
      }); // post-create lookup
    mockPrisma.user.create.mockResolvedValue(newUser);
    mockPrisma.userRole.createMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/users')
      .send({
        realName: '新用户',
        username: 'newuser',
        password: '123456',
        canLogin: true,
        roleIds: ['r1'],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('realName', '新用户');
  });

  it('creates a contact user (canLogin=false) without username/password', async () => {
    const newUser = {
      id: 'contact-1',
      username: null,
      realName: '联系人',
      canLogin: false,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    mockPrisma.user.create.mockResolvedValue(newUser);
    mockPrisma.user.findUnique.mockResolvedValue({
      ...newUser,
      userRoles: [],
    });

    const res = await request(app)
      .post('/api/users')
      .send({ realName: '联系人', canLogin: false });

    expect(res.status).toBe(201);
    expect(res.body.canLogin).toBe(false);
  });

  it('returns 500 on unexpected error', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockRejectedValue(new Error('TX fail'));
    const res = await request(app)
      .post('/api/users')
      .send({ realName: '测试', canLogin: false });
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/users/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
  });

  it('returns 404 when user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/users/nonexistent')
      .send({ realName: 'Updated' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/用户不存在/);
  });

  it('returns 400 when enabling login without username/password', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      username: null,
      password: null,
      canLogin: false,
      realName: 'Test',
    });
    const res = await request(app)
      .put('/api/users/u1')
      .send({ canLogin: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/用户名和密码/);
  });

  it('returns 400 when new username already taken', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      username: 'oldname',
      canLogin: true,
      realName: 'Test',
    });
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u2' }); // username taken

    const res = await request(app)
      .put('/api/users/u1')
      .send({ username: 'taken' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/已被使用/);
  });

  it('updates user successfully', async () => {
    const existing = {
      id: 'u1',
      username: 'testuser',
      realName: 'Old Name',
      canLogin: true,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(existing) // existence check
      .mockResolvedValueOnce({
        ...existing,
        realName: 'New Name',
        userRoles: [{ role: { id: 'r1', name: 'admin', description: null } }],
      }); // post-update lookup
    mockPrisma.user.update.mockResolvedValue({ ...existing, realName: 'New Name' });

    const res = await request(app)
      .put('/api/users/u1')
      .send({ realName: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.realName).toBe('New Name');
  });
});

describe('DELETE /api/users/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app).delete('/api/users/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/用户不存在/);
  });

  it('returns 400 when user is a project manager', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', realName: 'PM' });
    mockPrisma.project.count.mockResolvedValue(3);

    const res = await request(app).delete('/api/users/u1');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/项目经理/);
  });

  it('deletes user successfully', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', realName: 'Test' });
    mockPrisma.project.count.mockResolvedValue(0);
    mockPrisma.user.delete.mockResolvedValue({});

    const res = await request(app).delete('/api/users/u1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 500 on unexpected error', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', realName: 'Test' });
    mockPrisma.project.count.mockResolvedValue(0);
    mockPrisma.user.delete.mockRejectedValue(new Error('cascade fail'));

    const res = await request(app).delete('/api/users/u1');
    expect(res.status).toBe(500);
  });
});
