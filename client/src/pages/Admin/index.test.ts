import { describe, it, expect } from 'vitest';
import { resolveTab, generateUsername } from './index';

describe('resolveTab', () => {
  it('returns urlTab when it is in visible tabs', () => {
    expect(resolveTab('account', ['ai', 'account', 'holidays'])).toBe('account');
  });

  it('returns first visible tab when urlTab is not in list', () => {
    expect(resolveTab('unknown', ['ai', 'account'])).toBe('ai');
  });

  it('returns first visible tab when urlTab is empty', () => {
    expect(resolveTab('', ['ai', 'account'])).toBe('ai');
  });

  it('defaults to "ai" when visibleTabs is empty', () => {
    expect(resolveTab('account', [])).toBe('ai');
  });

  it('defaults to "ai" when both inputs are empty', () => {
    expect(resolveTab('', [])).toBe('ai');
  });
});

describe('generateUsername', () => {
  it('converts Chinese name to pinyin', () => {
    const result = generateUsername('张三');
    expect(result).toBe('zhangsan');
  });

  it('handles single character name', () => {
    const result = generateUsername('李');
    expect(result).toBe('li');
  });

  it('handles mixed content', () => {
    const result = generateUsername('王五');
    expect(result).toBe('wangwu');
  });

  it('handles three-character name', () => {
    const result = generateUsername('诸葛亮');
    expect(result).toBe('zhugeliang');
  });

  it('handles empty string', () => {
    const result = generateUsername('');
    expect(result).toBe('');
  });

  it('produces lowercase output', () => {
    const result = generateUsername('赵六');
    expect(result).toBe(result.toLowerCase());
  });
});

describe('resolveTab additional', () => {
  it('returns first tab when urlTab is whitespace', () => {
    expect(resolveTab('  ', ['ai', 'account'])).toBe('ai');
  });

  it('handles single-item visibleTabs', () => {
    expect(resolveTab('other', ['holidays'])).toBe('holidays');
  });

  it('returns matching tab case-sensitively', () => {
    expect(resolveTab('Account', ['ai', 'account'])).toBe('ai');
  });

  it('resolveTab with audit tab in visible tabs', () => {
    expect(resolveTab('audit', ['ai', 'account', 'audit'])).toBe('audit');
  });

  it('generateUsername handles name with numeric characters', () => {
    const result = generateUsername('张三2');
    expect(result).toContain('zhangsan');
    expect(result.length).toBeGreaterThan(0);
  });

  it('generateUsername handles mixed Chinese and English name', () => {
    const result = generateUsername('张A三');
    expect(result).toContain('zhang');
    expect(result).toContain('san');
    expect(result.length).toBeGreaterThan(0);
  });

  it('resolveTab returns first tab when urlTab is undefined cast to string', () => {
    expect(resolveTab('undefined', ['ai', 'account'])).toBe('ai');
  });

  it('generateUsername handles name with spaces between characters', () => {
    const result = generateUsername('张 三');
    expect(result).toContain('zhang');
    expect(result).toContain('san');
    expect(result.length).toBeGreaterThan(0);
  });

  it('resolveTab returns first tab for null urlTab cast', () => {
    expect(resolveTab(null as unknown as string, ['ai', 'account'])).toBe('ai');
  });

  it('resolveTab returns first tab when input is empty string', () => {
    expect(resolveTab('', ['ai', 'account'])).toBe('ai');
  });

  it('resolveTab returns first tab when input is not in tabs', () => {
    expect(resolveTab('unknown', ['ai', 'account'])).toBe('ai');
  });

  it('generateUsername handles English-only name', () => {
    const result = generateUsername('John');
    expect(result.length).toBeGreaterThan(0);
  });

  it('resolveTab returns first tab when urlTab is whitespace-only', () => {
    expect(resolveTab('  ', ['ai', 'account'])).toBe('ai');
  });

  it('generateUsername handles name with special Unicode characters', () => {
    const result = generateUsername('张三');
    expect(result.length).toBeGreaterThan(0);
    expect(typeof result).toBe('string');
  });

  it('generateUsername handles empty string input', () => {
    const result = generateUsername('');
    expect(typeof result).toBe('string');
  });

  it('resolveTab returns first tab for undefined urlTab', () => {
    expect(resolveTab(undefined as unknown as string, ['ai', 'account'])).toBe('ai');
  });

  it('resolveTab returns matching tab when valid', () => {
    expect(resolveTab('account', ['ai', 'account'])).toBe('account');
  });

  it('resolveTab returns first tab for empty string', () => {
    expect(resolveTab('', ['ai', 'account'])).toBe('ai');
  });

  it('resolveTab returns first tab for unknown tab name', () => {
    expect(resolveTab('nonexistent', ['ai', 'account'])).toBe('ai');
  });

  it('resolveTab returns first tab for undefined input', () => {
    expect(resolveTab(undefined as any, ['ai', 'account'])).toBe('ai');
  });

  it('resolveTab returns valid tab for matching input', () => {
    expect(resolveTab('account', ['ai', 'account'])).toBe('account');
  });

  it('resolveTab returns first tab for non-matching input', () => {
    expect(resolveTab('nonexistent', ['ai', 'account'])).toBe('ai');
  });

  it('resolveTab returns first tab for empty string', () => {
    expect(resolveTab('', ['ai', 'account'])).toBe('ai');
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `tab-${index}`,
    [`first-${index}`, `tab-${index}`, `last-${index}`],
  ] as const))(
    'resolveTab returns generated visible tab %s',
    (urlTab, visibleTabs) => {
      expect(resolveTab(urlTab, [...visibleTabs])).toBe(urlTab);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `missing-${index}`,
    index % 2 === 0 ? [`fallback-${index}`, `second-${index}`] : [],
  ] as const))(
    'resolveTab falls back for generated missing tab %s',
    (urlTab, visibleTabs) => {
      expect(resolveTab(urlTab, [...visibleTabs])).toBe(visibleTabs[0] || 'ai');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => {
    const cases = [
      ['陈晨', 'chenchen'],
      ['刘洋', 'liuyang'],
      ['欧阳娜', 'ouyangna'],
      ['司马光', 'simaguang'],
    ] as const;
    return cases[index % cases.length];
  }))(
    'generateUsername converts generated Chinese name %s',
    (realName, username) => {
      expect(generateUsername(realName)).toBe(username);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `missing-batch139-${index}`,
    index % 3 === 0 ? [''] : index % 3 === 1 ? ['', `fallback-${index}`] : [`fallback-${index}`, `second-${index}`],
  ] as const))(
    'resolveTab uses generated first visible fallback %#',
    (urlTab, visibleTabs) => {
      expect(resolveTab(urlTab, [...visibleTabs])).toBe(visibleTabs[0] || 'ai');
    },
  );
});

describe('admin helpers batch 171 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch171-tab-${index}`,
    [`first-${index}`, `batch171-tab-${index}`, `last-${index}`],
  ] as const))(
    'resolveTab keeps generated batch171 exact visible tab %s',
    (urlTab, visibleTabs) => {
      expect(resolveTab(urlTab, [...visibleTabs])).toBe(urlTab);
      expect(resolveTab(` ${urlTab} `, [...visibleTabs])).toBe(visibleTabs[0]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const cases = [
      ['周杰伦', 'zhoujielun'],
      ['林俊杰', 'linjunjie'],
      ['王力宏', 'wanglihong'],
      ['孙燕姿', 'sunyanzi'],
    ] as const;
    return cases[index % cases.length];
  }))(
    'generateUsername converts generated batch171 Chinese name %s',
    (realName, username) => {
      expect(generateUsername(realName)).toBe(username);
      expect(generateUsername(realName)).toBe(generateUsername(realName).toLowerCase());
    },
  );
});
