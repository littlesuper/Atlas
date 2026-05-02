import { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireFeatureFlag } from './featureFlag';
import { FEATURE_FLAGS, clearLocalFeatureFlagOverrides } from '../utils/featureFlags';

describe('requireFeatureFlag', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearLocalFeatureFlagOverrides();
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    delete process.env.FEATURE_FLAG_OVERRIDES;
  });

  afterEach(() => {
    clearLocalFeatureFlagOverrides();
    process.env = originalEnv;
  });

  it('returns 404 when the feature is disabled', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const next = vi.fn();

    requireFeatureFlag(FEATURE_FLAGS.AI_ASSISTANCE)(
      { ip: '127.0.0.1', headers: {}, user: { id: 'user-1' } } as Request,
      { status } as unknown as Response,
      next
    );

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: '接口不存在' });
    expect(next).not.toHaveBeenCalled();
  });

  it('continues when the feature is enabled through environment overrides', () => {
    process.env.FEATURE_FLAG_OVERRIDES = JSON.stringify({ [FEATURE_FLAGS.AI_ASSISTANCE]: true });
    const next = vi.fn();

    requireFeatureFlag(FEATURE_FLAGS.AI_ASSISTANCE)(
      { ip: '127.0.0.1', headers: {}, user: { id: 'user-1' } } as Request,
      {} as Response,
      next
    );

    expect(next).toHaveBeenCalledOnce();
  });
});
