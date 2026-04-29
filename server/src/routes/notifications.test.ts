import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    notification: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    activity: {
      findMany: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
    },
    weeklyReport: {
      findFirst: vi.fn(),
    },
  };
  return { mockPrisma };
});

// ─── vi.mock calls ────────────────────────────────────────────────────────────

vi.mock('@prisma/client', () => ({
  PrismaClient: class { constructor() { return mockPrisma as any; } },
}));

const mockUser = {
  id: 'user-1',
  username: 'admin',
  realName: '管理员',
  roles: [{ name: '系统管理员' }],
  permissions: ['*:*'],
  collaboratingProjectIds: [],
};

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { ...mockUser };
    next();
  },
}));

// ─── App setup (admin) ──────────────────────────────────────────────────────

import notificationsRoutes from './notifications';

const app = express();
app.use(express.json());
app.use('/api/notifications', notificationsRoutes);


// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated notifications with unreadCount', async () => {
    const notifications = [
      { id: 'n-1', userId: 'user-1', type: 'ACTIVITY_DUE', title: '活动即将到期', content: '测试内容', isRead: false, createdAt: '2026-03-27T00:00:00Z' },
      { id: 'n-2', userId: 'user-1', type: 'MILESTONE_APPROACHING', title: '里程碑即将到来', content: '测试内容2', isRead: true, createdAt: '2026-03-26T00:00:00Z' },
    ];
    mockPrisma.notification.findMany.mockResolvedValue(notifications);
    mockPrisma.notification.count
      .mockResolvedValueOnce(2)   // total
      .mockResolvedValueOnce(1);  // unreadCount

    const res = await request(app).get('/api/notifications?page=1&pageSize=10');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
    expect(res.body.unreadCount).toBe(1);
  });

  it('filters by current user ID', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([]);
    mockPrisma.notification.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    await request(app).get('/api/notifications');

    // Verify findMany was called with userId filter
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
      }),
    );
    // Verify count was called with userId filter
    expect(mockPrisma.notification.count).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(mockPrisma.notification.count).toHaveBeenCalledWith({ where: { userId: 'user-1', isRead: false } });
  });

  it('uses default pagination when no query params', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([]);
    mockPrisma.notification.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const res = await request(app).get('/api/notifications');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.notification.findMany.mockRejectedValue(new Error('DB fail'));
    mockPrisma.notification.count.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/notifications');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('服务器内部错误');
  });
});

describe('PUT /api/notifications/:id/read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks notification as read', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({
      id: 'n-1',
      userId: 'user-1',
      isRead: false,
    });
    mockPrisma.notification.update.mockResolvedValue({
      id: 'n-1',
      userId: 'user-1',
      isRead: true,
    });

    const res = await request(app).put('/api/notifications/n-1/read');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPrisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: { isRead: true },
    });
  });

  it('returns 404 for non-existent notification', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue(null);

    const res = await request(app).put('/api/notifications/nonexistent/read');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('通知不存在');
  });

  it('returns 404 when notification belongs to another user', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({
      id: 'n-1',
      userId: 'user-other',
      isRead: false,
    });

    const res = await request(app).put('/api/notifications/n-1/read');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('通知不存在');
    expect(mockPrisma.notification.update).not.toHaveBeenCalled();
  });

  it('returns 500 on database error', async () => {
    mockPrisma.notification.findUnique.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).put('/api/notifications/n-1/read');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('服务器内部错误');
  });
});

describe('PUT /api/notifications/read-all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks all notifications as read for current user', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

    const res = await request(app).put('/api/notifications/read-all');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
      data: { isRead: true },
    });
  });

  it('succeeds even when no unread notifications exist', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app).put('/api/notifications/read-all');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.notification.updateMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).put('/api/notifications/read-all');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('服务器内部错误');
  });
});

describe('DELETE /api/notifications/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes notification successfully', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({
      id: 'n-1',
      userId: 'user-1',
    });
    mockPrisma.notification.delete.mockResolvedValue({});

    const res = await request(app).delete('/api/notifications/n-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPrisma.notification.delete).toHaveBeenCalledWith({ where: { id: 'n-1' } });
  });

  it('returns 404 for non-existent notification', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/notifications/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('通知不存在');
  });

  it('returns 404 when notification belongs to another user', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({
      id: 'n-1',
      userId: 'user-other',
    });

    const res = await request(app).delete('/api/notifications/n-1');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('通知不存在');
    expect(mockPrisma.notification.delete).not.toHaveBeenCalled();
  });

  it('returns 500 on database error', async () => {
    mockPrisma.notification.findUnique.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).delete('/api/notifications/n-1');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('服务器内部错误');
  });
});

describe('POST /api/notifications/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for non-admin user', async () => {
    // Temporarily switch to non-admin permissions
    const originalPermissions = mockUser.permissions;
    mockUser.permissions = ['project:read'];

    const res = await request(app).post('/api/notifications/generate');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('只有管理员可以触发通知生成');

    // Restore admin permissions
    mockUser.permissions = originalPermissions;
  });

  it('generates notifications for due-soon activities (admin)', async () => {
    // Activity due within 3 days
    mockPrisma.activity.findMany
      .mockResolvedValueOnce([
        {
          id: 'a-1',
          name: '测试活动',
          executors: [{ userId: 'user-2' }],
          project: { name: '测试项目' },
        },
      ])
      .mockResolvedValueOnce([]); // no milestones

    // No existing notification (24h dedup)
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockPrisma.notification.create.mockResolvedValue({});
    mockPrisma.project.findMany.mockResolvedValue([]); // no weekly report projects

    const res = await request(app).post('/api/notifications/generate');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.generatedCount).toBeGreaterThanOrEqual(1);
    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-2',
          type: 'ACTIVITY_DUE',
          title: '活动即将到期',
          relatedId: 'a-1',
        }),
      }),
    );
  });

  it('skips duplicate notifications within 24 hours', async () => {
    mockPrisma.activity.findMany
      .mockResolvedValueOnce([
        {
          id: 'a-1',
          name: '测试活动',
          executors: [{ userId: 'user-2' }],
          project: { name: '测试项目' },
        },
      ])
      .mockResolvedValueOnce([]); // no milestones

    // Existing notification found (24h dedup)
    mockPrisma.notification.findFirst.mockResolvedValue({ id: 'existing-notif' });
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).post('/api/notifications/generate');

    expect(res.status).toBe(200);
    expect(res.body.generatedCount).toBe(0);
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('generates milestone approaching notifications', async () => {
    mockPrisma.activity.findMany
      .mockResolvedValueOnce([])   // no due-soon activities
      .mockResolvedValueOnce([     // milestone approaching
        {
          id: 'm-1',
          name: '里程碑1',
          type: 'MILESTONE',
          executors: [{ userId: 'user-2' }],
          project: { name: '测试项目', managerId: 'user-3' },
        },
      ]);

    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockPrisma.notification.create.mockResolvedValue({});
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).post('/api/notifications/generate');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Should generate for both assignee (user-2) and project manager (user-3)
    expect(res.body.generatedCount).toBe(2);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.activity.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).post('/api/notifications/generate');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('服务器内部错误');
  });
});
