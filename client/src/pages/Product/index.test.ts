import { describe, it, expect } from 'vitest';
import { getApiErrorMessage, paramsToObject } from './index';

describe('getApiErrorMessage (Product)', () => {
  it('extracts response.data.error string', () => {
    const err = { response: { data: { error: 'Product not found' } } };
    expect(getApiErrorMessage(err)).toBe('Product not found');
  });

  it('returns undefined for null', () => {
    expect(getApiErrorMessage(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(getApiErrorMessage(undefined)).toBeUndefined();
  });

  it('returns undefined for string error', () => {
    expect(getApiErrorMessage('Network Error')).toBeUndefined();
  });

  it('returns undefined for object without response', () => {
    expect(getApiErrorMessage({ message: 'fail' })).toBeUndefined();
  });

  it('returns undefined when data.error is not string', () => {
    expect(getApiErrorMessage({ response: { data: { error: 500 } } })).toBeUndefined();
  });

  it('returns undefined when response.data is missing', () => {
    expect(getApiErrorMessage({ response: {} })).toBeUndefined();
  });

  it('extracts Chinese error message', () => {
    const err = { response: { data: { error: '产品名称已存在' } } };
    expect(getApiErrorMessage(err)).toBe('产品名称已存在');
  });
});

describe('Product helpers batch 174 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch174-key-${index}`,
    `batch174-value-${index}`,
    ` batch174-key-${index} `,
    `spaced-value-${index}`,
  ] as const))(
    'paramsToObject keeps generated whitespace key distinct from trimmed key %s',
    (key, value, spacedKey, spacedValue) => {
      expect(paramsToObject([
        { key, value },
        { key: spacedKey, value: spacedValue },
      ])).toEqual({
        [key]: value,
        [spacedKey]: spacedValue,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? { response: null } : { response: { data: { error: '' } } },
  ] as const))(
    'getApiErrorMessage handles generated empty or missing response %#',
    (error) => {
      const expected = error.response && 'data' in error.response ? '' : undefined;
      expect(getApiErrorMessage(error)).toBe(expected);
    },
  );
});

describe('paramsToObject', () => {
  it('converts params array to object', () => {
    const params = [
      { key: 'voltage', value: '3.3V' },
      { key: 'current', value: '1A' },
    ];
    expect(paramsToObject(params)).toEqual({ voltage: '3.3V', current: '1A' });
  });

  it('skips entries with empty key', () => {
    const params = [
      { key: 'voltage', value: '3.3V' },
      { key: '', value: 'ignored' },
    ];
    expect(paramsToObject(params)).toEqual({ voltage: '3.3V' });
  });

  it('returns empty object for empty array', () => {
    expect(paramsToObject([])).toEqual({});
  });

  it('last duplicate key wins', () => {
    const params = [
      { key: 'a', value: '1' },
      { key: 'a', value: '2' },
    ];
    expect(paramsToObject(params)).toEqual({ a: '2' });
  });

  it('preserves empty string values when key is present', () => {
    const params = [{ key: 'note', value: '' }];
    expect(paramsToObject(params)).toEqual({ note: '' });
  });

  it('getApiErrorMessage handles error with null response.data', () => {
    expect(getApiErrorMessage({ response: { data: null } })).toBeUndefined();
  });

  it('paramsToObject includes whitespace-only keys', () => {
    const params = [
      { key: '   ', value: 'val' },
      { key: 'valid', value: 'data' },
    ];
    expect(paramsToObject(params)).toEqual({ '   ': 'val', valid: 'data' });
  });

  it('getApiErrorMessage returns undefined for truthy non-object error', () => {
    expect(getApiErrorMessage(42)).toBeUndefined();
  });

  it('getApiErrorMessage returns empty string when error is empty string', () => {
    expect(getApiErrorMessage({ response: { data: { error: '' } } })).toBe('');
  });

  it('getApiErrorMessage handles error object with response but no data property', () => {
    expect(getApiErrorMessage({ response: { status: 500 } })).toBeUndefined();
  });

  it('paramsToObject handles entries with undefined value', () => {
    const params = [{ key: 'k', value: undefined as unknown as string }];
    expect(paramsToObject(params)).toEqual({ k: undefined });
  });

  it('getApiErrorMessage returns undefined for boolean true', () => {
    expect(getApiErrorMessage(true)).toBeUndefined();
  });

  it('getApiErrorMessage returns error string from axios response', () => {
    const error = { response: { data: { error: 'network error' } } };
    expect(getApiErrorMessage(error)).toBe('network error');
  });

  it('paramsToObject handles entries with null key gracefully', () => {
    const params = [{ key: null as unknown as string, value: 'ignored' }, { key: 'valid', value: 'data' }];
    expect(paramsToObject(params)).toEqual({ valid: 'data' });
  });

  it('getApiErrorMessage returns undefined for response with boolean error false', () => {
    expect(getApiErrorMessage({ response: { data: { error: false } } })).toBeUndefined();
  });

  it('getApiErrorMessage returns undefined for response with null data', () => {
    expect(getApiErrorMessage({ response: { data: null } })).toBeUndefined();
  });

  it('getApiErrorMessage handles undefined error', () => { expect(getApiErrorMessage(undefined as any)).toBeUndefined(); });

  it('getApiErrorMessage returns string from response data error', () => { expect(getApiErrorMessage({ response: { data: { error: 'custom error' } } })).toBe('custom error'); });

  it('getApiErrorMessage handles string error input', () => { expect(getApiErrorMessage('string error' as any)).toBeUndefined(); });

  it('getApiErrorMessage returns error from response data', () => { expect(getApiErrorMessage({ response: { data: { error: 'custom error' } } })).toBe('custom error'); });

  it('getApiErrorMessage handles undefined response', () => { expect(getApiErrorMessage({} as any)).toBeUndefined(); });

  it('getApiErrorMessage handles error object without response', () => { const result = getApiErrorMessage(new Error('network error') as any); expect(result).toBeUndefined(); });

  it('getApiErrorMessage handles undefined input', () => { const result = getApiErrorMessage(undefined as any); expect(result).toBeUndefined(); });

  it.each(Array.from({ length: 90 }, (_, index) => [`param-${index}`, `value-${index}`] as const))(
    'paramsToObject preserves generated key %s',
    (key, value) => {
      expect(paramsToObject([{ key, value }])).toEqual({ [key]: value });
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => `产品错误 ${index}`))(
    'getApiErrorMessage extracts generated message %s',
    (message) => {
      expect(getApiErrorMessage({ response: { data: { error: message } } })).toBe(message);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch103-key-${index}`,
    `first-${index}`,
    `last-${index}`,
  ] as const))(
    'paramsToObject keeps generated duplicate key %s last value',
    (key, firstValue, lastValue) => {
      expect(paramsToObject([
        { key, value: firstValue },
        { key: `other-${key}`, value: firstValue },
        { key, value: lastValue },
      ])).toEqual({
        [key]: lastValue,
        [`other-${key}`]: firstValue,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch103-message-${index}`,
    [index, false, null, { text: `err-${index}` }, [`err-${index}`]][index % 5],
  ] as const))(
    'getApiErrorMessage ignores generated non-string error payload %s',
    (_label, errorValue) => {
      expect(getApiErrorMessage({ response: { data: { error: errorValue } } })).toBeUndefined();
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch108 key ${index} 中文`,
    `value-${index}`,
  ] as const))(
    'paramsToObject preserves generated special key %s',
    (key, value) => {
      expect(paramsToObject([{ key, value }])).toEqual({ [key]: value });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `batch108 product error ${index}`))(
    'getApiErrorMessage extracts generated product error %s',
    (message) => {
      expect(getApiErrorMessage({ response: { data: { error: message } } })).toBe(message);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch116-key-${index}`,
    `value-${index}`,
    `updated-${index}`,
  ] as const))(
    'paramsToObject overwrites generated key after ignored empty entry %s',
    (key, firstValue, finalValue) => {
      expect(paramsToObject([
        { key: '', value: 'ignored' },
        { key, value: firstValue },
        { key, value: finalValue },
      ])).toEqual({ [key]: finalValue });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch116-message-${index}`,
    index % 2 === 0 ? 'meta' : 'details',
  ] as const))(
    'getApiErrorMessage ignores generated sibling field %s',
    (message, siblingKey) => {
      expect(getApiErrorMessage({ response: { data: { [siblingKey]: message } } })).toBeUndefined();
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `批量参数-${index}`,
    `值-${index}`,
  ] as const))(
    'paramsToObject keeps generated unicode key %s',
    (key, value) => {
      expect(paramsToObject([
        { key: null as unknown as string, value: 'ignored-null' },
        { key: '', value: 'ignored-empty' },
        { key, value },
      ])).toEqual({ [key]: value });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `  batch120 product error ${index}  `,
  ] as const))(
    'getApiErrorMessage preserves generated spacing in message %s',
    (message) => {
      expect(getApiErrorMessage({ response: { data: { error: message } } })).toBe(message);
    },
  );
});

describe('Product helpers batch 124 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch124-param-${index}`,
    `first-${index}`,
    `second-${index}`,
    `third-${index}`,
  ] as const))(
    'paramsToObject keeps generated last duplicate among multiple values %s',
    (key, first, second, third) => {
      expect(paramsToObject([
        { key, value: first },
        { key: `other-${key}`, value: second },
        { key, value: third },
      ])).toEqual({
        [key]: third,
        [`other-${key}`]: second,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch124-message-${index}`,
    index % 2 === 0 ? { extra: 'ignored' } : ['ignored'],
  ] as const))(
    'getApiErrorMessage extracts generated string error with sibling payload %s',
    (message, sibling) => {
      expect(getApiErrorMessage({ response: { data: { error: message, sibling } } })).toBe(message);
    },
  );
});

describe('Product helpers batch 127 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch127-param-${index}`,
    '',
  ] as const))(
    'paramsToObject preserves generated empty value for key %s',
    (key, value) => {
      expect(paramsToObject([{ key, value }])).toEqual({ [key]: value });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `批量产品错误-${index}`,
    index % 2 === 0 ? 'code' : 'details',
    index,
  ] as const))(
    'getApiErrorMessage extracts generated unicode error with metadata %s',
    (message, metadataKey, metadataValue) => {
      expect(getApiErrorMessage({ response: { data: { error: message, [metadataKey]: metadataValue } } })).toBe(message);
    },
  );
});

describe('Product helpers batch 136 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch136-param-${index}`,
    `value-${index}`,
    `replacement-${index}`,
  ] as const))(
    'paramsToObject generated duplicate key %s keeps final replacement',
    (key, value, replacement) => {
      expect(paramsToObject([
        { key: '', value: 'ignored-empty' },
        { key, value },
        { key: `sibling-${key}`, value },
        { key, value: replacement },
      ])).toEqual({
        [key]: replacement,
        [`sibling-${key}`]: value,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch136-error-${index}`,
    index % 2 === 0 ? null : { message: `ignored-${index}` },
  ] as const))(
    'getApiErrorMessage generated response keeps string error over metadata %s',
    (message, metadata) => {
      expect(getApiErrorMessage({
        response: {
          data: {
            error: message,
            metadata,
          },
        },
      })).toBe(message);
    },
  );
});

describe('Product helpers batch 144 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    ` batch144-param-${index} `,
    `value-${index}`,
  ] as const))(
    'paramsToObject preserves generated whitespace key %s',
    (key, value) => {
      expect(paramsToObject([
        { key: '', value: 'ignored' },
        { key, value },
      ])).toEqual({ [key]: value });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 3 === 0 ? undefined : index % 3 === 1 ? { message: `message-${index}` } : index,
  ] as const))(
    'getApiErrorMessage ignores generated non-string error %#',
    (error) => {
      expect(getApiErrorMessage({ response: { data: { error } } })).toBeUndefined();
    },
  );
});

describe('Product helpers batch 150 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch150-key-${index}`,
    `value-${index}`,
    `replacement-${index}`,
  ] as const))(
    'paramsToObject keeps generated truthy key after skipped blanks %s',
    (key, value, replacement) => {
      expect(paramsToObject([
        { key: '', value: 'ignored-empty' },
        { key, value },
        { key: '0', value: `zero-${value}` },
        { key, value: replacement },
      ])).toEqual({
        [key]: replacement,
        0: `zero-${value}`,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch150-invalid-response-${index}`,
    [null, undefined, `plain-${index}`, [`error-${index}`], index][index % 5],
  ] as const))(
    'getApiErrorMessage ignores generated invalid response payload %s',
    (_label, response) => {
      expect(getApiErrorMessage({ response })).toBeUndefined();
    },
  );
});

describe('Product helpers batch 156 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `${index}`,
    `numeric-value-${index}`,
    `named-key-${index}`,
    `named-value-${index}`,
  ] as const))(
    'paramsToObject keeps generated numeric-like and named keys %s',
    (numericKey, numericValue, namedKey, namedValue) => {
      expect(paramsToObject([
        { key: '', value: 'ignored-empty' },
        { key: numericKey, value: numericValue },
        { key: namedKey, value: namedValue },
      ])).toEqual({
        [numericKey]: numericValue,
        [namedKey]: namedValue,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch156-inherited-error-${index}`,
  ] as const))(
    'getApiErrorMessage reads generated inherited response field %s',
    (message) => {
      const error = Object.create({
        response: {
          data: {
            error: message,
          },
        },
      });

      expect(getApiErrorMessage(error)).toBe(message);
    },
  );
});

describe('Product helpers batch 168 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch168-key-${index}`,
    `value-${index}`,
    `replacement-${index}`,
  ] as const))(
    'paramsToObject keeps generated last duplicate while skipping blank %s',
    (key, value, replacement) => {
      expect(paramsToObject([
        { key: '', value: 'ignored' },
        { key, value },
        { key: ` ${key} `, value: `spaced-${value}` },
        { key, value: replacement },
      ])).toEqual({
        [key]: replacement,
        [` ${key} `]: `spaced-${value}`,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch168-error-${index}`,
    index % 2 === 0 ? { error: `nested-${index}` } : undefined,
  ] as const))(
    'getApiErrorMessage reads generated string error and ignores sibling metadata %s',
    (message, metadata) => {
      expect(getApiErrorMessage({
        response: {
          data: {
            error: message,
            metadata,
          },
        },
      })).toBe(message);
    },
  );
});

describe('Product helpers batch 162 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    ['constructor', 'toString', 'valueOf', 'hasOwnProperty'][index % 4],
    `batch162-value-${index}`,
  ] as const))(
    'paramsToObject keeps generated built-in named key %s as own value',
    (key, value) => {
      const result = paramsToObject([
        { key: '', value: 'ignored-empty' },
        { key, value },
      ]);

      expect(result[key]).toBe(value);
      expect(Object.prototype.hasOwnProperty.call(result, key)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch162-array-error-${index}`,
  ] as const))(
    'getApiErrorMessage reads generated response field from array object %s',
    (message) => {
      const error = [] as unknown[] & { response?: { data?: { error?: string } } };
      error.response = { data: { error: message } };

      expect(getApiErrorMessage(error)).toBe(message);
    },
  );
});
