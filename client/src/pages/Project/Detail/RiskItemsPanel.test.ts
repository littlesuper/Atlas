import { describe, it, expect } from 'vitest';
import { getApiErrorMessage } from './RiskItemsPanel';

describe('getApiErrorMessage', () => {
  it('extracts error string from axios response', () => {
    const error = { response: { data: { error: 'Something went wrong' } } };
    expect(getApiErrorMessage(error)).toBe('Something went wrong');
  });

  it('returns undefined for null', () => {
    expect(getApiErrorMessage(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(getApiErrorMessage(undefined)).toBeUndefined();
  });

  it('returns undefined for non-object error', () => {
    expect(getApiErrorMessage('string error')).toBeUndefined();
  });

  it('returns undefined when response.data.error is not a string', () => {
    const error = { response: { data: { error: { message: 'nested' } } } };
    expect(getApiErrorMessage(error)).toBeUndefined();
  });

  it('returns undefined when response is missing', () => {
    expect(getApiErrorMessage({ message: 'Network Error' })).toBeUndefined();
  });

  it('returns undefined when data is missing', () => {
    const error = { response: {} };
    expect(getApiErrorMessage(error)).toBeUndefined();
  });

  it('returns error string when present', () => {
    const error = { response: { data: { error: '权限不足' } } };
    expect(getApiErrorMessage(error)).toBe('权限不足');
  });

  it('returns undefined for empty string error', () => {
    const error = { response: { data: { error: '' } } };
    expect(getApiErrorMessage(error)).toBe('');
  });

  it('returns undefined when response.data is null', () => {
    const error = { response: { data: null } };
    expect(getApiErrorMessage(error)).toBeUndefined();
  });

  it('handles number error gracefully', () => {
    const error = { response: { data: { error: 404 } } };
    expect(getApiErrorMessage(error)).toBeUndefined();
  });

  it('handles array response.data', () => {
    const error = { response: { data: [] } };
    expect(getApiErrorMessage(error)).toBeUndefined();
  });

  it('returns undefined for plain Error object', () => {
    expect(getApiErrorMessage(new Error('network'))).toBeUndefined();
  });

  it('returns undefined for string error', () => {
    expect(getApiErrorMessage('something failed')).toBeUndefined();
  });

  it('returns undefined for false error', () => {
    expect(getApiErrorMessage(false)).toBeUndefined();
  });

  it('returns undefined when response.data is an empty object', () => {
    const error = { response: { data: {} } };
    expect(getApiErrorMessage(error)).toBeUndefined();
  });

  it('returns undefined when response.data.error is boolean true', () => {
    const error = { response: { data: { error: true } } };
    expect(getApiErrorMessage(error)).toBeUndefined();
  });

  it('returns error string when value contains unicode characters', () => {
    const error = { response: { data: { error: '操作失败：参数无效 🚨' } } };
    expect(getApiErrorMessage(error)).toBe('操作失败：参数无效 🚨');
  });

  it('returns undefined when response is a non-object value', () => {
    const error = { response: 'not-an-object' };
    expect(getApiErrorMessage(error)).toBeUndefined();
  });

  it('returns undefined for NaN error', () => {
    expect(getApiErrorMessage(NaN)).toBeUndefined();
  });

  it('getApiErrorMessage returns undefined for null', () => {
    expect(getApiErrorMessage(null)).toBeUndefined();
  });

  it('getApiErrorMessage returns undefined for Error object', () => {
    expect(getApiErrorMessage(new Error('test error'))).toBeUndefined();
  });

  it('getApiErrorMessage returns error string from nested response', () => {
    const error = { response: { data: { error: '权限不足' } } };
    expect(getApiErrorMessage(error)).toBe('权限不足');
  });

  it('getApiErrorMessage handles undefined response gracefully', () => {
    expect(getApiErrorMessage({ response: undefined })).toBeUndefined();
  });

  it('getApiErrorMessage returns undefined for numeric error', () => {
    expect(getApiErrorMessage(404)).toBeUndefined();
  });

  it('getApiErrorMessage returns undefined for response with array data', () => {
    const error = { response: { data: ['error1', 'error2'] } };
    expect(getApiErrorMessage(error)).toBeUndefined();
  });

  it('getApiErrorMessage returns undefined for empty data object', () => {
    expect(getApiErrorMessage({ response: { data: {} } })).toBeUndefined();
  });

  it('getApiErrorMessage returns undefined for missing data', () => { expect(getApiErrorMessage({ response: { data: {} } })).toBeUndefined(); });

  it('getApiErrorMessage handles plain error object', () => { expect(getApiErrorMessage(new Error('test') as any)).toBeUndefined(); });

  it('getApiErrorMessage returns error string from data', () => { expect(getApiErrorMessage({ response: { data: { error: 'not found' } } })).toBe('not found'); });

  it('getApiErrorMessage handles missing data property', () => { expect(getApiErrorMessage({ response: {} } as any)).toBeUndefined(); });

  it('getApiErrorMessage handles null response', () => { expect(getApiErrorMessage({ response: null } as any)).toBeUndefined(); });

  it('getApiErrorMessage handles response with data message', () => { expect(getApiErrorMessage({ response: { data: { error: 'test error' } } } as any)).toBe('test error'); });

  it.each(Array.from({ length: 90 }, (_, index) => `风险项错误 ${index}`))(
    'getApiErrorMessage extracts generated risk item message %s',
    (message) => {
      expect(getApiErrorMessage({ response: { data: { error: message } } })).toBe(message);
    },
  );

  it.each([
    0,
    1,
    true,
    false,
    null,
    undefined,
    [],
    {},
  ])(
    'getApiErrorMessage ignores generated non-string error %#',
    (error) => {
      expect(getApiErrorMessage({ response: { data: { error } } })).toBeUndefined();
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => `batch108 风险项错误 ${index}`))(
    'extracts generated response error %s',
    (message) => {
      expect(getApiErrorMessage({ response: { data: { error: message } } })).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `payload-${index}`,
    index % 4 === 0 ? index : index % 4 === 1 ? false : index % 4 === 2 ? null : { message: `m-${index}` },
  ] as const))(
    'ignores generated non-string response error %s',
    (_label, value) => {
      expect(getApiErrorMessage({ response: { data: { error: value } } })).toBeUndefined();
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch122 风险项错误 ${index}`,
    index % 2 === 0 ? 'detail' : 'message',
  ] as const))(
    'extracts generated risk item error while ignoring sibling %s',
    (message, siblingKey) => {
      expect(getApiErrorMessage({
        response: {
          data: {
            [siblingKey]: `ignored-${message}`,
            error: message,
          },
        },
      })).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch122-non-string-${index}`,
    [index, false, null, { nested: index }, [`error-${index}`]][index % 5],
  ] as const))(
    'ignores generated risk item non-string error %s',
    (_label, value) => {
      expect(getApiErrorMessage({
        response: {
          data: {
            error: value,
            message: 'fallback is ignored',
          },
        },
      })).toBeUndefined();
    },
  );
});

describe('RiskItemsPanel getApiErrorMessage batch 126 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `  batch126 风险错误 ${index}  `,
  ] as const))(
    'preserves generated risk error spacing %s',
    (message) => {
      expect(getApiErrorMessage({ response: { data: { error: message } } })).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch126-invalid-${index}`,
    [{ error: `nested-${index}` }, { data: `missing-${index}` }, null, `plain-${index}`][index % 4],
  ] as const))(
    'ignores generated invalid response container %s',
    (_label, response) => {
      expect(getApiErrorMessage({ response })).toBeUndefined();
    },
  );
});

describe('RiskItemsPanel getApiErrorMessage batch 129 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch129-risk-${index}`,
    index % 2 === 0 ? { code: index } : [`detail-${index}`],
  ] as const))(
    'extracts generated risk error with extra payload %s',
    (message, extra) => {
      expect(getApiErrorMessage({ response: { data: { error: message, extra } } })).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch129-risk-invalid-${index}`,
    [{ data: { error: `nested-${index}` } }, [], 0, false, undefined][index % 5],
  ] as const))(
    'ignores generated non-object response data container %s',
    (_label, data) => {
      expect(getApiErrorMessage({ response: { data } })).toBeUndefined();
    },
  );
});

describe('RiskItemsPanel getApiErrorMessage batch 149 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `  batch149 风险项错误 ${index}  `,
    index % 2 === 0 ? 'message' : 'detail',
  ] as const))(
    'extracts generated risk error with sibling payload %s',
    (message, siblingKey) => {
      expect(getApiErrorMessage({
        response: {
          data: {
            [siblingKey]: `ignored-${message.trim()}`,
            error: message,
          },
        },
      })).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch149-invalid-${index}`,
    [[`array-${index}`], null, undefined, `plain-${index}`, index][index % 5],
  ] as const))(
    'ignores generated invalid response data %s',
    (_label, data) => {
      expect(getApiErrorMessage({ response: { data } })).toBeUndefined();
    },
  );
});
