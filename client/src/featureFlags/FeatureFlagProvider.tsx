import React, { createContext, useContext } from 'react';
import { FlagProvider, useFlag } from '@unleash/proxy-client-react';
import { DEFAULT_FEATURE_FLAGS, FEATURE_FLAGS, FeatureFlagName } from './flags';

type FeatureFlagMap = Record<FeatureFlagName, boolean>;

const FeatureFlagContext = createContext<FeatureFlagMap>(DEFAULT_FEATURE_FLAGS);

interface AtlasFeatureFlagProviderProps {
  children: React.ReactNode;
}

const getUnleashConfig = () => {
  const url = import.meta.env.VITE_UNLEASH_FRONTEND_URL;
  const clientKey = import.meta.env.VITE_UNLEASH_FRONTEND_TOKEN;

  if (!url || !clientKey) return null;

  return {
    url,
    clientKey,
    appName: import.meta.env.VITE_UNLEASH_APP_NAME || 'atlas-client',
    environment: import.meta.env.VITE_UNLEASH_ENVIRONMENT || import.meta.env.MODE,
    refreshInterval: Number(import.meta.env.VITE_UNLEASH_REFRESH_INTERVAL || 15),
  };
};

const UnleashBridge: React.FC<AtlasFeatureFlagProviderProps> = ({ children }) => {
  const week7DemoEnabled = useFlag(FEATURE_FLAGS.WEEK7_DEMO);

  return (
    <FeatureFlagContext.Provider
      value={{
        [FEATURE_FLAGS.WEEK7_DEMO]: week7DemoEnabled,
      }}
    >
      {children}
    </FeatureFlagContext.Provider>
  );
};

export const AtlasFeatureFlagProvider: React.FC<AtlasFeatureFlagProviderProps> = ({ children }) => {
  const config = getUnleashConfig();

  if (!config) {
    return <FeatureFlagContext.Provider value={DEFAULT_FEATURE_FLAGS}>{children}</FeatureFlagContext.Provider>;
  }

  return (
    <FlagProvider config={config}>
      <UnleashBridge>{children}</UnleashBridge>
    </FlagProvider>
  );
};

export const useFeatureFlag = (name: FeatureFlagName): boolean => {
  const flags = useContext(FeatureFlagContext);
  return flags[name] ?? false;
};

export const isFeatureFlagClientConfigured = (): boolean => Boolean(getUnleashConfig());
