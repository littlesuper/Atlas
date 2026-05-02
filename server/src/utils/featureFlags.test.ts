import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FEATURE_FLAGS,
  clearLocalFeatureFlagOverrides,
  getFeatureFlagSnapshot,
  isFeatureEnabled,
  isLocalFeatureFlagOverrideAllowed,
  setLocalFeatureFlagOverride,
} from './featureFlags';

describe('featureFlags', () => {
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

  it('defaults Atlas release flags to disabled', () => {
    expect(isFeatureEnabled(FEATURE_FLAGS.WEEK7_DEMO)).toBe(false);
    expect(isFeatureEnabled(FEATURE_FLAGS.AI_ASSISTANCE)).toBe(false);
    expect(getFeatureFlagSnapshot()).toEqual(Object.values(FEATURE_FLAGS).map((name) => ({ name, enabled: false })));
  });

  it('supports JSON environment overrides for known flags', () => {
    process.env.FEATURE_FLAG_OVERRIDES = JSON.stringify({ [FEATURE_FLAGS.AI_ASSISTANCE]: true });
    expect(isFeatureEnabled(FEATURE_FLAGS.AI_ASSISTANCE)).toBe(true);
    expect(isFeatureEnabled(FEATURE_FLAGS.WEEK7_DEMO)).toBe(false);
  });

  it('supports local dynamic overrides for non-production verification', () => {
    setLocalFeatureFlagOverride(FEATURE_FLAGS.WEEK7_DEMO, true);
    expect(isFeatureEnabled(FEATURE_FLAGS.WEEK7_DEMO)).toBe(true);

    setLocalFeatureFlagOverride(FEATURE_FLAGS.WEEK7_DEMO, false);
    expect(isFeatureEnabled(FEATURE_FLAGS.WEEK7_DEMO)).toBe(false);
  });

  it('only enables local override endpoint when explicitly allowed outside production', () => {
    process.env.FEATURE_FLAGS_ALLOW_LOCAL_OVERRIDE = 'true';
    process.env.NODE_ENV = 'test';
    expect(isLocalFeatureFlagOverrideAllowed()).toBe(true);

    process.env.NODE_ENV = 'production';
    expect(isLocalFeatureFlagOverrideAllowed()).toBe(false);
  });
});
