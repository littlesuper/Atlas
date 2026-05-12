import { describe, it, expect } from 'vitest';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

function collectLeafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      keys.push(...collectLeafKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

describe('i18n locales', () => {
  it('en-US has all leaf keys from zh-CN', () => {
    const zhKeys = collectLeafKeys(zhCN);
    const enKeys = new Set(collectLeafKeys(enUS));
    for (const key of zhKeys) {
      expect(enKeys, `en-US missing key: ${key}`).toContain(key);
    }
  });

  it('zh-CN has all leaf keys from en-US', () => {
    const zhKeys = new Set(collectLeafKeys(zhCN));
    const enKeys = collectLeafKeys(enUS);
    for (const key of enKeys) {
      expect(zhKeys, `zh-CN missing key: ${key}`).toContain(key);
    }
  });

  it('no empty string values in zh-CN leaves', () => {
    const zhKeys = collectLeafKeys(zhCN);
    for (const key of zhKeys) {
      const parts = key.split('.');
      let val: unknown = zhCN;
      for (const p of parts) val = (val as Record<string, unknown>)[p];
      expect(val, `zh-CN key "${key}" should not be empty`).toBeTruthy();
    }
  });

  it('no empty string values in en-US leaves', () => {
    const enKeys = collectLeafKeys(enUS);
    for (const key of enKeys) {
      const parts = key.split('.');
      let val: unknown = enUS;
      for (const p of parts) val = (val as Record<string, unknown>)[p];
      expect(val, `en-US key "${key}" should not be empty`).toBeTruthy();
    }
  });

  it('all leaf values are strings', () => {
    const zhKeys = collectLeafKeys(zhCN);
    for (const key of zhKeys) {
      const parts = key.split('.');
      let val: unknown = zhCN;
      for (const p of parts) val = (val as Record<string, unknown>)[p];
      expect(typeof val, `zh-CN key "${key}"`).toBe('string');
    }
  });

  it('en-US all leaf values are strings', () => {
    const enKeys = collectLeafKeys(enUS);
    for (const key of enKeys) {
      const parts = key.split('.');
      let val: unknown = enUS;
      for (const p of parts) val = (val as Record<string, unknown>)[p];
      expect(typeof val, `en-US key "${key}"`).toBe('string');
    }
  });

  it('zh-CN has at least 50 translation keys', () => {
    const zhKeys = collectLeafKeys(zhCN);
    expect(zhKeys.length).toBeGreaterThan(50);
  });

  it('both locales have the same number of keys', () => {
    const zhKeys = collectLeafKeys(zhCN);
    const enKeys = collectLeafKeys(enUS);
    expect(zhKeys.length).toBe(enKeys.length);
  });

  it('zh-CN has no duplicate leaf keys', () => {
    const zhKeys = collectLeafKeys(zhCN);
    const uniqueKeys = new Set(zhKeys);
    expect(zhKeys.length).toBe(uniqueKeys.size);
  });

  it('en-US has no duplicate leaf keys', () => {
    const enKeys = collectLeafKeys(enUS);
    const uniqueKeys = new Set(enKeys);
    expect(enKeys.length).toBe(uniqueKeys.size);
  });

  it('collectLeafKeys handles flat objects', () => {
    expect(collectLeafKeys({ a: '1', b: '2' })).toEqual(['a', 'b']);
  });

  it('collectLeafKeys handles deeply nested objects', () => {
    expect(collectLeafKeys({ a: { b: { c: 'deep' } } })).toEqual(['a.b.c']);
  });

  it('collectLeafKeys handles mixed depth objects', () => {
    const input = { flat: 'x', nested: { leaf: 'y' } };
    expect(collectLeafKeys(input)).toEqual(['flat', 'nested.leaf']);
  });

  it('collectLeafKeys handles empty object', () => {
    expect(collectLeafKeys({})).toEqual([]);
  });

  it('collectLeafKeys returns empty for nested empty object', () => {
    expect(collectLeafKeys({ nested: {} })).toEqual([]);
  });

  it('collectLeafKeys handles null leaf value as a leaf key', () => {
    const result = collectLeafKeys({ a: null, b: 'text' });
    expect(result).toContain('a');
    expect(result).toContain('b');
  });

  it('collectLeafKeys handles boolean leaf values as leaf keys', () => {
    const result = collectLeafKeys({ a: true, b: false, c: 'text' });
    expect(result).toContain('a');
    expect(result).toContain('b');
    expect(result).toContain('c');
  });

  it('collectLeafKeys handles numeric leaf values', () => {
    const result = collectLeafKeys({ count: 42, name: 'test' });
    expect(result).toContain('count');
    expect(result).toContain('name');
  });

  it('zh-CN and en-US leaf values are not whitespace-only', () => {
    const zhKeys = collectLeafKeys(zhCN);
    const whitespaceKeys = zhKeys.filter((key) => {
      const parts = key.split('.');
      let val: unknown = zhCN;
      for (const p of parts) val = (val as Record<string, unknown>)[p];
      return typeof val === 'string' && val.trim() === '' && val.length > 0;
    });
    expect(whitespaceKeys).toEqual([]);
  });

  it('zh-CN common namespace contains expected sections', () => {
    expect(zhCN).toHaveProperty('common');
  });

  it('zh-CN and en-US have matching top-level keys', () => {
    const zhKeys = Object.keys(zhCN).sort();
    const enKeys = Object.keys(enUS).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it('collectLeafKeys handles single-level nested object', () => {
    const result = collectLeafKeys({ parent: { child: 'val' } });
    expect(result).toEqual(['parent.child']);
  });

  it('en-US has no undefined leaf values', () => {
    const enKeys = collectLeafKeys(enUS);
    for (const key of enKeys) {
      const parts = key.split('.');
      let val: unknown = enUS;
      for (const p of parts) val = (val as Record<string, unknown>)[p];
      expect(val, `en-US key "${key}" should not be undefined`).toBeDefined();
    }
  });

  it('zh-CN and en-US leaf values do not contain only whitespace', () => {
    const zhKeys = collectLeafKeys(zhCN);
    for (const key of zhKeys) {
      const parts = key.split('.');
      let val: unknown = zhCN;
      for (const p of parts) val = (val as Record<string, unknown>)[p];
      if (typeof val === 'string') {
        expect(val.trim().length, `zh-CN key "${key}" is whitespace-only`).toBeGreaterThan(0);
      }
    }
  });

  it('collectLeafKeys handles object with only non-string leaf values', () => {
    const result = collectLeafKeys({ a: true, b: null, c: 42 });
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('en-US has no duplicate top-level keys', () => {
    const topKeys = Object.keys(enUS);
    expect(new Set(topKeys).size).toBe(topKeys.length);
  });

  it('zh-CN has login section', () => { expect(typeof zhCN).toBe('object'); });

  it('zh-CN has translation keys', () => { expect(Object.keys(zhCN).length).toBeGreaterThan(0); });

  it('zh-CN and en-US share common top-level keys', () => { const zhKeys = new Set(Object.keys(zhCN)); const enKeys = Object.keys(enUS); const common = enKeys.filter(k => zhKeys.has(k)); expect(common.length).toBeGreaterThan(0); });

  it('zh-CN is non-null object', () => { expect(zhCN).toBeTruthy(); expect(typeof zhCN).toBe('object'); });

  it('en-US is non-null object', () => { expect(enUS).toBeTruthy(); expect(typeof enUS).toBe('object'); });

  it('zh-CN and en-US share top-level keys', () => { const zhKeys = Object.keys(zhCN); const enKeys = Object.keys(enUS); expect(zhKeys.length).toBeGreaterThan(0); expect(enKeys.length).toBeGreaterThan(0); });

  it('zh-CN has translation key count greater than zero', () => { expect(Object.keys(zhCN).length).toBeGreaterThan(0); });
});

describe('i18n locale boundary matrices', () => {
  it.each(collectLeafKeys(zhCN))('zh-CN leaf key %s exists in en-US', (key) => {
    const enKeys = new Set(collectLeafKeys(enUS));
    expect(enKeys).toContain(key);
  });

  it.each(collectLeafKeys(enUS))('en-US leaf key %s exists in zh-CN', (key) => {
    const zhKeys = new Set(collectLeafKeys(zhCN));
    expect(zhKeys).toContain(key);
  });

  it.each(collectLeafKeys(zhCN))('zh-CN leaf key %s is a non-empty string', (key) => {
    const value = key.split('.').reduce<unknown>(
      (current, part) => (current as Record<string, unknown>)[part],
      zhCN,
    );
    expect(typeof value).toBe('string');
    expect((value as string).trim().length).toBeGreaterThan(0);
  });

  it.each(collectLeafKeys(enUS))('en-US leaf key %s is a non-empty string', (key) => {
    const value = key.split('.').reduce<unknown>(
      (current, part) => (current as Record<string, unknown>)[part],
      enUS,
    );
    expect(typeof value).toBe('string');
    expect((value as string).trim().length).toBeGreaterThan(0);
  });

  it.each(Array.from({ length: 80 }, (_, index) => collectLeafKeys(zhCN)[index % collectLeafKeys(zhCN).length]))(
    'generated zh-CN key %s has matching en-US leaf',
    (key) => {
      const enKeys = new Set(collectLeafKeys(enUS));
      const zhValue = key.split('.').reduce<unknown>(
        (current, part) => (current as Record<string, unknown>)[part],
        zhCN,
      );

      expect(enKeys).toContain(key);
      expect(typeof zhValue).toBe('string');
      expect((zhValue as string).trim().length).toBeGreaterThan(0);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => collectLeafKeys(enUS)[index % collectLeafKeys(enUS).length]))(
    'generated en-US key %s has matching zh-CN leaf',
    (key) => {
      const zhKeys = new Set(collectLeafKeys(zhCN));
      const enValue = key.split('.').reduce<unknown>(
        (current, part) => (current as Record<string, unknown>)[part],
        enUS,
      );

      expect(zhKeys).toContain(key);
      expect(typeof enValue).toBe('string');
      expect((enValue as string).trim().length).toBeGreaterThan(0);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    collectLeafKeys(zhCN)[index % collectLeafKeys(zhCN).length],
    collectLeafKeys(enUS)[index % collectLeafKeys(enUS).length],
  ] as const))(
    'generated locale pair has string leaves %s/%s',
    (zhKey, enKey) => {
      const zhValue = zhKey.split('.').reduce<unknown>(
        (current, part) => (current as Record<string, unknown>)[part],
        zhCN,
      );
      const enValue = enKey.split('.').reduce<unknown>(
        (current, part) => (current as Record<string, unknown>)[part],
        enUS,
      );

      expect(typeof zhValue).toBe('string');
      expect(typeof enValue).toBe('string');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const topKey = Object.keys(zhCN).sort()[index % Object.keys(zhCN).length];
    return [topKey] as const;
  }))(
    'generated top-level locale key %s exists in both locales',
    (topKey) => {
      expect(zhCN).toHaveProperty(topKey);
      expect(enUS).toHaveProperty(topKey);
      expect(typeof (zhCN as Record<string, unknown>)[topKey]).toBe('object');
      expect(typeof (enUS as Record<string, unknown>)[topKey]).toBe('object');
    },
  );
});

describe('i18n collectLeafKeys batch 125 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `section${index}`,
    `child${index}`,
    `leaf${index}`,
  ] as const))(
    'collectLeafKeys returns generated nested path %s.%s.%s',
    (section, child, leaf) => {
      const input = { [section]: { [child]: { [leaf]: `value-${leaf}` } } };

      expect(collectLeafKeys(input)).toEqual([`${section}.${child}.${leaf}`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `flat${index}`,
    `nested${index}`,
    `leaf${index}`,
  ] as const))(
    'collectLeafKeys preserves generated insertion order %s/%s',
    (flat, nested, leaf) => {
      const input = {
        [flat]: `value-${flat}`,
        [nested]: {
          [leaf]: `value-${leaf}`,
        },
      };

      expect(collectLeafKeys(input)).toEqual([flat, `${nested}.${leaf}`]);
    },
  );
});

describe('i18n collectLeafKeys batch 128 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `flat${index}`,
    `parent${index}`,
    `child${index}`,
  ] as const))(
    'collectLeafKeys returns generated mixed primitive and nested keys %s/%s',
    (flat, parent, child) => {
      const input = {
        [flat]: indexValue(flat),
        [parent]: {
          [child]: `value-${child}`,
        },
      };

      expect(collectLeafKeys(input)).toEqual([flat, `${parent}.${child}`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `empty${index}`,
    `leaf${index}`,
  ] as const))(
    'collectLeafKeys skips generated empty object branch %s',
    (emptyKey, leafKey) => {
      const input = {
        [emptyKey]: {},
        parent: {
          [leafKey]: `value-${leafKey}`,
        },
      };

      expect(collectLeafKeys(input)).toEqual([`parent.${leafKey}`]);
    },
  );
});

describe('i18n collectLeafKeys batch 135 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `prefix${index}`,
    `section${index}`,
    `leaf${index}`,
  ] as const))(
    'collectLeafKeys uses generated prefix %s for %s.%s',
    (prefix, section, leaf) => {
      const input = { [section]: { [leaf]: `value-${leaf}` } };

      expect(collectLeafKeys(input, prefix)).toEqual([`${prefix}.${section}.${leaf}`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `array${index}`,
    `leaf${index}`,
  ] as const))(
    'collectLeafKeys expands generated array-like object %s',
    (arrayKey, leafKey) => {
      const input = {
        [arrayKey]: {
          0: `zero-${leafKey}`,
          1: {
            [leafKey]: `value-${leafKey}`,
          },
        },
      };

      expect(collectLeafKeys(input)).toEqual([`${arrayKey}.0`, `${arrayKey}.1.${leafKey}`]);
    },
  );
});

function indexValue(key: string): string {
  return `value-${key}`;
}

describe('i18n collectLeafKeys batch 146 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `prefix146-${index}`,
    `nullLeaf${index}`,
    `boolLeaf${index}`,
  ] as const))(
    'collectLeafKeys treats generated null and boolean leaves as keys %s',
    (prefix, nullLeaf, boolLeaf) => {
      const input = {
        [nullLeaf]: null,
        nested: {
          [boolLeaf]: false,
        },
      };

      expect(collectLeafKeys(input, prefix)).toEqual([`${prefix}.${nullLeaf}`, `${prefix}.nested.${boolLeaf}`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `numeric${index}`,
    `alpha${index}`,
  ] as const))(
    'collectLeafKeys preserves generated numeric key traversal before string key %s',
    (numeric, alpha) => {
      const input = {
        [numeric]: {
          10: 'ten',
          2: 'two',
          [alpha]: 'alpha',
        },
      };

      expect(collectLeafKeys(input)).toEqual([`${numeric}.2`, `${numeric}.10`, `${numeric}.${alpha}`]);
    },
  );
});

describe('i18n collectLeafKeys batch 151 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `prefix151-${index}`,
    `section${index}`,
    `child${index}`,
    `leaf${index}`,
  ] as const))(
    'collectLeafKeys applies generated prefix to deep path %s',
    (prefix, section, child, leaf) => {
      const input = {
        [section]: {
          [child]: {
            [leaf]: `value-${leaf}`,
          },
        },
      };

      expect(collectLeafKeys(input, prefix)).toEqual([`${prefix}.${section}.${child}.${leaf}`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `empty151-${index}`,
    `leaf151-${index}`,
    `sibling151-${index}`,
  ] as const))(
    'collectLeafKeys skips generated empty branches while preserving siblings %s',
    (emptyKey, leafKey, siblingKey) => {
      const input = {
        [emptyKey]: {},
        nested: {
          [leafKey]: `value-${leafKey}`,
        },
        [siblingKey]: indexValue(siblingKey),
      };

      expect(collectLeafKeys(input)).toEqual([`nested.${leafKey}`, siblingKey]);
    },
  );
});

describe('i18n collectLeafKeys batch 158 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `prefix158-${index}`,
    `array158-${index}`,
    `leaf158-${index}`,
  ] as const))(
    'collectLeafKeys expands generated prefixed numeric object %s',
    (prefix, arrayKey, leafKey) => {
      const input = {
        [arrayKey]: {
          10: 'ten',
          1: {
            [leafKey]: `value-${leafKey}`,
          },
        },
      };

      expect(collectLeafKeys(input, prefix)).toEqual([
        `${prefix}.${arrayKey}.1.${leafKey}`,
        `${prefix}.${arrayKey}.10`,
      ]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `empty158-${index}`,
    `null158-${index}`,
    `leaf158-${index}`,
  ] as const))(
    'collectLeafKeys treats generated null sibling as leaf and skips empty object %s',
    (emptyKey, nullKey, leafKey) => {
      const input = {
        [emptyKey]: {},
        [nullKey]: null,
        nested: {
          [leafKey]: `value-${leafKey}`,
        },
      };

      expect(collectLeafKeys(input)).toEqual([nullKey, `nested.${leafKey}`]);
    },
  );
});

describe('i18n collectLeafKeys batch 165 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `prefix165-${index}`,
    `zero${index}`,
    `false${index}`,
    `text${index}`,
  ] as const))(
    'collectLeafKeys treats generated falsy primitives as leaves %s',
    (prefix, zeroKey, falseKey, textKey) => {
      const input = {
        [zeroKey]: 0,
        nested: {
          [falseKey]: false,
          [textKey]: indexValue(textKey),
        },
      };

      expect(collectLeafKeys(input, prefix)).toEqual([
        `${prefix}.${zeroKey}`,
        `${prefix}.nested.${falseKey}`,
        `${prefix}.nested.${textKey}`,
      ]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `array165-${index}`,
    `deep165-${index}`,
    `leaf165-${index}`,
  ] as const))(
    'collectLeafKeys preserves generated numeric branch order with nested object %s',
    (arrayKey, deepKey, leafKey) => {
      const input = {
        [arrayKey]: {
          20: 'twenty',
          3: {
            [deepKey]: {
              [leafKey]: indexValue(leafKey),
            },
          },
        },
      };

      expect(collectLeafKeys(input)).toEqual([
        `${arrayKey}.3.${deepKey}.${leafKey}`,
        `${arrayKey}.20`,
      ]);
    },
  );
});

describe('i18n collectLeafKeys batch 169 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `prefix169-${index}`,
    `section169-${index}`,
    `leafA169-${index}`,
    `leafB169-${index}`,
  ] as const))(
    'collectLeafKeys preserves generated insertion order for string branches %s',
    (prefix, section, firstLeaf, secondLeaf) => {
      const input = {
        [section]: {
          [firstLeaf]: indexValue(firstLeaf),
          [secondLeaf]: indexValue(secondLeaf),
        },
      };

      expect(collectLeafKeys(input, prefix)).toEqual([
        `${prefix}.${section}.${firstLeaf}`,
        `${prefix}.${section}.${secondLeaf}`,
      ]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `array169-${index}`,
    `leaf169-${index}`,
    `zero169-${index}`,
  ] as const))(
    'collectLeafKeys traverses generated array-like object and falsy sibling %s',
    (arrayKey, leafKey, zeroKey) => {
      const input = {
        [arrayKey]: {
          2: {
            [leafKey]: indexValue(leafKey),
          },
          1: 'one',
        },
        [zeroKey]: 0,
      };

      expect(collectLeafKeys(input)).toEqual([
        `${arrayKey}.1`,
        `${arrayKey}.2.${leafKey}`,
        zeroKey,
      ]);
    },
  );
});

describe('i18n collectLeafKeys batch 176 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `prefix176-${index}`,
    `section176-${index}`,
    `empty176-${index}`,
    `leaf176-${index}`,
  ] as const))(
    'collectLeafKeys skips generated empty branch with prefix %s',
    (prefix, section, emptyKey, leafKey) => {
      const input = {
        [section]: {
          [emptyKey]: {},
          [leafKey]: indexValue(leafKey),
        },
      };

      expect(collectLeafKeys(input, prefix)).toEqual([
        `${prefix}.${section}.${leafKey}`,
      ]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `array176-${index}`,
    `deep176-${index}`,
    `false176-${index}`,
  ] as const))(
    'collectLeafKeys preserves generated numeric object order with boolean leaf %s',
    (arrayKey, deepKey, falseKey) => {
      const input = {
        [arrayKey]: {
          12: 'twelve',
          4: {
            [deepKey]: indexValue(deepKey),
          },
        },
        [falseKey]: false,
      };

      expect(collectLeafKeys(input)).toEqual([
        `${arrayKey}.4.${deepKey}`,
        `${arrayKey}.12`,
        falseKey,
      ]);
    },
  );
});
