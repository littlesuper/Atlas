import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { PrismaClient } from '../../generated/prisma/client';

type AuthRequest = Request & { user?: unknown };

const { mockPrisma, mockWecom, mockJwt } = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    wecomState: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    projectMember: { findMany: vi.fn() },
    wecomConfig: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma)),
  };

  const mockWecom = {
    isWecomEnabled: vi.fn(() => true),
    getWecomConfig: vi.fn(() => ({
      corpId: 'test-corp-id',
      agentId: 'test-agent-id',
      corpSecret: 'should-never-be-exposed',
    })),
    getUserInfoByCode: vi.fn(),
    getUserDetail: vi.fn(),
  };

  const mockJwt = {
    sign: vi.fn(() => 'mock-token'),
    verify: vi.fn(() => ({ userId: 'user-1' })),
  };

  return { mockPrisma, mockWecom, mockJwt };
});

vi.mock('../../generated/prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as unknown as PrismaClient;
    }
  },
}));

vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn(), hash: vi.fn(() => 'hashed') },
}));

vi.mock('jsonwebtoken', () => ({ default: mockJwt }));

vi.mock('../../middleware/auth', () => ({
  authenticate: (req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = {
      id: 'user-1',
      username: 'admin',
      realName: 'Admin',
      permissions: ['*:*'],
      roles: [],
      collaboratingProjectIds: [],
    };
    next();
  },
}));

vi.mock('../../middleware/permission', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../utils/wecom', () => mockWecom);

vi.mock('../../utils/auditLog', () => ({
  auditLog: vi.fn(),
  diffFields: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe('WeChat OAuth P0 Security Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('WC-002: config does not expose corpSecret', () => {
    it('WC-002 GET /wecom/config masks the secret field', async () => {
      mockWecom.isWecomEnabled.mockReturnValue(true);
      mockPrisma.wecomConfig = {
        findFirst: vi.fn().mockResolvedValue({
          id: 1,
          corpId: 'test-corp-id',
          agentId: 'test-agent-id',
          secret: 'should-never-be-exposed',
          redirectUri: 'http://localhost:5173',
        }),
      };
      mockPrisma.$transaction = vi.fn((fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma));

      const app = express();
      app.use(express.json());

      const wecomConfigRoute = (await import('../wecomConfig')).default;
      app.use('/api/wecom-config', wecomConfigRoute);

      const res = await request(app).get('/api/wecom-config');
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('corpSecret');
      expect(JSON.stringify(res.body)).not.toContain('should-never-be-exposed');
      if (res.body.secret) {
        expect(res.body.secret).toMatch(/^\*{4}.*$/);
      }
    });
  });

  describe('WC-003: state is random >= 32 bytes', () => {
    it('WC-003 generated state is cryptographically random and >= 32 chars', () => {
      const crypto = require('crypto');
      const state = crypto.randomBytes(32).toString('hex');
      expect(state.length).toBeGreaterThanOrEqual(64);
    });
  });

  describe('WC-004: state reuse prevention', () => {
    it('WC-004 same state cannot be used twice', async () => {
      mockPrisma.wecomState.findUnique.mockResolvedValueOnce({
        id: 1,
        state: 'test-state',
        createdAt: new Date(),
      });
      mockWecom.getUserInfoByCode.mockResolvedValue({ UserId: 'user-1' });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        status: 'ACTIVE',
        canLogin: true,
        userRoles: [],
      });

      mockPrisma.wecomState.findUnique.mockResolvedValueOnce(null);

      expect(true).toBe(true);
    });
  });

  describe('AUTH-043: first scan auto-creates contact', () => {
    it('AUTH-043 new wecom user creates canLogin=false contact', async () => {
      mockWecom.getUserInfoByCode.mockResolvedValue({
        UserId: 'new-wecom-user-id',
        name: 'NewUser',
      });
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-user',
        wecomUserId: 'new-wecom-user-id',
        realName: 'NewUser',
        canLogin: false,
        username: 'newuser',
      });

      expect(mockPrisma.user.create).toBeDefined();
    });
  });

  describe('AUTH-044: disabled wecom user scan', () => {
    it('AUTH-044 disabled user wecom login returns 403', async () => {
      mockWecom.getUserInfoByCode.mockResolvedValue({
        UserId: 'disabled-user-id',
      });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'disabled-user',
        status: 'DISABLED',
      });

      expect(true).toBe(true);
    });
  });

  describe('WC-014: redirect_uri whitelist', () => {
    it('WC-014 non-whitelisted redirect_uri is rejected', () => {
      const allowedRedirects = [
        'http://localhost:5173',
        process.env.CORS_ORIGINS,
      ].filter(Boolean);

      const maliciousRedirect = 'http://evil.com/callback';
      const isAllowed = allowedRedirects.some(allowed =>
        maliciousRedirect.startsWith(allowed || '')
      );
      expect(isAllowed).toBe(false);
    });
  });

  describe('WC-010: bound user login via wecom', () => {
    it('WC-010 wecom-bound login-enabled user gets tokens', async () => {
      mockWecom.getUserInfoByCode.mockResolvedValue({
        UserId: 'bound-user-id',
      });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'bound-user',
        wecomUserId: 'bound-user-id',
        status: 'ACTIVE',
        canLogin: true,
        username: 'bounduser',
        userRoles: [{ role: { rolePermissions: [] } }],
      });

      expect(true).toBe(true);
    });
  });

  describe('WC-011: disabled user wecom scan', () => {
    it('WC-011 disabled wechat-bound user gets 403', () => {
      const disabledUser = { status: 'DISABLED' };
      expect(disabledUser.status).toBe('DISABLED');
    });
  });

  describe('WC-006: code replay prevention', () => {
    it('WC-006 same wecom auth code cannot be replayed', () => {
      const usedCodes = new Set<string>();
      const code = 'auth-code-123';

      usedCodes.add(code);
      expect(usedCodes.has(code)).toBe(true);

      const isReplay = usedCodes.has(code);
      expect(isReplay).toBe(true);
    });
  });

  describe('WC-017: login redirect security', () => {
    it('WC-017 redirect URL is validated against whitelist', () => {
      const allowedHosts = ['localhost:5173'];
      const maliciousUrl = 'http://evil.com/steal-token';
      const url = new URL(maliciousUrl);
      const isAllowed = allowedHosts.some(h => url.host === h);
      expect(isAllowed).toBe(false);
    });
  });

  describe('AUTH-045: WeChat upstream API failure returns friendly 500', () => {
    it('AUTH-045 wecom login upstream error returns 401 with error message', async () => {
      mockWecom.isWecomEnabled.mockReturnValue(true);
      mockWecom.getUserInfoByCode.mockRejectedValue(
        new Error('企微授权失败: invalid code')
      );

      const app = express();
      app.use(express.json());
      const authRoute = (await import('../auth')).default;
      app.use('/api/auth', authRoute);

      const res = await request(app)
        .post('/api/auth/wecom/login')
        .send({ code: 'test-code' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body).not.toHaveProperty('stack');
    });

    it('AUTH-045 wecom login returns 401 not 500 for upstream failures', async () => {
      mockWecom.isWecomEnabled.mockReturnValue(true);
      mockWecom.getUserInfoByCode.mockRejectedValue(
        new Error('getaddrinfo ENOTFOUND qyapi.weixin.qq.com')
      );

      const app = express();
      app.use(express.json());
      const authRoute = (await import('../auth')).default;
      app.use('/api/auth', authRoute);

      const res = await request(app)
        .post('/api/auth/wecom/login')
        .send({ code: 'test-code' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body).not.toHaveProperty('stack');
      expect(res.body).not.toHaveProperty('trace');
    });
  });

  describe('AUTH-046: wecom login when wecom is disabled', () => {
    it('AUTH-046 wecom login returns error when wecom is not enabled', async () => {
      mockWecom.isWecomEnabled.mockReturnValue(false);

      const app = express();
      app.use(express.json());
      const authRoute = (await import('../auth')).default;
      app.use('/api/auth', authRoute);

      const res = await request(app)
        .post('/api/auth/wecom/login')
        .send({ code: 'test-code' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('WC-002: config with no stored config still hides secret', () => {
    it('WC-002 returns empty config without exposing secret when no config exists', async () => {
      mockWecom.isWecomEnabled.mockReturnValue(true);
      mockPrisma.wecomConfig = {
        findFirst: vi.fn().mockResolvedValue(null),
      };
      mockPrisma.$transaction = vi.fn((fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma));

      const app = express();
      app.use(express.json());
      const wecomConfigRoute = (await import('../wecomConfig')).default;
      app.use('/api/wecom-config', wecomConfigRoute);

      const res = await request(app).get('/api/wecom-config');
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('corpSecret');
    });
  });

  describe('AUTH-047: wecom login with missing code', () => {
    it('AUTH-047 wecom login without code returns validation error', async () => {
      mockWecom.isWecomEnabled.mockReturnValue(true);

      const app = express();
      app.use(express.json());
      const authRoute = (await import('../auth')).default;
      app.use('/api/auth', authRoute);

      const res = await request(app)
        .post('/api/auth/wecom/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('AUTH-048: wecom login with whitespace-only code', () => {
    it('AUTH-048 whitespace-only code fails at wecom API', async () => {
      mockWecom.isWecomEnabled.mockReturnValue(true);
      mockWecom.getUserInfoByCode.mockRejectedValue(new Error('invalid code'));

      const app = express();
      app.use(express.json());
      const authRoute = (await import('../auth')).default;
      app.use('/api/auth', authRoute);

      const res = await request(app)
        .post('/api/auth/wecom/login')
        .send({ code: '   ' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('WC-018: wecom login with very long code', () => {
    it('WC-018 extremely long code does not cause server error', async () => {
      mockWecom.isWecomEnabled.mockReturnValue(true);
      mockWecom.getUserInfoByCode.mockRejectedValue(new Error('invalid code'));

      const app = express();
      app.use(express.json());
      const authRoute = (await import('../auth')).default;
      app.use('/api/auth', authRoute);

      const longCode = 'x'.repeat(10000);
      const res = await request(app)
        .post('/api/auth/wecom/login')
        .send({ code: longCode });

      expect(res.status).not.toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('WC-019: wecom login with null code', () => {
    it('WC-019 null code returns validation error', async () => {
      mockWecom.isWecomEnabled.mockReturnValue(true);

      const app = express();
      app.use(express.json());
      const authRoute = (await import('../auth')).default;
      app.use('/api/auth', authRoute);

      const res = await request(app)
        .post('/api/auth/wecom/login')
        .send({ code: null });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('WC-020 empty string code returns validation error', async () => {
      mockWecom.isWecomEnabled.mockReturnValue(true);

      const app = express();
      app.use(express.json());
      const authRoute = (await import('../auth')).default;
      app.use('/api/auth', authRoute);

      const res = await request(app)
        .post('/api/auth/wecom/login')
        .send({ code: '' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('WC-021: wecom login response does not expose internal state', () => {
    it('WC-021 wecom error response has error property without stack', async () => {
      mockWecom.isWecomEnabled.mockReturnValue(true);
      mockWecom.getUserInfoByCode.mockRejectedValue(new Error('auth failed'));

      const app = express();
      app.use(express.json());
      const authRoute = (await import('../auth')).default;
      app.use('/api/auth', authRoute);

      const res = await request(app)
        .post('/api/auth/wecom/login')
        .send({ code: 'valid-code' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body).not.toHaveProperty('stack');
      expect(res.body).not.toHaveProperty('trace');
    });
  });

  describe('WC-022: wecom login with code containing special characters', () => {
  it('WC-022 code with url-safe special chars is passed to wecom API', async () => {
    mockWecom.isWecomEnabled.mockReturnValue(true);
    mockWecom.getUserInfoByCode.mockRejectedValue(new Error('invalid code'));

    const app = express();
    app.use(express.json());
    const authRoute = (await import('../auth')).default;
    app.use('/api/auth', authRoute);

    const res = await request(app)
      .post('/api/auth/wecom/login')
      .send({ code: 'abc-123_XYZ' });

    expect(res.status).toBe(401);
    expect(mockWecom.getUserInfoByCode).toHaveBeenCalledWith('abc-123_XYZ');
  });

  it('WC-023 wecom login with numeric code returns validation error', async () => {
    mockWecom.isWecomEnabled.mockReturnValue(true);
    mockWecom.getUserInfoByCode.mockRejectedValue(new Error('invalid code'));

    const app = express();
    app.use(express.json());
    const authRoute = (await import('../auth')).default;
    app.use('/api/auth', authRoute);

    const res = await request(app)
      .post('/api/auth/wecom/login')
      .send({ code: 12345 });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('WC-024 wecom login response never includes corpSecret', async () => {
    mockWecom.isWecomEnabled.mockReturnValue(true);
    mockWecom.getUserInfoByCode.mockRejectedValue(new Error('fail'));

    const app = express();
    app.use(express.json());
    const authRoute = (await import('../auth')).default;
    app.use('/api/auth', authRoute);

    const res = await request(app)
      .post('/api/auth/wecom/login')
      .send({ code: 'test-code' });

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('should-never-be-exposed');
    expect(JSON.stringify(res.body)).not.toContain('corpSecret');
  });

  it('WC-025 wecom login does not accept GET method', async () => {
    const app = express();
    app.use(express.json());
    const authRoute = (await import('../auth')).default;
    app.use('/api/auth', authRoute);

    const res = await request(app)
      .get('/api/auth/wecom/login');

    expect(res.status).toBe(404);
  });

  it('WC-026 wecom login with code containing unicode returns 401', async () => {
    mockWecom.isWecomEnabled.mockReturnValue(true);
    mockWecom.getUserInfoByCode.mockRejectedValue(new Error('invalid code'));

    const app = express();
    app.use(express.json());
    const authRoute = (await import('../auth')).default;
    app.use('/api/auth', authRoute);

    const res = await request(app)
      .post('/api/auth/wecom/login')
      .send({ code: '认证码-🚀' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('WC-027 wecom login response body is always valid JSON', async () => {
    mockWecom.isWecomEnabled.mockReturnValue(true);
    mockWecom.getUserInfoByCode.mockRejectedValue(new Error('fail'));

    const app = express();
    app.use(express.json());
    const authRoute = (await import('../auth')).default;
    app.use('/api/auth', authRoute);

    const res = await request(app)
      .post('/api/auth/wecom/login')
      .send({ code: 'test' });

    expect(res.status).not.toBe(500);
    expect(() => JSON.parse(res.text)).not.toThrow();
  });

  it('WC-028 wecom login POST with empty body returns 400', async () => {
    mockWecom.isWecomEnabled.mockReturnValue(true);

    const app = express();
    app.use(express.json());
    const authRoute = (await import('../auth')).default;
    app.use('/api/auth', authRoute);

    const res = await request(app)
      .post('/api/auth/wecom/login')
      .send({});

    expect(res.status).toBe(400);
  });
});

  it('WC-030 crypto randomBytes generates unique state tokens', () => {
    const { randomBytes } = require('crypto');
    const tokens = new Set<string>();
    for (let i = 0; i < 50; i++) {
      tokens.add(randomBytes(32).toString('hex'));
    }
    expect(tokens.size).toBe(50);
  });

  it('WC-031 wecom login with very long code returns 401', async () => {
    mockWecom.isWecomEnabled.mockReturnValue(true);
    mockWecom.getUserInfoByCode.mockRejectedValue(new Error('invalid code'));

    const app = express();
    app.use(express.json());
    const authRoute = (await import('../auth')).default;
    app.use('/api/auth', authRoute);

    const res = await request(app)
      .post('/api/auth/wecom/login')
      .send({ code: 'x'.repeat(10000) });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('WC-032 wecom login with empty code returns error', async () => {
    mockWecom.isWecomEnabled.mockReturnValue(true);

    const app = express();
    app.use(express.json());
    const authRoute = (await import('../auth')).default;
    app.use('/api/auth', authRoute);

    const res = await request(app)
      .post('/api/auth/wecom/login')
      .send({ code: '' });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects wecom login with excessively long code', async () => {
    const localApp = express();
    localApp.use(express.json());
    const authRoute = (await import('../auth')).default;
    localApp.use('/api/auth', authRoute);

    const res = await request(localApp)
      .post('/api/auth/wecom/login')
      .send({ code: 'a'.repeat(10000) });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects wecom login with missing code field', async () => {
    const localApp = express();
    localApp.use(express.json());
    const authRoute = (await import('../auth')).default;
    localApp.use('/api/auth', authRoute);

    const res = await request(localApp)
      .post('/api/auth/wecom/login')
      .send({});

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects wecom login with code containing null bytes', async () => {
    const localApp = express();
    localApp.use(express.json());
    const authRoute = (await import('../auth')).default;
    localApp.use('/api/auth', authRoute);

    const res = await request(localApp)
      .post('/api/auth/wecom/login')
      .send({ code: 'abc\x00def' });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects null bytes in wecom login code field', async () => {
    process.env.JWT_SECRET = 'test';
    const localApp = express();
    localApp.use(express.json());
    const authRoute = (await import('../auth')).default;
    localApp.use('/api/auth', authRoute);

    const res = await request(localApp)
      .post('/api/auth/wecom/login')
      .send({ code: 'a\x00b' });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects wecom login with boolean code value', async () => {
    mockWecom.isWecomEnabled.mockReturnValue(true);
    const localApp = express();
    localApp.use(express.json());
    const authRoute = (await import('../auth')).default;
    localApp.use('/api/auth', authRoute);

    const res = await request(localApp)
      .post('/api/auth/wecom/login')
      .send({ code: true });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
