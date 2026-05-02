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

export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagName, boolean> = {
  [FEATURE_FLAGS.WEEK7_DEMO]: false,
  [FEATURE_FLAGS.AI_ASSISTANCE]: false,
  [FEATURE_FLAGS.WECOM_LOGIN]: false,
  [FEATURE_FLAGS.PROJECT_TEMPLATES]: false,
  [FEATURE_FLAGS.RISK_DASHBOARD]: false,
  [FEATURE_FLAGS.WORKLOAD_DASHBOARD]: false,
  [FEATURE_FLAGS.HOLIDAY_MANAGEMENT]: false,
};
