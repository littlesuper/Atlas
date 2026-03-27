import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    productChangeLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn(mockPrisma)),
  };

  return { mockPrisma };
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
  sanitizePagination: (page: any, pageSize: any) => ({
    pageNum: parseInt(page) || 1,
    pageSizeNum: parseInt(pageSize) || 20,
  }),
}));

vi.mock('../utils/auditLog', () => ({
  auditLog: vi.fn(),
  diffFields: vi.fn(() => ({})),
}));

vi.mock('../middleware/validate', () => ({
  validate: () => (_req: any, _res: any, next: any) => next(),
}));

// ─── App setup ────────────────────────────────────────────────────────────────

import productsRoutes from './products';

const app = express();
app.use(express.json());
app.use('/api/products', productsRoutes);

// ─── Helper data ──────────────────────────────────────────────────────────────

const sampleProduct = {
  id: 'prod-1',
  name: '测试产品',
  model: 'MODEL-A',
  revision: 'V1.0',
  category: 'ROUTER',
  description: '测试描述',
  status: 'DEVELOPING',
  specifications: { weight: '100g' },
  performance: null,
  images: null,
  documents: null,
  projectId: 'proj-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  project: { id: 'proj-1', name: '测试项目', productLine: '产品线A' },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/products', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated products with stats', async () => {
    mockPrisma.product.count
      .mockResolvedValueOnce(5)   // all
      .mockResolvedValueOnce(3)   // developing
      .mockResolvedValueOnce(1)   // production
      .mockResolvedValueOnce(1)   // discontinued
      .mockResolvedValueOnce(5);  // total (filtered)
    mockPrisma.product.findMany.mockResolvedValue([sampleProduct]);

    const res = await request(app).get('/api/products?page=1&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('pageSize', 10);
    expect(res.body).toHaveProperty('stats');
    expect(res.body.stats).toEqual({
      all: 5,
      developing: 3,
      production: 1,
      discontinued: 1,
    });
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by status', async () => {
    mockPrisma.product.count.mockResolvedValue(0);
    mockPrisma.product.findMany.mockResolvedValue([]);

    await request(app).get('/api/products?status=PRODUCTION');

    // The findMany call should include status in its where clause
    const findManyArgs = mockPrisma.product.findMany.mock.calls[0][0];
    expect(findManyArgs.where.status).toBe('PRODUCTION');
  });

  it('filters by category', async () => {
    mockPrisma.product.count.mockResolvedValue(0);
    mockPrisma.product.findMany.mockResolvedValue([]);

    await request(app).get('/api/products?category=ROUTER');

    const findManyArgs = mockPrisma.product.findMany.mock.calls[0][0];
    expect(findManyArgs.where.category).toBe('ROUTER');
  });

  it('filters by keyword', async () => {
    mockPrisma.product.count.mockResolvedValue(0);
    mockPrisma.product.findMany.mockResolvedValue([]);

    await request(app).get('/api/products?keyword=sensor');

    const findManyArgs = mockPrisma.product.findMany.mock.calls[0][0];
    expect(findManyArgs.where.OR).toBeDefined();
    expect(findManyArgs.where.OR).toHaveLength(3);
  });

  it('returns 500 on unexpected error', async () => {
    mockPrisma.product.count.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/products');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/products/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a single product', async () => {
    mockPrisma.product.findUnique.mockResolvedValue(sampleProduct);

    const res = await request(app).get('/api/products/prod-1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'prod-1');
    expect(res.body).toHaveProperty('name', '测试产品');
  });

  it('returns 404 for non-existent product', async () => {
    mockPrisma.product.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/products/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/产品不存在/);
  });
});

describe('POST /api/products', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates product successfully', async () => {
    // Called twice: once for archive check, once for existence validation
    mockPrisma.project.findUnique
      .mockResolvedValueOnce({ id: 'proj-1', status: 'IN_PROGRESS' })
      .mockResolvedValueOnce({ id: 'proj-1', status: 'IN_PROGRESS' });
    mockPrisma.product.findFirst.mockResolvedValue(null); // no duplicate
    mockPrisma.product.create.mockResolvedValue(sampleProduct);
    mockPrisma.productChangeLog.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/products')
      .send({
        name: '测试产品',
        model: 'MODEL-A',
        revision: 'V1.0',
        category: 'ROUTER',
        projectId: 'proj-1',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id', 'prod-1');
    expect(res.body).toHaveProperty('name', '测试产品');
  });

  it('rejects duplicate model+revision with 409', async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: 'existing-prod' }); // duplicate exists

    const res = await request(app)
      .post('/api/products')
      .send({
        name: '重复产品',
        model: 'MODEL-A',
        revision: 'V1.0',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/已存在/);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/products')
      .send({ model: 'MODEL-B' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/产品名称不能为空/);
  });

  it('returns 500 on unexpected error', async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);
    mockPrisma.product.create.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .post('/api/products')
      .send({ name: '测试产品' });

    expect(res.status).toBe(500);
  });
});

describe('PUT /api/products/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates product successfully', async () => {
    const existing = { ...sampleProduct, status: 'DEVELOPING' };
    const updated = { ...sampleProduct, name: '更新产品', status: 'DEVELOPING' };

    mockPrisma.product.findUnique.mockResolvedValue(existing);
    mockPrisma.product.findFirst.mockResolvedValue(null); // no duplicate
    mockPrisma.product.update.mockResolvedValue(updated);
    mockPrisma.productChangeLog.create.mockResolvedValue({});
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', status: 'IN_PROGRESS' });

    const res = await request(app)
      .put('/api/products/prod-1')
      .send({ name: '更新产品' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', '更新产品');
  });

  it('allows valid status transition DEVELOPING -> PRODUCTION', async () => {
    const existing = { ...sampleProduct, status: 'DEVELOPING' };
    const updated = { ...sampleProduct, status: 'PRODUCTION' };

    mockPrisma.product.findUnique.mockResolvedValue(existing);
    mockPrisma.product.findFirst.mockResolvedValue(null);
    mockPrisma.product.update.mockResolvedValue(updated);
    mockPrisma.productChangeLog.create.mockResolvedValue({});
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', status: 'IN_PROGRESS' });

    const res = await request(app)
      .put('/api/products/prod-1')
      .send({ status: 'PRODUCTION' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PRODUCTION');
  });

  it('rejects invalid status transition PRODUCTION -> DEVELOPING', async () => {
    const existing = { ...sampleProduct, status: 'PRODUCTION' };

    mockPrisma.product.findUnique.mockResolvedValue(existing);
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', status: 'IN_PROGRESS' });

    const res = await request(app)
      .put('/api/products/prod-1')
      .send({ status: 'DEVELOPING' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/不允许从/);
  });

  it('returns 404 when product does not exist', async () => {
    mockPrisma.product.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/products/nonexistent')
      .send({ name: 'Updated' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/产品不存在/);
  });

  it('returns 409 when updated model+revision conflicts', async () => {
    const existing = { ...sampleProduct, status: 'DEVELOPING' };

    mockPrisma.product.findUnique.mockResolvedValue(existing);
    mockPrisma.product.findFirst.mockResolvedValue({ id: 'other-prod' }); // conflict
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', status: 'IN_PROGRESS' });

    const res = await request(app)
      .put('/api/products/prod-1')
      .send({ model: 'MODEL-B', revision: 'V2.0' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/已存在/);
  });
});

describe('DELETE /api/products/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes product and returns success', async () => {
    mockPrisma.product.findUnique.mockResolvedValue(sampleProduct);
    mockPrisma.product.delete.mockResolvedValue({});
    mockPrisma.productChangeLog.create.mockResolvedValue({});

    const res = await request(app).delete('/api/products/prod-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when product does not exist', async () => {
    mockPrisma.product.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/products/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/产品不存在/);
  });

  it('returns 500 on unexpected error', async () => {
    mockPrisma.product.findUnique.mockResolvedValue(sampleProduct);
    mockPrisma.productChangeLog.create.mockResolvedValue({});
    mockPrisma.product.delete.mockRejectedValue(new Error('cascade fail'));

    const res = await request(app).delete('/api/products/prod-1');
    expect(res.status).toBe(500);
  });
});

describe('POST /api/products/:id/copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies product with new revision', async () => {
    const copiedProduct = { ...sampleProduct, id: 'prod-2', revision: 'V2.0', status: 'DEVELOPING' };

    mockPrisma.product.findUnique.mockResolvedValue(sampleProduct);
    mockPrisma.product.findFirst.mockResolvedValue(null); // no duplicate
    mockPrisma.product.create.mockResolvedValue(copiedProduct);
    mockPrisma.productChangeLog.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/products/prod-1/copy')
      .send({ revision: 'V2.0' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id', 'prod-2');
    expect(res.body).toHaveProperty('revision', 'V2.0');
    expect(res.body).toHaveProperty('status', 'DEVELOPING');
  });

  it('rejects duplicate revision with 409', async () => {
    mockPrisma.product.findUnique.mockResolvedValue(sampleProduct);
    mockPrisma.product.findFirst.mockResolvedValue({ id: 'existing-prod' }); // duplicate

    const res = await request(app)
      .post('/api/products/prod-1/copy')
      .send({ revision: 'V1.0' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/已存在/);
  });

  it('returns 404 when source product does not exist', async () => {
    mockPrisma.product.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/products/nonexistent/copy')
      .send({ revision: 'V2.0' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/源产品不存在/);
  });

  it('returns 400 when revision is missing', async () => {
    const res = await request(app)
      .post('/api/products/prod-1/copy')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/版本号不能为空/);
  });
});

describe('GET /api/products/:id/changelog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns change logs for a product', async () => {
    const logs = [
      {
        id: 'log-1',
        productId: 'prod-1',
        userId: 'user-1',
        userName: 'Admin',
        action: 'CREATE',
        changes: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'log-2',
        productId: 'prod-1',
        userId: 'user-1',
        userName: 'Admin',
        action: 'UPDATE',
        changes: { name: { from: '旧名', to: '新名' } },
        createdAt: new Date().toISOString(),
      },
    ];
    mockPrisma.productChangeLog.findMany.mockResolvedValue(logs);

    const res = await request(app).get('/api/products/prod-1/changelog');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('action', 'CREATE');
    expect(res.body[1]).toHaveProperty('action', 'UPDATE');
  });

  it('returns 500 on unexpected error', async () => {
    mockPrisma.productChangeLog.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/products/prod-1/changelog');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/products/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns CSV file with correct headers', async () => {
    mockPrisma.product.findMany.mockResolvedValue([
      {
        ...sampleProduct,
        createdAt: new Date('2026-03-01'),
      },
    ]);

    const res = await request(app).get('/api/products/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=products_/);

    // Check CSV contains BOM + headers
    const body = res.text;
    expect(body).toContain('名称');
    expect(body).toContain('型号');
    expect(body).toContain('测试产品');
  });

  it('returns 500 on unexpected error', async () => {
    mockPrisma.product.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/products/export');
    expect(res.status).toBe(500);
  });
});
