import { Context, InMemStorageProvider, Unleash, initialize } from 'unleash-client';
import { logger } from './logger';

export const FEATURE_FLAGS = {
  WEEK7_DEMO: 'atlas.week7.demo',
  AI_ASSISTANCE: 'atlas.ai.assistance',
  WECOM_LOGIN: 'atlas.wecom.login',
  PROJECT_TEMPLATES: 'atlas.project.templates',
  RISK_DASHBOARD: 'atlas.risk.dashboard',
  WORKLOAD_DASHBOARD: 'atlas.workload.dashboard',
  HOLIDAY_MANAGEMENT: 'atlas.holiday.management',
} as const;

export type FeatureFlagName = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

interface FeatureFlagState {
  name: FeatureFlagName;
  enabled: boolean;
}

const DEFAULT_FLAGS: Record<FeatureFlagName, boolean> = {
  [FEATURE_FLAGS.WEEK7_DEMO]: false,
  [FEATURE_FLAGS.AI_ASSISTANCE]: false,
  [FEATURE_FLAGS.WECOM_LOGIN]: false,
  [FEATURE_FLAGS.PROJECT_TEMPLATES]: false,
  [FEATURE_FLAGS.RISK_DASHBOARD]: false,
  [FEATURE_FLAGS.WORKLOAD_DASHBOARD]: false,
  [FEATURE_FLAGS.HOLIDAY_MANAGEMENT]: false,
};

let unleashClient: Unleash | null = null;
let initialized = false;
const localOverrides = new Map<FeatureFlagName, boolean>();

const isKnownFlag = (name: string): name is FeatureFlagName =>
  Object.values(FEATURE_FLAGS).includes(name as FeatureFlagName);

const parseEnvOverrides = (): Partial<Record<FeatureFlagName, boolean>> => {
  if (!process.env.FEATURE_FLAG_OVERRIDES) return {};

  try {
    const parsed = JSON.parse(process.env.FEATURE_FLAG_OVERRIDES) as Record<string, unknown>;
    return Object.entries(parsed).reduce<Partial<Record<FeatureFlagName, boolean>>>((acc, [name, value]) => {
      if (isKnownFlag(name) && typeof value === 'boolean') {
        acc[name] = value;
      }
      return acc;
    }, {});
  } catch (error) {
    logger.warn({ err: error }, 'FEATURE_FLAG_OVERRIDES 解析失败，将使用默认 Feature Flag');
    return {};
  }
};

const getFallback = (name: FeatureFlagName): boolean => {
  const envOverrides = parseEnvOverrides();
  return envOverrides[name] ?? DEFAULT_FLAGS[name];
};

export const initializeFeatureFlags = (): void => {
  if (initialized) return;
  initialized = true;

  const url = process.env.UNLEASH_URL;
  const token = process.env.UNLEASH_BACKEND_TOKEN;

  if (!url || !token) {
    logger.info('Feature Flags 未配置 Unleash，使用本地默认值');
    return;
  }

  unleashClient = initialize({
    url,
    appName: process.env.UNLEASH_APP_NAME || 'atlas-server',
    environment: process.env.UNLEASH_ENVIRONMENT || process.env.NODE_ENV || 'development',
    instanceId: process.env.UNLEASH_INSTANCE_ID || 'atlas-server',
    customHeaders: { Authorization: token },
    storageProvider: new InMemStorageProvider(),
    disableMetrics: process.env.UNLEASH_SEND_METRICS !== 'true',
    bootstrap: {
      data: Object.entries(DEFAULT_FLAGS).map(([name, enabled]) => ({
        name,
        enabled,
        description: 'Atlas rollout guard',
        project: 'default',
        stale: false,
        type: 'release',
        variants: [],
        strategies: enabled ? [{ name: 'default', parameters: {}, constraints: [] }] : [],
      })),
    },
  });

  unleashClient.on('synchronized', () => logger.info('Feature Flags 已与 Unleash 同步'));
  unleashClient.on('error', (error) => logger.warn({ err: error }, 'Feature Flags 同步 Unleash 失败'));
};

export const isFeatureFlagConfigured = (): boolean => Boolean(unleashClient);

export const isLocalFeatureFlagOverrideAllowed = (): boolean =>
  process.env.NODE_ENV !== 'production' && process.env.FEATURE_FLAGS_ALLOW_LOCAL_OVERRIDE === 'true';

export const isFeatureEnabled = (name: FeatureFlagName, context: Context = {}): boolean => {
  if (localOverrides.has(name)) {
    return localOverrides.get(name) ?? false;
  }

  const fallback = getFallback(name);
  if (!unleashClient) {
    return fallback;
  }

  return unleashClient.isEnabled(name, context, fallback);
};

export const getFeatureFlagSnapshot = (context: Context = {}): FeatureFlagState[] =>
  Object.values(FEATURE_FLAGS).map((name) => ({
    name,
    enabled: isFeatureEnabled(name, context),
  }));

export const setLocalFeatureFlagOverride = (name: string, enabled: boolean): FeatureFlagState => {
  if (!isKnownFlag(name)) {
    throw new Error(`Unknown feature flag: ${name}`);
  }

  localOverrides.set(name, enabled);
  return { name, enabled };
};

export const clearLocalFeatureFlagOverrides = (): void => {
  localOverrides.clear();
};
