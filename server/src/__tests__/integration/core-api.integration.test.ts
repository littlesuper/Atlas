import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupIntegrationTest, type IntegrationTestContext, setupIntegrationTest } from './helpers/testApp';

describe('integration: core API journeys', () => {
  let context: IntegrationTestContext;
  let accessToken: string;
  let refreshToken: string;

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  beforeAll(async () => {
    context = await setupIntegrationTest();

    const login = await request(context.app)
      .post('/api/auth/login')
      .send({ username: 'integration-admin', password: 'admin123' }); // pragma: allowlist secret

    accessToken = login.body.accessToken;
    refreshToken = login.body.refreshToken;
  }, 30_000);

  afterAll(async () => {
    await cleanupIntegrationTest(context);
  });

  async function createProject(app: Express, suffix: string) {
    const response = await request(app)
      .post('/api/projects')
      .set(auth())
      .send({
        name: `Integration Project ${suffix}`,
        description: `Project created for integration test ${suffix}`,
        productLine: 'Router',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        managerId: context.seed.adminUser.id,
        startDate: '2026-02-01T00:00:00.000Z',
      });

    expect(response.status).toBe(201);
    return response.body as { id: string; name: string };
  }

  async function createActivity(app: Express, suffix: string, projectId = context.seed.project.id) {
    const response = await request(app)
      .post('/api/activities')
      .set(auth())
      .send({
        projectId,
        name: `Integration Activity ${suffix}`,
        type: 'TASK',
        status: 'NOT_STARTED',
        priority: 'MEDIUM',
        planStartDate: '2026-02-02T00:00:00.000Z',
        planEndDate: '2026-02-04T00:00:00.000Z',
        sortOrder: 10,
      });

    expect(response.status).toBe(201);
    return response.body as { id: string; name: string; projectId: string };
  }

  async function createProduct(app: Express, suffix: string, projectId = context.seed.project.id) {
    const response = await request(app)
      .post('/api/products')
      .set(auth())
      .send({
        name: `Integration Product ${suffix}`,
        model: `INT-MODEL-${suffix}`,
        revision: 'A',
        category: 'ROUTER',
        status: 'DEVELOPING',
        projectId,
        specifications: { chipset: 'Atlas', memory: '8GB' },
      });

    expect(response.status).toBe(201);
    return response.body as { id: string; name: string; model: string; revision: string; projectId: string };
  }

  it('returns the current authenticated user from /auth/me', async () => {
    const response = await request(context.app).get('/api/auth/me').set(auth());

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: context.seed.adminUser.id,
        username: 'integration-admin',
        realName: 'Integration Admin',
        roles: ['系统管理员'],
        permissions: ['*:*'],
      })
    );
  });

  it('refreshes a valid refresh token into a new access token', async () => {
    const response = await request(context.app).post('/api/auth/refresh').send({ refreshToken });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
  });

  it('persists shallow-merged user preferences', async () => {
    const update = await request(context.app)
      .put('/api/auth/preferences')
      .set(auth())
      .send({ preferences: { theme: 'dark', locale: 'zh-CN' } });

    expect(update.status).toBe(200);
    expect(update.body).toEqual(expect.objectContaining({ theme: 'dark', locale: 'zh-CN' }));

    const read = await request(context.app).get('/api/auth/preferences').set(auth());

    expect(read.status).toBe(200);
    expect(read.body).toEqual(expect.objectContaining({ theme: 'dark', locale: 'zh-CN' }));
  });

  it('lists roles with their expanded permissions', async () => {
    const response = await request(context.app).get('/api/roles').set(auth());

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '系统管理员',
          permissions: [expect.objectContaining({ resource: '*', action: '*' })],
        }),
      ])
    );
  });

  it('lists permission records for role management', async () => {
    const response = await request(context.app).get('/api/roles/permissions').set(auth());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([expect.objectContaining({ resource: '*', action: '*' })]);
  });

  it('lists login-enabled users without exposing password hashes', async () => {
    const response = await request(context.app).get('/api/users?canLogin=true').set(auth());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({
        id: context.seed.adminUser.id,
        username: 'integration-admin',
        canLogin: true,
        roles: ['系统管理员'],
      })
    );
    expect(response.body.data[0]).not.toHaveProperty('password');
  });

  it('creates a project through the authenticated API', async () => {
    const project = await createProject(context.app, 'create');

    expect(project).toEqual(
      expect.objectContaining({
        name: 'Integration Project create',
        manager: expect.objectContaining({ id: context.seed.adminUser.id }),
      })
    );
  });

  it('filters projects by keyword and keeps stats aligned with the filter', async () => {
    const project = await createProject(context.app, 'keyword');

    const response = await request(context.app).get('/api/projects?keyword=keyword&page=1&pageSize=5').set(auth());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.stats.all).toBe(1);
    expect(response.body.data).toEqual([expect.objectContaining({ id: project.id })]);
  });

  it('rejects project creation with an invalid status', async () => {
    const response = await request(context.app).post('/api/projects').set(auth()).send({
      name: 'Integration Invalid Status Project',
      productLine: 'Router',
      status: 'UNKNOWN',
      priority: 'HIGH',
      managerId: context.seed.adminUser.id,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('无效的状态值');
  });

  it('creates an activity and computes plan duration from dates', async () => {
    const activity = await createActivity(context.app, 'create');

    expect(activity).toEqual(
      expect.objectContaining({
        name: 'Integration Activity create',
        projectId: context.seed.project.id,
        planDuration: expect.any(Number),
      })
    );
  });

  it('lists project activities in paginated mode', async () => {
    const activity = await createActivity(context.app, 'list');

    const response = await request(context.app)
      .get(`/api/activities/project/${context.seed.project.id}?page=1&pageSize=10`)
      .set(auth());

    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
    expect(response.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: activity.id })]));
  });

  it('creates and lists check items for an activity', async () => {
    const activity = await createActivity(context.app, 'check-items');

    const create = await request(context.app)
      .post('/api/check-items')
      .set(auth())
      .send({ activityId: activity.id, title: 'Integration check item' });

    expect(create.status).toBe(201);
    expect(create.body).toEqual(expect.objectContaining({ activityId: activity.id, title: 'Integration check item' }));

    const list = await request(context.app).get(`/api/check-items/activity/${activity.id}`).set(auth());

    expect(list.status).toBe(200);
    expect(list.body).toEqual([expect.objectContaining({ id: create.body.id, checked: false })]);
  });

  it('updates check item completion state', async () => {
    const activity = await createActivity(context.app, 'check-update');
    const create = await request(context.app)
      .post('/api/check-items')
      .set(auth())
      .send({ activityId: activity.id, title: 'Check completion' });

    const update = await request(context.app)
      .put(`/api/check-items/${create.body.id}`)
      .set(auth())
      .send({ checked: true });

    expect(update.status).toBe(200);
    expect(update.body).toEqual(expect.objectContaining({ id: create.body.id, checked: true }));
  });

  it('creates a product linked to a project and filters by specification keyword', async () => {
    const product = await createProduct(context.app, 'spec');

    const response = await request(context.app).get('/api/products?specKeyword=memory').set(auth());

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: product.id })]));
  });

  it('rejects duplicate product model and revision pairs', async () => {
    const product = await createProduct(context.app, 'duplicate');

    const duplicate = await request(context.app).post('/api/products').set(auth()).send({
      name: 'Integration Duplicate Product',
      model: product.model,
      revision: product.revision,
      category: 'ROUTER',
      status: 'DEVELOPING',
    });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toContain(product.model);
  });

  it('creates a weekly report draft for a managed project', async () => {
    const project = await createProject(context.app, 'weekly-draft');

    const response = await request(context.app).post('/api/weekly-reports').set(auth()).send({
      projectId: project.id,
      weekStart: '2026-03-02T00:00:00.000Z',
      weekEnd: '2026-03-08T00:00:00.000Z',
      keyProgress: '<p>Integration progress</p>',
      nextWeekPlan: '<p>Integration plan</p>',
      progressStatus: 'ON_TRACK',
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        projectId: project.id,
        status: 'DRAFT',
        progressStatus: 'ON_TRACK',
      })
    );
  });

  it('submits a weekly report and exposes it as the latest report', async () => {
    const project = await createProject(context.app, 'weekly-submit');

    const create = await request(context.app).post('/api/weekly-reports').set(auth()).send({
      projectId: project.id,
      weekStart: '2026-03-09T00:00:00.000Z',
      weekEnd: '2026-03-15T00:00:00.000Z',
      keyProgress: '<p>Submitted progress</p>',
      progressStatus: 'MINOR_ISSUE',
    });
    expect(create.status).toBe(201);

    const submit = await request(context.app).post(`/api/weekly-reports/${create.body.id}/submit`).set(auth());

    expect(submit.status).toBe(200);
    expect(submit.body.status).toBe('SUBMITTED');

    const latest = await request(context.app).get(`/api/weekly-reports/project/${project.id}/latest`).set(auth());

    expect(latest.status).toBe(200);
    expect(latest.body.id).toBe(create.body.id);
    expect(latest.body.status).toBe('SUBMITTED');
  });
});
