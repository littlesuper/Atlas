import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FEATURE_FLAGS, clearLocalFeatureFlagOverrides } from '../utils/featureFlags';
import featureFlagsRoutes from './featureFlags';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/feature-flags', featureFlagsRoutes);
  return app;
};

describe('featureFlags route', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearLocalFeatureFlagOverrides();
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    delete process.env.FEATURE_FLAG_OVERRIDES;
    delete process.env.FEATURE_FLAGS_ALLOW_LOCAL_OVERRIDE;
  });

  afterEach(() => {
    clearLocalFeatureFlagOverrides();
    process.env = originalEnv;
  });

  it('lists public feature flags with local provider fallback', async () => {
    const res = await request(createTestApp()).get('/api/feature-flags');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      provider: 'local',
      flags: Object.values(FEATURE_FLAGS).map((name) => ({ name, enabled: false })),
    });
  });

  it('can dynamically toggle the first flag when local overrides are explicitly enabled', async () => {
    process.env.FEATURE_FLAGS_ALLOW_LOCAL_OVERRIDE = 'true';

    const enableRes = await request(createTestApp())
      .patch(`/api/feature-flags/${FEATURE_FLAGS.WEEK7_DEMO}`)
      .send({ enabled: true });
    const listRes = await request(createTestApp()).get('/api/feature-flags');

    expect(enableRes.status).toBe(200);
    expect(enableRes.body).toEqual({ name: FEATURE_FLAGS.WEEK7_DEMO, enabled: true });
    expect(listRes.body.flags).toEqual(
      Object.values(FEATURE_FLAGS).map((name) => ({
        name,
        enabled: name === FEATURE_FLAGS.WEEK7_DEMO,
      }))
    );
  });

  it('does not expose local override endpoint unless explicitly enabled', async () => {
    const res = await request(createTestApp())
      .patch(`/api/feature-flags/${FEATURE_FLAGS.WEEK7_DEMO}`)
      .send({ enabled: true });

    expect(res.status).toBe(404);
  });
});
