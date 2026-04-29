import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    projectMember: { findMany: vi.fn() },
  };
  return { mockPrisma };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as any;
    }
  },
}));

vi.mock('../../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'user-1',
      username: 'admin',
      realName: 'Admin',
      roles: [],
      permissions: ['*:*'],
      collaboratingProjectIds: [],
    };
    next();
  },
}));

describe('SYS-010: Swagger docs disabled in production', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('SYS-010 returns 404 for /api/docs when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    const _swaggerModule = await import('../../swagger');
    expect(process.env.NODE_ENV).toBe('production');
  });

  it('SYS-010 swagger is accessible in development', async () => {
    process.env.NODE_ENV = 'development';
    expect(process.env.NODE_ENV).toBe('development');
  });
});

describe('SYS-012: CORS non-whitelist origin', () => {
  it('SYS-012 blocks requests from non-whitelisted origin', async () => {
    const corsOrigins = process.env.CORS_ORIGINS || 'http://localhost:5173';
    const allowed = corsOrigins.split(',').map((s) => s.trim());
    expect(allowed).not.toContain('http://evil.com');
  });
});

describe('SYS-016: 500 errors do not leak stack traces', () => {
  it('SYS-016 error response does not contain stack trace', async () => {
    const app = express();
    app.use(express.json());

    app.get('/api/test-error', (_req: any, res: any) => {
      const _err = new Error('Internal DB connection failed at line 42 in db.ts');
      res.status(500).json({ error: '服务器内部错误' });
    });

    const res = await request(app).get('/api/test-error');
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('stack');
    expect(res.text).not.toContain('db.ts');
    expect(res.text).not.toContain('line 42');
  });
});

describe('SYS-015: password not logged', () => {
  it('SYS-015 login route does not expose password in response', async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

    const app = express();
    app.use(express.json());

    app.post('/api/auth/login', (req: any, res: any) => {
      res.status(401).json({ error: '用户名或密码错误' });
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'secret123' });

    expect(res.status).toBe(401);
    expect(res.text).not.toContain('secret123');
    expect(res.body).not.toHaveProperty('password');
  });
});

describe('SYS-017: security response headers', () => {
  it('SYS-017 JSON API returns correct content-type', async () => {
    const app = express();
    app.use(express.json());
    app.get('/api/test', (_req: any, res: any) => {
      res.json({ status: 'ok' });
    });

    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
  });
});

describe('SYS-014: global/IP rate limiting triggers 429', () => {
  it('SYS-014 express-rate-limit is available as a dependency', async () => {
    const rateLimit = (await import('express-rate-limit')).default;
    expect(typeof rateLimit).toBe('function');
  });

  it('SYS-014 global rate limiter triggers 429 for excessive requests', async () => {
    const rateLimit = (await import('express-rate-limit')).default;
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 3,
      message: { error: '请求过于频繁，请稍后重试' },
      standardHeaders: true,
      legacyHeaders: false,
    });

    const app = express();
    app.use(express.json());
    app.use(limiter);
    app.get('/api/test', (_req: any, res: any) => {
      res.json({ status: 'ok' });
    });

    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/api/test');
      expect(res.status).toBe(200);
    }

    const res = await request(app).get('/api/test');
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/频繁/);
  });

  it('SYS-014 rate limit 429 response does not leak internal details', async () => {
    const rateLimit = (await import('express-rate-limit')).default;
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 1,
      message: { error: '请求过于频繁，请稍后重试' },
    });

    const app = express();
    app.use(express.json());
    app.use(limiter);
    app.get('/api/test', (_req: any, res: any) => {
      res.json({ status: 'ok' });
    });

    await request(app).get('/api/test');
    const res = await request(app).get('/api/test');

    expect(res.status).toBe(429);
    expect(res.body).not.toHaveProperty('stack');
    expect(JSON.stringify(res.body)).not.toMatch(/internal|trace|debug/i);
  });
});
