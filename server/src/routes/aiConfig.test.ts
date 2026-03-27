import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockPrisma, mockFetch } = vi.hoisted(() => {
  const mockPrisma = {
    aiConfig: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    aiUsageLog: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const mockFetch = vi.fn();
  return { mockPrisma, mockFetch };
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
}));

vi.mock('../middleware/permission', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

// ─── Global fetch mock ──────────────────────────────────────────────────────

vi.stubGlobal('fetch', mockFetch);

// ─── App setup ────────────────────────────────────────────────────────────────

import aiConfigRoutes from './aiConfig';

const app = express();
app.use(express.json());
app.use('/api/ai-config', aiConfigRoutes);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/ai-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns configs with masked API keys', async () => {
    const configs = [
      { id: 'c1', name: '默认配置', apiKey: 'sk-abcdefgh12345678', apiUrl: 'https://api.openai.com/v1/chat/completions', modelName: 'gpt-4o', features: 'risk', updatedAt: new Date() },
      { id: 'c2', name: '备用配置', apiKey: 'sk-zzzzyyyyxxxx9999', apiUrl: 'https://api.example.com', modelName: 'gpt-4o-mini', features: 'weekly_report', updatedAt: new Date() },
    ];
    mockPrisma.aiConfig.findMany.mockResolvedValue(configs);

    const res = await request(app).get('/api/ai-config');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].apiKey).toBe('****5678');
    expect(res.body[1].apiKey).toBe('****9999');
    expect(res.body[0].name).toBe('默认配置');
  });

  it('auto-fixes legacy config with empty name and features', async () => {
    const legacyConfig = { id: 'c-old', name: '', apiKey: 'sk-old1234', apiUrl: 'https://api.com', modelName: 'gpt-4o-mini', features: '', updatedAt: new Date() };
    const fixedConfig = { ...legacyConfig, name: '默认配置', features: 'risk,weekly_report' };

    mockPrisma.aiConfig.findMany
      .mockResolvedValueOnce([legacyConfig])   // first query returns legacy
      .mockResolvedValueOnce([fixedConfig]);    // after fix re-query
    mockPrisma.aiConfig.update.mockResolvedValue(fixedConfig);

    const res = await request(app).get('/api/ai-config');

    expect(res.status).toBe(200);
    expect(mockPrisma.aiConfig.update).toHaveBeenCalledWith({
      where: { id: 'c-old' },
      data: { name: '默认配置', features: 'risk,weekly_report' },
    });
    expect(res.body[0].name).toBe('默认配置');
  });

  it('returns 500 on database error', async () => {
    mockPrisma.aiConfig.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/ai-config');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('服务器内部错误');
  });
});

describe('POST /api/ai-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates config successfully', async () => {
    mockPrisma.aiConfig.findMany.mockResolvedValue([]); // for removeFeatureAssignments
    const created = {
      id: 'c-new',
      name: '新配置',
      apiKey: 'sk-newkey12345678',
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      modelName: 'gpt-4o-mini',
      features: 'risk',
    };
    mockPrisma.aiConfig.create.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/ai-config')
      .send({ name: '新配置', apiKey: 'sk-newkey12345678', apiUrl: 'https://api.openai.com/v1/chat/completions', features: 'risk' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('新配置');
    expect(res.body.apiKey).toBe('****5678');
    expect(mockPrisma.aiConfig.create).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when name is empty', async () => {
    const res = await request(app)
      .post('/api/ai-config')
      .send({ apiKey: 'sk-test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('配置名称不能为空');
    expect(mockPrisma.aiConfig.create).not.toHaveBeenCalled();
  });
});

describe('PUT /api/ai-config/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates config successfully', async () => {
    mockPrisma.aiConfig.findUnique.mockResolvedValue({
      id: 'c1',
      name: '旧配置',
      apiKey: 'sk-oldkey1234',
      apiUrl: 'https://old.api.com',
      modelName: 'gpt-4o-mini',
      features: 'risk',
    });
    mockPrisma.aiConfig.findMany.mockResolvedValue([]); // for removeFeatureAssignments
    const updated = {
      id: 'c1',
      name: '新配置',
      apiKey: 'sk-updatedkey99',
      apiUrl: 'https://new.api.com',
      modelName: 'gpt-4o',
      features: 'risk,weekly_report',
    };
    mockPrisma.aiConfig.update.mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/ai-config/c1')
      .send({ name: '新配置', apiKey: 'sk-updatedkey99', apiUrl: 'https://new.api.com', modelName: 'gpt-4o', features: 'risk,weekly_report' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('新配置');
    expect(res.body.apiKey).toBe('****ey99');
  });

  it('returns 404 when config does not exist', async () => {
    mockPrisma.aiConfig.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/ai-config/nonexistent')
      .send({ name: '新名称' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('配置不存在');
    expect(mockPrisma.aiConfig.update).not.toHaveBeenCalled();
  });

  it('skips masked apiKey and does not update it', async () => {
    mockPrisma.aiConfig.findUnique.mockResolvedValue({
      id: 'c1',
      name: '配置',
      apiKey: 'sk-realkey1234',
      apiUrl: 'https://api.com',
      modelName: 'gpt-4o',
      features: '',
    });
    const updated = {
      id: 'c1',
      name: '仅改名',
      apiKey: 'sk-realkey1234',
      apiUrl: 'https://api.com',
      modelName: 'gpt-4o',
      features: '',
    };
    mockPrisma.aiConfig.update.mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/ai-config/c1')
      .send({ name: '仅改名', apiKey: '****1234' });

    expect(res.status).toBe(200);
    // The update call should NOT include apiKey since it starts with ****
    const updateCall = mockPrisma.aiConfig.update.mock.calls[0][0];
    expect(updateCall.data.apiKey).toBeUndefined();
    expect(updateCall.data.name).toBe('仅改名');
  });
});

describe('DELETE /api/ai-config/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes config successfully', async () => {
    mockPrisma.aiConfig.findUnique.mockResolvedValue({ id: 'c1', name: '待删除' });
    mockPrisma.aiConfig.delete.mockResolvedValue({});

    const res = await request(app).delete('/api/ai-config/c1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPrisma.aiConfig.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('returns 404 when config does not exist', async () => {
    mockPrisma.aiConfig.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/ai-config/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('配置不存在');
    expect(mockPrisma.aiConfig.delete).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai-config/test-connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success when connection is OK', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '{"choices":[]}',
    });

    const res = await request(app)
      .post('/api/ai-config/test-connection')
      .send({ apiUrl: 'https://api.openai.com/v1/chat/completions', apiKey: 'sk-test123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('连接成功');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns failure message when API returns non-OK response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const res = await request(app)
      .post('/api/ai-config/test-connection')
      .send({ apiUrl: 'https://api.openai.com/v1/chat/completions', apiKey: 'sk-bad' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/API 返回 401/);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/ai-config/test-connection')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/API URL/);
  });
});

describe('GET /api/ai-config/usage-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns aggregated usage stats', async () => {
    mockPrisma.aiUsageLog.aggregate.mockResolvedValue({
      _sum: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      _count: 10,
    });

    const logs = [
      {
        id: 'log1',
        feature: 'risk',
        promptTokens: 500,
        completionTokens: 250,
        totalTokens: 750,
        createdAt: new Date('2026-03-27T10:00:00Z'),
      },
      {
        id: 'log2',
        feature: 'risk',
        promptTokens: 500,
        completionTokens: 250,
        totalTokens: 750,
        createdAt: new Date('2026-03-27T12:00:00Z'),
      },
    ];

    // findMany is called twice: once for daily aggregation, once for recent logs
    mockPrisma.aiUsageLog.findMany
      .mockResolvedValueOnce(logs) // daily aggregation
      .mockResolvedValueOnce(logs.map(l => ({ ...l, project: { id: 'p1', name: '项目A' } }))); // recent logs

    const res = await request(app).get('/api/ai-config/usage-stats');

    expect(res.status).toBe(200);
    expect(res.body.totals).toBeDefined();
    expect(res.body.totals.callCount).toBe(10);
    expect(res.body.totals.promptTokens).toBe(1000);
    expect(res.body.totals.completionTokens).toBe(500);
    expect(res.body.totals.totalTokens).toBe(1500);
    expect(res.body.dailyStats).toBeDefined();
    expect(res.body.recentLogs).toBeDefined();
  });
});
