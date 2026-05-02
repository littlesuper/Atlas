import React, { createContext, useContext } from 'react';
import { FlagProvider, useFlag } from '@unleash/proxy-client-react';
import { DEFAULT_FEATURE_FLAGS, FEATURE_FLAGS, FeatureFlagName } from './flags';

type FeatureFlagMap = Record<FeatureFlagName, boolean>;

const parseLocalOverrides = (): Partial<FeatureFlagMap> => {
  const raw = import.meta.env.VITE_FEATURE_FLAG_OVERRIDES;
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.values(FEATURE_FLAGS).reduce<Partial<FeatureFlagMap>>((acc, name) => {
      if (typeof parsed[name] === 'boolean') {
        acc[name] = parsed[name];
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
};

const getLocalDefaults = (): FeatureFlagMap => ({
  ...DEFAULT_FEATURE_FLAGS,
  ...parseLocalOverrides(),
});

const FeatureFlagContext = createContext<FeatureFlagMap>(getLocalDefaults());

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
  const aiAssistanceEnabled = useFlag(FEATURE_FLAGS.AI_ASSISTANCE);
  const wecomLoginEnabled = useFlag(FEATURE_FLAGS.WECOM_LOGIN);
  const projectTemplatesEnabled = useFlag(FEATURE_FLAGS.PROJECT_TEMPLATES);
  const riskDashboardEnabled = useFlag(FEATURE_FLAGS.RISK_DASHBOARD);
  const workloadDashboardEnabled = useFlag(FEATURE_FLAGS.WORKLOAD_DASHBOARD);
  const holidayManagementEnabled = useFlag(FEATURE_FLAGS.HOLIDAY_MANAGEMENT);

  return (
    <FeatureFlagContext.Provider
      value={{
        [FEATURE_FLAGS.WEEK7_DEMO]: week7DemoEnabled,
        [FEATURE_FLAGS.AI_ASSISTANCE]: aiAssistanceEnabled,
        [FEATURE_FLAGS.WECOM_LOGIN]: wecomLoginEnabled,
        [FEATURE_FLAGS.PROJECT_TEMPLATES]: projectTemplatesEnabled,
        [FEATURE_FLAGS.RISK_DASHBOARD]: riskDashboardEnabled,
        [FEATURE_FLAGS.WORKLOAD_DASHBOARD]: workloadDashboardEnabled,
        [FEATURE_FLAGS.HOLIDAY_MANAGEMENT]: holidayManagementEnabled,
      }}
    >
      {children}
    </FeatureFlagContext.Provider>
  );
};

export const AtlasFeatureFlagProvider: React.FC<AtlasFeatureFlagProviderProps> = ({ children }) => {
  const config = getUnleashConfig();

  if (!config) {
    return <FeatureFlagContext.Provider value={getLocalDefaults()}>{children}</FeatureFlagContext.Provider>;
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
