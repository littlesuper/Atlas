export type FeatureFlagMap = Record<string, boolean>;

export const isFeatureEnabled = (
  flags: FeatureFlagMap | undefined,
  name: string,
  defaultValue = false,
): boolean => flags?.[name] ?? defaultValue;

export const normalizeFeatureFlags = (value: unknown): FeatureFlagMap => {
  if (!value || typeof value !== 'object') return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
    ),
  );
};
