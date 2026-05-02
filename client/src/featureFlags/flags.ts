export const FEATURE_FLAGS = {
  WEEK7_DEMO: 'atlas.week7.demo',
} as const;

export type FeatureFlagName = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagName, boolean> = {
  [FEATURE_FLAGS.WEEK7_DEMO]: false,
};
