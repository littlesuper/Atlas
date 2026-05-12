import { describe, expect, it } from 'vitest';
import {
  getFeatureFlagDefinitions,
  isFeatureEnabled,
  parseFeatureFlags,
  snapshotFeatureFlags,
  validateFeatureFlagConfiguration,
} from './featureFlags';

describe('feature flags', () => {
  it('parses JSON object flags', () => {
    expect(
      parseFeatureFlags('{"risk.ai":true,"weekly-report":false,"ignored":"yes"}'),
    ).toEqual({
      'risk.ai': true,
      'weekly-report': false,
    });
  });

  it('parses comma shorthand flags with ! for disabled flags', () => {
    expect(parseFeatureFlags('risk.ai,!weekly-report, product_compare ')).toEqual({
      'product_compare': true,
      'risk.ai': true,
      'weekly-report': false,
    });
  });

  it('fails closed for malformed JSON and invalid names', () => {
    expect(parseFeatureFlags('{"risk.ai":true')).toEqual({});
    expect(parseFeatureFlags('risk.ai, bad flag, ok_flag')).toEqual({
      'ok_flag': true,
      'risk.ai': true,
    });
  });

  it('evaluates unknown flags as disabled by default', () => {
    const flags = parseFeatureFlags('risk.ai,!weekly-report');

    expect(isFeatureEnabled(flags, 'risk.ai')).toBe(true);
    expect(isFeatureEnabled(flags, 'weekly-report')).toBe(false);
    expect(isFeatureEnabled(flags, 'missing')).toBe(false);
    expect(isFeatureEnabled(flags, 'missing', true)).toBe(true);
  });

  it('returns a stable sorted snapshot', () => {
    expect(snapshotFeatureFlags({ beta: true, alpha: false })).toEqual({
      flags: { alpha: false, beta: true },
      total: 2,
    });
  });

  it('returns registered feature flag definitions with ownership and mitigation metadata', () => {
    expect(getFeatureFlagDefinitions()).toEqual([
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
    ]);
  });

  it('reports configured flags that are not registered in definitions', () => {
    expect(validateFeatureFlagConfiguration({
      'activity.import': false,
      'unknown.flag': true,
      'weekly-report': false,
    })).toEqual({
      unknownFlags: ['unknown.flag', 'weekly-report'],
      registeredFlags: ['activity.import'],
    });
  });

  it('returns empty for undefined raw input', () => {
    expect(parseFeatureFlags(undefined)).toEqual({});
  });

  it('returns empty for empty string', () => {
    expect(parseFeatureFlags('')).toEqual({});
  });

  it('returns empty for whitespace-only string', () => {
    expect(parseFeatureFlags('   ')).toEqual({});
  });

  it('filters non-boolean values from JSON', () => {
    expect(parseFeatureFlags('{"a":1,"b":"yes","c":true}')).toEqual({ c: true });
  });

  it('filters invalid flag names with special characters', () => {
    expect(parseFeatureFlags('valid-flag,invalid flag,bad@name')).toEqual({
      'valid-flag': true,
    });
  });

  it('handles double negation as filtered invalid name', () => {
    expect(parseFeatureFlags('!!flag')).toEqual({});
  });

  it('handles duplicate comma keys by keeping last', () => {
    const result = parseFeatureFlags('flag,!flag');
    expect(result).toEqual({ flag: false });
  });

  it('handles duplicate JSON keys by keeping last', () => {
    const result = parseFeatureFlags('{"flag":true,"flag":false}');
    expect(result).toEqual({ flag: false });
  });

  it('handles commas with only whitespace tokens', () => {
    expect(parseFeatureFlags('  ,  ,  ')).toEqual({});
  });

  it('validates empty flag configuration', () => {
    expect(validateFeatureFlagConfiguration({})).toEqual({
      unknownFlags: [],
      registeredFlags: [],
    });
  });

  it('snapshot with empty flags returns empty', () => {
    expect(snapshotFeatureFlags({})).toEqual({ flags: {}, total: 0 });
  });

  it('isFeatureEnabled returns defaultValue for empty flags', () => {
    expect(isFeatureEnabled({}, 'any', true)).toBe(true);
    expect(isFeatureEnabled({}, 'any', false)).toBe(false);
  });

  it('getFeatureFlagDefinitions returns a copy', () => {
    const a = getFeatureFlagDefinitions();
    const b = getFeatureFlagDefinitions();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('accepts flag names with dots, hyphens, colons', () => {
    expect(parseFeatureFlags('a.b,c-d,e:f')).toEqual({
      'a.b': true,
      'c-d': true,
      'e:f': true,
    });
  });

  it('rejects flag names with spaces or slashes', () => {
    expect(parseFeatureFlags('a b,c/d')).toEqual({});
  });

  it('JSON parse returns empty for array JSON', () => {
    expect(parseFeatureFlags('[]')).toEqual({});
  });

  it('JSON parse filters non-boolean values in object', () => {
    expect(parseFeatureFlags('{"a":"string","b":1,"c":null,"d":true}')).toEqual({ d: true });
  });

  it('parseFeatureFlags handles undefined input', () => {
    expect(parseFeatureFlags(undefined)).toEqual({});
  });

  it('parseFeatureFlags handles comma list with trailing comma', () => { expect(parseFeatureFlags('a,b,')).toEqual({ a: true, b: true }); });

  it('parseFeatureFlags handles comma list with only commas', () => { expect(parseFeatureFlags(',,,')).toEqual({}); });

  it('parseFeatureFlags handles key with equals but no value', () => { expect(parseFeatureFlags('debug=')).toEqual({}); });

  it('parseFeatureFlags handles flag with explicit true string', () => { const result = parseFeatureFlags('beta'); expect(result).toHaveProperty('beta'); });

  it('parseFeatureFlags handles undefined input', () => { const result = parseFeatureFlags(undefined); expect(Object.keys(result)).toHaveLength(0); });

  it('parseFeatureFlags handles empty string input', () => { const result = parseFeatureFlags(''); expect(Object.keys(result)).toHaveLength(0); });
});

describe('feature flag boundary matrices', () => {
  it.each(Array.from({ length: 72 }, (_, index) => [`feature.${index}:rollout-${index}`, index % 2 === 0]))(
    'parses valid JSON flag name %s',
    (name, enabled) => {
      expect(parseFeatureFlags(JSON.stringify({ [name]: enabled }))).toEqual({ [name]: enabled });
    }
  );

  it.each(Array.from({ length: 72 }, (_, index) => `flag ${index}`))(
    'filters comma flag names containing whitespace %s',
    (name) => {
      expect(parseFeatureFlags(name)).toEqual({});
    }
  );

  it.each(Array.from({ length: 72 }, (_, index) => [`flag-${index}`, index % 2 === 0]))(
    'parses comma flag toggles %s',
    (name, enabled) => {
      expect(parseFeatureFlags(enabled ? name : `!${name}`)).toEqual({ [name]: enabled });
    }
  );

  it.each(Array.from({ length: 48 }, (_, index) => [`flag-${index}`, index % 2 === 0]))(
    'keeps sorted snapshot total for single flag %s',
    (name, enabled) => {
      expect(snapshotFeatureFlags({ [name]: enabled })).toEqual({
        flags: { [name]: enabled },
        total: 1,
      });
    }
  );

  it.each(Array.from({ length: 48 }, (_, index) => `unknown.flag.${index}`))(
    'reports unknown configured flag %s',
    (name) => {
      expect(validateFeatureFlagConfiguration({ [name]: true })).toEqual({
        unknownFlags: [name],
        registeredFlags: [],
      });
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch109.${index}:flag-${index}`,
    index % 2 === 0,
  ] as const))(
    'parses generated comma shorthand flag %s',
    (name, enabled) => {
      const raw = enabled ? name : `!${name}`;

      expect(parseFeatureFlags(raw)).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(parseFeatureFlags(raw), name, !enabled)).toBe(enabled);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `activity.import`,
    `batch109.unknown.${index}`,
  ] as const))(
    'splits generated registered and unknown flags %s/%s',
    (registeredName, unknownName) => {
      expect(validateFeatureFlagConfiguration({
        [unknownName]: true,
        [registeredName]: false,
      })).toEqual({
        unknownFlags: [unknownName],
        registeredFlags: [registeredName],
      });
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch120.${index}.alpha`,
    `batch120.${index}.beta`,
    index % 2 === 0,
  ] as const))(
    'parses generated multi flag JSON object %s/%s',
    (leftName, rightName, leftEnabled) => {
      expect(parseFeatureFlags(JSON.stringify({
        [rightName]: !leftEnabled,
        ignored: 'true',
        [leftName]: leftEnabled,
      }))).toEqual({
        [rightName]: !leftEnabled,
        [leftName]: leftEnabled,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `bad/name/${index}`,
    `also bad ${index}`,
  ] as const))(
    'filters generated invalid JSON flag names %s/%s',
    (leftName, rightName) => {
      expect(parseFeatureFlags(JSON.stringify({
        [leftName]: true,
        [rightName]: false,
      }))).toEqual({});
    },
  );
});

describe('feature flags batch 126 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch126.${index}.alpha`,
    `batch126.${index}.beta`,
    index % 2 === 0,
  ] as const))(
    'parses generated mixed comma toggles %s/%s',
    (leftName, rightName, leftEnabled) => {
      const raw = leftEnabled ? `${leftName},!${rightName}` : `!${leftName},${rightName}`;
      const flags = parseFeatureFlags(raw);

      expect(flags).toEqual({
        [leftName]: leftEnabled,
        [rightName]: !leftEnabled,
      });
      expect(isFeatureEnabled(flags, leftName, !leftEnabled)).toBe(leftEnabled);
      expect(isFeatureEnabled(flags, rightName, leftEnabled)).toBe(!leftEnabled);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `zeta-${index}`,
    `alpha-${index}`,
    `middle-${index}`,
  ] as const))(
    'snapshot sorts generated flag names %s/%s/%s',
    (zeta, alpha, middle) => {
      expect(snapshotFeatureFlags({
        [zeta]: true,
        [alpha]: false,
        [middle]: true,
      })).toEqual({
        flags: {
          [alpha]: false,
          [middle]: true,
          [zeta]: true,
        },
        total: 3,
      });
    },
  );
});

describe('feature flags batch 163 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch163.${index}.flag`,
    index % 2 === 0,
  ] as const))(
    'parses generated duplicate comma flag with last toggle winning %s',
    (name, firstEnabled) => {
      const raw = firstEnabled ? `${name},!${name}` : `!${name},${name}`;

      expect(parseFeatureFlags(raw)).toEqual({ [name]: !firstEnabled });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch163_${index}-flag.ok`,
    `batch163/bad/${index}`,
    index % 2 === 0,
  ] as const))(
    'keeps generated valid JSON flag while filtering invalid sibling %s/%s',
    (validName, invalidName, enabled) => {
      expect(parseFeatureFlags(JSON.stringify({
        [validName]: enabled,
        [invalidName]: !enabled,
      }))).toEqual({ [validName]: enabled });
    },
  );
});

describe('feature flags batch 166 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch166.${index}.alpha`,
    `batch166.${index}.beta`,
    index % 2 === 0,
  ] as const))(
    'parses generated comma flag with whitespace around toggles %s/%s',
    (leftName, rightName, leftEnabled) => {
      const raw = leftEnabled ? ` ${leftName} , !${rightName} ` : ` !${leftName} , ${rightName} `;
      const flags = parseFeatureFlags(raw);

      expect(flags).toEqual({
        [leftName]: leftEnabled,
        [rightName]: !leftEnabled,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `activity.bulk-mutation`,
    `batch166.unknown.${index}`,
    index % 2 === 0,
  ] as const))(
    'validates generated registered flag beside unknown sibling %s/%s',
    (registeredName, unknownName, enabled) => {
      expect(validateFeatureFlagConfiguration({
        [unknownName]: enabled,
        [registeredName]: !enabled,
      })).toEqual({
        unknownFlags: [unknownName],
        registeredFlags: [registeredName],
      });
    },
  );
});
