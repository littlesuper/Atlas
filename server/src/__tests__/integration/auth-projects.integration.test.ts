import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupIntegrationTest, type IntegrationTestContext, setupIntegrationTest } from './helpers/testApp';

describe('integration: auth and projects API', () => {
  let context: IntegrationTestContext;

  beforeAll(async () => {
    context = await setupIntegrationTest();
  }, 30_000);

  afterAll(async () => {
    await cleanupIntegrationTest(context);
  });

  it('serves health without authentication', async () => {
    const res = await request(context.app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('rejects protected project API requests without a token', async () => {
    const res = await request(context.app).get('/api/projects');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('未提供认证令牌');
  });

  it('logs in with a real password hash and reads projects through JWT auth', async () => {
    const login = await request(context.app)
      .post('/api/auth/login')
      .send({ username: 'integration-admin', password: 'admin123' }); // pragma: allowlist secret

    expect(login.status).toBe(200);
    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(login.body.refreshToken).toEqual(expect.any(String));
    expect(login.body.user).toEqual(
      expect.objectContaining({
        id: context.seed.adminUser.id,
        username: 'integration-admin',
        realName: 'Integration Admin',
        roles: ['系统管理员'],
        permissions: ['*:*'],
      })
    );

    const projects = await request(context.app)
      .get('/api/projects?page=1&pageSize=10')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(projects.status).toBe(200);
    expect(projects.body.total).toBe(1);
    expect(projects.body.stats.inProgress).toBe(1);
    expect(projects.body.data).toEqual([
      expect.objectContaining({
        id: context.seed.project.id,
        name: 'Integration Project',
        manager: expect.objectContaining({
          id: context.seed.adminUser.id,
          realName: 'Integration Admin',
        }),
      }),
    ]);
  });
});
