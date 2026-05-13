import { describe, expect, it } from 'vitest';
import { isFeatureEnabled, normalizeFeatureFlags } from './featureFlags';

describe('feature flag helpers', () => {
  it('uses explicit flag values and falls back to the provided default for missing flags', () => {
    const flags = {
      'activity.import': false,
      'activity.bulk-mutation': true,
    };

    expect(isFeatureEnabled(flags, 'activity.import', true)).toBe(false);
    expect(isFeatureEnabled(flags, 'activity.bulk-mutation', false)).toBe(true);
    expect(isFeatureEnabled(flags, 'unknown.feature', true)).toBe(true);
    expect(isFeatureEnabled(flags, 'unknown.feature', false)).toBe(false);
  });

  it('keeps only boolean feature flags from an API snapshot', () => {
    expect(normalizeFeatureFlags({
      'activity.import': false,
      'activity.bulk-mutation': true,
      ignored: 'false',
      count: 1,
    })).toEqual({
      'activity.import': false,
      'activity.bulk-mutation': true,
    });

    expect(normalizeFeatureFlags(null)).toEqual({});
  });

  it('handles undefined input', () => {
    expect(normalizeFeatureFlags(undefined)).toEqual({});
    expect(isFeatureEnabled(undefined, 'any', true)).toBe(true);
  });

  it('handles empty flags object', () => {
    expect(normalizeFeatureFlags({})).toEqual({});
    expect(isFeatureEnabled({}, 'any', false)).toBe(false);
    expect(isFeatureEnabled({}, 'any', true)).toBe(true);
  });

  it('uses false as default defaultValue', () => {
    expect(isFeatureEnabled({}, 'any')).toBe(false);
    expect(isFeatureEnabled(undefined, 'any')).toBe(false);
  });

  it('strips non-boolean values from API response', () => {
    expect(normalizeFeatureFlags({
      a: true,
      b: 'true',
      c: 1,
      d: null,
      e: undefined,
      f: false,
    })).toEqual({ a: true, f: false });
  });

  it('preserves all boolean flags', () => {
    expect(normalizeFeatureFlags({
      'x.y': true,
      'z.w': false,
    })).toEqual({ 'x.y': true, 'z.w': false });
  });

  it('handles array input returning empty', () => {
    expect(normalizeFeatureFlags([1, 2, 3])).toEqual({});
  });

  it('normalizes many flags efficiently', () => {
    const input: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      input[`flag-${i}`] = i % 2 === 0;
    }
    input['extra'] = 'not-bool';
    const result = normalizeFeatureFlags(input);
    expect(Object.keys(result)).toHaveLength(50);
  });

  it('isFeatureEnabled returns false for all unknown flags with default false', () => {
    const flags = { 'a.b': true };
    expect(isFeatureEnabled(flags, 'a.b', false)).toBe(true);
    expect(isFeatureEnabled(flags, 'c.d', false)).toBe(false);
    expect(isFeatureEnabled(flags, 'x', false)).toBe(false);
  });

  it('normalizeFeatureFlags with all boolean values preserves all', () => {
    const input = { a: true, b: false, c: true };
    expect(normalizeFeatureFlags(input)).toEqual({ a: true, b: false, c: true });
  });

  it('normalizeFeatureFlags handles Date input returning empty', () => {
    expect(normalizeFeatureFlags(new Date())).toEqual({});
  });

  it('isFeatureEnabled returns default for empty string flag name', () => {
    expect(isFeatureEnabled({}, '', true)).toBe(true);
    expect(isFeatureEnabled({ '': false }, '', true)).toBe(false);
  });

  it('isFeatureEnabled with undefined flags uses defaultValue', () => {
    expect(isFeatureEnabled(undefined, 'missing', true)).toBe(true);
    expect(isFeatureEnabled(undefined, 'missing', false)).toBe(false);
  });

  it('normalizeFeatureFlags returns empty when all values are non-boolean', () => {
    expect(normalizeFeatureFlags({ a: 'yes', b: 1, c: null })).toEqual({});
  });

  it('isFeatureEnabled with false flag value returns false regardless of default', () => {
    expect(isFeatureEnabled({ darkMode: false }, 'darkMode', true)).toBe(false);
  });

  it('normalizeFeatureFlags handles object with only null and undefined values', () => {
    expect(normalizeFeatureFlags({ a: null, b: undefined })).toEqual({});
  });

  it('normalizeFeatureFlags with primitive boolean true returns empty', () => {
    expect(normalizeFeatureFlags(true)).toEqual({});
  });

  it('normalizeFeatureFlags with Map input returns empty', () => {
    expect(normalizeFeatureFlags(new Map([['a', true]]))).toEqual({});
  });

  it('isFeatureEnabled treats undefined flag value as missing and uses default', () => {
    const flags = { 'a.b': undefined } as Record<string, unknown>;
    expect(isFeatureEnabled(flags as Record<string, boolean>, 'a.b', true)).toBe(true);
    expect(isFeatureEnabled(flags as Record<string, boolean>, 'a.b', false)).toBe(false);
  });

  it('isFeatureEnabled returns default for empty flags object', () => {
    expect(isFeatureEnabled({}, 'any.feature', true)).toBe(true);
    expect(isFeatureEnabled({}, 'any.feature', false)).toBe(false);
  });

  it('isFeatureEnabled handles undefined flags with default', () => {
    expect(isFeatureEnabled(undefined, 'feature.x', true)).toBe(true);
    expect(isFeatureEnabled(undefined, 'feature.x', false)).toBe(false);
  });

  it('normalizeFeatureFlags ignores nested object values', () => {
    expect(normalizeFeatureFlags({ nested: { a: true }, flag: true })).toEqual({ flag: true });
  });

  it('isFeatureEnabled with flag set to true returns true regardless of default false', () => {
    expect(isFeatureEnabled({ enabled: true }, 'enabled', false)).toBe(true);
  });

  it('normalizeFeatureFlags handles object with only function values returning empty', () => {
    expect(normalizeFeatureFlags({ cb: () => true, handler: () => false })).toEqual({});
  });

  it('isFeatureEnabled treats boolean true flag as enabled overriding default false', () => {
    expect(isFeatureEnabled({ flag: true }, 'flag', false)).toBe(true);
  });

  it('normalizeFeatureFlags handles object with zero as boolean false correctly', () => {
    expect(normalizeFeatureFlags({ a: 0, b: false })).toEqual({ b: false });
  });

  it('normalizeFeatureFlags filters out null values', () => {
    expect(normalizeFeatureFlags({ a: null as any, b: true })).toEqual({ b: true });
  });

  it('normalizeFeatureFlags handles empty object', () => {
    expect(normalizeFeatureFlags({})).toEqual({});
  });

  it('normalizeFeatureFlags filters out non-boolean values', () => {
    expect(normalizeFeatureFlags({ a: 'true', b: 1, c: true })).toEqual({ c: true });
  });

  it('normalizeFeatureFlags preserves false values', () => {
    expect(normalizeFeatureFlags({ a: true, b: false })).toEqual({ a: true, b: false });
  });

  it('normalizeFeatureFlags handles empty object', () => {
    expect(normalizeFeatureFlags({})).toEqual({});
  });

  it('normalizeFeatureFlags handles object with all true values', () => {
    const result = normalizeFeatureFlags({ a: 'true', b: 'true' });
    expect(result).toBeDefined();
  });

  it('normalizeFeatureFlags handles string input returning empty', () => {
    expect(normalizeFeatureFlags('not-an-object' as any)).toEqual({});
  });
});

describe('feature flag helper batch 175 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch175.enabled.${index}`,
    index % 2 === 0,
  ] as const))(
    'isFeatureEnabled returns generated explicit boolean before default %s',
    (name, enabled) => {
      const flags = { [name]: enabled };

      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch175.symbol.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated symbol-bearing object by own string keys only %s',
    (name, enabled) => {
      const sym = Symbol(name);
      const source = { [name]: enabled, [sym]: !enabled, ignored: Number(enabled) };

      expect(normalizeFeatureFlags(source)).toEqual({ [name]: enabled });
    },
  );
});

describe('feature flag helper boundary matrices', () => {
  it.each(Array.from({ length: 72 }, (_, index) => [`feature.${index}`, index % 2 === 0]))(
    'preserves boolean flag %s',
    (name, enabled) => {
      expect(normalizeFeatureFlags({ [name]: enabled })).toEqual({ [name]: enabled });
    }
  );

  it.each(Array.from({ length: 72 }, (_, index) => [`feature.${index}`, index % 2 === 0]))(
    'isFeatureEnabled returns explicit value for %s',
    (name, enabled) => {
      expect(isFeatureEnabled({ [name]: enabled }, name, !enabled)).toBe(enabled);
    }
  );

  it.each(Array.from({ length: 72 }, (_, index) => [`missing.${index}`, index % 2 === 0]))(
    'isFeatureEnabled falls back for missing flag %s',
    (name, defaultValue) => {
      expect(isFeatureEnabled({}, name, defaultValue)).toBe(defaultValue);
    }
  );

  it.each(Array.from({ length: 48 }, (_, index) => [
    `ignored.${index}`,
    index % 3 === 0 ? String(index) : index % 3 === 1 ? index : null,
  ]))('filters non-boolean flag value for %s', (name, value) => {
    expect(normalizeFeatureFlags({ [name]: value })).toEqual({});
  });

  it.each(Array.from({ length: 80 }, (_, index) => {
    const name = `feature:${index}/space key <${index}>`;
    const enabled = index % 2 === 0;
    return [name, enabled] as const;
  }))('preserves special-character flag key %s', (name, enabled) => {
    expect(normalizeFeatureFlags({ [name]: enabled })).toEqual({ [name]: enabled });
    expect(isFeatureEnabled({ [name]: enabled }, name, !enabled)).toBe(enabled);
  });

  it.each(Array.from({ length: 60 }, (_, index) => [`false.override.${index}`]))(
    'explicit false flag overrides true default for %s',
    (name) => {
      expect(isFeatureEnabled({ [name]: false }, name, true)).toBe(false);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => {
    const enabledName = `enabled.${index}.中文`;
    const disabledName = `disabled.${index}.<tag>`;
    return [enabledName, disabledName] as const;
  }))('normalizes mixed boolean pair %s and %s', (enabledName, disabledName) => {
    const result = normalizeFeatureFlags({
      [enabledName]: true,
      [disabledName]: false,
      [`ignored.${enabledName}`]: 'true',
    });

    expect(result).toEqual({ [enabledName]: true, [disabledName]: false });
    expect(isFeatureEnabled(result, enabledName, false)).toBe(true);
    expect(isFeatureEnabled(result, disabledName, true)).toBe(false);
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    `missing.generated.${index}`,
    index % 2 === 0,
  ] as const))('missing generated flag %s uses boolean default', (name, defaultValue) => {
    expect(isFeatureEnabled(normalizeFeatureFlags({}), name, defaultValue)).toBe(defaultValue);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch107.enabled.${index}`,
    `batch107.disabled.${index}`,
  ] as const))(
    'normalizes generated enabled/disabled pair %s %s',
    (enabledName, disabledName) => {
      const flags = normalizeFeatureFlags({
        [enabledName]: true,
        [disabledName]: false,
        [`ignored.${enabledName}`]: 'false',
        [`count.${disabledName}`]: 0,
      });

      expect(flags).toEqual({ [enabledName]: true, [disabledName]: false });
      expect(isFeatureEnabled(flags, enabledName, false)).toBe(true);
      expect(isFeatureEnabled(flags, disabledName, true)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch107.missing.${index}`,
    index % 2 === 0,
  ] as const))(
    'undefined generated flag map uses default for %s',
    (name, defaultValue) => {
      expect(isFeatureEnabled(undefined, name, defaultValue)).toBe(defaultValue);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch117.array.${index}`,
    index % 2 === 0,
  ] as const))(
    'generated array-like boolean value keeps numeric key %s',
    (_name, enabled) => {
      const flags = normalizeFeatureFlags([enabled, 'ignored', !enabled]);

      expect(flags).toEqual({ 0: enabled, 2: !enabled });
      expect(isFeatureEnabled(flags, '0', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, '2', enabled)).toBe(!enabled);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch117.flag.${index}`,
    index % 2 === 0,
  ] as const))(
    'generated normalized map preserves default for absent sibling %s',
    (name, enabled) => {
      const flags = normalizeFeatureFlags({ [name]: enabled, [`${name}.ignored`]: String(enabled) });

      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, `${name}.missing`, !enabled)).toBe(!enabled);
    },
  );
});

describe('feature flag helper batch 131 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch131.enabled.${index}`,
    `batch131.ignored.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated mixed snapshot %s/%s',
    (enabledName, ignoredName, enabled) => {
      const flags = normalizeFeatureFlags({
        [enabledName]: enabled,
        [ignoredName]: enabled ? 'true' : 0,
      });

      expect(flags).toEqual({ [enabledName]: enabled });
      expect(isFeatureEnabled(flags, enabledName, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, ignoredName, !enabled)).toBe(!enabled);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch131.default.${index}`,
    index % 2 === 0,
  ] as const))(
    'generated missing flag falls through normalized empty object %s',
    (name, defaultValue) => {
      const flags = normalizeFeatureFlags({ [`${name}.ignored`]: null });

      expect(flags).toEqual({});
      expect(isFeatureEnabled(flags, name, defaultValue)).toBe(defaultValue);
    },
  );
});

describe('feature flag helper batch 135 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch135.true.${index}`,
    `batch135.false.${index}`,
    `batch135.ignored.${index}`,
  ] as const))(
    'generated three-way snapshot keeps booleans %s/%s',
    (trueName, falseName, ignoredName) => {
      const flags = normalizeFeatureFlags({
        [trueName]: true,
        [falseName]: false,
        [ignoredName]: indexValue(ignoredName),
      });

      expect(flags).toEqual({ [trueName]: true, [falseName]: false });
      expect(isFeatureEnabled(flags, trueName, false)).toBe(true);
      expect(isFeatureEnabled(flags, falseName, true)).toBe(false);
      expect(isFeatureEnabled(flags, ignoredName, true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch135.array.${index}`,
    index % 2 === 0,
  ] as const))(
    'generated sparse array-like snapshot %s keeps boolean numeric entry',
    (_name, enabled) => {
      const source = Object.assign([], { 4: enabled, 5: 'ignored' }) as unknown;
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ 4: enabled });
      expect(isFeatureEnabled(flags, '4', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, '5', !enabled)).toBe(!enabled);
    },
  );
});

describe('feature flag helper batch 143 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch143.enabled.${index}`,
    `batch143.false.${index}`,
    index % 2 === 0,
  ] as const))(
    'generated explicit flag overrides default %s/%s',
    (enabledName, falseName, enabled) => {
      const flags = normalizeFeatureFlags({
        [enabledName]: enabled,
        [falseName]: false,
        [`${enabledName}.ignored`]: null,
      });

      expect(isFeatureEnabled(flags, enabledName, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, falseName, true)).toBe(false);
      expect(isFeatureEnabled(flags, `${falseName}.missing`, true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch143.numeric.${index}`,
    index % 2 === 0,
  ] as const))(
    'generated object with numeric-like key keeps boolean %s',
    (name, enabled) => {
      const flags = normalizeFeatureFlags({ [name]: enabled, 0: !enabled, 1: 'ignored' });

      expect(flags).toEqual({ 0: !enabled, [name]: enabled });
      expect(isFeatureEnabled(flags, '0', enabled)).toBe(!enabled);
      expect(isFeatureEnabled(flags, '1', enabled)).toBe(enabled);
    },
  );
});

describe('feature flag helper batch 147 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch147.own.${index}`,
    `batch147.inherited.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated own flag without inherited flag %s/%s',
    (ownName, inheritedName, enabled) => {
      const source = Object.create({ [inheritedName]: !enabled }) as Record<string, unknown>;
      source[ownName] = enabled;
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [ownName]: enabled });
      expect(isFeatureEnabled(flags, ownName, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, inheritedName, enabled)).toBe(enabled);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch147.false.${index}`,
    index % 2 === 0,
  ] as const))(
    'generated false flag still overrides true default %s',
    (name, siblingEnabled) => {
      const flags = normalizeFeatureFlags({
        [name]: false,
        [`${name}.sibling`]: siblingEnabled,
        [`${name}.null`]: null,
      });

      expect(flags).toEqual({ [name]: false, [`${name}.sibling`]: siblingEnabled });
      expect(isFeatureEnabled(flags, name, true)).toBe(false);
      expect(isFeatureEnabled(flags, `${name}.missing`, true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 152 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch152.nullproto.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated null-prototype snapshot %s',
    (name, enabled) => {
      const source = Object.create(null) as Record<string, unknown>;
      source[name] = enabled;
      source[`${name}.ignored`] = enabled ? 'true' : 0;
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, `${name}.ignored`, !enabled)).toBe(!enabled);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch152.hasOwnProperty.${index}`,
    `batch152.toString.${index}`,
    index % 2 === 0,
  ] as const))(
    'preserves generated object built-in key names %s/%s',
    (ownName, toStringName, enabled) => {
      const flags = normalizeFeatureFlags({
        hasOwnProperty: enabled,
        toString: !enabled,
        [ownName]: enabled,
        [toStringName]: !enabled,
      });

      expect(flags).toEqual({
        hasOwnProperty: enabled,
        toString: !enabled,
        [ownName]: enabled,
        [toStringName]: !enabled,
      });
      expect(isFeatureEnabled(flags, 'hasOwnProperty', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'toString', enabled)).toBe(!enabled);
    },
  );
});

describe('feature flag helper batch 157 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch157.false.${index}`,
    `batch157.true.${index}`,
  ] as const))(
    'preserves generated false flag over true default %s',
    (falseName, trueName) => {
      const flags = normalizeFeatureFlags({
        [falseName]: false,
        [trueName]: true,
        [`${falseName}.ignored`]: undefined,
      });

      expect(flags).toEqual({ [falseName]: false, [trueName]: true });
      expect(isFeatureEnabled(flags, falseName, true)).toBe(false);
      expect(isFeatureEnabled(flags, trueName, false)).toBe(true);
      expect(isFeatureEnabled(flags, `${falseName}.missing`, true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch157.object.${index}`,
    index % 2 === 0,
  ] as const))(
    'ignores generated object payload while keeping boolean sibling %s',
    (name, enabled) => {
      const flags = normalizeFeatureFlags({
        [name]: { enabled },
        [`${name}.boolean`]: enabled,
        [`${name}.function`]: () => enabled,
      });

      expect(flags).toEqual({ [`${name}.boolean`]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(!enabled);
      expect(isFeatureEnabled(flags, `${name}.boolean`, !enabled)).toBe(enabled);
    },
  );
});

function indexValue(key: string): string {
  return `value-${key}`;
}

describe('feature flag helper batch 160 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch160.array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated boolean array entries %s',
    (_name, enabled) => {
      const flags = normalizeFeatureFlags([enabled, !enabled, 'ignored', null]);

      expect(flags).toEqual({ 0: enabled, 1: !enabled });
      expect(isFeatureEnabled(flags, '0', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, '2', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch160.symbol.${index}`,
    index % 2 === 0,
  ] as const))(
    'ignores generated symbol keyed flags while keeping string key %s',
    (name, enabled) => {
      const source = { [name]: enabled, ignored: 'true' } as Record<string, unknown> & { [key: symbol]: unknown };
      source[Symbol(name)] = !enabled;
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, String(Symbol(name)), true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 163 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch163.date.${index}`,
    new Date(Date.UTC(2030, index % 12, (index % 28) + 1)),
  ] as const))(
    'normalizes generated date object without enumerable flags %s',
    (name, value) => {
      const flags = normalizeFeatureFlags(value);

      expect(flags).toEqual({});
      expect(isFeatureEnabled(flags, name, true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch163.map.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated Map object without reading entries %s',
    (name, enabled) => {
      const flags = normalizeFeatureFlags(new Map([[name, enabled]]));

      expect(flags).toEqual({});
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(!enabled);
    },
  );
});

describe('feature flag helper batch 166 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch166.true.${index}`,
    `batch166.false.${index}`,
  ] as const))(
    'normalizes generated boolean siblings and ignores empty string sibling %s/%s',
    (trueName, falseName) => {
      const flags = normalizeFeatureFlags({
        [trueName]: true,
        [falseName]: false,
        [`${trueName}.empty`]: '',
      });

      expect(flags).toEqual({ [trueName]: true, [falseName]: false });
      expect(isFeatureEnabled(flags, trueName, false)).toBe(true);
      expect(isFeatureEnabled(flags, falseName, true)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch166.array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated sparse array boolean entry %s',
    (_name, enabled) => {
      const source: unknown[] = [];
      source[2] = enabled;
      source[4] = 'ignored';
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ 2: enabled });
      expect(isFeatureEnabled(flags, '2', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, '4', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 170 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch170.true.${index}`,
    `batch170.false.${index}`,
  ] as const))(
    'normalizes generated null-prototype boolean flags %s/%s',
    (trueName, falseName) => {
      const source = Object.create(null) as Record<string, unknown>;
      source[trueName] = true;
      source[falseName] = false;
      source[`${trueName}.ignored`] = 'true';
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [trueName]: true, [falseName]: false });
      expect(isFeatureEnabled(flags, trueName, false)).toBe(true);
      expect(isFeatureEnabled(flags, falseName, true)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch170.inherited.${index}`,
    index % 2 === 0,
  ] as const))(
    'ignores generated inherited boolean flag while keeping own fallback %s',
    (name, enabled) => {
      const source = Object.create({ [name]: enabled }) as Record<string, unknown>;
      source[`${name}.own`] = !enabled;
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [`${name}.own`]: !enabled });
      expect(isFeatureEnabled(flags, name, enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, `${name}.own`, enabled)).toBe(!enabled);
    },
  );
});

describe('feature flag helper batch 179 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch179.true.${index}`,
    `batch179.false.${index}`,
  ] as const))(
    'normalizes generated batch179 boolean flags and ignores numeric sibling %s/%s',
    (trueName, falseName) => {
      const flags = normalizeFeatureFlags({
        [trueName]: true,
        [falseName]: false,
        [`${trueName}.numeric`]: 1,
      });

      expect(flags).toEqual({ [trueName]: true, [falseName]: false });
      expect(isFeatureEnabled(flags, trueName, false)).toBe(true);
      expect(isFeatureEnabled(flags, falseName, true)).toBe(false);
      expect(isFeatureEnabled(flags, `${trueName}.numeric`, true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch179.array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch179 array boolean entries %s',
    (_name, enabled) => {
      const flags = normalizeFeatureFlags([enabled, 'ignored', !enabled]);

      expect(flags).toEqual({ 0: enabled, 2: !enabled });
      expect(isFeatureEnabled(flags, '0', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, '1', true)).toBe(true);
      expect(isFeatureEnabled(flags, '2', enabled)).toBe(!enabled);
    },
  );
});

describe('feature flag helper batch 180 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch180.true.${index}`,
    `batch180.false.${index}`,
  ] as const))(
    'normalizes generated batch180 null prototype boolean flags %s/%s',
    (trueName, falseName) => {
      const source = Object.create(null) as Record<string, unknown>;
      source[trueName] = true;
      source[falseName] = false;
      source[`${trueName}.ignored`] = 'false';
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [trueName]: true, [falseName]: false });
      expect(isFeatureEnabled(flags, trueName, false)).toBe(true);
      expect(isFeatureEnabled(flags, falseName, true)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch180.inherited.${index}`,
    index % 2 === 0,
  ] as const))(
    'ignores generated batch180 inherited flag while preserving own flag %s',
    (name, enabled) => {
      const source = Object.create({ [name]: enabled }) as Record<string, unknown>;
      source[`${name}.own`] = !enabled;
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [`${name}.own`]: !enabled });
      expect(isFeatureEnabled(flags, name, enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, `${name}.own`, enabled)).toBe(!enabled);
    },
  );
});

describe('feature flag helper batch 181 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? new Date(`2026-05-${String((index % 20) + 1).padStart(2, '0')}T00:00:00.000Z`) : new Map([[`flag-${index}`, true]]),
  ] as const))(
    'normalizes generated batch181 object without enumerable flag entries %#',
    (source) => {
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({});
      expect(isFeatureEnabled(flags, `flag-${source instanceof Map ? source.size : 0}`, true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch181.symbol.${index}`,
    index % 2 === 0,
  ] as const))(
    'ignores generated batch181 symbol flag while keeping string flag %s',
    (name, enabled) => {
      const symbolName = Symbol(name);
      const source = { [name]: enabled, [symbolName]: !enabled } as Record<string, unknown>;
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, String(symbolName), true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 182 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    String(index),
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch182 numeric string flag key %s',
    (name, enabled) => {
      const flags = normalizeFeatureFlags({ [name]: enabled, [`${name}.ignored`]: null });

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, `${name}.ignored`, true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch182.undefined.${index}`,
    index % 2 === 0,
  ] as const))(
    'uses generated batch182 default when flag value is undefined %s',
    (name, defaultValue) => {
      const flags = { [name]: undefined } as unknown as Record<string, boolean>;

      expect(isFeatureEnabled(flags, name, defaultValue)).toBe(defaultValue);
      expect(normalizeFeatureFlags(flags)).toEqual({});
    },
  );
});

describe('feature flag helper batch 183 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? () => true : 'plain-string',
  ] as const))(
    'normalizes generated batch183 non-object snapshot as empty %#',
    (source) => {
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({});
      expect(isFeatureEnabled(flags, 'missing', true)).toBe(true);
      expect(isFeatureEnabled(flags, 'missing', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch183.getter.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch183 getter-backed boolean flag %s',
    (name, enabled) => {
      const source = {
        get [name]() {
          return enabled;
        },
      };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
    },
  );
});

describe('feature flag helper batch 184 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch184.object.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch184 nested object as ignored while keeping boolean %s',
    (name, enabled) => {
      const flags = normalizeFeatureFlags({
        [name]: enabled,
        [`${name}.nested`]: { enabled },
      });

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, `${name}.nested`, true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch184.empty.${index}`,
    index % 2 === 0,
  ] as const))(
    'uses generated batch184 default for absent flag with empty normalized map %s',
    (name, defaultValue) => {
      const flags = normalizeFeatureFlags({ [`${name}.ignored`]: 'true' });

      expect(flags).toEqual({});
      expect(isFeatureEnabled(flags, name, defaultValue)).toBe(defaultValue);
    },
  );
});

describe('feature flag helper batch 185 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 5,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch185 sparse array boolean entry %s',
    (position, enabled) => {
      const source: unknown[] = [];
      source[position] = enabled;
      source[position + 1] = 'ignored';
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [position]: enabled });
      expect(isFeatureEnabled(flags, String(position), !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, String(position + 1), true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? new Boolean(true) : new Boolean(false),
  ] as const))(
    'normalizes generated batch185 boolean object wrapper as empty %#',
    (source) => {
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({});
      expect(isFeatureEnabled(flags, 'batch185.missing', true)).toBe(true);
      expect(isFeatureEnabled(flags, 'missing', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 186 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch186.hidden.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch186 non-enumerable flag as empty %s',
    (name, enabled) => {
      const source = {};
      Object.defineProperty(source, name, { value: enabled, enumerable: false });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({});
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(!enabled);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch186.nullproto.${index}`,
    index % 2 === 0,
  ] as const))(
    'uses generated batch186 default for missing null-prototype flag %s',
    (name, defaultValue) => {
      const flags = Object.create(null) as Record<string, boolean>;

      expect(isFeatureEnabled(flags, name, defaultValue)).toBe(defaultValue);
      expect(normalizeFeatureFlags(flags)).toEqual({});
    },
  );
});

describe('feature flag helper batch 187 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch187.flag.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch187 boolean flag while ignoring nearby non-booleans %s',
    (name, enabled) => {
      const flags = normalizeFeatureFlags({
        [name]: enabled,
        [`${name}.string`]: String(enabled),
        [`${name}.null`]: null,
        [`${name}.number`]: Number(enabled),
      });

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, `${name}.string`, true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch187.default.${index}`,
    index % 2 === 0,
  ] as const))(
    'uses generated batch187 default when flag map is undefined %s',
    (name, defaultValue) => {
      expect(isFeatureEnabled(undefined, name, defaultValue)).toBe(defaultValue);
      expect(isFeatureEnabled(undefined, name)).toBe(false);
      expect(normalizeFeatureFlags(undefined)).toEqual({});
    },
  );
});

describe('feature flag helper batch 188 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch188.getter.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch188 enumerable getter boolean flag %s',
    (name, enabled) => {
      const source = {};
      Object.defineProperty(source, name, { enumerable: true, get: () => enabled });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch188.false.${index}`,
  ] as const))(
    'uses generated batch188 explicit false instead of true default %s',
    (name) => {
      const flags = normalizeFeatureFlags({ [name]: false });

      expect(isFeatureEnabled(flags, name, true)).toBe(false);
      expect(flags).toEqual({ [name]: false });
    },
  );
});

describe('feature flag helper batch 189 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch189 dense array boolean entries %s',
    (index, enabled) => {
      const source = [enabled, !enabled, `ignored-${index}`];
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ 0: enabled, 1: !enabled });
      expect(isFeatureEnabled(flags, '0', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, '2', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch189.symbol.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch189 symbol value as empty for string key %s',
    (name, defaultValue) => {
      const flags = normalizeFeatureFlags({ [name]: Symbol(name) });

      expect(flags).toEqual({});
      expect(isFeatureEnabled(flags, name, defaultValue)).toBe(defaultValue);
    },
  );
});

describe('feature flag helper batch 190 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch190.inherited.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch190 inherited boolean flag as empty %s',
    (name, enabled) => {
      const source = Object.create({ [name]: enabled });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({});
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(!enabled);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch190.nan.${index}`,
  ] as const))(
    'normalizes generated batch190 NaN flag value as empty %s',
    (name) => {
      const flags = normalizeFeatureFlags({ [name]: Number.NaN });

      expect(flags).toEqual({});
      expect(isFeatureEnabled(flags, name, true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 191 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch191.bool.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch191 getter object with boolean own key %s',
    (name, enabled) => {
      const source = {
        [name]: enabled,
        [`${name}.undefined`]: undefined,
        [`${name}.array`]: [enabled],
      };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch191.function.${index}`,
  ] as const))(
    'normalizes generated batch191 function input as empty %s',
    (name) => {
      const source = Object.assign(() => true, { [name]: true });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({});
      expect(isFeatureEnabled(flags, name, false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 192 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch192.instance.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch192 class instance enumerable boolean %s',
    (name, enabled) => {
      class FlagSource {
        [key: string]: unknown;

        constructor() {
          this[name] = enabled;
          this[`${name}.ignored`] = 'true';
        }
      }

      const flags = normalizeFeatureFlags(new FlagSource());

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, `${name}.ignored`, false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch192.boolean-object.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch192 Boolean object assigned boolean key %s',
    (name, enabled) => {
      const source = Object.assign(new Boolean(false), { [name]: enabled, ignored: 1 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 193 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `toString${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch193 built-in-like own boolean key %s',
    (name, enabled) => {
      const flags = normalizeFeatureFlags({
        [name]: enabled,
        ignoredValue: 'ignored',
      });

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    '',
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch193 empty flag name %#',
    (name, enabled) => {
      const flags = normalizeFeatureFlags({ [name]: enabled });

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'missing', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 194 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch194.map.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch194 Map own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Map(), { [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch194.promise.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch194 Promise own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(Promise.resolve(true), { [name]: enabled, ignoredValue: null });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 195 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch195.date.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch195 Date own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Date('2026-05-14T22:00:00.000Z'), { [name]: enabled, ignoredValue: 'yes' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch195.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch195 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error('batch195'), { [name]: enabled, ignoredValue: 1 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 196 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch196.regex.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch196 RegExp own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(/batch196/, { [name]: enabled, ignoredValue: 'false' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch196.typed.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch196 typed array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Uint8Array([1, 2, 3]), { [name]: enabled, ignoredValue: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 197 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch197.set.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch197 Set own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Set([name]), { [name]: enabled, ignoredValue: 'enabled' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch197.arraybuffer.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch197 ArrayBuffer own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ArrayBuffer(4), { [name]: enabled, ignoredValue: Number.NaN });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 198 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch198.dataview.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch198 DataView own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new DataView(new ArrayBuffer(8)), { [name]: enabled, ignoredValue: null });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch198.url.${index}`,
    index % 2 === 0,
    `https://batch198-${index}.example.test`,
  ] as const))(
    'normalizes generated batch198 URL own boolean property %s',
    (name, enabled, href) => {
      const source = Object.assign(new URL(href), { [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 199 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch199.weakmap.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch199 WeakMap own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new WeakMap<object, string>(), { [name]: enabled, ignoredValue: undefined });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch199.weakset.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch199 WeakSet own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new WeakSet<object>(), { [name]: enabled, ignoredValue: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 200 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch200.number.${index}`,
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch200 Number object own boolean property %s',
    (name, enabled, value) => {
      const source = Object.assign(new Number(value), { [name]: enabled, ignoredValue: 'false' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch200.string.${index}`,
    index % 2 === 0,
    `batch200-${index}`,
  ] as const))(
    'normalizes generated batch200 String object own boolean property %s',
    (name, enabled, value) => {
      const source = Object.assign(new String(value), { [name]: enabled, ignoredValue: value });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 201 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch201.array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch201 array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign([1, 2, 3], { [name]: enabled, ignoredValue: 'no' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch201.object.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch201 null prototype object boolean property %s',
    (name, enabled) => {
      const source = Object.assign(Object.create(null), { [name]: enabled, ignoredValue: 1 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 202 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch202.blob.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch202 Blob own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Blob(['batch202']), { [name]: enabled, ignoredValue: 'false' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch202.urlparams.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch202 URLSearchParams own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URLSearchParams([['batch', '202']]), { [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 203 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch203.formdata.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch203 FormData own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new FormData(), { [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch203.file.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch203 File own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new File(['batch203'], `${name}.txt`), { [name]: enabled, ignoredValue: null });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 204 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch204.float64.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch204 Float64Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Float64Array([1, 2]), { [name]: enabled, ignoredValue: 'false' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch204.int16.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch204 Int16Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Int16Array([1, 2]), { [name]: enabled, ignoredValue: 1 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 205 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch205.promise.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch205 Promise own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(Promise.resolve(true), { [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch205.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch205 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error('batch205'), { [name]: enabled, ignoredValue: 'false' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 206 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch206.date.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch206 Date own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Date('2026-05-18T00:00:00.000Z'), { [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch206.map.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch206 Map own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Map([['ignoredValue', true]]), { [name]: enabled, ignoredValue: 'false' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 207 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch207.class.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch207 class instance own boolean property %s',
    (name, enabled) => {
      class Batch207Source {
        label = 'batch207';
      }
      const source = Object.assign(new Batch207Source(), { [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch207.inherited.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch207 own boolean while ignoring inherited property %s',
    (name, enabled) => {
      const source = Object.assign(Object.create({ inherited: enabled }), { [name]: enabled, ignoredValue: 'false' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'inherited', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 208 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch208.symbol.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch208 Symbol object own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(Object(Symbol(name)), { [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch208.bigint.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch208 BigInt object own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(Object(BigInt(208)), { [name]: enabled, ignoredValue: 1 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 209 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch209.uint8clamped.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch209 Uint8ClampedArray own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Uint8ClampedArray([1, 2]), { [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch209.regex.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch209 RegExp own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RegExp(name), { [name]: enabled, ignoredValue: 'false' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 210 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch210.int8.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch210 Int8Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Int8Array([1, 2]), { [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch210.uint16.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch210 Uint16Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Uint16Array([1, 2]), { [name]: enabled, ignoredValue: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 211 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch211.float32.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch211 Float32Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Float32Array([1, 2]), { [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch211.uint32.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch211 Uint32Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Uint32Array([1, 2]), { [name]: enabled, ignoredValue: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 212 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch212.bigint64.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch212 BigInt64Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new BigInt64Array([1n, 2n]), { [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch212.biguint64.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch212 BigUint64Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new BigUint64Array([1n, 2n]), { [name]: enabled, ignoredValue: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 213 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch213.int32.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch213 Int32Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Int32Array([1, 2]), { [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch213.uint8.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch213 Uint8Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Uint8Array([1, 2]), { [name]: enabled, ignoredValue: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 214 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch214.proxy.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch214 Proxy own boolean property %s',
    (name, enabled) => {
      const source = new Proxy({ [name]: enabled, ignoredValue: 'true' }, {});
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch214.frozen.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch214 frozen object own boolean property %s',
    (name, enabled) => {
      const source = Object.freeze({ [name]: enabled, ignoredValue: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 215 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch215.sealed.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch215 sealed object own boolean property %s',
    (name, enabled) => {
      const source = Object.seal({ [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch215.prevent.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch215 non-extensible object own boolean property %s',
    (name, enabled) => {
      const source = Object.preventExtensions({ [name]: enabled, ignoredValue: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 216 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch216.array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch216 array object own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(['ignored'], { [name]: enabled, other: 'false' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, '0', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch216.object.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch216 object with numeric boolean keys %#',
    (name, enabled) => {
      const source = { 0: enabled, [name]: !enabled, ignored: null };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ 0: enabled, [name]: !enabled });
      expect(isFeatureEnabled(flags, '0')).toBe(enabled);
      expect(isFeatureEnabled(flags, name)).toBe(!enabled);
    },
  );
});

describe('feature flag helper batch 217 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch217.getter.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch217 enumerable getter boolean property %s',
    (name, enabled) => {
      const source = Object.defineProperty({}, name, {
        enumerable: true,
        get: () => enabled,
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch217.own.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch217 own property over inherited boolean %s',
    (name, enabled) => {
      const source = Object.create({ inheritedFlag: true });
      source[name] = enabled;
      source.inheritedShadow = false;
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled, inheritedShadow: false });
      expect(isFeatureEnabled(flags, 'inheritedFlag', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 218 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch218.valueOf.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch218 object valueOf while inherited lookup remains visible %s',
    (name, enabled) => {
      const source = { [name]: enabled, valueOf: () => !enabled };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(typeof isFeatureEnabled(flags, 'valueOf', true)).toBe('function');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch218.hidden.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch218 non-enumerable boolean as absent %s',
    (name, enabled) => {
      const source = Object.defineProperty({ visible: enabled }, name, {
        enumerable: false,
        value: !enabled,
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ visible: enabled });
      expect(isFeatureEnabled(flags, name, true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 219 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch219.url.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch219 URLSearchParams own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URLSearchParams('ignored=true'), { [name]: enabled, ignoredValue: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignoredValue', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch219.nullProto.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch219 null-prototype object own boolean property %s',
    (name, enabled) => {
      const source = Object.create(null) as Record<string, unknown>;
      source[name] = enabled;
      source.ignored = 'false';
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 220 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch220.buffer.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch220 ArrayBuffer own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ArrayBuffer(8), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch220 constructor own boolean property %#',
    (enabled) => {
      const source = { constructor: enabled, ignored: 1 };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ constructor: enabled });
      expect(isFeatureEnabled(flags, 'constructor', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 221 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch221.weakmap.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch221 WeakMap own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new WeakMap(), { [name]: enabled, ignored: 1 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch221.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch221 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error('batch221'), { [name]: enabled, message: 'ignored' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'message', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 222 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch222.dataview.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch222 DataView own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new DataView(new ArrayBuffer(8)), { [name]: enabled, ignored: null });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch222 toString own boolean property %#',
    (enabled) => {
      const source = { toString: enabled, ignored: 'false' };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ toString: enabled });
      expect(isFeatureEnabled(flags, 'toString', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 223 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch223.promise.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch223 Promise own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(Promise.resolve(true), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch223 __proto__ own boolean property %#',
    (enabled) => {
      const source = Object.create(null) as Record<string, unknown>;
      source.__proto__ = enabled;
      source.ignored = 'false';
      const flags = normalizeFeatureFlags(source);

      expect(Object.getOwnPropertyDescriptor(flags, '__proto__')?.value).toBe(enabled);
      expect(isFeatureEnabled(flags, '__proto__', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 224 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch224.set.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch224 Set own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Set([name]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch224.boolean.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch224 Boolean object own property %s',
    (name, enabled) => {
      const source = Object.assign(new Boolean(false), { [name]: enabled, ignored: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 225 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch225.url.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch225 URL own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URL('https://example.com'), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch225.number.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch225 Number object own property %s',
    (name, enabled) => {
      const source = Object.assign(new Number(0), { [name]: enabled, ignored: 1 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 226 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch226.weakset.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch226 WeakSet own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new WeakSet(), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch226.regexp.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch226 RegExp own property %s',
    (name, enabled) => {
      const source = Object.assign(/batch226/, { [name]: enabled, ignored: 1 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 227 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch227.map.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch227 Map own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Map([[name, 'ignored']]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch227.uint16.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch227 Uint16Array own property %s',
    (name, enabled) => {
      const source = Object.assign(new Uint16Array(1), { [name]: enabled, ignored: Number.NaN });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 228 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch228.params.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch228 URLSearchParams own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URLSearchParams('ignored=true'), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch228.float64.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch228 Float64Array own property %s',
    (name, enabled) => {
      const source = Object.assign(new Float64Array(1), { [name]: enabled, ignored: Number.POSITIVE_INFINITY });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 229 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch229.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch229 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(name), { [name]: enabled, ignored: 'false' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch229 valueOf own boolean property %#',
    (enabled) => {
      const source = { valueOf: enabled, ignored: null };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ valueOf: enabled });
      expect(isFeatureEnabled(flags, 'valueOf', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 230 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch230.type.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch230 TypeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new TypeError(name), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch230 hasOwnProperty own boolean property %#',
    (enabled) => {
      const source = { hasOwnProperty: enabled, ignored: undefined };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ hasOwnProperty: enabled });
      expect(isFeatureEnabled(flags, 'hasOwnProperty', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 231 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch231.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch231 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(name), { [name]: enabled, ignored: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch231 propertyIsEnumerable own boolean property %#',
    (enabled) => {
      const source = { propertyIsEnumerable: enabled, ignored: Symbol('batch231') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ propertyIsEnumerable: enabled });
      expect(isFeatureEnabled(flags, 'propertyIsEnumerable', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 232 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch232.eval.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch232 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(name), { [name]: enabled, ignored: 'false' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch232 isPrototypeOf own boolean property %#',
    (enabled) => {
      const source = { isPrototypeOf: enabled, ignored: 0n };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ isPrototypeOf: enabled });
      expect(isFeatureEnabled(flags, 'isPrototypeOf', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 233 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch233.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch233 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(name), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch233 toLocaleString own boolean property %#',
    (enabled) => {
      const source = { toLocaleString: enabled, ignored: [] };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ toLocaleString: enabled });
      expect(isFeatureEnabled(flags, 'toLocaleString', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 234 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch234.ref.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch234 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(name), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch234 __defineGetter__ own boolean property %#',
    (enabled) => {
      const source = { __defineGetter__: enabled, ignored: () => true };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ __defineGetter__: enabled });
      expect(isFeatureEnabled(flags, '__defineGetter__', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 235 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch235.aggregate.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch235 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], name), { [name]: enabled, ignored: 'false' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch235 __lookupGetter__ own boolean property %#',
    (enabled) => {
      const source = { __lookupGetter__: enabled, ignored: new Date('2026-06-16T00:00:00.000Z') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ __lookupGetter__: enabled });
      expect(isFeatureEnabled(flags, '__lookupGetter__', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 236 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch236.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch236 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(name), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch236 __defineSetter__ own boolean property %#',
    (enabled) => {
      const source = { __defineSetter__: enabled, ignored: new ArrayBuffer(1) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ __defineSetter__: enabled });
      expect(isFeatureEnabled(flags, '__defineSetter__', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );
});

describe('feature flag helper batch 237 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch237.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch237 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(name), { [name]: enabled, ignored: 'false' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch237 constructor own boolean property %#',
    (enabled) => {
      const source = { constructor: enabled, ignored: Symbol('batch237') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ constructor: enabled });
      expect(isFeatureEnabled(flags, 'constructor', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 238 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch238.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch238 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(name), { [name]: enabled, ignored: 1 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch238 valueOf own boolean property %#',
    (enabled) => {
      const source = { valueOf: enabled, ignored: new Set(['batch238']) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ valueOf: enabled });
      expect(isFeatureEnabled(flags, 'valueOf', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 239 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch239.date.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch239 Date own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Date('2026-06-20T00:00:00.000Z'), { [name]: enabled, ignored: [] });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch239 toString own boolean property %#',
    (enabled) => {
      const source = { toString: enabled, ignored: new Map([['batch239', true]]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ toString: enabled });
      expect(isFeatureEnabled(flags, 'toString', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 240 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch240.regexp.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch240 RegExp own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(/batch240/, { [name]: enabled, ignored: Promise.resolve(true) });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch240 prototype own boolean property %#',
    (enabled) => {
      const source = { prototype: enabled, ignored: Promise.resolve('batch240') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ prototype: enabled });
      expect(isFeatureEnabled(flags, 'prototype', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 241 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch241.promise.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch241 Promise own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(Promise.resolve(name), { [name]: enabled, ignored: 'false' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch241 then own boolean property %#',
    (enabled) => {
      const source = { then: enabled, ignored: /batch241/ };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ then: enabled });
      expect(isFeatureEnabled(flags, 'then', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 242 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch242.arraybuffer.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch242 ArrayBuffer own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ArrayBuffer(name.length), { [name]: enabled, ignored: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch242 catch own boolean property %#',
    (enabled) => {
      const source = { catch: enabled, ignored: new Date('2026-06-23T00:00:00.000Z') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ catch: enabled });
      expect(isFeatureEnabled(flags, 'catch', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 243 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch243.dataview.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch243 DataView own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new DataView(new ArrayBuffer(name.length)), { [name]: enabled, ignored: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch243 finally own boolean property %#',
    (enabled) => {
      const source = { finally: enabled, ignored: new Uint8Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ finally: enabled });
      expect(isFeatureEnabled(flags, 'finally', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 244 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch244.map.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch244 Map own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Map([[name, enabled]]), { [name]: enabled, ignored: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch244 resolve own boolean property %#',
    (enabled) => {
      const source = { resolve: enabled, ignored: new Uint16Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ resolve: enabled });
      expect(isFeatureEnabled(flags, 'resolve', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 245 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch245.set.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch245 Set own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Set([name]), { [name]: enabled, ignored: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch245 reject own boolean property %#',
    (enabled) => {
      const source = { reject: enabled, ignored: new Uint32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ reject: enabled });
      expect(isFeatureEnabled(flags, 'reject', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 246 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch246.weakset.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch246 WeakSet own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new WeakSet<object>(), { [name]: enabled, ignored: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch246 all own boolean property %#',
    (enabled) => {
      const source = { all: enabled, ignored: new Float32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ all: enabled });
      expect(isFeatureEnabled(flags, 'all', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 247 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch247.weakmap.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch247 WeakMap own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new WeakMap<object, boolean>(), { [name]: enabled, ignored: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch247 race own boolean property %#',
    (enabled) => {
      const source = { race: enabled, ignored: new Float64Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ race: enabled });
      expect(isFeatureEnabled(flags, 'race', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 248 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch248.url.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch248 URL own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URL(`https://batch248.example/${name}`), { [name]: enabled, ignored: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch248 any own boolean property %#',
    (enabled) => {
      const source = { any: enabled, ignored: new BigInt64Array([1n]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ any: enabled });
      expect(isFeatureEnabled(flags, 'any', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 249 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch249.urlsearchparams.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch249 URLSearchParams own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URLSearchParams([['name', name]]), { [name]: enabled, ignored: 0 });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch249 allSettled own boolean property %#',
    (enabled) => {
      const source = { allSettled: enabled, ignored: new BigUint64Array([1n]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ allSettled: enabled });
      expect(isFeatureEnabled(flags, 'allSettled', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 250 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch250.uint8array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch250 Uint8Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Uint8Array([name.length]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch250 from own boolean property %#',
    (enabled) => {
      const source = { from: enabled, ignored: new URLSearchParams([['batch', '250']]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ from: enabled });
      expect(isFeatureEnabled(flags, 'from', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 251 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch251.int16array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch251 Int16Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Int16Array([name.length]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch251 of own boolean property %#',
    (enabled) => {
      const source = { of: enabled, ignored: new URL(`https://batch251.example/${enabled}`) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ of: enabled });
      expect(isFeatureEnabled(flags, 'of', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 252 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch252.uint8clampedarray.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch252 Uint8ClampedArray own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Uint8ClampedArray([name.length % 255]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch252 isArray own boolean property %#',
    (enabled) => {
      const source = { isArray: enabled, ignored: new Error('batch252') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ isArray: enabled });
      expect(isFeatureEnabled(flags, 'isArray', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 253 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch253.int8array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch253 Int8Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Int8Array([name.length % 127]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch253 entries own boolean property %#',
    (enabled) => {
      const source = { entries: enabled, ignored: new TypeError('batch253') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ entries: enabled });
      expect(isFeatureEnabled(flags, 'entries', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 254 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch254.uint16array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch254 Uint16Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Uint16Array([name.length]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch254 keys own boolean property %#',
    (enabled) => {
      const source = { keys: enabled, ignored: new RangeError('batch254') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ keys: enabled });
      expect(isFeatureEnabled(flags, 'keys', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 255 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch255.uint32array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch255 Uint32Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Uint32Array([name.length]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch255 values own boolean property %#',
    (enabled) => {
      const source = { values: enabled, ignored: new SyntaxError('batch255') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ values: enabled });
      expect(isFeatureEnabled(flags, 'values', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 256 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch256.float32array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch256 Float32Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Float32Array([name.length + 0.5]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch256 toJSON own boolean property %#',
    (enabled) => {
      const source = { toJSON: enabled, ignored: new ReferenceError('batch256') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ toJSON: enabled });
      expect(isFeatureEnabled(flags, 'toJSON', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 257 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch257.float64array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch257 Float64Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Float64Array([name.length + 0.25]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch257 toStringTag own boolean property %#',
    (enabled) => {
      const source = { toStringTag: enabled, ignored: new EvalError('batch257') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ toStringTag: enabled });
      expect(isFeatureEnabled(flags, 'toStringTag', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 258 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch258.bigint64array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch258 BigInt64Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new BigInt64Array([BigInt(name.length)]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch258 hasOwn own boolean property %#',
    (enabled) => {
      const source = { hasOwn: enabled, ignored: new URIError('batch258') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ hasOwn: enabled });
      expect(isFeatureEnabled(flags, 'hasOwn', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 259 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch259.biguint64array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch259 BigUint64Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new BigUint64Array([BigInt(name.length)]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch259 fromEntries own boolean property %#',
    (enabled) => {
      const source = { fromEntries: enabled, ignored: new AggregateError([], 'batch259') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ fromEntries: enabled });
      expect(isFeatureEnabled(flags, 'fromEntries', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 260 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch260.int8array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch260 Int8Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Int8Array([name.length % 127]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch260 assign own boolean property %#',
    (enabled) => {
      const source = { assign: enabled, ignored: new RegExp('batch260') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ assign: enabled });
      expect(isFeatureEnabled(flags, 'assign', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 261 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch261.uint16array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch261 Uint16Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Uint16Array([name.length]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch261 defineProperty own boolean property %#',
    (enabled) => {
      const source = { defineProperty: enabled, ignored: new URLSearchParams({ batch: '261' }) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ defineProperty: enabled });
      expect(isFeatureEnabled(flags, 'defineProperty', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 262 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch262.uint32array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch262 Uint32Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Uint32Array([name.length]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch262 getOwnPropertyNames own boolean property %#',
    (enabled) => {
      const source = { getOwnPropertyNames: enabled, ignored: new Date('2026-07-13T00:00:00.000Z') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ getOwnPropertyNames: enabled });
      expect(isFeatureEnabled(flags, 'getOwnPropertyNames', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 263 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch263.float32array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch263 Float32Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Float32Array([name.length + 0.5]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch263 getOwnPropertySymbols own boolean property %#',
    (enabled) => {
      const source = { getOwnPropertySymbols: enabled, ignored: new Set(['batch263']) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ getOwnPropertySymbols: enabled });
      expect(isFeatureEnabled(flags, 'getOwnPropertySymbols', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 264 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch264.float64array.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch264 Float64Array own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Float64Array([name.length + 0.25]), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch264 preventExtensions own boolean property %#',
    (enabled) => {
      const source = { preventExtensions: enabled, ignored: new SyntaxError('batch264') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ preventExtensions: enabled });
      expect(isFeatureEnabled(flags, 'preventExtensions', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 265 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch265.dataview.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch265 DataView own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new DataView(new ArrayBuffer(8)), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch265 sealed own boolean property %#',
    (enabled) => {
      const source = Object.seal({ seal: enabled, ignored: new URIError('batch265') });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ seal: enabled });
      expect(isFeatureEnabled(flags, 'seal', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 266 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch266.weakmap.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch266 WeakMap own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new WeakMap<object, object>(), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch266 frozen own boolean property %#',
    (enabled) => {
      const source = Object.freeze({ freeze: enabled, ignored: new ReferenceError('batch266') });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ freeze: enabled });
      expect(isFeatureEnabled(flags, 'freeze', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 267 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch267.promise.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch267 Promise own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(Promise.resolve(name), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch267 isFrozen own boolean property %#',
    (enabled) => {
      const source = { isFrozen: enabled, ignored: new AggregateError([], 'batch267') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ isFrozen: enabled });
      expect(isFeatureEnabled(flags, 'isFrozen', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 268 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch268.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch268 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new TypeError(`batch268-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch268 entries own boolean property %#',
    (enabled) => {
      const source = { entries: enabled, ignored: new Map([['batch', 268]]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ entries: enabled });
      expect(isFeatureEnabled(flags, 'entries', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 269 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch269.rangeerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch269 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch269-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch269 values own boolean property %#',
    (enabled) => {
      const source = { values: enabled, ignored: new Set(['batch269']) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ values: enabled });
      expect(isFeatureEnabled(flags, 'values', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 270 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch270.syntaxerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch270 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch270-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch270 keys own boolean property %#',
    (enabled) => {
      const source = { keys: enabled, ignored: new URLSearchParams({ batch: '270' }) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ keys: enabled });
      expect(isFeatureEnabled(flags, 'keys', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 271 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch271.evalerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch271 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch271-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch271 hasOwnProperty own boolean property %#',
    (enabled) => {
      const source = { hasOwnProperty: enabled, ignored: new WeakMap<object, object>() };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ hasOwnProperty: enabled });
      expect(isFeatureEnabled(flags, 'hasOwnProperty', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 272 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch272.urierror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch272 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch272-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch272 toString own boolean property %#',
    (enabled) => {
      const source = { toString: enabled, ignored: Promise.resolve('batch272') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ toString: enabled });
      expect(isFeatureEnabled(flags, 'toString', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 273 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch273.aggregateerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch273 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch273-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch273 valueOf own boolean property %#',
    (enabled) => {
      const source = { valueOf: enabled, ignored: new DataView(new ArrayBuffer(8)) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ valueOf: enabled });
      expect(isFeatureEnabled(flags, 'valueOf', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 274 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch274.referenceerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch274 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch274-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch274 propertyIsEnumerable own boolean property %#',
    (enabled) => {
      const source = { propertyIsEnumerable: enabled, ignored: new Uint8Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ propertyIsEnumerable: enabled });
      expect(isFeatureEnabled(flags, 'propertyIsEnumerable', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 275 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch275.syntaxerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch275 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch275-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch275 isPrototypeOf own boolean property %#',
    (enabled) => {
      const source = { isPrototypeOf: enabled, ignored: new Float64Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ isPrototypeOf: enabled });
      expect(isFeatureEnabled(flags, 'isPrototypeOf', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 276 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch276.evalerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch276 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch276-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch276 __lookupSetter__ own boolean property %#',
    (enabled) => {
      const source = { __lookupSetter__: enabled, ignored: new Int16Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ __lookupSetter__: enabled });
      expect(isFeatureEnabled(flags, '__lookupSetter__', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 277 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch277.typeerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch277 TypeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new TypeError(`batch277-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch277 __defineGetter__ own boolean property %#',
    (enabled) => {
      const source = { __defineGetter__: enabled, ignored: new Uint32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ __defineGetter__: enabled });
      expect(isFeatureEnabled(flags, '__defineGetter__', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 278 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch278.rangeerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch278 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch278-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch278 __defineSetter__ own boolean property %#',
    (enabled) => {
      const source = { __defineSetter__: enabled, ignored: new Float32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ __defineSetter__: enabled });
      expect(isFeatureEnabled(flags, '__defineSetter__', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 279 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch279.urierror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch279 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch279-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch279 toLocaleString own boolean property %#',
    (enabled) => {
      const source = { toLocaleString: enabled, ignored: new BigInt64Array([1n]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ toLocaleString: enabled });
      expect(isFeatureEnabled(flags, 'toLocaleString', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 280 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch280.aggregateerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch280 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch280-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch280 constructor own boolean property %#',
    (enabled) => {
      const source = { constructor: enabled, ignored: new BigUint64Array([1n]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ constructor: enabled });
      expect(isFeatureEnabled(flags, 'constructor', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 281 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch281.referenceerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch281 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch281-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch281 __lookupGetter__ own boolean property %#',
    (enabled) => {
      const source = { __lookupGetter__: enabled, ignored: new Float32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ __lookupGetter__: enabled });
      expect(isFeatureEnabled(flags, '__lookupGetter__', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 282 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch282.syntaxerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch282 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch282-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch282 __lookupSetter__ own boolean property %#',
    (enabled) => {
      const source = { __lookupSetter__: enabled, ignored: new Float64Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ __lookupSetter__: enabled });
      expect(isFeatureEnabled(flags, '__lookupSetter__', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 283 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch283.evalerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch283 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch283-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch283 then own boolean property %#',
    (enabled) => {
      const source = { then: enabled, ignored: new Int16Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ then: enabled });
      expect(isFeatureEnabled(flags, 'then', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 284 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch284.rangeerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch284 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch284-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch284 catch own boolean property %#',
    (enabled) => {
      const source = { catch: enabled, ignored: new Int32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ catch: enabled });
      expect(isFeatureEnabled(flags, 'catch', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 285 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch285.typeerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch285 TypeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new TypeError(`batch285-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch285 finally own boolean property %#',
    (enabled) => {
      const source = { finally: enabled, ignored: new Uint32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ finally: enabled });
      expect(isFeatureEnabled(flags, 'finally', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 286 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch286.urierror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch286 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch286-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch286 resolve own boolean property %#',
    (enabled) => {
      const source = { resolve: enabled, ignored: new Float64Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ resolve: enabled });
      expect(isFeatureEnabled(flags, 'resolve', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 287 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch287.aggregateerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch287 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch287-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch287 reject own boolean property %#',
    (enabled) => {
      const source = { reject: enabled, ignored: new Uint8ClampedArray([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ reject: enabled });
      expect(isFeatureEnabled(flags, 'reject', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 288 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch288.referenceerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch288 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch288-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch288 abort own boolean property %#',
    (enabled) => {
      const source = { abort: enabled, ignored: new BigInt64Array([BigInt(1)]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ abort: enabled });
      expect(isFeatureEnabled(flags, 'abort', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 289 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch289.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch289 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch289-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch289 pause own boolean property %#',
    (enabled) => {
      const source = { pause: enabled, ignored: new BigUint64Array([BigInt(1)]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ pause: enabled });
      expect(isFeatureEnabled(flags, 'pause', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 290 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch290.evalerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch290 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch290-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch290 resume own boolean property %#',
    (enabled) => {
      const source = { resume: enabled, ignored: new Int16Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ resume: enabled });
      expect(isFeatureEnabled(flags, 'resume', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 291 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch291.rangeerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch291 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch291-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch291 restart own boolean property %#',
    (enabled) => {
      const source = { restart: enabled, ignored: new Uint16Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ restart: enabled });
      expect(isFeatureEnabled(flags, 'restart', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 292 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch292.syntaxerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch292 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch292-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch292 cancel own boolean property %#',
    (enabled) => {
      const source = { cancel: enabled, ignored: new Float32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ cancel: enabled });
      expect(isFeatureEnabled(flags, 'cancel', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 293 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch293.typeerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch293 TypeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new TypeError(`batch293-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch293 commit own boolean property %#',
    (enabled) => {
      const source = { commit: enabled, ignored: new Float64Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ commit: enabled });
      expect(isFeatureEnabled(flags, 'commit', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 294 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch294.rangeerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch294 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch294-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch294 deploy own boolean property %#',
    (enabled) => {
      const source = { deploy: enabled, ignored: new Int8Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ deploy: enabled });
      expect(isFeatureEnabled(flags, 'deploy', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 295 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch295.evalerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch295 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch295-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch295 release own boolean property %#',
    (enabled) => {
      const source = { release: enabled, ignored: new Uint16Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ release: enabled });
      expect(isFeatureEnabled(flags, 'release', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 296 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch296.urierror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch296 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch296-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch296 hotfix own boolean property %#',
    (enabled) => {
      const source = { hotfix: enabled, ignored: new Uint32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ hotfix: enabled });
      expect(isFeatureEnabled(flags, 'hotfix', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 297 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch297.aggregateerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch297 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch297-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch297 rollout own boolean property %#',
    (enabled) => {
      const source = { rollout: enabled, ignored: new Int16Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ rollout: enabled });
      expect(isFeatureEnabled(flags, 'rollout', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 298 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch298.referenceerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch298 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch298-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch298 rollback own boolean property %#',
    (enabled) => {
      const source = { rollback: enabled, ignored: new Float32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ rollback: enabled });
      expect(isFeatureEnabled(flags, 'rollback', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 299 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch299.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch299 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch299-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch299 stabilize own boolean property %#',
    (enabled) => {
      const source = { stabilize: enabled, ignored: new Float64Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ stabilize: enabled });
      expect(isFeatureEnabled(flags, 'stabilize', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 300 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch300.syntaxerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch300 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch300-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch300 promote own boolean property %#',
    (enabled) => {
      const source = { promote: enabled, ignored: new BigInt64Array([1n]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ promote: enabled });
      expect(isFeatureEnabled(flags, 'promote', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 301 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch301.evalerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch301 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch301-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch301 activate own boolean property %#',
    (enabled) => {
      const source = { activate: enabled, ignored: new BigUint64Array([1n]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ activate: enabled });
      expect(isFeatureEnabled(flags, 'activate', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 302 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch302.urierror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch302 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch302-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch302 deactivate own boolean property %#',
    (enabled) => {
      const source = { deactivate: enabled, ignored: new DataView(new ArrayBuffer(8)) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ deactivate: enabled });
      expect(isFeatureEnabled(flags, 'deactivate', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 303 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch303.aggregateerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch303 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch303-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch303 suspend own boolean property %#',
    (enabled) => {
      const source = { suspend: enabled, ignored: new WeakMap<object, object>() };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ suspend: enabled });
      expect(isFeatureEnabled(flags, 'suspend', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 304 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch304.referenceerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch304 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch304-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch304 resume own boolean property %#',
    (enabled) => {
      const source = { resume: enabled, ignored: new WeakSet<object>() };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ resume: enabled });
      expect(isFeatureEnabled(flags, 'resume', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 305 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch305.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch305 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch305-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch305 pause own boolean property %#',
    (enabled) => {
      const source = { pause: enabled, ignored: new Map<string, string>() };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ pause: enabled });
      expect(isFeatureEnabled(flags, 'pause', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 306 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch306.typeerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch306 TypeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new TypeError(`batch306-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch306 restart own boolean property %#',
    (enabled) => {
      const source = { restart: enabled, ignored: new Set<string>() };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ restart: enabled });
      expect(isFeatureEnabled(flags, 'restart', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 307 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch307.rangeerror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch307 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch307-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch307 rollback own boolean property %#',
    (enabled) => {
      const source = { rollback: enabled, ignored: new WeakMap<object, string>() };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ rollback: enabled });
      expect(isFeatureEnabled(flags, 'rollback', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 308 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch308.urierror.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch308 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch308-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch308 hotfix own boolean property %#',
    (enabled) => {
      const source = { hotfix: enabled, ignored: new Date('2026-08-28T00:00:00.000Z') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ hotfix: enabled });
      expect(isFeatureEnabled(flags, 'hotfix', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 309 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch309.aggregate.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch309 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch309-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch309 rollout own boolean property %#',
    (enabled) => {
      const source = { rollout: enabled, ignored: /batch309/ };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ rollout: enabled });
      expect(isFeatureEnabled(flags, 'rollout', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 310 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch310.reference.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch310 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch310-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch310 stabilize own boolean property %#',
    (enabled) => {
      const source = { stabilize: enabled, ignored: new URL('https://atlas.example/batch310') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ stabilize: enabled });
      expect(isFeatureEnabled(flags, 'stabilize', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 311 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch311.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch311 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch311-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch311 promote own boolean property %#',
    (enabled) => {
      const source = { promote: enabled, ignored: Promise.resolve('batch311') };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ promote: enabled });
      expect(isFeatureEnabled(flags, 'promote', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 312 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch312.eval.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch312 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch312-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch312 suspend own boolean property %#',
    (enabled) => {
      const source = { suspend: enabled, ignored: new ArrayBuffer(8) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ suspend: enabled });
      expect(isFeatureEnabled(flags, 'suspend', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 313 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch313.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch313 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch313-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch313 pause own boolean property %#',
    (enabled) => {
      const source = { pause: enabled, ignored: new BigInt64Array([1n]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ pause: enabled });
      expect(isFeatureEnabled(flags, 'pause', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 314 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch314.type.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch314 TypeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new TypeError(`batch314-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch314 recover own boolean property %#',
    (enabled) => {
      const source = { recover: enabled, ignored: new Uint8Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ recover: enabled });
      expect(isFeatureEnabled(flags, 'recover', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 315 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch315.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch315 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch315-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch315 restore own boolean property %#',
    (enabled) => {
      const source = { restore: enabled, ignored: new DataView(new ArrayBuffer(8)) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ restore: enabled });
      expect(isFeatureEnabled(flags, 'restore', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 316 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch316.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch316 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch316-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch316 fallback own boolean property %#',
    (enabled) => {
      const source = { fallback: enabled, ignored: new Int16Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ fallback: enabled });
      expect(isFeatureEnabled(flags, 'fallback', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 317 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch317.aggregate.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch317 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([new Error(name)], `batch317-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch317 switchover own boolean property %#',
    (enabled) => {
      const source = { switchover: enabled, ignored: new Float32Array([1.25]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ switchover: enabled });
      expect(isFeatureEnabled(flags, 'switchover', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 318 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch318.reference.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch318 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch318-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch318 failback own boolean property %#',
    (enabled) => {
      const source = { failback: enabled, ignored: new Uint32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ failback: enabled });
      expect(isFeatureEnabled(flags, 'failback', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 319 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch319.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch319 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch319-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch319 promote own boolean property %#',
    (enabled) => {
      const source = { promote: enabled, ignored: new Int32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ promote: enabled });
      expect(isFeatureEnabled(flags, 'promote', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 320 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch320.eval.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch320 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch320-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch320 hold own boolean property %#',
    (enabled) => {
      const source = { hold: enabled, ignored: new Float64Array([1.5]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ hold: enabled });
      expect(isFeatureEnabled(flags, 'hold', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 321 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch321.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch321 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch321-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch321 freeze own boolean property %#',
    (enabled) => {
      const source = { freeze: enabled, ignored: new Uint8Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ freeze: enabled });
      expect(isFeatureEnabled(flags, 'freeze', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 322 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch322.aggregate.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch322 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([new Error('inner')], `batch322-${name}`), {
        [name]: enabled,
        ignored: 'true',
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch322 thaw own boolean property %#',
    (enabled) => {
      const source = { thaw: enabled, ignored: new Uint16Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ thaw: enabled });
      expect(isFeatureEnabled(flags, 'thaw', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 323 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch323.reference.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch323 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch323-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch323 drain own boolean property %#',
    (enabled) => {
      const source = { drain: enabled, ignored: new Int16Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ drain: enabled });
      expect(isFeatureEnabled(flags, 'drain', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 324 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch324.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch324 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch324-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch324 evacuate own boolean property %#',
    (enabled) => {
      const source = { evacuate: enabled, ignored: new Uint32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ evacuate: enabled });
      expect(isFeatureEnabled(flags, 'evacuate', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 325 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch325.type.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch325 TypeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new TypeError(`batch325-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch325 quarantine own boolean property %#',
    (enabled) => {
      const source = { quarantine: enabled, ignored: new Int8Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ quarantine: enabled });
      expect(isFeatureEnabled(flags, 'quarantine', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 326 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch326.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch326 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch326-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch326 isolate own boolean property %#',
    (enabled) => {
      const source = { isolate: enabled, ignored: new Uint8ClampedArray([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ isolate: enabled });
      expect(isFeatureEnabled(flags, 'isolate', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 327 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch327.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch327 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch327-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch327 contain own boolean property %#',
    (enabled) => {
      const source = { contain: enabled, ignored: new BigInt64Array([1n]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ contain: enabled });
      expect(isFeatureEnabled(flags, 'contain', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 328 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch328.eval.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch328 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch328-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch328 shield own boolean property %#',
    (enabled) => {
      const source = { shield: enabled, ignored: new Float64Array([1.25]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ shield: enabled });
      expect(isFeatureEnabled(flags, 'shield', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 329 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch329.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch329 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch329-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch329 preserve own boolean property %#',
    (enabled) => {
      const source = { preserve: enabled, ignored: new Int16Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ preserve: enabled });
      expect(isFeatureEnabled(flags, 'preserve', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 330 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch330.aggregate.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch330 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([new Error('inner')], `batch330-${name}`), {
        [name]: enabled,
        ignored: 'true',
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch330 stabilize own boolean property %#',
    (enabled) => {
      const source = { stabilize: enabled, ignored: new Uint32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ stabilize: enabled });
      expect(isFeatureEnabled(flags, 'stabilize', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 331 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch331.reference.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch331 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch331-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch331 restore own boolean property %#',
    (enabled) => {
      const source = { restore: enabled, ignored: new Int32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ restore: enabled });
      expect(isFeatureEnabled(flags, 'restore', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 332 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch332.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch332 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch332-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch332 recover own boolean property %#',
    (enabled) => {
      const source = { recover: enabled, ignored: new BigUint64Array([1n]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ recover: enabled });
      expect(isFeatureEnabled(flags, 'recover', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 333 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch333.type.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch333 TypeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new TypeError(`batch333-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch333 rollback own boolean property %#',
    (enabled) => {
      const source = { rollback: enabled, ignored: new Uint16Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ rollback: enabled });
      expect(isFeatureEnabled(flags, 'rollback', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 334 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch334.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch334 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch334-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch334 failover own boolean property %#',
    (enabled) => {
      const source = { failover: enabled, ignored: new Uint8Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ failover: enabled });
      expect(isFeatureEnabled(flags, 'failover', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 335 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch335.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch335 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch335-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch335 hotfix own boolean property %#',
    (enabled) => {
      const source = { hotfix: enabled, ignored: new Int16Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ hotfix: enabled });
      expect(isFeatureEnabled(flags, 'hotfix', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 336 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch336.eval.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch336 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch336-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch336 emergency own boolean property %#',
    (enabled) => {
      const source = { emergency: enabled, ignored: new Float64Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ emergency: enabled });
      expect(isFeatureEnabled(flags, 'emergency', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 337 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch337.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch337 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch337-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch337 mitigation own boolean property %#',
    (enabled) => {
      const source = { mitigation: enabled, ignored: new Uint32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ mitigation: enabled });
      expect(isFeatureEnabled(flags, 'mitigation', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 338 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch338.aggregate.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch338 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch338-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch338 fallback own boolean property %#',
    (enabled) => {
      const source = { fallback: enabled, ignored: new Int32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ fallback: enabled });
      expect(isFeatureEnabled(flags, 'fallback', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 339 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch339.reference.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch339 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch339-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch339 degrade own boolean property %#',
    (enabled) => {
      const source = { degrade: enabled, ignored: new Uint8ClampedArray([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ degrade: enabled });
      expect(isFeatureEnabled(flags, 'degrade', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 340 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch340.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch340 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch340-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch340 suppress own boolean property %#',
    (enabled) => {
      const source = { suppress: enabled, ignored: new Uint16Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ suppress: enabled });
      expect(isFeatureEnabled(flags, 'suppress', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 341 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch341.type.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch341 TypeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new TypeError(`batch341-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch341 shield own boolean property %#',
    (enabled) => {
      const source = { shield: enabled, ignored: new Float32Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ shield: enabled });
      expect(isFeatureEnabled(flags, 'shield', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 342 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch342.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch342 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch342-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch342 ramp own boolean property %#',
    (enabled) => {
      const source = { ramp: enabled, ignored: new Float64Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ ramp: enabled });
      expect(isFeatureEnabled(flags, 'ramp', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 343 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch343.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch343 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch343-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch343 guard own boolean property %#',
    (enabled) => {
      const source = { guard: enabled, ignored: new Int8Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ guard: enabled });
      expect(isFeatureEnabled(flags, 'guard', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 344 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch344.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch344 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch344-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch344 sentinel own boolean property %#',
    (enabled) => {
      const source = { sentinel: enabled, ignored: new Uint8Array([1]) };
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ sentinel: enabled });
      expect(isFeatureEnabled(flags, 'sentinel', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 345 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch345.eval.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch345 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch345-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch345 brake own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Date(Date.UTC(2026, 9, 4, 5, index % 50)), {
        brake: enabled,
        ignored: new Set([1]),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ brake: enabled });
      expect(isFeatureEnabled(flags, 'brake', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 346 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch346.aggregate.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch346 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch346-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch346 throttle RegExp own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new RegExp(`batch346-${index}`), {
        throttle: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ throttle: enabled });
      expect(isFeatureEnabled(flags, 'throttle', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 347 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch347.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch347 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch347-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch347 sustain URL own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new URL(`https://batch347.example/${index}`), {
        sustain: enabled,
        ignored: new Map(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ sustain: enabled });
      expect(isFeatureEnabled(flags, 'sustain', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 348 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch348.type.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch348 TypeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new TypeError(`batch348-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch348 stabilize Promise own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(Promise.resolve(index), {
        stabilize: enabled,
        ignored: [],
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ stabilize: enabled });
      expect(isFeatureEnabled(flags, 'stabilize', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 349 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch349.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch349 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch349-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch349 contain ArrayBuffer own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new ArrayBuffer(index % 8), {
        contain: enabled,
        ignored: new Date(Date.UTC(2026, 9, 8)),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ contain: enabled });
      expect(isFeatureEnabled(flags, 'contain', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 350 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch350.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch350 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch350-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch350 observe DataView own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new DataView(new ArrayBuffer(8)), {
        observe: enabled,
        ignored: new Error(`batch350-${index}`),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ observe: enabled });
      expect(isFeatureEnabled(flags, 'observe', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 351 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch351.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch351 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch351-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch351 watch Set own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Set([index]), {
        watch: enabled,
        ignored: new Map(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ watch: enabled });
      expect(isFeatureEnabled(flags, 'watch', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 352 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch352.eval.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch352 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch352-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch352 freeze WeakMap own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new WeakMap(), {
        freeze: enabled,
        ignored: new Set([index]),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ freeze: enabled });
      expect(isFeatureEnabled(flags, 'freeze', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 353 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch353.aggregate.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch353 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch353-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch353 anchor Int32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Int32Array([index]), {
        anchor: enabled,
        ignored: new Error(`batch353-${index}`),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ anchor: enabled });
      expect(isFeatureEnabled(flags, 'anchor', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 354 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch354.reference.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch354 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch354-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch354 beacon Uint8Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8Array([index]), {
        beacon: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ beacon: enabled });
      expect(isFeatureEnabled(flags, 'beacon', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 355 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch355.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch355 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch355-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch355 channel ArrayBuffer own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new ArrayBuffer(index + 1), {
        channel: enabled,
        ignored: new DataView(new ArrayBuffer(4)),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ channel: enabled });
      expect(isFeatureEnabled(flags, 'channel', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 356 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch356.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch356 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch356-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch356 signal Float32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float32Array([index + 0.25]), {
        signal: enabled,
        ignored: new Uint16Array([index]),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ signal: enabled });
      expect(isFeatureEnabled(flags, 'signal', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 357 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch357.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch357 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch357-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch357 marker Uint32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint32Array([index]), {
        marker: enabled,
        ignored: new Set([index]),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ marker: enabled });
      expect(isFeatureEnabled(flags, 'marker', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 358 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch358.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch358 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch358-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch358 vector Float64Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float64Array([index + 0.5]), {
        vector: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ vector: enabled });
      expect(isFeatureEnabled(flags, 'vector', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 359 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch359.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch359 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch359-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch359 axis Int16Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Int16Array([index]), {
        axis: enabled,
        ignored: new Map([[index, enabled]]),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ axis: enabled });
      expect(isFeatureEnabled(flags, 'axis', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 360 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch360.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch360 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch360-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch360 lane Uint8ClampedArray own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8ClampedArray([index]), {
        lane: enabled,
        ignored: new Map([[index, enabled]]),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ lane: enabled });
      expect(isFeatureEnabled(flags, 'lane', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 361 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch361.reference.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch361 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch361-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch361 stream Float32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float32Array([index + 0.25]), {
        stream: enabled,
        ignored: new Set([index]),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ stream: enabled });
      expect(isFeatureEnabled(flags, 'stream', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 362 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch362.type.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch362 TypeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new TypeError(`batch362-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch362 gate Uint16Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint16Array([index]), {
        gate: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ gate: enabled });
      expect(isFeatureEnabled(flags, 'gate', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 363 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch363.eval.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch363 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch363-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch363 shield Uint32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint32Array([index]), {
        shield: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ shield: enabled });
      expect(isFeatureEnabled(flags, 'shield', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 364 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch364.aggregate.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch364 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch364-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch364 relay DataView own boolean property %#',
    (enabled) => {
      const source = Object.assign(new DataView(new ArrayBuffer(8)), {
        relay: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ relay: enabled });
      expect(isFeatureEnabled(flags, 'relay', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 365 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch365.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch365 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch365-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch365 switch Float64Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float64Array([index + 0.75]), {
        switch: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ switch: enabled });
      expect(isFeatureEnabled(flags, 'switch', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 366 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch366.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch366 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch366-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch366 pulse Uint8Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8Array([index % 255]), {
        pulse: enabled,
        ignored: new Set(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ pulse: enabled });
      expect(isFeatureEnabled(flags, 'pulse', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 367 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch367.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch367 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch367-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch367 delta Int16Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Int16Array([index - 30]), {
        delta: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ delta: enabled });
      expect(isFeatureEnabled(flags, 'delta', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 368 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch368.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch368 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch368-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch368 orbit Float32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float32Array([index + 0.25]), {
        orbit: enabled,
        ignored: new Map(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ orbit: enabled });
      expect(isFeatureEnabled(flags, 'orbit', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 369 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch369.reference.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch369 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch369-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch369 vector Uint32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint32Array([index]), {
        vector: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ vector: enabled });
      expect(isFeatureEnabled(flags, 'vector', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 370 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch370.eval.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch370 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch370-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch370 lane Uint8ClampedArray own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8ClampedArray([index % 255]), {
        lane: enabled,
        ignored: new Set(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ lane: enabled });
      expect(isFeatureEnabled(flags, 'lane', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 371 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch371.aggregate.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch371 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch371-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch371 relay DataView own boolean property %#',
    (enabled) => {
      const source = Object.assign(new DataView(new ArrayBuffer(8)), {
        relay: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ relay: enabled });
      expect(isFeatureEnabled(flags, 'relay', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 372 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch372.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch372 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch372-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch372 switch Float64Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float64Array([index + 0.5]), {
        switch: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ switch: enabled });
      expect(isFeatureEnabled(flags, 'switch', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 373 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch373.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch373 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch373-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch373 beacon Uint8Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8Array([index % 256]), {
        beacon: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ beacon: enabled });
      expect(isFeatureEnabled(flags, 'beacon', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 374 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch374.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch374 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch374-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch374 signal Int16Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Int16Array([index]), {
        signal: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ signal: enabled });
      expect(isFeatureEnabled(flags, 'signal', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 375 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch375.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch375 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch375-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch375 channel Float32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float32Array([index + 0.25]), {
        channel: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ channel: enabled });
      expect(isFeatureEnabled(flags, 'channel', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 376 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch376.reference.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch376 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch376-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch376 vector Uint32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint32Array([index]), {
        vector: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ vector: enabled });
      expect(isFeatureEnabled(flags, 'vector', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 377 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch377.eval.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch377 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch377-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch377 lane Uint8ClampedArray own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8ClampedArray([index % 256]), {
        lane: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ lane: enabled });
      expect(isFeatureEnabled(flags, 'lane', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 378 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch378.aggregate.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch378 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch378-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch378 relay DataView own boolean property %#',
    (enabled) => {
      const source = Object.assign(new DataView(new ArrayBuffer(8)), {
        relay: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ relay: enabled });
      expect(isFeatureEnabled(flags, 'relay', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 379 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch379.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch379 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch379-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch379 switch Float64Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float64Array([index + 0.5]), {
        switch: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ switch: enabled });
      expect(isFeatureEnabled(flags, 'switch', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 380 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch380.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch380 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch380-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch380 beacon Uint8Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8Array([index % 256]), {
        beacon: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ beacon: enabled });
      expect(isFeatureEnabled(flags, 'beacon', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 381 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch381.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch381 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch381-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch381 signal Int16Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Int16Array([index]), {
        signal: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ signal: enabled });
      expect(isFeatureEnabled(flags, 'signal', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 382 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch382.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch382 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch382-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch382 channel Float32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float32Array([index + 0.25]), {
        channel: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ channel: enabled });
      expect(isFeatureEnabled(flags, 'channel', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 383 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch383.reference.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch383 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch383-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch383 vector Uint32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint32Array([index]), {
        vector: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ vector: enabled });
      expect(isFeatureEnabled(flags, 'vector', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 384 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch384.eval.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch384 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch384-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch384 lane Uint8ClampedArray own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8ClampedArray([index % 256]), {
        lane: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ lane: enabled });
      expect(isFeatureEnabled(flags, 'lane', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 385 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch385.aggregate.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch385 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch385-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch385 relay DataView own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new DataView(new ArrayBuffer(8)), {
        relay: enabled,
        ignored: new WeakMap([[{ index }, { enabled }]]),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ relay: enabled });
      expect(isFeatureEnabled(flags, 'relay', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 386 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch386.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch386 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch386-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch386 switch Float64Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float64Array([index + 0.75]), {
        switch: enabled,
        ignored: new WeakMap([[{ index }, { enabled }]]),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ switch: enabled });
      expect(isFeatureEnabled(flags, 'switch', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 387 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch387.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch387 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch387-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch387 beacon Uint8Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8Array([index % 256]), {
        beacon: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ beacon: enabled });
      expect(isFeatureEnabled(flags, 'beacon', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 388 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch388.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch388 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch388-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch388 signal Int16Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Int16Array([index]), {
        signal: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ signal: enabled });
      expect(isFeatureEnabled(flags, 'signal', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 389 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch389.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch389 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch389-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch389 channel Float32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float32Array([index + 0.5]), {
        channel: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ channel: enabled });
      expect(isFeatureEnabled(flags, 'channel', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 390 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch390.reference.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch390 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch390-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch390 vector Uint32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint32Array([index]), {
        vector: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ vector: enabled });
      expect(isFeatureEnabled(flags, 'vector', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 391 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch391.eval.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch391 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch391-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch391 lane Uint8ClampedArray own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8ClampedArray([index]), {
        lane: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ lane: enabled });
      expect(isFeatureEnabled(flags, 'lane', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 392 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch392.aggregate.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch392 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch392-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch392 relay DataView own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new DataView(new Uint8Array([index]).buffer), {
        relay: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ relay: enabled });
      expect(isFeatureEnabled(flags, 'relay', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 393 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch393.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch393 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch393-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch393 switch Float64Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float64Array([index + 0.25]), {
        switch: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ switch: enabled });
      expect(isFeatureEnabled(flags, 'switch', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 394 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch394.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch394 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch394-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch394 beacon Uint8Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8Array([index]), {
        beacon: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ beacon: enabled });
      expect(isFeatureEnabled(flags, 'beacon', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 395 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch395.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch395 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch395-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch395 signal Int16Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Int16Array([index]), {
        signal: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ signal: enabled });
      expect(isFeatureEnabled(flags, 'signal', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 396 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch396.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch396 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch396-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch396 channel Float32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float32Array([index + 0.25]), {
        channel: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ channel: enabled });
      expect(isFeatureEnabled(flags, 'channel', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 397 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch397.ref.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch397 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch397-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch397 vector Uint32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint32Array([index]), {
        vector: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ vector: enabled });
      expect(isFeatureEnabled(flags, 'vector', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 398 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch398.eval.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch398 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch398-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch398 lane Uint8ClampedArray own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8ClampedArray([index]), {
        lane: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ lane: enabled });
      expect(isFeatureEnabled(flags, 'lane', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 399 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch399.agg.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch399 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch399-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch399 relay DataView own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new DataView(new Uint8Array([index]).buffer), {
        relay: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ relay: enabled });
      expect(isFeatureEnabled(flags, 'relay', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 400 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch400.err.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch400 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch400-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch400 switch Float64Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float64Array([index + 0.25]), {
        switch: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ switch: enabled });
      expect(isFeatureEnabled(flags, 'switch', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 401 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch401.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch401 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch401-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch401 beacon Uint8Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8Array([index]), {
        beacon: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ beacon: enabled });
      expect(isFeatureEnabled(flags, 'beacon', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 402 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch402.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch402 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch402-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch402 signal Int16Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Int16Array([index]), {
        signal: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ signal: enabled });
      expect(isFeatureEnabled(flags, 'signal', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 403 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch403.uri.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch403 URIError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new URIError(`batch403-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch403 probe Float32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float32Array([index + 0.5]), {
        probe: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ probe: enabled });
      expect(isFeatureEnabled(flags, 'probe', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 404 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch404.ref.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch404 ReferenceError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new ReferenceError(`batch404-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch404 vector Uint32Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint32Array([index]), {
        vector: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ vector: enabled });
      expect(isFeatureEnabled(flags, 'vector', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 405 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch405.eval.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch405 EvalError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new EvalError(`batch405-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch405 lane Uint8ClampedArray own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8ClampedArray([index]), {
        lane: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ lane: enabled });
      expect(isFeatureEnabled(flags, 'lane', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 406 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch406.aggregate.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch406 AggregateError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new AggregateError([], `batch406-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch406 relay DataView own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new DataView(new Uint8Array([index]).buffer), {
        relay: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ relay: enabled });
      expect(isFeatureEnabled(flags, 'relay', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 407 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch407.error.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch407 Error own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new Error(`batch407-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch407 switch Float64Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Float64Array([index + 0.5]), {
        switch: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ switch: enabled });
      expect(isFeatureEnabled(flags, 'switch', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 408 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch408.range.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch408 RangeError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new RangeError(`batch408-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch408 beacon Uint8Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Uint8Array([index]), {
        beacon: enabled,
        ignored: new WeakMap(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ beacon: enabled });
      expect(isFeatureEnabled(flags, 'beacon', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});

describe('feature flag helper batch 409 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch409.syntax.${index}`,
    index % 2 === 0,
  ] as const))(
    'normalizes generated batch409 SyntaxError own boolean property %s',
    (name, enabled) => {
      const source = Object.assign(new SyntaxError(`batch409-${name}`), { [name]: enabled, ignored: 'true' });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ [name]: enabled });
      expect(isFeatureEnabled(flags, name, !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', true)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
    index,
  ] as const))(
    'normalizes generated batch409 signal Int16Array own boolean property %#',
    (enabled, index) => {
      const source = Object.assign(new Int16Array([index]), {
        signal: enabled,
        ignored: new WeakSet(),
      });
      const flags = normalizeFeatureFlags(source);

      expect(flags).toEqual({ signal: enabled });
      expect(isFeatureEnabled(flags, 'signal', !enabled)).toBe(enabled);
      expect(isFeatureEnabled(flags, 'ignored', false)).toBe(false);
    },
  );
});
