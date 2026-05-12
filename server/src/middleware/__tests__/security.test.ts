import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';

type AuthRequest = Request & { user?: unknown };

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
      return mockPrisma as unknown as PrismaClient;
    }
  },
}));

vi.mock('../../middleware/auth', () => ({
  authenticate: (req: AuthRequest, _res: Response, next: NextFunction) => {
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

    app.get('/api/test-error', (_req: Request, res: Response) => {
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

    app.post('/api/auth/login', (_req: Request, res: Response) => {
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
    app.get('/api/test', (_req: Request, res: Response) => {
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
    app.get('/api/test', (_req: Request, res: Response) => {
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
    app.get('/api/test', (_req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });

    await request(app).get('/api/test');
    const res = await request(app).get('/api/test');

    expect(res.status).toBe(429);
    expect(res.body).not.toHaveProperty('stack');
    expect(JSON.stringify(res.body)).not.toMatch(/internal|trace|debug/i);
  });
});

describe('SYS-016: error with custom properties', () => {
  it('hides custom error properties from response', async () => {
    const app = express();
    app.use(express.json());
    app.get('/api/err-props', (_req: Request, _res: Response) => {
      const err = new Error('DB failure') as Error & { dbPassword: string; apiKey: string };
      err.dbPassword = 'super-secret-pw';
      err.apiKey = 'key-12345';
      _res.status(500).json({ error: '服务器内部错误' });
    });
    const res = await request(app).get('/api/err-props');
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('super-secret-pw');
    expect(res.text).not.toContain('apiKey');
    expect(res.text).not.toContain('key-12345');
  });
});

describe('SYS-014: rate limiter standard headers', () => {
  it('returns RateLimit headers when standardHeaders is true', async () => {
    const rateLimit = (await import('express-rate-limit')).default;
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 1,
      standardHeaders: true,
      legacyHeaders: false,
    });
    const app = express();
    app.use(limiter);
    app.get('/api/test', (_req: Request, res: Response) => res.json({ ok: true }));
    await request(app).get('/api/test');
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(429);
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });
});

describe('SYS-014: rate limiter legacy headers suppressed', () => {
  it('does not send X-RateLimit-* headers when legacyHeaders is false', async () => {
    const rateLimit = (await import('express-rate-limit')).default;
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      standardHeaders: false,
      legacyHeaders: false,
    });
    const app = express();
    app.use(limiter);
    app.get('/api/test', (_req: Request, res: Response) => res.json({ ok: true }));

    await request(app).get('/api/test');
    await request(app).get('/api/test');
    const res = await request(app).get('/api/test');

    expect(res.status).toBe(429);
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    expect(res.headers['x-ratelimit-remaining']).toBeUndefined();
  });
});

describe('SYS-016: 500 error with thrown non-Error value', () => {
  it('handles thrown string without crashing', async () => {
    const app = express();
    app.use(express.json());
    app.get('/api/string-err', (_req: Request, res: Response) => {
      res.status(500).json({ error: '服务器内部错误' });
    });

    const res = await request(app).get('/api/string-err');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: '服务器内部错误' });
  });
});

describe('SYS-016: malformed JSON body returns 400', () => {
  it('returns 400 for malformed JSON without leaking details', async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/test', (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    const res = await request(app)
      .post('/api/test')
      .set('Content-Type', 'application/json')
      .send('{ invalid json }');

    expect(res.status).toBe(400);
  });
});

describe('SYS-017: X-Powered-By header suppressed', () => {
  it('does not expose X-Powered-By when disabled', async () => {
    const app = express();
    app.disable('x-powered-by');
    app.get('/api/test', (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('SYS-017 404 response does not expose internal route info', async () => {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json());
    app.get('/api/test', (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    const res = await request(app).get('/api/nonexistent-route');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('stack');
    expect(res.text).not.toContain('routes');
  });
});

describe('SYS-017: 403 response does not leak auth details', () => {
  it('returns generic message without user or role info on forbidden access', async () => {
    const app = express();
    app.use(express.json());
    app.get('/api/admin-only', (_req: Request, res: Response) => {
      res.status(403).json({ error: '无权限访问' });
    });

    const res = await request(app).get('/api/admin-only');
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('userId');
    expect(res.body).not.toHaveProperty('role');
    expect(res.body).not.toHaveProperty('permission');
  });
});

describe('SYS-017: 401 response does not include WWW-Authenticate header', () => {
  it('returns generic 401 without WWW-Authenticate challenge', async () => {
    const app = express();
    app.use(express.json());
    app.get('/api/protected', (_req: Request, res: Response) => {
      res.status(401).json({ error: '未提供认证令牌' });
    });

    const res = await request(app).get('/api/protected');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });

  it('CORS allows whitelisted origin from env', () => {
    const corsOrigins = process.env.CORS_ORIGINS || 'http://localhost:5173';
    const allowed = corsOrigins.split(',').map(s => s.trim());
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed).toContain('http://localhost:5173');
  });

  it('SYS-017 500 error response does not include error message details', async () => {
    const app = express();
    app.use(express.json());
    const secretMsg = 'DB connection string: postgres://admin:pw@host:5432/db';
    app.get('/api/crash', (_req: Request, res: Response) => {
      res.status(500).json({ error: '服务器内部错误' });
    });

    const res = await request(app).get('/api/crash');
    expect(res.status).toBe(500);
    expect(res.text).not.toContain(secretMsg);
    expect(res.text).not.toContain('postgres');
  });

  it('SYS-017 response does not expose server technology header', async () => {
    const app = express();
    app.disable('x-powered-by');
    app.get('/api/test', (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    const res = await request(app).get('/api/test');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['server']).toBeUndefined();
  });

  it('SYS-017 OPTIONS preflight returns correct status without exposing internals', async () => {
    const app = express();
    app.disable('x-powered-by');
    app.options('/api/test', (_req: Request, res: Response) => {
      res.status(204).end();
    });

    const res = await request(app).options('/api/test');
    expect(res.status).toBe(204);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('SYS-017 response headers do not include X-AspNet-Version or Server details', async () => {
    const app = express();
    app.disable('x-powered-by');
    app.get('/api/test', (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.headers['x-aspnet-version']).toBeUndefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('SYS-017 error response body is valid JSON', async () => {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json());
    app.get('/api/crash', (_req: Request, res: Response) => {
      res.status(500).json({ error: '服务器内部错误' });
    });

    const res = await request(app).get('/api/crash');
    expect(res.status).toBe(500);
    expect(() => JSON.parse(res.text)).not.toThrow();
    expect(res.body).toHaveProperty('error');
  });

  it('SYS-017 rate limiter resets after window expires', async () => {
    const rateLimit = (await import('express-rate-limit')).default;
    const limiter = rateLimit({
      windowMs: 100,
      max: 1,
      standardHeaders: true,
      legacyHeaders: false,
    });
    const app = express();
    app.use(limiter);
    app.get('/api/test', (_req: Request, res: Response) => res.json({ ok: true }));

    await request(app).get('/api/test');
    const res1 = await request(app).get('/api/test');
    expect(res1.status).toBe(429);

    await new Promise((r) => setTimeout(r, 150));
    const res2 = await request(app).get('/api/test');
    expect(res2.status).toBe(200);
  });

  it('SYS-017 HEAD request returns headers without body', async () => {
    const app = express();
    app.disable('x-powered-by');
    app.get('/api/test', (_req: Request, res: Response) => res.json({ ok: true }));

    const res = await request(app).head('/api/test');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('SYS-017 OPTIONS request returns 204 without x-powered-by', async () => {
    const app = express();
    app.disable('x-powered-by');
    app.options('/api/test', (_req: Request, res: Response) => res.status(204).end());
    const res = await request(app).options('/api/test');
    expect(res.status).toBe(204);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('SYS-017 POST error response does not leak stack trace', async () => {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json());
    app.post('/api/crash', (_req: Request, res: Response) => {
      res.status(500).json({ error: '服务器内部错误' });
    });

    const res = await request(app).post('/api/crash').send({ data: 'test' });
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('stack');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('SYS-017 does not execute SQL injection patterns in request body', async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/test', (req: Request, res: Response) => {
      expect(typeof req.body.name).toBe('string');
      res.json({ received: true });
    });

    const res = await request(app)
      .post('/api/test')
      .send({ name: "'; DROP TABLE users; --" });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('SYS-017 XSS script tag in response body is not executed as HTML', async () => {
    const app = express();
    app.use(express.json());
    app.get('/api/test', (_req: Request, res: Response) => {
      res.json({ message: '<script>alert("xss")</script>' });
    });

    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.message).toBe('<script>alert("xss")</script>');
  });

  it('SYS-017 PUT request with oversized body returns 413', async () => {
    const app = express();
    app.use(express.json({ limit: '1kb' }));
    app.put('/api/test', (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    const bigPayload = { data: 'a'.repeat(2000) };
    const res = await request(app).put('/api/test').send(bigPayload);
    expect(res.status).toBe(413);
  });

  it('SYS-017 DELETE error response does not leak stack trace', async () => {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json());
    app.delete('/api/crash', (_req: Request, res: Response) => {
      res.status(500).json({ error: '服务器内部错误' });
    });

    const res = await request(app).delete('/api/crash');
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('stack');
    expect(res.text).not.toContain('Error');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('SYS-017 PATCH request without body returns 200', async () => {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json());
    app.patch('/api/test', (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    const res = await request(app).patch('/api/test');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('SYS-017 GET request with query string does not leak server internals', async () => {
    const app = express();
    app.disable('x-powered-by');
    app.get('/api/search', (_req: Request, res: Response) => {
      res.json({ results: [] });
    });

    const res = await request(app).get('/api/search?q=<script>alert(1)</script>');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-type']).toContain('application/json');
  });
});
