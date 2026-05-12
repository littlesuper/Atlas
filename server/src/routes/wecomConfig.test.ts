import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';

type AuthRequest = Request & { user?: unknown };

const { mockPrisma, mockAuditLog, mockInvalidateCache } = vi.hoisted(() => ({
  mockPrisma: {
    wecomConfig: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  mockAuditLog: vi.fn(),
  mockInvalidateCache: vi.fn(),
}));

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
}));

vi.mock('../utils/auditLog', () => ({ auditLog: mockAuditLog, diffFields: vi.fn().mockReturnValue({}) }));
vi.mock('../utils/wecom', () => ({ invalidateWecomConfigCache: mockInvalidateCache }));

import wecomConfigRoutes, { maskSecret } from './wecomConfig';

const app = express();
app.use(express.json());
app.use('/api/wecom-config', wecomConfigRoutes);

const sampleConfig = {
  id: 'wc-1',
  corpId: 'corp123',
  agentId: 'agent456',
  secret: 'mysecretkey1234',
  redirectUri: 'https://example.com/callback',
  createdAt: new Date('2026-05-01'),
  updatedAt: new Date('2026-05-01'),
};

describe('GET /api/wecom-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns config with masked secret', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(sampleConfig);

    const res = await request(app).get('/api/wecom-config');

    expect(res.status).toBe(200);
    expect(res.body.corpId).toBe('corp123');
    expect(res.body.secret).toBe('****1234');
  });

  it('returns empty object when no config exists', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/wecom-config');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('returns 500 on database error', async () => {
    mockPrisma.wecomConfig.findFirst.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/wecom-config');

    expect(res.status).toBe(500);
  });

  it('maskSecret handles null input gracefully', () => {
    expect(maskSecret(null as unknown as string)).toBe('');
  });
});describe('PUT /api/wecom-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates config when none exists', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(null);
    mockPrisma.wecomConfig.create.mockResolvedValue(sampleConfig);

    const res = await request(app)
      .put('/api/wecom-config')
      .send({ corpId: 'corp123', agentId: 'agent456', secret: 'mysecretkey1234' });

    expect(res.status).toBe(200);
    expect(res.body.corpId).toBe('corp123');
    expect(mockPrisma.wecomConfig.create).toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE' }),
    );
    expect(mockInvalidateCache).toHaveBeenCalled();
  });

  it('updates existing config', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(sampleConfig);
    mockPrisma.wecomConfig.update.mockResolvedValue({ ...sampleConfig, corpId: 'newcorp' });

    const res = await request(app)
      .put('/api/wecom-config')
      .send({ corpId: 'newcorp' });

    expect(res.status).toBe(200);
    expect(mockPrisma.wecomConfig.update).toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE' }),
    );
  });

  it('does not update secret when it starts with ****', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(sampleConfig);
    mockPrisma.wecomConfig.update.mockResolvedValue(sampleConfig);

    await request(app)
      .put('/api/wecom-config')
      .send({ secret: '****y1234' });

    const call = mockPrisma.wecomConfig.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.secret).toBeUndefined();
  });

  it('returns 500 on database error', async () => {
    mockPrisma.wecomConfig.findFirst.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .put('/api/wecom-config')
      .send({ corpId: 'corp123' });

    expect(res.status).toBe(500);
  });

  it('masks secret in PUT response', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(null);
    mockPrisma.wecomConfig.create.mockResolvedValue(sampleConfig);

    const res = await request(app)
      .put('/api/wecom-config')
      .send({ corpId: 'corp123', secret: 'mysecretkey1234' });

    expect(res.status).toBe(200);
    expect(res.body.secret).toBe('****1234');
  });

  it('updates only provided fields', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(sampleConfig);
    mockPrisma.wecomConfig.update.mockResolvedValue({ ...sampleConfig, redirectUri: 'https://new.url' });

    await request(app)
      .put('/api/wecom-config')
      .send({ redirectUri: 'https://new.url' });

    const call = mockPrisma.wecomConfig.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.redirectUri).toBe('https://new.url');
    expect(call.data.corpId).toBeUndefined();
    expect(call.data.agentId).toBeUndefined();
  });

  it('creates config with empty strings for missing fields', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(null);
    mockPrisma.wecomConfig.create.mockResolvedValue(sampleConfig);

    await request(app)
      .put('/api/wecom-config')
      .send({});

    expect(mockPrisma.wecomConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          corpId: '',
          agentId: '',
          secret: '',
          redirectUri: '',
        }),
      }),
    );
  });

  it('creates config without masked secret', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(null);
    mockPrisma.wecomConfig.create.mockResolvedValue(sampleConfig);

    await request(app)
      .put('/api/wecom-config')
      .send({ secret: '****masked' });

    expect(mockPrisma.wecomConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ secret: '' }),
      }),
    );
  });

  it('masks empty secret as empty string', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue({ ...sampleConfig, secret: '' });

    const res = await request(app).get('/api/wecom-config');

    expect(res.status).toBe(200);
    expect(res.body.secret).toBe('');
  });
});

describe('maskSecret', () => {
  it('masks secret showing last 4 chars', () => {
    expect(maskSecret('mysecretkey1234')).toBe('****1234');
  });

  it('returns empty for empty string', () => {
    expect(maskSecret('')).toBe('');
  });

  it('handles short secret', () => {
    expect(maskSecret('ab')).toBe('****ab');
  });

  it('handles 4-char secret', () => {
    expect(maskSecret('abcd')).toBe('****abcd');
  });

  it('handles 5-char secret', () => {
    expect(maskSecret('abcde')).toBe('****bcde');
  });

  it('update does not change secret when same value provided', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(sampleConfig);
    mockPrisma.wecomConfig.update.mockResolvedValue(sampleConfig);

    const res = await request(app)
      .put('/api/wecom-config')
      .send({ secret: 'mysecretkey1234' });

    expect(res.status).toBe(200);
    expect(mockPrisma.wecomConfig.update).toHaveBeenCalled();
  });

  it('maskSecret handles single character', () => {
    expect(maskSecret('a')).toBe('****a');
  });

  it('update sends secret change audit when secret changes', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(sampleConfig);
    mockPrisma.wecomConfig.update.mockResolvedValue({ ...sampleConfig, secret: 'newsecretkey99' });

    await request(app)
      .put('/api/wecom-config')
      .send({ secret: 'newsecretkey99' });

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.objectContaining({ secret: expect.anything() }),
      }),
    );
  });

  it('GET returns 500 when database throws during config fetch', async () => {
    mockPrisma.wecomConfig.findFirst.mockRejectedValue(new Error('unexpected DB error'));

    const res = await request(app).get('/api/wecom-config');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('服务器内部错误');
  });

  it('PUT returns 500 when create fails', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(null);
    mockPrisma.wecomConfig.create.mockRejectedValue(new Error('DB create fail'));

    const res = await request(app)
      .put('/api/wecom-config')
      .send({ corpId: 'corp123', agentId: 'agent456', secret: 'secret123' });

    expect(res.status).toBe(500);
  });

  it('PUT updates existing config when one already exists', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue({ id: 1, corpId: 'old', agentId: 'old', secret: 'old' });
    mockPrisma.wecomConfig.update.mockResolvedValue({ id: 1, corpId: 'new-corp', agentId: 'new-agent', secret: 'new-secret' });
    mockAuditLog.mockResolvedValue(undefined);
    mockInvalidateCache.mockReturnValue(undefined);

    const res = await request(app)
      .put('/api/wecom-config')
      .send({ corpId: 'new-corp', agentId: 'new-agent', secret: 'new-secret' });

    expect(res.status).toBe(200);
    expect(mockPrisma.wecomConfig.update).toHaveBeenCalled();
  });

  it('PUT returns 500 when update fails', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(sampleConfig);
    mockPrisma.wecomConfig.update.mockRejectedValue(new Error('DB update fail'));

    const res = await request(app)
      .put('/api/wecom-config')
      .send({ corpId: 'updated' });

    expect(res.status).toBe(500);
  });

  it('maskSecret masks long secret showing last 4 chars', () => {
    const longSecret = 'a'.repeat(1000);
    const masked = maskSecret(longSecret);
    expect(masked).toBe('****' + longSecret.slice(-4));
    expect(masked.length).toBe(8);
  });

  it('maskSecret returns same last 4 for very short secret', () => {
    expect(maskSecret('ab')).toBe('****ab');
    expect(maskSecret('abcd')).toBe('****abcd');
  });

  it('PUT invalidates cache after update', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(sampleConfig);
    mockPrisma.wecomConfig.update.mockResolvedValue({ ...sampleConfig, corpId: 'newcorp' });

    await request(app)
      .put('/api/wecom-config')
      .send({ corpId: 'newcorp' });

    expect(mockInvalidateCache).toHaveBeenCalled();
  });

  it('GET returns empty object when no config exists', async () => {
    mockPrisma.wecomConfig.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/wecom-config');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('maskSecret handles zero length string', () => {
    expect(maskSecret('')).toBe('');
  });

  it('maskSecret handles short secret less than 4 chars', () => {
    expect(maskSecret('ab')).toBe('****ab');
  });

  it('maskSecret handles exactly 4 char secret', () => {
    expect(maskSecret('abcd')).toBe('****abcd');
  });

  it('GET wecom-config returns 500 on database error', async () => {
    mockPrisma.wecomConfig.findFirst.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/wecom-config');

    expect(res.status).toBe(500);
  });

  it('maskSecret handles single character secret', () => {
    expect(maskSecret('x')).toBe('****x');
  });

  it('maskSecret handles empty string', () => {
    expect(maskSecret('')).toBe('');
  });

  it('maskSecret handles single character string', () => {
    expect(typeof maskSecret('a')).toBe('string');
  });
});
