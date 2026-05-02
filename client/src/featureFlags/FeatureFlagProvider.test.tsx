import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasFeatureFlagProvider, isFeatureFlagClientConfigured, useFeatureFlag } from './FeatureFlagProvider';
import { FEATURE_FLAGS } from './flags';

vi.mock('@unleash/proxy-client-react', () => ({
  FlagProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="unleash-provider">{children}</div>,
  useFlag: vi.fn(() => true),
}));

const Probe = () => {
  const enabled = useFeatureFlag(FEATURE_FLAGS.WEEK7_DEMO);
  return <div>{enabled ? 'enabled' : 'disabled'}</div>;
};

describe('AtlasFeatureFlagProvider', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults known flags to disabled when Unleash is not configured', () => {
    render(
      <AtlasFeatureFlagProvider>
        <Probe />
      </AtlasFeatureFlagProvider>
    );

    expect(screen.getByText('disabled')).toBeInTheDocument();
    expect(isFeatureFlagClientConfigured()).toBe(false);
  });

  it('uses the Unleash React provider when frontend config is present', () => {
    vi.stubEnv('VITE_UNLEASH_FRONTEND_URL', 'https://unleash.example.com/api/frontend');
    vi.stubEnv('VITE_UNLEASH_FRONTEND_TOKEN', 'frontend-token');

    render(
      <AtlasFeatureFlagProvider>
        <Probe />
      </AtlasFeatureFlagProvider>
    );

    expect(screen.getByTestId('unleash-provider')).toBeInTheDocument();
    expect(screen.getByText('enabled')).toBeInTheDocument();
    expect(isFeatureFlagClientConfigured()).toBe(true);
  });
});
