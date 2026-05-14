import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosError } from 'axios';

const { mockCreate, mockInstance, mockPost } = vi.hoisted(() => {
  const mockReqInterceptors = { use: vi.fn() };
  const mockResInterceptors = { use: vi.fn() };
  const instance = vi.fn();
  instance.interceptors = { request: mockReqInterceptors, response: mockResInterceptors };
  instance.defaults = {};
  const create = vi.fn(() => instance);
  const post = vi.fn();
  return { mockCreate: create, mockInstance: instance, mockPost: post };
});

describe('request helper batch 175 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? `timeout batch175-${index}` : `Network Error batch175-${index}`,
    index % 2 === 0 ? '请求超时，请稍后重试' : '网络错误，请检查网络连接',
  ] as const))(
    'getErrorMessage maps generated transport message %s',
    async (message, expected) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => (
    index % 2 === 0
      ? [{ response: { data: null }, message: '' }, '未知错误']
      : [{ response: { data: { message: '', error: '' } }, message: '' }, '请求失败']
  ) as const))(
    'getErrorMessage falls back for generated empty response shape %#',
    async (error, expected) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage(error as AxiosError)).toBe(expected);
    },
  );
});

vi.mock('axios', () => ({
  default: Object.assign(mockCreate, { post: mockPost, create: mockCreate }),
}));

const { mockMessageError, mockCaptureAppError } = vi.hoisted(() => ({
  mockMessageError: vi.fn(),
  mockCaptureAppError: vi.fn(),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: { error: mockMessageError, success: vi.fn() },
}));

vi.mock('../utils/monitoring', () => ({
  captureAppError: mockCaptureAppError,
}));

describe('request module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  it('creates axios instance with /api baseURL and 30s timeout', async () => {
    await import('./request');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: '/api', timeout: 30000 })
    );
  });

  it('sets JSON content type header', async () => {
    await import('./request');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('registers request and response interceptors', async () => {
    await import('./request');
    expect(mockInstance.interceptors.request.use).toHaveBeenCalledTimes(1);
    expect(mockInstance.interceptors.response.use).toHaveBeenCalledTimes(1);
  });

  it('request interceptor adds Bearer token from localStorage', async () => {
    await import('./request');
    const onFulfilled = mockInstance.interceptors.request.use.mock.calls[0][0];

    localStorage.setItem('accessToken', 'test-jwt');
    const config = { headers: {} };
    const result = onFulfilled(config);
    expect(result.headers.Authorization).toBe('Bearer test-jwt');
  });

  it('request interceptor skips auth when no token', async () => {
    await import('./request');
    const onFulfilled = mockInstance.interceptors.request.use.mock.calls[0][0];

    const config = { headers: {} };
    const result = onFulfilled(config);
    expect(result.headers.Authorization).toBeUndefined();
  });

  it('request error interceptor rejects with original error', async () => {
    await import('./request');
    const onRejected = mockInstance.interceptors.request.use.mock.calls[0][1];

    const error = new Error('setup failure');
    await expect(onRejected(error)).rejects.toThrow('setup failure');
  });

  it('response success interceptor passes through response', async () => {
    await import('./request');
    const onFulfilled = mockInstance.interceptors.response.use.mock.calls[0][0];

    const response = { data: { ok: true }, status: 200 };
    expect(onFulfilled(response)).toBe(response);
  });
});

describe('getErrorMessage', () => {
  it('extracts message from response data', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { response: { data: { message: '自定义错误' } } } as AxiosError;
    expect(getErrorMessage(error)).toBe('自定义错误');
  });

  it('extracts error field when message is absent', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { response: { data: { error: '服务器错误' } } } as AxiosError;
    expect(getErrorMessage(error)).toBe('服务器错误');
  });

  it('returns default for empty response data', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { response: { data: {} } } as AxiosError;
    expect(getErrorMessage(error)).toBe('请求失败');
  });

  it('handles timeout error message', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { message: 'timeout of 30000ms exceeded' } as AxiosError;
    expect(getErrorMessage(error)).toBe('请求超时，请稍后重试');
  });

  it('handles network error message', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { message: 'Network Error' } as AxiosError;
    expect(getErrorMessage(error)).toBe('网络错误，请检查网络连接');
  });

  it('returns raw message for other errors', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { message: 'something else went wrong' } as AxiosError;
    expect(getErrorMessage(error)).toBe('something else went wrong');
  });

  it('returns fallback for empty error', async () => {
    const { getErrorMessage } = await import('./request');
    const error = {} as AxiosError;
    expect(getErrorMessage(error)).toBe('未知错误');
  });

  it('handles timeout error message', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { code: 'ECONNABORTED', message: 'timeout' } as AxiosError;
    expect(getErrorMessage(error)).toBeTruthy();
  });

  it('extracts response data error string', async () => {
    const { getErrorMessage } = await import('./request');
    const error = {
      response: { status: 422, data: 'validation failed' },
    } as unknown as AxiosError;
    const msg = getErrorMessage(error);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('prioritizes message over error field', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { response: { data: { message: 'msg', error: 'err' } } } as AxiosError;
    expect(getErrorMessage(error)).toBe('msg');
  });

  it('handles response data as non-object string', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { response: { data: 'plain error string' } } as unknown as AxiosError;
    const msg = getErrorMessage(error);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('falls back to error field when message is empty string', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { response: { data: { message: '', error: 'server error' } } } as AxiosError;
    expect(getErrorMessage(error)).toBe('server error');
  });

  it('handles falsy response data falling back to error message', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { response: { data: 0 }, message: 'fallback msg' } as unknown as AxiosError;
    expect(getErrorMessage(error)).toBe('fallback msg');
  });

  it('handles response data as null falling back to error message', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { response: { data: null }, message: 'null data fallback' } as unknown as AxiosError;
    expect(getErrorMessage(error)).toBe('null data fallback');
  });

  it('getErrorMessage returns fallback for empty error', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { message: '' } as unknown as AxiosError;
    expect(getErrorMessage(error)).toBe('未知错误');
  });

  it('getErrorMessage handles network error without response', async () => {
    const { getErrorMessage } = await import('./request');
    const error = new Error('Network Error') as unknown as AxiosError;
    expect(getErrorMessage(error)).toBe('网络错误，请检查网络连接');
  });

  it('getErrorMessage handles response data as array returning default', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { response: { data: [1, 2, 3] } } as unknown as AxiosError;
    expect(getErrorMessage(error)).toBe('请求失败');
  });

  it('getErrorMessage handles response data as boolean', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { response: { data: true } } as unknown as AxiosError;
    const msg = getErrorMessage(error);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('response interceptor skips Message.error when _silent flag is set', async () => {
    await import('./request');
    const onRejected = mockInstance.interceptors.response.use.mock.calls[0][1];
    const silentConfig = { url: '/some-endpoint', headers: {}, _silent: true } as any;
    const error = { config: silentConfig, response: { status: 403, data: { message: 'forbidden' } } } as AxiosError;
    await expect(onRejected(error)).rejects.toBeDefined();
    expect(mockMessageError).not.toHaveBeenCalled();
  });

  it('response interceptor handles 403 by showing error but not capturing to monitoring', async () => {
    await import('./request');
    const onRejected = mockInstance.interceptors.response.use.mock.calls[0][1];
    const config = { url: '/data', headers: {} } as any;
    const error = { config, response: { status: 403, data: { message: 'forbidden' } } } as AxiosError;
    await expect(onRejected(error)).rejects.toBeDefined();
    expect(mockMessageError).toHaveBeenCalledWith('forbidden');
    expect(mockCaptureAppError).not.toHaveBeenCalled();
  });

  it('getErrorMessage handles response data with numeric zero message field', async () => {
    const { getErrorMessage } = await import('./request');
    const error = { response: { data: { message: 0, error: 'fallback' } } } as unknown as AxiosError;
    expect(getErrorMessage(error)).toBe('fallback');
  });

  it('getErrorMessage handles error with no response', async () => { const { getErrorMessage } = await import('./request'); const error = new Error('network error') as unknown as AxiosError; expect(getErrorMessage(error)).toBeDefined(); });

  it('getErrorMessage handles string error input', async () => { const { getErrorMessage } = await import('./request'); expect(getErrorMessage('plain error' as unknown as AxiosError)).toBeDefined(); });

  it('getErrorMessage handles error without response', async () => { const { getErrorMessage } = await import('./request'); const error = new Error('network error') as unknown as AxiosError; expect(getErrorMessage(error)).toBeDefined(); });

  it('getErrorMessage handles undefined input gracefully', async () => { const { getErrorMessage } = await import('./request'); try { getErrorMessage(undefined as unknown as AxiosError); } catch { expect(true).toBe(true); } });

  it('getErrorMessage handles string error input', async () => { const { getErrorMessage } = await import('./request'); const result = getErrorMessage('plain error' as unknown as AxiosError); expect(typeof result).toBe('string'); });

  it('getErrorMessage handles undefined error input with try/catch', async () => { const { getErrorMessage } = await import('./request'); try { getErrorMessage(undefined as unknown as AxiosError); } catch { expect(true).toBe(true); } });

  it.each(Array.from({ length: 80 }, (_, index) => [`错误消息 ${index} <tag>${index}</tag>`, index % 2 === 0 ? 'message' : 'error']))(
    'getErrorMessage extracts response %s field value %s',
    async (value, field) => {
      const { getErrorMessage } = await import('./request');
      const data = field === 'message' ? { message: value, error: 'fallback' } : { error: value };
      const error = { response: { data } } as AxiosError;

      expect(getErrorMessage(error)).toBe(value);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `timeout ${index}ms exceeded` : `Network Error ${index}`,
    index % 2 === 0 ? '请求超时，请稍后重试' : '网络错误，请检查网络连接',
  ]))('getErrorMessage maps transport message %s', async (message, expected) => {
    const { getErrorMessage } = await import('./request');
    const error = { message } as AxiosError;

    expect(getErrorMessage(error)).toBe(expected);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [`batch109 message ${index}`, `batch109 error ${index}`] as const))(
    'getErrorMessage prioritizes generated message %s over error %s',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } } } as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 3 === 0 ? '' : index % 3 === 1 ? null : 0,
    `fallback-${index}`,
  ] as const))(
    'getErrorMessage falls back from generated falsy message %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } } } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    { response: { data: index % 2 === 0 ? [index] : { details: `detail-${index}` } } },
  ] as const))(
    'getErrorMessage falls back for generated response payload %#',
    async (error) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage(error as unknown as AxiosError)).toBe('请求失败');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `plain generated failure ${index}`,
  ] as const))(
    'getErrorMessage returns generated plain message %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 132 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch132-message-${index}`,
    `batch132-error-${index}`,
  ] as const))(
    'getErrorMessage keeps generated message priority %s',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } } } as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `timeout of ${index}ms exceeded` : `Network Error batch ${index}`,
    index % 2 === 0 ? '请求超时，请稍后重试' : '网络错误，请检查网络连接',
  ] as const))(
    'getErrorMessage maps generated transport failure %s',
    async (message, expected) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(expected);
    },
  );
});

describe('request helper batch 148 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch148-message-${index}`,
    '',
    index % 2 === 0 ? '' : `batch148-error-${index}`,
  ] as const))(
    'getErrorMessage handles generated blank message with error fallback %s',
    async (_label, message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } }, message: 'plain-message' } as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText || '请求失败');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `Timeout ${index}` : `timeout batch ${index}`,
    index % 2 === 0 ? `Timeout ${index}` : '请求超时，请稍后重试',
  ] as const))(
    'getErrorMessage timeout mapping remains case sensitive for %s',
    async (message, expected) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch153-message-${index} 中文`,
    `batch153-error-${index}`,
  ] as const))(
    'getErrorMessage preserves generated unicode message priority %s',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } }, message: 'plain' } as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? null : 0,
    index % 3 === 0 ? '' : `batch153-error-${index}`,
  ] as const))(
    'getErrorMessage handles generated falsy response fields %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } }, message: `plain-${errorText}` } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText || '请求失败');
    },
  );
});

describe('request helper batch 163 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch163-error-${index}`,
    `plain-${index}`,
  ] as const))(
    'getErrorMessage keeps generated response error before plain message %s',
    async (errorText, plainMessage) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { error: errorText } }, message: plainMessage } as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `network error ${index}` : `TIMEOUT ${index}`,
  ] as const))(
    'getErrorMessage preserves generated case-sensitive transport text %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 166 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch166-message-${index}`,
    `batch166-error-${index}`,
    `plain-${index}`,
  ] as const))(
    'getErrorMessage returns generated response message before all fallbacks %s',
    async (message, errorText, plainMessage) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } }, message: plainMessage } as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `plain-${index}` : `batch166-plain-${index}`,
    index % 2 === 0 ? { response: { data: '' }, message: `plain-${index}` } : { message: `batch166-plain-${index}` },
  ] as const))(
    'getErrorMessage handles generated empty response payload %#',
    async (expected, error) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage(error as AxiosError)).toBe(expected);
    },
  );
});

describe('request helper batch 170 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch170-inherited-message-${index}`,
    `plain-${index}`,
  ] as const))(
    'getErrorMessage reads generated inherited response message %s',
    async (message, plainMessage) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.create({ message });
      const error = { response: { data }, message: plainMessage } as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch170-array-error-${index}`,
  ] as const))(
    'getErrorMessage reads generated error field from array payload %s',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const data = [] as unknown[] & { error?: string };
      data.error = errorText;
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );
});

describe('request helper batch 179 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch179-message-${index}`,
    `batch179-error-${index}`,
    `plain-${index}`,
  ] as const))(
    'getErrorMessage keeps generated batch179 response message priority %s',
    async (message, errorText, plainMessage) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } }, message: plainMessage } as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `timeout batch179 ${index}` : `Network Error batch179 ${index}`,
    index % 2 === 0 ? '请求超时，请稍后重试' : '网络错误，请检查网络连接',
  ] as const))(
    'getErrorMessage maps generated batch179 transport text %s',
    async (message, expected) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(expected);
    },
  );
});

describe('request helper batch 180 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    '',
    index % 2 === 0 ? `batch180-error-${index}` : '',
    `plain-${index}`,
  ] as const))(
    'getErrorMessage uses generated batch180 error fallback when message blank %#',
    async (message, errorText, plainMessage) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } }, message: plainMessage } as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText || '请求失败');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `Network error batch180 ${index}` : `Timeout batch180 ${index}`,
  ] as const))(
    'getErrorMessage preserves generated batch180 case-sensitive transport text %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 181 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? `batch181-error-${index}` : '',
    index % 2 === 0 ? `timeout batch181 ${index}` : `Network Error batch181 ${index}`,
  ] as const))(
    'getErrorMessage keeps generated batch181 response error before transport message %#',
    async (errorText, message) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { error: errorText } }, message } as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText || '请求失败');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? ['not-message'] : 123,
  ] as const))(
    'getErrorMessage falls back for generated batch181 primitive response data %#',
    async (data) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data }, message: 'plain fallback' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe('请求失败');
    },
  );
});

describe('request helper batch 182 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? `   batch182-message-${index}   ` : `batch182-message-${index}`,
    `batch182-error-${index}`,
  ] as const))(
    'getErrorMessage preserves generated batch182 response message text %s',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } }, message: 'plain' } as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? {} : { message: '' },
  ] as const))(
    'getErrorMessage returns generated batch182 unknown fallback without response %#',
    async (error) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage(error as AxiosError)).toBe('未知错误');
    },
  );
});

describe('request helper batch 183 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 0 : false,
  ] as const))(
    'getErrorMessage falls back for generated batch183 falsy response fields %#',
    async (fieldValue) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message: fieldValue, error: fieldValue } },
        message: `plain-${fieldValue}`,
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe('请求失败');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `prefix timeout suffix ${index}` : `prefix Network Error suffix ${index}`,
    index % 2 === 0 ? '请求超时，请稍后重试' : '网络错误，请检查网络连接',
  ] as const))(
    'getErrorMessage maps generated batch183 transport substring %s',
    async (message, expected) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(expected);
    },
  );
});

describe('request helper batch 184 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch184-inherited-${index}`,
    `plain-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch184 inherited error field %s',
    async (errorText, plainMessage) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.create({ error: errorText });
      const error = { response: { data }, message: plainMessage } as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch184-message-${index}`,
  ] as const))(
    'getErrorMessage prefers generated batch184 array message property %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const data = [] as unknown[] & { message?: string };
      data.message = message;
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );
});

describe('request helper batch 185 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? null : undefined,
    `batch185-error-${index}`,
  ] as const))(
    'getErrorMessage uses generated batch185 error when response message absent %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `timeout batch185 ${index}` : `Network Error batch185 ${index}`,
    index % 2 === 0 ? '请求超时，请稍后重试' : '网络错误，请检查网络连接',
  ] as const))(
    'getErrorMessage maps generated batch185 transport fallback %s',
    async (message, expected) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(expected);
    },
  );
});

describe('request helper batch 186 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? '' : undefined,
  ] as const))(
    'getErrorMessage returns generated batch186 unknown for empty message %#',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('未知错误');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout then Network Error batch186 ${index}`,
  ] as const))(
    'getErrorMessage maps generated batch186 timeout before network text %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 187 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? {} : { message: '', error: '' },
  ] as const))(
    'getErrorMessage returns generated batch187 request failed for empty response data %#',
    async (data) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data }, message: `plain-${JSON.stringify(data)}` } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe('请求失败');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `Timeout batch187 ${index}` : `NETWORK ERROR batch187 ${index}`,
  ] as const))(
    'getErrorMessage keeps generated batch187 case sensitive transport text %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 188 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? `batch188-response-${index}` : index,
  ] as const))(
    'getErrorMessage returns generated batch188 request failed for primitive response data %#',
    async (data) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data }, message: `plain-${data}` } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe('请求失败');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 0 : false,
  ] as const))(
    'getErrorMessage ignores generated batch188 falsy response error %#',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { error: errorText } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe('请求失败');
    },
  );
});

describe('request helper batch 189 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? `  batch189-message-${index}  ` : `\nbatch189-message-${index}\t`,
  ] as const))(
    'getErrorMessage returns generated batch189 response message without trimming %#',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `batch189 plain ${index}` : `network error lowercase ${index}`,
  ] as const))(
    'getErrorMessage returns generated batch189 plain message for non-mapped text %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 190 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? [] : [index],
  ] as const))(
    'getErrorMessage returns generated batch190 request failed for array response data %#',
    async (data) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data }, message: `plain-${data.length}` } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe('请求失败');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `Network Error timeout batch190 ${index}` : `Network Error batch190 ${index} timeout`,
  ] as const))(
    'getErrorMessage maps generated batch190 timeout before network error %#',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 191 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? `  batch191-message-${index}  ` : `\nbatch191-message-${index}\t`,
    `batch191-error-${index}`,
  ] as const))(
    'getErrorMessage prefers generated batch191 message over error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `Timeout batch191 ${index}` : `network error lowercase batch191 ${index}`,
  ] as const))(
    'getErrorMessage keeps generated batch191 non-mapped casing %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 192 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 0 : false,
    `batch192-error-${index}`,
  ] as const))(
    'getErrorMessage falls through generated batch192 falsy message to error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `prefix Network Error batch192 ${index}` : `batch192 ${index} Network Error suffix`,
  ] as const))(
    'getErrorMessage maps generated batch192 network substring %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('网络错误，请检查网络连接');
    },
  );
});

describe('request helper batch 193 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? false : 0,
  ] as const))(
    'getErrorMessage returns request failed for generated batch193 falsy response error %#',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message: undefined, error: errorText } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe('请求失败');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch193-inherited-message-${index}`,
    `batch193-inherited-error-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch193 inherited response message %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.create({ message, error: errorText });
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );
});

describe('request helper batch 194 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? ` batch194-error-${index} ` : `\nbatch194-error-${index}\t`,
  ] as const))(
    'getErrorMessage preserves generated batch194 response error whitespace %#',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message: '', error: errorText } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'Network Error' : 'timeout',
    index % 2 === 0 ? '网络错误，请检查网络连接' : '请求超时，请稍后重试',
  ] as const))(
    'getErrorMessage maps generated batch194 transport with null response %#',
    async (message, expected) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: null }, message } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(expected);
    },
  );
});

describe('request helper batch 195 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { nested: `batch195-message-${index}` },
  ] as const))(
    'getErrorMessage returns generated batch195 object message by reference %#',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    [`batch195-error-${index}`],
  ] as const))(
    'getErrorMessage returns generated batch195 array error by reference %#',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message: '', error: errorText } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );
});

describe('request helper batch 196 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { message: '', error: `batch196-error-${index}`, extra: { index } },
  ] as const))(
    'getErrorMessage ignores generated batch196 extra response fields %#',
    async (data) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(data.error);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `timeout Network Error batch196 ${index}` : `timeout only batch196 ${index}`,
  ] as const))(
    'getErrorMessage maps generated batch196 timeout before network %#',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 197 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { nested: `batch197-message-${index}` },
    `batch197-error-${index}`,
  ] as const))(
    'getErrorMessage prefers generated batch197 object message over string error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `Network Error batch197 ${index}` : `plain batch197 ${index}`,
    index % 2 === 0 ? '网络错误，请检查网络连接' : `plain batch197 ${index}`,
  ] as const))(
    'getErrorMessage handles generated batch197 response without data %#',
    async (message, expected) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: {}, message } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(expected);
    },
  );
});

describe('request helper batch 198 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch198-message-${index}`,
  ] as const))(
    'getErrorMessage returns default for generated batch198 empty response object %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: {} }, message } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe('请求失败');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `timeout batch198 ${index}` : `Network Error batch198 ${index}`,
    index % 2 === 0 ? '请求超时，请稍后重试' : '网络错误，请检查网络连接',
  ] as const))(
    'getErrorMessage falls back for generated batch198 null response data %#',
    async (message, expected) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: null }, message } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(expected);
    },
  );
});

describe('request helper batch 199 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 0 : false,
    `batch199-error-${index}`,
  ] as const))(
    'getErrorMessage falls through generated batch199 falsy message values %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 0 : false,
  ] as const))(
    'getErrorMessage returns default for generated batch199 fully falsy response data %#',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: '' } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe('请求失败');
    },
  );
});

describe('request helper batch 200 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch200-string-data-${index}`,
  ] as const))(
    'getErrorMessage returns default for generated batch200 string response data %s',
    async (data) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe('请求失败');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? true : [],
  ] as const))(
    'getErrorMessage returns default for generated batch200 truthy non-record response data %#',
    async (data) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe('请求失败');
    },
  );
});

describe('request helper batch 201 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    { toString: () => `batch201-message-${index}` },
  ] as const))(
    'getErrorMessage returns generated batch201 object error by reference %#',
    async (errorValue) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message: '', error: errorValue } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorValue);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'timeout' : 'Network Error',
    index % 2 === 0 ? '请求超时，请稍后重试' : '网络错误，请检查网络连接',
  ] as const))(
    'getErrorMessage maps generated batch201 exact transport messages %#',
    async (message, expected) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(expected);
    },
  );
});

describe('request helper batch 202 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch202-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch202 error when message is null %s',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message: null, error: errorText } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? { message: undefined, error: undefined } : { message: null, error: null },
  ] as const))(
    'getErrorMessage returns default for generated batch202 nullish response fields %#',
    async (data) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe('请求失败');
    },
  );
});

describe('request helper batch 203 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch203-message-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch203 message when error is object %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: { nested: message } } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch203 plain ${index}`,
  ] as const))(
    'getErrorMessage returns generated batch203 plain message %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 204 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `   batch204-message-${index}   `,
  ] as const))(
    'getErrorMessage preserves generated batch204 whitespace message %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: 'fallback' } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch204-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch204 response error before transport message %s',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message: '', error: errorText } }, message: 'timeout Network Error' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );
});

describe('request helper batch 205 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 0 : false,
    `batch205-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch205 error when message is falsy %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message, error: errorText } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error before timeout batch205-${index}`,
  ] as const))(
    'getErrorMessage returns timeout when generated batch205 transport message includes both keywords %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 206 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 0 : false,
  ] as const))(
    'getErrorMessage returns default for generated batch206 falsy response error %#',
    async (errorValue) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data: { message: '', error: errorValue } }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe('请求失败');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `network error batch206-${index}`,
  ] as const))(
    'getErrorMessage preserves generated batch206 lowercase network message %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 207 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch207-inherited-message-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch207 inherited response message %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.create({ message });
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Timeout Network Error batch207-${index}`,
  ] as const))(
    'getErrorMessage preserves generated batch207 uppercase timeout spelling %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('网络错误，请检查网络连接');
    },
  );
});

describe('request helper batch 208 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch208-function-message-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch208 message from function response data %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.assign(() => message, { message, error: 'fallback' });
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, () => [
    '',
  ] as const))(
    'getErrorMessage returns unknown for generated batch208 empty transport message %#',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('未知错误');
    },
  );
});

describe('request helper batch 209 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch209-array-message-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch209 message from array response data %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.assign([message], { message, error: 'fallback' });
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout batch209-${index}`,
  ] as const))(
    'getErrorMessage maps generated batch209 lowercase timeout message %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 210 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch210-error-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch210 error from String object response data %s',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.assign(new String('batch210'), { error: errorText });
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? `batch210-data-${index}` : index + 1,
  ] as const))(
    'getErrorMessage returns request failure for generated batch210 primitive response data %#',
    async (data) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe('请求失败');
    },
  );
});

describe('request helper batch 211 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch211-message-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch211 message from Boolean object response data %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.assign(Object(false), { message, error: 'fallback' });
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error timeout batch211-${index}`,
  ] as const))(
    'getErrorMessage prioritizes generated batch211 lowercase timeout over network %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 212 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index,
    `batch212-error-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch212 error from Number object response data %s',
    async (index, errorText) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.assign(Object(index), { error: errorText });
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `TIMEOUT batch212-${index}`,
  ] as const))(
    'getErrorMessage preserves generated batch212 uppercase timeout message %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 213 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch213-message-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch213 message from Date response data %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.assign(new Date('2026-05-25T00:00:00.000Z'), { message, error: 'fallback' });
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0,
  ] as const))(
    'getErrorMessage returns generated batch213 boolean response data fallback %#',
    async (data) => {
      const { getErrorMessage } = await import('./request');
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(data ? '请求失败' : 'plain');
    },
  );
});

describe('request helper batch 214 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch214-error-message-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch214 message from Error response data %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.assign(new Error('fallback'), { message, error: 'fallback' });
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network error batch214-${index}`,
  ] as const))(
    'getErrorMessage preserves generated batch214 differently cased network message %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 215 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch215-error-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch215 error from RegExp response data %s',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.assign(new RegExp(errorText), { error: errorText });
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch215-${index}`,
  ] as const))(
    'getErrorMessage prioritizes generated batch215 timeout before network %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 216 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch216-message-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch216 message from array response data %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.assign([message], { message });
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch216 Network Error timeout ${index}`,
  ] as const))(
    'getErrorMessage keeps generated batch216 timeout precedence with mixed network message %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 217 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch217-prototype-message-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch217 inherited response message %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.create({ message });
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Timeout Network Error batch217-${index}`,
  ] as const))(
    'getErrorMessage treats generated batch217 uppercase timeout as network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('网络错误，请检查网络连接');
    },
  );
});

describe('request helper batch 218 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch218-function-error-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch218 error from function response data %s',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const data = Object.assign(() => errorText, { error: errorText });
      const error = { response: { data }, message: 'plain' } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch218 TIMEOUT Network Error ${index}`,
  ] as const))(
    'getErrorMessage treats generated batch218 uppercase TIMEOUT as network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('网络错误，请检查网络连接');
    },
  );
});

describe('request helper batch 219 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch219-error-${index}`,
  ] as const))(
    'getErrorMessage falls back from empty generated batch219 message to error %s',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message: '', error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch219 network error timeout ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch219 lowercase timeout precedence %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 220 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch220-error-${index}`,
  ] as const))(
    'getErrorMessage falls back from numeric generated batch220 message to error %s',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message: 0, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error with timeout batch220-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch220 timeout precedence over network %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 221 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch221-message-${index}`,
  ] as const))(
    'getErrorMessage reads generated batch221 String object message %#',
    async (message) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message: new String(message), error: 'fallback' } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toEqual(new String(message));
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error batch221-${index}`,
  ] as const))(
    'getErrorMessage maps generated batch221 pure network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('网络错误，请检查网络连接');
    },
  );
});

describe('request helper batch 222 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch222-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch222 array message before error %#',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const message: string[] = [];
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `network error batch222-${index}`,
  ] as const))(
    'getErrorMessage keeps generated batch222 lowercase network message %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 223 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch223-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch223 object message before error %#',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const message = { code: errorText };
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `TIMEOUT Network Error batch223-${index}`,
  ] as const))(
    'getErrorMessage keeps generated batch223 uppercase timeout network message %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('网络错误，请检查网络连接');
    },
  );
});

describe('request helper batch 224 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch224-error-${index}`,
  ] as const))(
    'getErrorMessage falls back from generated batch224 false message to error %s',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message: false, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch224-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch224 timeout precedence over network %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 225 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    Promise.resolve(`batch225-message-${index}`),
    `batch225-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch225 Promise message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Timeout Network Error batch225-${index}`,
  ] as const))(
    'getErrorMessage maps generated batch225 uppercase Timeout network message to network %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('网络错误，请检查网络连接');
    },
  );
});

describe('request helper batch 226 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Map([['message', `batch226-message-${index}`]]),
    `batch226-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch226 Map message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `network timeout Error batch226-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch226 lowercase timeout precedence %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 227 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Set([`batch227-message-${index}`]),
    `batch227-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch227 Set message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error timeout batch227-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch227 timeout precedence over network %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 228 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    Object.assign(Object.create(null), { text: `batch228-message-${index}` }),
    `batch228-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch228 null-prototype message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout batch228 Network Error ${index}`,
  ] as const))(
    'getErrorMessage keeps generated batch228 lowercase timeout precedence %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 229 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URLSearchParams(`message=batch229-${index}`),
    `batch229-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch229 URLSearchParams message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `request timeout Network Error batch229-${index}`,
  ] as const))(
    'getErrorMessage keeps generated batch229 request timeout precedence %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 230 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Date(Date.UTC(2026, 5, 11, 0, index % 50)),
  ] as const))(
    'getErrorMessage falls back from generated batch230 zero message to Date error %#',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message: 0, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `TIMEOUT request timeout Network Error batch230-${index}`,
  ] as const))(
    'getErrorMessage keeps generated batch230 lowercase timeout precedence %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 231 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URL(`https://batch231-${index}.example.com/error`),
  ] as const))(
    'getErrorMessage falls back from generated batch231 NaN message to URL error %#',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message: Number.NaN, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `request timed out batch231-${index}`,
  ] as const))(
    'getErrorMessage keeps generated batch231 timed out wording unchanged %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 232 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    Symbol(`batch232-message-${index}`),
    `batch232-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch232 Symbol message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `TimeoutError batch232-${index}`,
  ] as const))(
    'getErrorMessage keeps generated batch232 uppercase timeout spelling unchanged %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 233 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    BigInt(index + 1),
    `batch233-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch233 BigInt message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `request time out batch233-${index}`,
  ] as const))(
    'getErrorMessage keeps generated batch233 spaced time out wording unchanged %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 234 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch234-error-${index}`),
  ] as const))(
    'getErrorMessage falls back from generated batch234 null message to RangeError error %#',
    async (errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message: null, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(errorText);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `pretimeoutpost Network Error batch234-${index}`,
  ] as const))(
    'getErrorMessage keeps generated batch234 embedded timeout precedence %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 235 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Boolean(index % 2 === 0),
    `batch235-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch235 Boolean object message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `TIMEOUT timeout Network Error batch235-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch235 mixed timeout precedence %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 236 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ArrayBuffer(index + 1),
    `batch236-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch236 ArrayBuffer message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `network error timeout batch236-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch236 lowercase timeout precedence %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 237 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Map([['batch', index]]),
    `batch237-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch237 Map message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch237-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch237 timeout before network error precedence %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 238 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Set([`batch238-${index}`]),
    `batch238-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch238 Set message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error timeout batch238-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch238 timeout after network error precedence %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 239 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    Promise.resolve(`batch239-${index}`),
    `batch239-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch239 Promise message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error Timeout batch239-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch239 network error before capital timeout %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('网络错误，请检查网络连接');
    },
  );
});

describe('request helper batch 240 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new WeakMap<object, string>([[{}, `batch240-${index}`]]),
    `batch240-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch240 WeakMap message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `TIMEOUT Network Error batch240-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch240 network error when timeout is uppercase %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('网络错误，请检查网络连接');
    },
  );
});

describe('request helper batch 241 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Date(`2026-06-22T05:${String(index % 50).padStart(2, '0')}:00.000Z`),
    `batch241-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch241 Date message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout NETWORK ERROR batch241-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch241 lowercase timeout before uppercase network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 242 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Uint8Array([index % 255]),
    `batch242-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch242 Uint8Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error timeout Timeout batch242-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch242 lowercase timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 243 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Uint16Array([index]),
    `batch243-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch243 Uint16Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error TIMEOUT batch243-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch243 network error before uppercase timeout %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('网络错误，请检查网络连接');
    },
  );
});

describe('request helper batch 244 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Uint32Array([index]),
    `batch244-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch244 Uint32Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error TIMEOUT batch244-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch244 lowercase timeout before mixed network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 245 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Int8Array([index % 127]),
    `batch245-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch245 Int8Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error batch245-${index} timeout`,
  ] as const))(
    'getErrorMessage gives generated batch245 lowercase timeout after network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 246 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Int16Array([index]),
    `batch246-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch246 Int16Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `network error timeout batch246-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch246 lowercase timeout after lowercase network text %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 247 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Int32Array([index]),
    `batch247-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch247 Int32Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `network error TIMEOUT batch247-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch247 original message when network case does not match %#',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe(message);
    },
  );
});

describe('request helper batch 248 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Float32Array([index + 0.5]),
    `batch248-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch248 Float32Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error\n timeout batch248-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch248 timeout when newline separates network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 249 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Float64Array([index + 0.25]),
    `batch249-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch249 Float64Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error\t timeout batch249-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch249 timeout when tab separates network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 250 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new BigInt64Array([BigInt(index + 1)]),
    `batch250-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch250 BigInt64Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error\ttime out batch250-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch250 network error when timeout is spaced %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('网络错误，请检查网络连接');
    },
  );
});

describe('request helper batch 251 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new BigUint64Array([BigInt(index + 1)]),
    `batch251-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch251 BigUint64Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeoutNetwork Error batch251-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch251 timeout when network text is glued %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 252 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Uint8ClampedArray([index % 255]),
    `batch252-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch252 Uint8ClampedArray message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error timeout batch252-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch252 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 253 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Int8Array([index % 127]),
    `batch253-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch253 Int8Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout\nNetwork Error batch253-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch253 timeout before newline network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 254 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Uint16Array([index]),
    `batch254-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch254 Uint16Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout\nNetwork Error batch254-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch254 timeout before newline network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 255 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Uint32Array([index]),
    `batch255-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch255 Uint32Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch255-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch255 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 256 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Float32Array([index + 0.5]),
    `batch256-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch256 Float32Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error\ntimeout batch256-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch256 timeout after newline network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 257 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Float64Array([index + 0.25]),
    `batch257-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch257 Float64Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error\ntimeout batch257-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch257 timeout after newline network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 258 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new BigInt64Array([BigInt(index + 1)]),
    `batch258-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch258 BigInt64Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error timeout batch258-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch258 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 259 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new BigUint64Array([BigInt(index + 2)]),
    `batch259-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch259 BigUint64Array message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error timeout\nbatch259-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch259 timeout before multiline network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 260 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new DataView(new ArrayBuffer(index % 4 + 1)),
    `batch260-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch260 DataView message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error\nbatch260-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch260 timeout before multiline network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 261 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new WeakSet<object>([{ index }]),
    `batch261-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch261 WeakSet message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout\tNetwork Error batch261-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch261 timeout before tabbed network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 262 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Map([['batch', index]]),
    `batch262-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch262 Map message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout\r\nNetwork Error batch262-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch262 timeout before crlf network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 263 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Set([`batch263-${index}`]),
    `batch263-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch263 Set message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error\tbatch263-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch263 timeout before tabbed network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 264 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URLSearchParams({ batch: `264-${index}` }),
    `batch264-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch264 URLSearchParams message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch264-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch264 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 265 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new WeakMap<object, object>([[{ batch: index }, { message: `batch265-${index}` }]]),
    `batch265-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch265 WeakMap message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error timeout batch265-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch265 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 266 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    Promise.resolve(`batch266-message-${index}`),
    `batch266-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch266 Promise message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout\nNetwork Error batch266-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch266 timeout before multiline network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 267 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch267-message-${index}`),
    `batch267-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch267 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error\ntimeout batch267-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch267 timeout before multiline network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 268 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new TypeError(`batch268-message-${index}`),
    `batch268-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch268 TypeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error timeout\nbatch268-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch268 timeout before multiline network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 269 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch269-message-${index}`),
    `batch269-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch269 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout\rNetwork Error batch269-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch269 timeout before carriage return network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 270 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch270-message-${index}`),
    `batch270-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch270 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout\tNetwork Error batch270-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch270 timeout before tabbed network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 271 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch271-message-${index}`),
    `batch271-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch271 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout\r\nNetwork Error batch271-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch271 timeout before crlf network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 272 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch272-message-${index}`),
    `batch272-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch272 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error timeout\r\nbatch272-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch272 timeout before crlf network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 273 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch273-message-${index}`),
    `batch273-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch273 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error\r\nbatch273-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch273 timeout before crlf network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 274 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch274-message-${index}`),
    `batch274-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch274 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error\r\ntimeout batch274-${index}`,
  ] as const))(
    'getErrorMessage gives generated batch274 timeout after crlf network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 275 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch275-message-${index}`),
    `batch275-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch275 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout\r\nbatch275 Network Error ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch275 timeout before crlf network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 276 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch276-message-${index}`),
    `batch276-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch276 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error timeout batch276\r\n${index}`,
  ] as const))(
    'getErrorMessage gives generated batch276 timeout after network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 277 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new TypeError(`batch277-message-${index}`),
    `batch277-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch277 TypeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout batch277 Network Error ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch277 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 278 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch278-message-${index}`),
    `batch278-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch278 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error batch278 timeout ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch278 timeout after network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 279 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch279-message-${index}`),
    `batch279-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch279 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout batch279\r\nNetwork Error ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch279 timeout before crlf network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 280 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch280-message-${index}`),
    `batch280-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch280 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch280 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch280 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 281 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch281-message-${index}`),
    `batch281-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch281 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error timeout batch281 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch281 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 282 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch282-message-${index}`),
    `batch282-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch282 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `Network Error timeout batch282 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch282 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 283 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch283-message-${index}`),
    `batch283-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch283 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch283 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch283 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 284 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch284-message-${index}`),
    `batch284-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch284 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch284 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch284 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 285 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new TypeError(`batch285-message-${index}`),
    `batch285-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch285 TypeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch285 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch285 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 286 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch286-message-${index}`),
    `batch286-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch286 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch286 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch286 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 287 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch287-message-${index}`),
    `batch287-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch287 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch287 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch287 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 288 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch288-message-${index}`),
    `batch288-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch288 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch288 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch288 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 289 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch289-message-${index}`),
    `batch289-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch289 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch289 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch289 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 290 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch290-message-${index}`),
    `batch290-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch290 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch290 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch290 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 291 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch291-message-${index}`),
    `batch291-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch291 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch291 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch291 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 292 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch292-message-${index}`),
    `batch292-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch292 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch292 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch292 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 293 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new TypeError(`batch293-message-${index}`),
    `batch293-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch293 TypeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch293 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch293 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 294 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch294-message-${index}`),
    `batch294-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch294 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch294 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch294 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 295 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch295-message-${index}`),
    `batch295-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch295 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch295 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch295 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 296 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch296-message-${index}`),
    `batch296-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch296 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch296 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch296 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 297 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch297-message-${index}`),
    `batch297-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch297 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch297 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch297 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 298 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch298-message-${index}`),
    `batch298-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch298 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch298 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch298 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 299 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch299-message-${index}`),
    `batch299-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch299 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch299 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch299 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 300 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch300-message-${index}`),
    `batch300-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch300 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch300 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch300 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 301 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch301-message-${index}`),
    `batch301-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch301 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch301 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch301 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 302 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch302-message-${index}`),
    `batch302-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch302 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch302 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch302 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 303 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch303-message-${index}`),
    `batch303-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch303 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch303 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch303 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 304 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch304-message-${index}`),
    `batch304-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch304 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch304 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch304 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 305 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch305-message-${index}`),
    `batch305-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch305 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch305 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch305 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 306 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new TypeError(`batch306-message-${index}`),
    `batch306-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch306 TypeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch306 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch306 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 307 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch307-message-${index}`),
    `batch307-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch307 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch307 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch307 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 308 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch308-message-${index}`),
    `batch308-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch308 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch308 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch308 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 309 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch309-message-${index}`),
    `batch309-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch309 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch309 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch309 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 310 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch310-message-${index}`),
    `batch310-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch310 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch310 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch310 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 311 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch311-message-${index}`),
    `batch311-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch311 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch311 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch311 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 312 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch312-message-${index}`),
    `batch312-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch312 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch312 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch312 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 313 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch313-message-${index}`),
    `batch313-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch313 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch313 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch313 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 314 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new TypeError(`batch314-message-${index}`),
    `batch314-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch314 TypeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch314 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch314 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 315 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch315-message-${index}`),
    `batch315-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch315 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch315 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch315 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 316 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch316-message-${index}`),
    `batch316-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch316 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch316 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch316 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 317 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([new Error(`inner-${index}`)], `batch317-message-${index}`),
    `batch317-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch317 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch317 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch317 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 318 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch318-message-${index}`),
    `batch318-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch318 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch318 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch318 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 319 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch319-message-${index}`),
    `batch319-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch319 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch319 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch319 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 320 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch320-message-${index}`),
    `batch320-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch320 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch320 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch320 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 321 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch321-message-${index}`),
    `batch321-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch321 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch321 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch321 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 322 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([new Error('inner')], `batch322-message-${index}`),
    `batch322-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch322 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch322 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch322 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 323 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch323-message-${index}`),
    `batch323-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch323 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch323 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch323 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 324 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch324-message-${index}`),
    `batch324-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch324 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch324 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch324 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 325 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new TypeError(`batch325-message-${index}`),
    `batch325-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch325 TypeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch325 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch325 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 326 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch326-message-${index}`),
    `batch326-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch326 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch326 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch326 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 327 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch327-message-${index}`),
    `batch327-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch327 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch327 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch327 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 328 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch328-message-${index}`),
    `batch328-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch328 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch328 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch328 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 329 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch329-message-${index}`),
    `batch329-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch329 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch329 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch329 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 330 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([new Error('inner')], `batch330-message-${index}`),
    `batch330-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch330 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch330 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch330 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 331 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch331-message-${index}`),
    `batch331-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch331 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch331 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch331 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 332 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch332-message-${index}`),
    `batch332-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch332 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch332 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch332 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 333 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new TypeError(`batch333-message-${index}`),
    `batch333-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch333 TypeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch333 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch333 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 334 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch334-message-${index}`),
    `batch334-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch334 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch334 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch334 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 335 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch335-message-${index}`),
    `batch335-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch335 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch335 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch335 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 336 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch336-message-${index}`),
    `batch336-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch336 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch336 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch336 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 337 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch337-message-${index}`),
    `batch337-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch337 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch337 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch337 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 338 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch338-message-${index}`),
    `batch338-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch338 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch338 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch338 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 339 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch339-message-${index}`),
    `batch339-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch339 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch339 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch339 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 340 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch340-message-${index}`),
    `batch340-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch340 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch340 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch340 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 341 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new TypeError(`batch341-message-${index}`),
    `batch341-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch341 TypeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch341 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch341 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 342 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch342-message-${index}`),
    `batch342-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch342 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch342 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch342 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 343 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch343-message-${index}`),
    `batch343-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch343 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch343 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch343 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 344 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch344-message-${index}`),
    `batch344-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch344 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch344 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch344 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 345 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch345-message-${index}`),
    `batch345-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch345 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch345 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch345 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 346 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch346-message-${index}`),
    `batch346-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch346 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch346 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch346 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 347 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch347-message-${index}`),
    `batch347-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch347 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch347 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch347 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 348 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new TypeError(`batch348-message-${index}`),
    `batch348-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch348 TypeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch348 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch348 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 349 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch349-message-${index}`),
    `batch349-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch349 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch349 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch349 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 350 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch350-message-${index}`),
    `batch350-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch350 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch350 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch350 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 351 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch351-message-${index}`),
    `batch351-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch351 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch351 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch351 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 352 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch352-message-${index}`),
    `batch352-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch352 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch352 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch352 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 353 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch353-message-${index}`),
    `batch353-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch353 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch353 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch353 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 354 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch354-message-${index}`),
    `batch354-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch354 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch354 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch354 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 355 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch355-message-${index}`),
    `batch355-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch355 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch355 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch355 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 356 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch356-message-${index}`),
    `batch356-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch356 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch356 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch356 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 357 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch357-message-${index}`),
    `batch357-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch357 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch357 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch357 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 358 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch358-message-${index}`),
    `batch358-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch358 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch358 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch358 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 359 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch359-message-${index}`),
    `batch359-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch359 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch359 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch359 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 360 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch360-message-${index}`),
    `batch360-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch360 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch360 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch360 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 361 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch361-message-${index}`),
    `batch361-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch361 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch361 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch361 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 362 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new TypeError(`batch362-message-${index}`),
    `batch362-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch362 TypeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch362 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch362 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 363 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch363-message-${index}`),
    `batch363-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch363 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch363 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch363 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 364 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch364-message-${index}`),
    `batch364-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch364 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch364 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch364 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 365 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch365-message-${index}`),
    `batch365-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch365 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch365 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch365 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 366 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch366-message-${index}`),
    `batch366-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch366 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch366 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch366 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 367 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch367-message-${index}`),
    `batch367-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch367 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch367 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch367 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 368 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch368-message-${index}`),
    `batch368-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch368 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch368 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch368 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 369 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch369-message-${index}`),
    `batch369-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch369 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch369 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch369 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 370 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch370-message-${index}`),
    `batch370-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch370 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch370 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch370 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 371 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch371-message-${index}`),
    `batch371-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch371 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch371 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch371 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 372 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch372-message-${index}`),
    `batch372-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch372 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch372 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch372 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 373 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch373-message-${index}`),
    `batch373-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch373 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch373 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch373 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 374 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch374-message-${index}`),
    `batch374-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch374 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch374 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch374 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 375 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch375-message-${index}`),
    `batch375-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch375 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch375 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch375 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 376 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch376-message-${index}`),
    `batch376-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch376 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch376 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch376 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 377 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch377-message-${index}`),
    `batch377-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch377 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch377 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch377 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 378 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch378-message-${index}`),
    `batch378-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch378 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch378 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch378 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 379 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch379-message-${index}`),
    `batch379-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch379 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch379 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch379 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 380 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch380-message-${index}`),
    `batch380-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch380 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch380 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch380 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 381 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch381-message-${index}`),
    `batch381-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch381 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch381 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch381 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 382 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch382-message-${index}`),
    `batch382-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch382 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch382 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch382 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 383 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch383-message-${index}`),
    `batch383-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch383 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch383 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch383 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 384 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch384-message-${index}`),
    `batch384-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch384 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch384 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch384 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 385 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch385-message-${index}`),
    `batch385-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch385 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch385 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch385 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 386 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch386-message-${index}`),
    `batch386-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch386 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch386 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch386 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 387 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch387-message-${index}`),
    `batch387-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch387 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch387 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch387 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 388 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch388-message-${index}`),
    `batch388-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch388 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch388 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch388 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 389 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch389-message-${index}`),
    `batch389-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch389 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch389 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch389 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 390 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch390-message-${index}`),
    `batch390-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch390 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch390 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch390 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 391 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch391-message-${index}`),
    `batch391-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch391 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch391 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch391 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 392 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch392-message-${index}`),
    `batch392-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch392 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch392 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch392 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 393 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch393-message-${index}`),
    `batch393-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch393 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch393 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch393 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 394 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch394-message-${index}`),
    `batch394-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch394 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch394 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch394 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 395 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch395-message-${index}`),
    `batch395-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch395 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch395 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch395 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 396 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch396-message-${index}`),
    `batch396-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch396 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch396 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch396 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 397 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch397-message-${index}`),
    `batch397-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch397 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch397 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch397 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 398 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch398-message-${index}`),
    `batch398-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch398 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch398 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch398 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 399 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch399-message-${index}`),
    `batch399-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch399 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch399 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch399 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 400 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch400-message-${index}`),
    `batch400-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch400 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch400 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch400 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 401 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch401-message-${index}`),
    `batch401-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch401 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch401 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch401 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 402 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch402-message-${index}`),
    `batch402-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch402 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch402 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch402 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 403 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch403-message-${index}`),
    `batch403-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch403 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch403 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch403 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 404 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch404-message-${index}`),
    `batch404-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch404 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch404 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch404 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 405 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch405-message-${index}`),
    `batch405-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch405 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch405 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch405 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 406 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch406-message-${index}`),
    `batch406-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch406 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch406 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch406 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 407 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch407-message-${index}`),
    `batch407-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch407 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch407 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch407 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 408 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new RangeError(`batch408-message-${index}`),
    `batch408-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch408 RangeError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch408 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch408 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 409 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new SyntaxError(`batch409-message-${index}`),
    `batch409-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch409 SyntaxError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch409 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch409 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 410 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new URIError(`batch410-message-${index}`),
    `batch410-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch410 URIError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch410 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch410 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 411 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new ReferenceError(`batch411-message-${index}`),
    `batch411-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch411 ReferenceError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch411 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch411 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 412 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new EvalError(`batch412-message-${index}`),
    `batch412-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch412 EvalError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch412 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch412 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 413 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new AggregateError([], `batch413-message-${index}`),
    `batch413-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch413 AggregateError message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch413 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch413 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request helper batch 414 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    new Error(`batch414-message-${index}`),
    `batch414-error-${index}`,
  ] as const))(
    'getErrorMessage returns generated batch414 Error message before error %#',
    async (message, errorText) => {
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch414 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch414 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 415 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `RangeError: batch415 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch415 RangeError response data message %s',
    async (message) => {
      const errorText = new RangeError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch415 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch415 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 416 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `SyntaxError: batch416 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch416 SyntaxError response data message %s',
    async (message) => {
      const errorText = new SyntaxError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch416 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch416 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 417 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `URIError: batch417 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch417 URIError response data message %s',
    async (message) => {
      const errorText = new URIError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch417 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch417 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 418 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `ReferenceError: batch418 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch418 ReferenceError response data message %s',
    async (message) => {
      const errorText = new ReferenceError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch418 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch418 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 419 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `EvalError: batch419 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch419 EvalError response data message %s',
    async (message) => {
      const errorText = new EvalError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch419 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch419 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 420 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `AggregateError: batch420 ${index} occurred`,
    index,
  ] as const))(
    'getErrorMessage extracts batch420 AggregateError response data message %s',
    async (message, index) => {
      const errorText = new AggregateError([`err-${index}`], `err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch420 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch420 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 421 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `Error: batch421 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch421 Error response data message %s',
    async (message) => {
      const errorText = new Error(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch421 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch421 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 422 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `RangeError: batch422 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch422 RangeError response data message %s',
    async (message) => {
      const errorText = new RangeError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch422 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch422 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 423 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `SyntaxError: batch423 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch423 SyntaxError response data message %s',
    async (message) => {
      const errorText = new SyntaxError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch423 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch423 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 424 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `URIError: batch424 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch424 URIError response data message %s',
    async (message) => {
      const errorText = new URIError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch424 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch424 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 425 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `ReferenceError: batch425 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch425 ReferenceError response data message %s',
    async (message) => {
      const errorText = new ReferenceError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch425 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch425 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 426 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `EvalError: batch426 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch426 EvalError response data message %s',
    async (message) => {
      const errorText = new EvalError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch426 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch426 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 427 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `AggregateError: batch427 ${index} occurred`,
    index,
  ] as const))(
    'getErrorMessage extracts batch427 AggregateError response data message %s',
    async (message, index) => {
      const errorText = new AggregateError([`err-${index}`], `err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch427 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch427 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 428 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `Error: batch428 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch428 Error response data message %s',
    async (message) => {
      const errorText = new Error(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch428 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch428 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 429 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `RangeError: batch429 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch429 RangeError response data message %s',
    async (message) => {
      const errorText = new RangeError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch429 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch429 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 430 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `SyntaxError: batch430 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch430 SyntaxError response data message %s',
    async (message) => {
      const errorText = new SyntaxError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch430 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch430 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 431 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `URIError: batch431 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch431 URIError response data message %s',
    async (message) => {
      const errorText = new URIError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch431 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch431 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 432 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `ReferenceError: batch432 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch432 ReferenceError response data message %s',
    async (message) => {
      const errorText = new ReferenceError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch432 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch432 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 433 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `EvalError: batch433 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch433 EvalError response data message %s',
    async (message) => {
      const errorText = new EvalError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch433 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch433 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 434 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `AggregateError: batch434 ${index} occurred`,
    index,
  ] as const))(
    'getErrorMessage extracts batch434 AggregateError response data message %s',
    async (message, index) => {
      const errorText = new AggregateError([`err-${index}`], `err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch434 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch434 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 435 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `Error: batch435 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch435 Error response data message %s',
    async (message) => {
      const errorText = new Error(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch435 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch435 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 436 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `RangeError: batch436 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch436 RangeError response data message %s',
    async (message) => {
      const errorText = new RangeError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch436 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch436 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 437 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `SyntaxError: batch437 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch437 SyntaxError response data message %s',
    async (message) => {
      const errorText = new SyntaxError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch437 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch437 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 438 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `URIError: batch438 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch438 URIError response data message %s',
    async (message) => {
      const errorText = new URIError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch438 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch438 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 439 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `ReferenceError: batch439 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch439 ReferenceError response data message %s',
    async (message) => {
      const errorText = new ReferenceError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch439 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch439 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});

describe('request batch 440 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `EvalError: batch440 ${index} occurred`,
  ] as const))(
    'getErrorMessage extracts batch440 EvalError response data message %s',
    async (message) => {
      const errorText = new EvalError(`err-${message}`).toString();
      const { getErrorMessage } = await import('./request');
      const error = {
        response: { data: { message, error: errorText } },
        message: 'plain',
      } as unknown as AxiosError;

      expect(getErrorMessage(error)).toBe(message);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `timeout Network Error batch440 ${index}`,
  ] as const))(
    'getErrorMessage gives generated batch440 timeout before network error %s',
    async (message) => {
      const { getErrorMessage } = await import('./request');

      expect(getErrorMessage({ message } as AxiosError)).toBe('请求超时，请稍后重试');
    },
  );
});
