export type FeatureFlagMap = Record<string, boolean>;

export type FeatureFlagDefinition = {
  name: string;
  defaultEnabled: boolean;
  owner: string;
  riskLevel: 'low' | 'medium' | 'high';
  description: string;
  mitigation: string;
};

export type FeatureFlagConfigurationValidation = {
  unknownFlags: string[];
  registeredFlags: string[];
};

const flagNamePattern = /^[A-Za-z0-9._:-]+$/;

const featureFlagDefinitions: FeatureFlagDefinition[] = [
  {
    name: 'activity.bulk-mutation',
    defaultEnabled: true,
    owner: 'project-management',
    riskLevel: 'high',
    description: '活动批量更新与批量删除入口',
    mitigation: '关闭后阻断批量更新/删除，单条活动操作保持可用',
  },
  {
    name: 'activity.import',
    defaultEnabled: true,
    owner: 'project-management',
    riskLevel: 'high',
    description: '活动 Excel 导入批量写入入口',
    mitigation: '关闭后阻断导入解析和批量写入，其他活动管理能力保持可用',
  },
  {
    name: 'ai.external-calls',
    defaultEnabled: true,
    owner: 'platform-ai',
    riskLevel: 'high',
    description: '外部 AI API 调用统一出口',
    mitigation: '关闭后外部 AI 调用失败关闭，系统回退到规则引擎或空 AI 结果',
  },
];

export function parseFeatureFlags(raw: string | undefined): FeatureFlagMap {
  if (!raw?.trim()) return {};

  const value = raw.trim();
  if (value.startsWith('{')) {
    return parseJsonFeatureFlags(value);
  }

  return parseCommaFeatureFlags(value);
}

export function isFeatureEnabled(
  flags: FeatureFlagMap,
  name: string,
  defaultValue = false,
): boolean {
  return flags[name] ?? defaultValue;
}

export function snapshotFeatureFlags(flags: FeatureFlagMap): { flags: FeatureFlagMap; total: number } {
  const sortedFlags = Object.fromEntries(
    Object.entries(flags).sort(([left], [right]) => left.localeCompare(right)),
  );

  return {
    flags: sortedFlags,
    total: Object.keys(sortedFlags).length,
  };
}

export function getFeatureFlagDefinitions(): FeatureFlagDefinition[] {
  return featureFlagDefinitions.map((definition) => ({ ...definition }));
}

export function validateFeatureFlagConfiguration(flags: FeatureFlagMap): FeatureFlagConfigurationValidation {
  const registeredNames = new Set(featureFlagDefinitions.map((definition) => definition.name));
  const names = Object.keys(flags).sort((left, right) => left.localeCompare(right));

  return {
    unknownFlags: names.filter((name) => !registeredNames.has(name)),
    registeredFlags: names.filter((name) => registeredNames.has(name)),
  };
}

function parseJsonFeatureFlags(raw: string): FeatureFlagMap {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {};

    const entries = Object.entries(parsed).filter(
      (entry): entry is [string, boolean] =>
        isValidFlagName(entry[0]) && typeof entry[1] === 'boolean',
    );

    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

function parseCommaFeatureFlags(raw: string): FeatureFlagMap {
  return Object.fromEntries(
    raw
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => {
        const disabled = token.startsWith('!');
        const name = disabled ? token.slice(1).trim() : token;
        return { name, enabled: !disabled };
      })
      .filter(({ name }) => isValidFlagName(name))
      .map(({ name, enabled }) => [name, enabled]),
  );
}

function isValidFlagName(name: string) {
  return flagNamePattern.test(name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
