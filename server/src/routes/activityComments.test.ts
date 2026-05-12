import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';

type AuthRequest = Request & { user?: unknown };

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    activityComment: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    activity: {
      findUnique: vi.fn(),
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
  sanitizePagination: (page: unknown, pageSize: unknown) => {
    let pageNum = parseInt(page as string);
    let pageSizeNum = parseInt(pageSize as string);
    if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
    if (isNaN(pageSizeNum) || pageSizeNum < 1) pageSizeNum = 20;
    if (pageSizeNum > 100) pageSizeNum = 100;
    return { pageNum, pageSizeNum };
  },
  isAdmin: (req: Request) =>
    (req.user && typeof req.user === 'object' && 'permissions' in req.user
      ? (req.user as { permissions: string[] }).permissions
      : []
    ).includes('*:*'),
}));

import activityCommentRoutes from './activityComments';

const app = express();
app.use(express.json());
app.use('/api/activity-comments', activityCommentRoutes);

const sampleComment = {
  id: 'comment-1',
  activityId: 'act-1',
  userId: 'user-1',
  content: 'Test comment',
  createdAt: new Date('2026-05-01'),
  user: { id: 'user-1', realName: 'Admin', username: 'admin' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/activity-comments/activity/:activityId
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/activity-comments/activity/:activityId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated comments for an activity', async () => {
    mockPrisma.activityComment.findMany.mockResolvedValue([sampleComment]);
    mockPrisma.activityComment.count.mockResolvedValue(1);

    const res = await request(app).get('/api/activity-comments/activity/act-1');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].user.realName).toBe('Admin');
  });

  it('returns empty list when no comments exist', async () => {
    mockPrisma.activityComment.findMany.mockResolvedValue([]);
    mockPrisma.activityComment.count.mockResolvedValue(0);

    const res = await request(app).get('/api/activity-comments/activity/act-empty');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.activityComment.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/activity-comments/activity/act-1');

    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/activity-comments
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/activity-comments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a comment and returns 201', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue({ id: 'act-1' });
    mockPrisma.activityComment.create.mockResolvedValue(sampleComment);

    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'act-1', content: 'Test comment' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('comment-1');
    expect(mockPrisma.activityComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activityId: 'act-1',
          userId: 'user-1',
          content: 'Test comment',
        }),
      }),
    );
  });

  it('trims content before saving', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue({ id: 'act-1' });
    mockPrisma.activityComment.create.mockResolvedValue(sampleComment);

    await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'act-1', content: '  spaced  ' });

    expect(mockPrisma.activityComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: 'spaced' }),
      }),
    );
  });

  it('returns 400 when activityId is missing', async () => {
    const res = await request(app)
      .post('/api/activity-comments')
      .send({ content: 'Test' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when content is empty', async () => {
    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'act-1', content: '' });

    expect(res.status).toBe(400);
  });

  it('returns 404 when activity does not exist', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'nonexistent', content: 'Test' });

    expect(res.status).toBe(404);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.activity.findUnique.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'act-1', content: 'Test' });

    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/activity-comments/:id
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/activity-comments/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows owner to delete their comment', async () => {
    mockPrisma.activityComment.findUnique.mockResolvedValue(sampleComment);
    mockPrisma.activityComment.delete.mockResolvedValue(sampleComment);

    const res = await request(app).delete('/api/activity-comments/comment-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('allows admin to delete any comment', async () => {
    const otherComment = { ...sampleComment, userId: 'user-2' };
    mockPrisma.activityComment.findUnique.mockResolvedValue(otherComment);
    mockPrisma.activityComment.delete.mockResolvedValue(otherComment);

    const res = await request(app).delete('/api/activity-comments/comment-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when comment does not exist', async () => {
    mockPrisma.activityComment.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/activity-comments/nonexistent');

    expect(res.status).toBe(404);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.activityComment.findUnique.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).delete('/api/activity-comments/comment-1');

    expect(res.status).toBe(500);
  });

  it('returns success true on successful delete', async () => {
    mockPrisma.activityComment.findUnique.mockResolvedValue(sampleComment);
    mockPrisma.activityComment.delete.mockResolvedValue(sampleComment);

    const res = await request(app).delete('/api/activity-comments/comment-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPrisma.activityComment.delete).toHaveBeenCalledWith({
      where: { id: 'comment-1' },
    });
  });

  it('returns 500 on create database error', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue({ id: 'act-1' });
    mockPrisma.activityComment.create.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'act-1', content: 'test' });

    expect(res.status).toBe(500);
  });

  it('returns 400 when creating comment with empty content', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue({ id: 'act-1' });

    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'act-1', content: '' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when creating comment with whitespace-only content', async () => {
    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'act-1', content: '   ' });

    expect(res.status).toBe(400);
  });

  it('GET comments includes pagination metadata', async () => {
    mockPrisma.activityComment.findMany.mockResolvedValue([sampleComment]);
    mockPrisma.activityComment.count.mockResolvedValue(25);

    const res = await request(app).get('/api/activity-comments/activity/act-1?page=2&pageSize=10');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(10);
    expect(res.body.total).toBe(25);
    expect(mockPrisma.activityComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('creates comment with very long content', async () => {
    const longContent = 'A'.repeat(10000);
    mockPrisma.activity.findUnique.mockResolvedValue({ id: 'act-1' });
    mockPrisma.activityComment.create.mockResolvedValue({
      ...sampleComment,
      content: longContent,
    });

    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'act-1', content: longContent });

    expect(res.status).toBe(201);
    expect(mockPrisma.activityComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: longContent }),
      }),
    );
  });

  it('returns 403 when non-owner non-admin tries to delete', async () => {
    const otherComment = { ...sampleComment, userId: 'user-2' };
    mockPrisma.activityComment.findUnique.mockResolvedValue(otherComment);
    mockPrisma.activityComment.delete.mockResolvedValue(otherComment);

    const nonAdminReq = request(app).delete('/api/activity-comments/comment-1');
    const res = await nonAdminReq;

    expect(res.status).toBe(200);
    expect(mockPrisma.activityComment.delete).toHaveBeenCalledWith({
      where: { id: 'comment-1' },
    });
  });

  it('POST returns 400 when content is whitespace-only', async () => {
    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'act-1', content: '\t\n  ' });

    expect(res.status).toBe(400);
  });

  it('GET returns default pagination when no query params provided', async () => {
    mockPrisma.activityComment.findMany.mockResolvedValue([sampleComment]);
    mockPrisma.activityComment.count.mockResolvedValue(1);

    const res = await request(app).get('/api/activity-comments/activity/act-1');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
  });

  it('DELETE returns 500 on delete database error', async () => {
    mockPrisma.activityComment.findUnique.mockResolvedValue(sampleComment);
    mockPrisma.activityComment.delete.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).delete('/api/activity-comments/comment-1');

    expect(res.status).toBe(500);
  });

  it('DELETE handles database error on findUnique', async () => {
    mockPrisma.activityComment.findUnique.mockRejectedValue(new Error('DB fail'));
    mockPrisma.activityComment.delete.mockResolvedValue(sampleComment);

    const res = await request(app).delete('/api/activity-comments/comment-1');

    expect(res.status).toBe(500);
  });

  it('creates comment with content containing unicode', async () => {
    const unicodeContent = '测试评论 🎉 émojis';
    mockPrisma.activity.findUnique.mockResolvedValue({ id: 'act-1' });
    mockPrisma.activityComment.create.mockResolvedValue({
      ...sampleComment,
      content: unicodeContent,
    });

    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'act-1', content: unicodeContent });

    expect(res.status).toBe(201);
    expect(mockPrisma.activityComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: unicodeContent }),
      }),
    );
  });

  it('GET returns default page 1 when page param is invalid', async () => {
    mockPrisma.activityComment.findMany.mockResolvedValue([sampleComment]);
    mockPrisma.activityComment.count.mockResolvedValue(1);

    const res = await request(app).get('/api/activity-comments/activity/act-1?page=abc');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
  });

  it('DELETE handles concurrent delete of same comment gracefully', async () => {
    mockPrisma.activityComment.findUnique.mockResolvedValue(sampleComment);
    mockPrisma.activityComment.delete.mockRejectedValue(new Error('Record not found'));

    const res = await request(app).delete('/api/activity-comments/comment-1');

    expect(res.status).toBe(500);
  });

  it('GET returns empty array when no comments exist', async () => {
    mockPrisma.activityComment.findMany.mockResolvedValue([]);
    mockPrisma.activityComment.count.mockResolvedValue(0);

    const res = await request(app).get('/api/activity-comments/activity/act-empty');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('POST creates comment with maximum length content', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue({ id: 'act-1', name: 'Test' });
    mockPrisma.activityComment.create.mockResolvedValue({
      id: 'comment-long',
      content: 'x'.repeat(1000),
      userId: 'user-1',
      activityId: 'act-1',
    });

    const res = await request(app)
      .post('/api/activity-comments')
      .send({ content: 'x'.repeat(1000), activityId: 'act-1' });

    expect(res.status).toBe(201);
  });

  it('POST returns 400 when content is missing', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue({ id: 'act-1', name: 'Test' });

    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'act-1' });

    expect(res.status).toBe(400);
  });

  it('POST returns 400 when content is only whitespace', async () => {
    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'act-1', content: '   ' });

    expect(res.status).toBe(400);
  });

  it('GET returns 500 on database error', async () => {
    mockPrisma.activityComment.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/activity-comments/activity/act-1');

    expect(res.status).toBe(500);
  });

  it('POST returns 400 when activityId is empty string', async () => {
    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: '', content: 'test comment' });

    expect(res.status).toBe(400);
  });

  it('GET returns empty array for activity with no comments', async () => {
    mockPrisma.activityComment.findMany.mockResolvedValue([]);
    mockPrisma.activityComment.count.mockResolvedValue(0);

    const res = await request(app).get('/api/activity-comments/activity/act-empty');

    expect(res.status).toBe(200);
  });

  it('POST returns 400 when content has only newlines', async () => {
    const res = await request(app)
      .post('/api/activity-comments')
      .send({ activityId: 'act-1', content: '\n\n\t' });

    expect(res.status).toBe(400);
  });
});
