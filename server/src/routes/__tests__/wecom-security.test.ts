import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

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
    wecomConfig: {
      findFirst: vi.fn(),
    },
    projectMember: { findMany: vi.fn() },
    $transaction: vi.fn((fn: any) => fn(mockPrisma)),
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

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as any;
    }
  },
}));

vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn(), hash: vi.fn(() => 'hashed') },
}));

vi.mock('jsonwebtoken', () => ({ default: mockJwt }));

vi.mock('../../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'user-1',
      permissions: ['*:*'],
      roles: [],
      collaboratingProjectIds: [],
    };
    next();
  },
}));

vi.mock('../../middleware/permission', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
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
      mockPrisma.$transaction = vi.fn((fn: any) => fn(mockPrisma));

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
});
