import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { mockPrisma, mockUser } = vi.hoisted(() => {
  const mockPrisma = {
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };
  const mockUser = {
    id: 'admin-1',
    username: 'admin',
    realName: '管理员',
    roles: [],
    permissions: ['system:audit_log'] as string[],
    collaboratingProjectIds: [] as string[],
  };
  return { mockPrisma, mockUser };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: class { constructor() { return mockPrisma; } },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request & { user?: typeof mockUser }, _res: Response, next: NextFunction) => {
    req.user = { ...mockUser, permissions: [...mockUser.permissions] };
    next();
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import auditLogRoutes from './auditLogs';

const app = express();
app.use(express.json());
app.use('/api/audit-logs', auditLogRoutes);

const makeAuditLog = (overrides: Record<string, unknown> = {}) => ({
  id: 'log-1',
  userId: 'user-1',
  userName: '张三',
  action: 'UPDATE',
  resourceType: 'PROJECT',
  resourceName: '项目 A',
  createdAt: new Date('2026-05-01T08:00:00.000Z'),
  ...overrides,
});

describe('GET /api/audit-logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.permissions = ['system:audit_log'];
  });

  it('rejects users without audit log permission', async () => {
    mockUser.permissions = ['project:read'];

    const res = await request(app).get('/api/audit-logs');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('权限不足');
    expect(mockPrisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('returns paginated audit logs for authorized users', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      makeAuditLog({ id: 'log-1' }),
      makeAuditLog({ id: 'log-2', action: 'CREATE' }),
    ]);
    mockPrisma.auditLog.count.mockResolvedValue(2);

    const res = await request(app).get('/api/audit-logs?page=2&pageSize=10');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(10);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('builds filters for user, action, resource, date range, and keyword', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);
    const expectedEndDate = new Date('2026-05-02');
    expectedEndDate.setHours(23, 59, 59, 999);

    const res = await request(app)
      .get('/api/audit-logs')
      .query({
        userId: 'user-1',
        action: 'UPDATE',
        resourceType: 'PROJECT',
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        keyword: '张三',
      });

    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          action: 'UPDATE',
          resourceType: 'PROJECT',
          createdAt: {
            gte: new Date('2026-05-01'),
            lte: expectedEndDate,
          },
          OR: [
            { userName: { contains: '张三' } },
            { resourceName: { contains: '张三' } },
          ],
        },
      }),
    );
    expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ userId: 'user-1', action: 'UPDATE' }),
    });
  });

  it('returns 500 without leaking database errors', async () => {
    mockPrisma.auditLog.findMany.mockRejectedValue(new Error('database password leaked'));
    mockPrisma.auditLog.count.mockRejectedValue(new Error('database password leaked'));

    const res = await request(app).get('/api/audit-logs');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: '服务器内部错误' });
  });
});

describe('GET /api/audit-logs/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.permissions = ['system:audit_log'];
  });

  it('rejects users without audit log permission', async () => {
    mockUser.permissions = ['project:read'];

    const res = await request(app).get('/api/audit-logs/users');

    expect(res.status).toBe(403);
    expect(mockPrisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('returns distinct users for the filter dropdown', async () => {
    const users = [
      { userId: 'user-1', userName: '张三' },
      { userId: 'user-2', userName: '李四' },
    ];
    mockPrisma.auditLog.findMany.mockResolvedValue(users);

    const res = await request(app).get('/api/audit-logs/users');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(users);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
      select: { userId: true, userName: true },
      distinct: ['userId'],
      orderBy: { userName: 'asc' },
    });
  });
});
