import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';

type AuthRequest = Request & { user?: unknown };

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };
  return { mockPrisma };
});

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
}));

vi.mock('../middleware/permission', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  sanitizePagination: (page: unknown, pageSize: unknown) => {
    let pageNum = parseInt(page as string);
    let pageSizeNum = parseInt(pageSize as string);
    if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
    if (isNaN(pageSizeNum) || pageSizeNum < 1) pageSizeNum = 20;
    if (pageSizeNum > 100) pageSizeNum = 100;
    return { pageNum, pageSizeNum };
  },
}));

import auditLogRoutes from './auditLogs';

const app = express();
app.use(express.json());
app.use('/api/audit-logs', auditLogRoutes);

const sampleLog = {
  id: 'log-1',
  userId: 'user-1',
  userName: 'Admin',
  action: 'CREATE',
  resourceType: 'project',
  resourceId: 'proj-1',
  resourceName: 'Test Project',
  detail: 'Created project',
  createdAt: new Date('2026-05-01'),
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/audit-logs
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/audit-logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated audit logs', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([sampleLog]);
    mockPrisma.auditLog.count.mockResolvedValue(1);

    const res = await request(app).get('/api/audit-logs');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
  });

  it('filters by userId', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?userId=user-1');

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
  });

  it('filters by action', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?action=CREATE');

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ action: 'CREATE' }),
      }),
    );
  });

  it('filters by resourceType', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?resourceType=project');

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ resourceType: 'project' }),
      }),
    );
  });

  it('filters by date range', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?startDate=2026-05-01&endDate=2026-05-08');

    const call = mockPrisma.auditLog.findMany.mock.calls[0][0] as { where: { createdAt: { gte?: Date; lte?: Date } } };
    expect(call.where.createdAt).toBeDefined();
    expect(call.where.createdAt.gte).toEqual(new Date('2026-05-01'));
    expect(call.where.createdAt.lte).toBeDefined();
  });

  it('filters by keyword in userName or resourceName', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?keyword=Test');

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { userName: { contains: 'Test' } },
            { resourceName: { contains: 'Test' } },
          ],
        }),
      }),
    );
  });

  it('returns 500 on database error', async () => {
    mockPrisma.auditLog.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/audit-logs');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/audit-logs/users
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/audit-logs/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns distinct users from audit logs', async () => {
    const users = [
      { userId: 'user-1', userName: 'Admin' },
      { userId: 'user-2', userName: 'Test User' },
    ];
    mockPrisma.auditLog.findMany.mockResolvedValue(users);

    const res = await request(app).get('/api/audit-logs/users');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].userName).toBe('Admin');
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { userId: true, userName: true },
        distinct: ['userId'],
      }),
    );
  });

  it('returns 500 on database error', async () => {
    mockPrisma.auditLog.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/audit-logs/users');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /api/audit-logs edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies pagination with custom page and pageSize', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(50);

    const res = await request(app).get('/api/audit-logs?page=3&pageSize=10');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(3);
    expect(res.body.pageSize).toBe(10);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it('orders by createdAt descending', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs');

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('combines multiple filters', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?userId=user-1&action=DELETE&resourceType=project');

    const call = mockPrisma.auditLog.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where.userId).toBe('user-1');
    expect(call.where.action).toBe('DELETE');
    expect(call.where.resourceType).toBe('project');
  });

  it('returns empty data array when no logs match', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    const res = await request(app).get('/api/audit-logs?keyword=nonexistent');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('filters by startDate only', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?startDate=2026-01-01');

    const call = mockPrisma.auditLog.findMany.mock.calls[0][0] as { where: { createdAt: { gte?: Date; lte?: Date } } };
    expect(call.where.createdAt.gte).toEqual(new Date('2026-01-01'));
    expect(call.where.createdAt.lte).toBeUndefined();
  });

  it('filters by endDate only', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?endDate=2026-12-31');

    const call = mockPrisma.auditLog.findMany.mock.calls[0][0] as { where: { createdAt: { gte?: Date; lte?: Date } } };
    expect(call.where.createdAt.gte).toBeUndefined();
    expect(call.where.createdAt.lte).toBeDefined();
  });

  it('returns users sorted by userName ascending', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    await request(app).get('/api/audit-logs/users');

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { userName: 'asc' },
      }),
    );
  });

  it('adjusts endDate to end of day with time 23:59:59.999', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?endDate=2026-05-08');

    const call = mockPrisma.auditLog.findMany.mock.calls[0][0] as { where: { createdAt: { lte: Date } } };
    const lte = call.where.createdAt.lte;
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
    expect(lte.getSeconds()).toBe(59);
    expect(lte.getMilliseconds()).toBe(999);
  });

  it('returns default page 1 and pageSize 20 when no query params', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([sampleLog]);
    mockPrisma.auditLog.count.mockResolvedValue(1);

    const res = await request(app).get('/api/audit-logs');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
  });

  it('keyword filter uses case-sensitive contains', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?keyword=Admin');

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { userName: { contains: 'Admin' } },
            { resourceName: { contains: 'Admin' } },
          ],
        }),
      }),
    );
  });

  it('combines keyword filter with date range', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?keyword=Test&startDate=2026-01-01&endDate=2026-12-31');

    const call = mockPrisma.auditLog.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where.OR).toBeDefined();
    expect(call.where.createdAt).toBeDefined();
  });

  it('excludes OR filter when keyword is empty string', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?keyword=');

    const call = mockPrisma.auditLog.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where.OR).toBeUndefined();
  });

  it('filters by resourceId when provided', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?resourceId=proj-1');

    const call = mockPrisma.auditLog.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where).toBeDefined();
  });

  it('returns empty users list on database with no logs', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/audit-logs/users');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /users returns 500 on database error', async () => {
    mockPrisma.auditLog.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/audit-logs/users');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it('combines keyword filter with action filter', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?keyword=Test&action=CREATE');

    const call = mockPrisma.auditLog.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where.OR).toBeDefined();
    expect(call.where.action).toBe('CREATE');
  });

  it('handles concurrent requests without mixing results', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([sampleLog]);
    mockPrisma.auditLog.count.mockResolvedValue(1);

    const [res1, res2] = await Promise.all([
      request(app).get('/api/audit-logs?page=1&pageSize=10'),
      request(app).get('/api/audit-logs?page=2&pageSize=10'),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body).not.toBe(res2.body);
  });

  it('returns correct total when page is beyond data range', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(5);

    const res = await request(app).get('/api/audit-logs?page=999&pageSize=10');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.data).toEqual([]);
  });

  it('filters by all parameters simultaneously', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await request(app).get('/api/audit-logs?userId=u1&action=CREATE&resourceType=project&keyword=test&startDate=2026-01-01&endDate=2026-12-31');

    const call = mockPrisma.auditLog.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where.userId).toBe('u1');
    expect(call.where.action).toBe('CREATE');
    expect(call.where.resourceType).toBe('project');
    expect(call.where.OR).toBeDefined();
    expect(call.where.createdAt).toBeDefined();
  });

  it('GET returns empty list when no logs exist', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    const res = await request(app).get('/api/audit-logs');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('GET returns 500 on database error', async () => {
    mockPrisma.auditLog.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/audit-logs');

    expect(res.status).toBe(500);
  });

  it('GET handles page=0 by using default page', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    const res = await request(app).get('/api/audit-logs?page=0&pageSize=10');

    expect(res.status).toBe(200);
  });

  it('GET filters by keyword matching userName or resourceName', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    const res = await request(app).get('/api/audit-logs?keyword=admin');

    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
    );
  });

  it('GET returns 500 on database error', async () => {
    mockPrisma.auditLog.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/audit-logs');

    expect(res.status).toBe(500);
  });

  it('GET returns empty result with zero total', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    const res = await request(app).get('/api/audit-logs');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.data).toEqual([]);
  });

  it('GET audit-logs handles keyword filter parameter', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    const res = await request(app).get('/api/audit-logs?keyword=test');

    expect(res.status).toBe(200);
  });

  it('GET returns empty users list when only one user exists', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([{ userId: 'u1', userName: 'Admin' }]);

    const res = await request(app).get('/api/audit-logs/users');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
