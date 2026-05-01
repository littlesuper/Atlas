import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { mockPrisma, mockUser } = vi.hoisted(() => {
  const mockPrisma = {
    activity: {
      findUnique: vi.fn(),
    },
    activityComment: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  };
  const mockUser = {
    id: 'user-1',
    username: 'zhangsan',
    realName: '张三',
    roles: [],
    permissions: [] as string[],
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

import activityCommentsRoutes from './activityComments';

const app = express();
app.use(express.json());
app.use('/api/activity-comments', activityCommentsRoutes);

const makeComment = (overrides: Record<string, unknown> = {}) => ({
  id: 'comment-1',
  activityId: 'activity-1',
  userId: 'user-1',
  content: '需要同步结构件进展',
  createdAt: new Date('2026-05-01T08:00:00.000Z'),
  user: { id: 'user-1', realName: '张三', username: 'zhangsan' },
  ...overrides,
});

describe('GET /api/activity-comments/activity/:activityId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.id = 'user-1';
    mockUser.permissions = [];
  });

  it('returns paginated comments for an activity', async () => {
    mockPrisma.activityComment.findMany.mockResolvedValue([
      makeComment({ id: 'comment-1' }),
      makeComment({ id: 'comment-2', content: '第二条评论' }),
    ]);
    mockPrisma.activityComment.count.mockResolvedValue(2);

    const res = await request(app).get('/api/activity-comments/activity/activity-1?page=2&pageSize=5');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(5);
    expect(mockPrisma.activityComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activityId: 'activity-1' },
        skip: 5,
        take: 5,
        include: { user: { select: { id: true, realName: true, username: true } } },
      }),
    );
  });

  it('sanitizes invalid pagination to safe defaults', async () => {
    mockPrisma.activityComment.findMany.mockResolvedValue([]);
    mockPrisma.activityComment.count.mockResolvedValue(0);

    const res = await request(app).get('/api/activity-comments/activity/activity-1?page=-1&pageSize=10000');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(100);
    expect(mockPrisma.activityComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 100 }),
    );
  });
});

describe('POST /api/activity-comments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.id = 'user-1';
    mockUser.permissions = [];
  });

  it('rejects missing activityId or blank content', async () => {
    const missingActivity = await request(app)
      .post('/api/activity-comments')
      .send({ content: '有效评论' });
    const blankContent = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'activity-1', content: '   ' });

    expect(missingActivity.status).toBe(400);
    expect(blankContent.status).toBe(400);
    expect(mockPrisma.activity.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when target activity does not exist', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'missing-activity', content: '这条评论不会创建' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('活动不存在');
    expect(mockPrisma.activityComment.create).not.toHaveBeenCalled();
  });

  it('creates a trimmed comment for the authenticated user', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue({ id: 'activity-1' });
    mockPrisma.activityComment.create.mockResolvedValue(makeComment({ content: '需要同步结构件进展' }));

    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'activity-1', content: '  需要同步结构件进展  ' });

    expect(res.status).toBe(201);
    expect(res.body.content).toBe('需要同步结构件进展');
    expect(mockPrisma.activityComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          activityId: 'activity-1',
          userId: 'user-1',
          content: '需要同步结构件进展',
        },
      }),
    );
  });
});

describe('DELETE /api/activity-comments/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.id = 'user-1';
    mockUser.permissions = [];
  });

  it('returns 404 when comment does not exist', async () => {
    mockPrisma.activityComment.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/activity-comments/missing-comment');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('评论不存在');
    expect(mockPrisma.activityComment.delete).not.toHaveBeenCalled();
  });

  it('allows the author to delete their own comment', async () => {
    mockPrisma.activityComment.findUnique.mockResolvedValue(makeComment({ userId: 'user-1' }));
    mockPrisma.activityComment.delete.mockResolvedValue(makeComment());

    const res = await request(app).delete('/api/activity-comments/comment-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPrisma.activityComment.delete).toHaveBeenCalledWith({ where: { id: 'comment-1' } });
  });

  it('allows an admin to delete another user comment', async () => {
    mockUser.permissions = ['*:*'];
    mockPrisma.activityComment.findUnique.mockResolvedValue(makeComment({ userId: 'user-2' }));
    mockPrisma.activityComment.delete.mockResolvedValue(makeComment());

    const res = await request(app).delete('/api/activity-comments/comment-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects deleting another user comment without admin permission', async () => {
    mockPrisma.activityComment.findUnique.mockResolvedValue(makeComment({ userId: 'user-2' }));

    const res = await request(app).delete('/api/activity-comments/comment-1');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('只能删除自己的评论');
    expect(mockPrisma.activityComment.delete).not.toHaveBeenCalled();
  });
});
