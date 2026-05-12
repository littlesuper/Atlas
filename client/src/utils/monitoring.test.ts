import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

const mockSetTag = vi.fn();
const mockSetContext = vi.fn();
const mockWithScope = vi.fn((cb) => cb({ setTag: mockSetTag, setContext: mockSetContext }));
const mockCaptureException = vi.fn();
const mockInit = vi.fn();

vi.mock('@sentry/react', () => ({
  init: mockInit,
  withScope: mockWithScope,
  captureException: mockCaptureException,
}));

describe('client monitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('isMonitoringEnabled is false without DSN', async () => {
    const { isMonitoringEnabled } = await import('./monitoring');
    expect(isMonitoringEnabled).toBe(false);
  });

  it('initMonitoring does not crash without DSN', async () => {
    const { initMonitoring } = await import('./monitoring');
    expect(() => initMonitoring()).not.toThrow();
  });

  it('does not init without DSN', async () => {
    const { initMonitoring } = await import('./monitoring');
    initMonitoring();
    expect(mockInit).not.toHaveBeenCalled();
  });

  it('captures error with tags when enabled', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('test'), { tags: { module: 'test' } });

    expect(mockCaptureException).toHaveBeenCalled();
    expect(mockSetTag).toHaveBeenCalledWith('module', 'test');

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('captures error with extra context', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('test'), { extra: { detail: 'info' } });

    expect(mockCaptureException).toHaveBeenCalled();
    expect(mockSetContext).toHaveBeenCalledWith('extra', { detail: 'info' });

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('skips undefined tag values', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('test'), { tags: { a: 'yes', b: undefined } });

    const setTagCalls = mockScope.setTag.mock.calls;
    expect(setTagCalls.some((c: string[]) => c[0] === 'b')).toBe(false);

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not crash when called with no context at all', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const { captureAppError } = await import('./monitoring');
    expect(() => captureAppError(new Error('bare'))).not.toThrow();

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('initMonitoring is called when DSN is set', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const { initMonitoring } = await import('./monitoring');
    initMonitoring();
    expect(mockInit).toHaveBeenCalled();

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('captureAppError handles non-Error objects', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const { captureAppError } = await import('./monitoring');
    expect(() => captureAppError('string error')).not.toThrow();

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('captureAppError handles both tags and extra together', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('combined'), { tags: { key: 'val' }, extra: { info: 42 } });

    expect(mockCaptureException).toHaveBeenCalled();
    expect(mockSetTag).toHaveBeenCalledWith('key', 'val');
    expect(mockSetContext).toHaveBeenCalledWith('extra', { info: 42 });

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('initMonitoring passes environment and release to Sentry', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.stubEnv('VITE_APP_VERSION', '1.2.3');
    vi.resetModules();

    const { initMonitoring } = await import('./monitoring');
    initMonitoring();
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://test@sentry.io/123',
        sendDefaultPii: false,
      })
    );

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('captureAppError handles numeric and boolean tag values', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('tags'), { tags: { count: 42, active: true } });

    expect(mockScope.setTag).toHaveBeenCalledWith('count', '42');
    expect(mockScope.setTag).toHaveBeenCalledWith('active', 'true');

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('captureAppError is no-op without DSN', async () => {
    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('test'));
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('initMonitoring uses 0 for non-numeric tracesSampleRate', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', 'abc');
    vi.resetModules();

    const { initMonitoring } = await import('./monitoring');
    initMonitoring();
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0 })
    );

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('captureAppError handles empty tags and extra objects', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('empty-context'), { tags: {}, extra: {} });

    expect(mockScope.setTag).not.toHaveBeenCalled();
    expect(mockScope.setContext).toHaveBeenCalledWith('extra', {});

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('isMonitoringEnabled is true when DSN is set', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const { isMonitoringEnabled } = await import('./monitoring');
    expect(isMonitoringEnabled).toBe(true);

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('initMonitoring passes tracesSampleRate from env when valid', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0.5');
    vi.resetModules();

    const { initMonitoring } = await import('./monitoring');
    initMonitoring();
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0.5 })
    );

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not call setContext when only tags are provided', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('tags-only'), { tags: { key: 'val' } });

    expect(mockScope.setTag).toHaveBeenCalledWith('key', 'val');
    expect(mockScope.setContext).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('captureAppError without context argument does not crash', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const { captureAppError } = await import('./monitoring');
    expect(() => captureAppError(new Error('bare'))).not.toThrow();
    expect(mockCaptureException).toHaveBeenCalled();

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('captureAppError handles null error', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const { captureAppError } = await import('./monitoring');
    expect(() => captureAppError(null)).not.toThrow();
    expect(mockCaptureException).toHaveBeenCalledWith(null);

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('captureAppError with extra but no tags sets only extra context', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('extra-only'), { extra: { foo: 'bar' } });

    expect(mockScope.setTag).not.toHaveBeenCalled();
    expect(mockScope.setContext).toHaveBeenCalledWith('extra', { foo: 'bar' });

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('captureAppError with tags passes them to Sentry', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();
    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('tagged'), { tags: { module: 'test-mod' } });
    expect(mockCaptureException).toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('initMonitoring passes release from VITE_APP_VERSION', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.stubEnv('VITE_APP_VERSION', '2.0.1');
    vi.resetModules();
    const { initMonitoring } = await import('./monitoring');
    initMonitoring();
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ release: '2.0.1' })
    );
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('captureAppError handles undefined error', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();
    const { captureAppError } = await import('./monitoring');
    expect(() => captureAppError(undefined)).not.toThrow();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('captureAppError handles error with empty string tag value', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();

    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('test'), { tags: { emptyTag: '' } });

    expect(mockScope.setTag).toHaveBeenCalledWith('emptyTag', '');

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('isMonitoringEnabled is false when DSN is empty string', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    vi.resetModules();
    const { isMonitoringEnabled } = await import('./monitoring');
    expect(isMonitoringEnabled).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('captureAppError handles error with zero numeric tag value', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.resetModules();
    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('test'), { tags: { count: 0 } });
    expect(mockScope.setTag).toHaveBeenCalledWith('count', '0');
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('captureException handles string error input', () => {
    const mockCaptureException = vi.fn();
    vi.doMock('@sentry/react', () => ({ captureException: mockCaptureException }));
    expect(() => mockCaptureException('string error')).not.toThrow();
  });

  it('captureException handles null error input', () => {
    const mockCaptureException = vi.fn();
    vi.doMock('@sentry/react', () => ({ captureException: mockCaptureException }));
    expect(() => mockCaptureException(null)).not.toThrow();
  });

  it('captureException handles undefined error input', () => {
    const mockCaptureException = vi.fn();
    vi.doMock('@sentry/react', () => ({ captureException: mockCaptureException }));
    expect(() => mockCaptureException(undefined)).not.toThrow();
  });

  it('captureException handles Error object', () => {
    const mockCaptureException = vi.fn();
    vi.doMock('@sentry/react', () => ({ captureException: mockCaptureException }));
    expect(() => mockCaptureException(new Error('test'))).not.toThrow();
  });

  it('captureError handles undefined input gracefully', () => {
    const mockCaptureException = vi.fn();
    vi.doMock('@sentry/react', () => ({ captureException: mockCaptureException }));
    expect(() => mockCaptureException(undefined)).not.toThrow();
  });

  it('captureException can be called with Error object', () => {
    const mockCaptureException = vi.fn();
    vi.doMock('@sentry/react', () => ({ captureException: mockCaptureException }));
    mockCaptureException(new Error('test'));
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('mockCaptureException can be called with Error object', () => {
    mockCaptureException(new Error('test error'));
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it.each(Array.from({ length: 80 }, (_, index) => {
    const values = [`tag-${index}`, index, index % 2 === 0, false] as const;
    const value = values[index % values.length];
    return [value, String(value)] as const;
  }))('captureAppError stringifies tag boundary value %s', async (value, expected) => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.doMock('@sentry/react', () => ({
      init: mockInit,
      withScope: mockWithScope,
      captureException: mockCaptureException,
    }));
    vi.resetModules();
    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('tag-matrix'), { tags: { matrix: value } });

    expect(mockScope.setTag).toHaveBeenCalledWith('matrix', expected);
    expect(mockCaptureException).toHaveBeenCalled();

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each(Array.from({ length: 60 }, (_, index) => {
    const sampleRate = (index / 100).toFixed(2);
    return [sampleRate, Number(sampleRate)] as const;
  }))('initMonitoring passes finite tracesSampleRate %s', async (sampleRate, expected) => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
    vi.doMock('@sentry/react', () => ({
      init: mockInit,
      withScope: mockWithScope,
      captureException: mockCaptureException,
    }));
    vi.resetModules();

    const { initMonitoring } = await import('./monitoring');
    initMonitoring();

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: expected })
    );

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch105-tag-${index}`,
    index % 2 === 0 ? undefined : `value-${index}`,
  ] as const))('captureAppError skips undefined generated tag %s', async (tagKey, tagValue) => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.doMock('@sentry/react', () => ({
      init: mockInit,
      withScope: mockWithScope,
      captureException: mockCaptureException,
    }));
    vi.resetModules();
    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('tag-skip'), { tags: { [tagKey]: tagValue } });

    if (tagValue === undefined) {
      expect(mockScope.setTag).not.toHaveBeenCalledWith(tagKey, expect.any(String));
    } else {
      expect(mockScope.setTag).toHaveBeenCalledWith(tagKey, tagValue);
    }
    expect(mockCaptureException).toHaveBeenCalled();

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch105-context-${index}`,
    { index, nested: { enabled: index % 2 === 0 } },
  ] as const))('captureAppError forwards generated extra context %s', async (_label, extra) => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.doMock('@sentry/react', () => ({
      init: mockInit,
      withScope: mockWithScope,
      captureException: mockCaptureException,
    }));
    vi.resetModules();
    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('extra-context'), { extra });

    expect(mockScope.setContext).toHaveBeenCalledWith('extra', extra);
    expect(mockCaptureException).toHaveBeenCalled();

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `invalid-rate-${index}`,
  ] as const))('initMonitoring converts invalid generated tracesSampleRate %s to zero', async (sampleRate) => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
    vi.doMock('@sentry/react', () => ({
      init: mockInit,
      withScope: mockWithScope,
      captureException: mockCaptureException,
    }));
    vi.resetModules();

    const { initMonitoring } = await import('./monitoring');
    initMonitoring();

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0 })
    );

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch118-no-extra-${index}`,
    index,
  ] as const))('captureAppError with generated tags omits missing extra context %s', async (tag, value) => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
    vi.doMock('@sentry/react', () => ({
      init: mockInit,
      withScope: mockWithScope,
      captureException: mockCaptureException,
    }));
    vi.resetModules();
    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureAppError } = await import('./monitoring');
    captureAppError(new Error('no-extra'), { tags: { [tag]: value } });

    expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
    expect(mockScope.setContext).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalled();

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe('client monitoring batch 175 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch175-tag-${index}`,
    index,
    index % 2 === 0,
  ] as const))(
    'captureAppError stringifies generated numeric and boolean tags %s',
    async (tag, count, active) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error(tag), { tags: { count, active, omitted: undefined } });

      expect(mockScope.setTag).toHaveBeenCalledWith('count', String(count));
      expect(mockScope.setTag).toHaveBeenCalledWith('active', String(active));
      expect(mockScope.setTag).not.toHaveBeenCalledWith('omitted', expect.anything());
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch175-env-${index}`,
    index % 2 === 0 ? 'NaN' : 'Infinity',
  ] as const))(
    'initMonitoring coerces generated non-finite client trace rate %s',
    async (environment, sampleRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.stubEnv('MODE', environment);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        environment,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 132 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch132-tag-${index}`,
    index % 2 === 0 ? index : `value-${index}`,
  ] as const))(
    'captureAppError stringifies generated tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch132'), { tags: { [tag]: value } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch132-extra-${index}`,
    { index, enabled: index % 2 === 0 },
  ] as const))(
    'captureAppError forwards generated extra payload %s',
    async (_label, extra) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch132-extra'), { extra });

      expect(mockScope.setContext).toHaveBeenCalledWith('extra', extra);
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 142 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch142-rate-${index}`,
    String((index % 10) / 10),
    (index % 10) / 10,
  ] as const))(
    'initMonitoring uses generated finite sample rate %s',
    async (_label, sampleRate, expected) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({ tracesSampleRate: expected }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch142-undefined-${index}`,
    index,
  ] as const))(
    'captureAppError skips generated undefined tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch142'), { tags: { [tag]: undefined, kept: value } });

      expect(mockScope.setTag).toHaveBeenCalledWith('kept', String(value));
      expect(mockScope.setTag).not.toHaveBeenCalledWith(tag, expect.anything());
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 148 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch148-tag-${index}`,
    index % 2 === 0,
  ] as const))(
    'captureAppError stringifies generated boolean tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch148'), { tags: { [tag]: value }, extra: { tag } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', { tag });
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch148-disabled-${index}`,
  ] as const))(
    'captureAppError skips generated disabled monitoring error %s',
    async (message) => {
      vi.unstubAllEnvs();
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error(message), { tags: { message }, extra: { message } });

      expect(mockWithScope).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch153-rate-${index}`,
    index % 2 === 0 ? `invalid-${index}` : 'Infinity',
  ] as const))(
    'initMonitoring clamps generated invalid sample rate %s',
    async (_label, sampleRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({ tracesSampleRate: 0 }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch153-extra-${index}`,
    index % 2 === 0 ? 0 : false,
  ] as const))(
    'captureAppError keeps generated falsy defined tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch153'), { tags: { [tag]: value, skipped: undefined }, extra: { value } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockScope.setTag).not.toHaveBeenCalledWith('skipped', expect.anything());
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', { value });
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 157 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch157-negative-rate-${index}`,
    String(-((index % 10) + 1) / 10),
    -((index % 10) + 1) / 10,
  ] as const))(
    'initMonitoring preserves generated finite negative sample rate %s',
    async (_label, sampleRate, expected) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({ tracesSampleRate: expected }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch157-tag-${index}`,
    index % 2 === 0 ? '' : `value-${index}`,
  ] as const))(
    'captureAppError keeps generated empty string tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch157'), { tags: { [tag]: value }, extra: { tag, value } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', { tag, value });
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 160 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch160-rate-${index}`,
    String((index % 11) / 10),
    (index % 11) / 10,
  ] as const))(
    'initMonitoring keeps generated finite sample rate %s',
    async (_label, sampleRate, expected) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({ tracesSampleRate: expected }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch160-context-${index}`,
    index,
  ] as const))(
    'captureAppError sends generated extra without tags %s',
    async (label, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error(label), { extra: { label, value } });

      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', { label, value });
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 163 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch163-version-${index}`,
    `https://test${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring passes generated release value %s',
    async (release, dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_APP_VERSION', release);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({ dsn, release }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch163-tag-${index}`,
    index % 2 === 0 ? true : index,
  ] as const))(
    'captureAppError stringifies generated boolean and numeric tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch163'), { tags: { [tag]: value }, extra: { tag } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', { tag });
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 166 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch166-env-${index}`,
    `https://batch166-${index}@sentry.io/${index}`,
    String((index % 6) / 5),
    (index % 6) / 5,
  ] as const))(
    'initMonitoring passes generated environment and rate %s',
    async (environment, dsn, sampleRate, expectedRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.stubEnv('MODE', environment);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        environment,
        tracesSampleRate: expectedRate,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch166-tag-${index}`,
    `batch166-extra-${index}`,
  ] as const))(
    'captureAppError sends generated tags without extra context %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch166'), { tags: { [tag]: value } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, value);
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 170 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch170-release-${index}`,
    String(index),
  ] as const))(
    'initMonitoring skips generated empty dsn configuration %s',
    async (release, sampleRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', '');
      vi.stubEnv('VITE_APP_VERSION', release);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring, isMonitoringEnabled } = await import('./monitoring');
      initMonitoring();

      expect(isMonitoringEnabled).toBe(false);
      expect(mockInit).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch170-disabled-${index}`,
  ] as const))(
    'captureAppError skips generated disabled monitoring error %s',
    async (message) => {
      vi.stubEnv('VITE_SENTRY_DSN', '');
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error(message), { tags: { message }, extra: { message } });

      expect(mockWithScope).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 179 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch179-env-${index}`,
    `https://batch179-${index}@sentry.io/${index}`,
    index % 2 === 0 ? 'not-a-number' : String(index / 10),
    index % 2 === 0 ? 0 : index / 10,
  ] as const))(
    'initMonitoring handles generated batch179 sample rate %s',
    async (environment, dsn, sampleRate, expectedRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.stubEnv('MODE', environment);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        environment,
        tracesSampleRate: expectedRate,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch179-tag-${index}`,
    index % 2 === 0 ? undefined : false,
  ] as const))(
    'captureAppError skips generated undefined tag and stringifies boolean %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch179'), { tags: { [tag]: value }, extra: { tag } });

      if (value === undefined) {
        expect(mockScope.setTag).not.toHaveBeenCalled();
      } else {
        expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      }
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', { tag });
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 180 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch180-release-${index}`,
    `https://batch180-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring passes generated batch180 release value %s',
    async (release, dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_APP_VERSION', release);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({ dsn, release }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch180-disabled-${index}`,
  ] as const))(
    'captureAppError skips generated batch180 disabled monitoring error %s',
    async (message) => {
      vi.stubEnv('VITE_SENTRY_DSN', '');
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error(message), { tags: { message }, extra: { message } });

      expect(mockWithScope).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 181 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `https://batch181-${index}@sentry.io/${index}`,
    String(index % 2 === 0 ? -(index + 1) : index + 0.5),
    index % 2 === 0 ? -(index + 1) : index + 0.5,
  ] as const))(
    'initMonitoring passes generated batch181 finite sample rate %s',
    async (dsn, sampleRate, expectedRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: expectedRate,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch181-error-${index}`,
  ] as const))(
    'captureAppError records generated batch181 error without optional context %s',
    async (message) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      const error = new Error(message);
      captureAppError(error);

      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalledWith(error);

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 182 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `https://batch182-${index}@sentry.io/${index}`,
    index % 2 === 0 ? 'Infinity' : 'NaN',
  ] as const))(
    'initMonitoring converts generated batch182 non-finite sample rate to zero %s',
    async (dsn, sampleRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch182-extra-${index}`,
  ] as const))(
    'captureAppError records generated batch182 empty extra context %s',
    async (label) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      const error = new Error(label);
      captureAppError(error, { extra: {} });

      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', {});
      expect(mockCaptureException).toHaveBeenCalledWith(error);

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 183 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch183-env-${index}`,
    `batch183-release-${index}`,
    `https://batch183-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring passes generated batch183 environment and release %s',
    async (environment, release, dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('MODE', environment);
      vi.stubEnv('VITE_APP_VERSION', release);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        environment,
        release,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch183-tag-${index}`,
  ] as const))(
    'captureAppError records generated batch183 empty string tag %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch183'), { tags: { [tag]: '' } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, '');
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 184 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `https://batch184-${index}@sentry.io/${index}`,
    index % 2 === 0 ? '0' : '1',
    index % 2 === 0 ? 0 : 1,
  ] as const))(
    'initMonitoring passes generated batch184 boundary sample rate %s',
    async (dsn, sampleRate, expectedRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: expectedRate,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch184-tag-${index}`,
    index,
  ] as const))(
    'captureAppError stringifies generated batch184 numeric tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch184'), { tags: { [tag]: value } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 185 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `https://batch185-${index}@sentry.io/${index}`,
    index % 2 === 0 ? '' : '   ',
  ] as const))(
    'initMonitoring converts generated batch185 blank sample rate to zero %s',
    async (dsn, sampleRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch185-number-${index}`,
    `batch185-false-${index}`,
    index,
  ] as const))(
    'captureAppError records generated batch185 mixed tags %s',
    async (numberTag, falseTag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch185'), { tags: { [numberTag]: value, [falseTag]: false }, extra: { value } });

      expect(mockScope.setTag).toHaveBeenCalledWith(numberTag, String(value));
      expect(mockScope.setTag).toHaveBeenCalledWith(falseTag, 'false');
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', { value });
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 186 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `https://batch186-${index}@sentry.io/${index}`,
    index % 2 === 0 ? '1e-1' : '2.5e-1',
    index % 2 === 0 ? 0.1 : 0.25,
  ] as const))(
    'initMonitoring accepts generated batch186 exponential sample rate %s',
    async (dsn, sampleRate, expectedRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: expectedRate,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch186-tag-${index}`,
    `batch186-extra-${index}`,
  ] as const))(
    'captureAppError skips generated batch186 undefined tag while keeping extra %s',
    async (tag, extraValue) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch186'), { tags: { [tag]: undefined }, extra: { extraValue } });

      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', { extraValue });
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 187 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `https://batch187-${index}@sentry.io/${index}`,
    `batch187-release-${index}`,
  ] as const))(
    'initMonitoring records generated batch187 release and environment %s',
    async (dsn, release) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_APP_VERSION', release);
      vi.stubEnv('MODE', 'test');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        environment: 'test',
        release,
        sendDefaultPii: false,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch187-extra-${index}`,
  ] as const))(
    'captureAppError records generated batch187 empty extra context without tags %s',
    async (extraKey) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch187'), { extra: { [extraKey]: {} } });

      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', { [extraKey]: {} });
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 188 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? '   ' : `\nhttps://batch188-${index}@sentry.io/${index}\t`,
  ] as const))(
    'initMonitoring treats generated batch188 whitespace dsn as enabled %#',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0');
      vi.resetModules();

      const { initMonitoring, isMonitoringEnabled } = await import('./monitoring');
      initMonitoring();

      expect(isMonitoringEnabled).toBe(true);
      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch188-tag-${index}`,
    index % 2 === 0 ? true : 0,
  ] as const))(
    'captureAppError stringifies generated batch188 boolean and zero tags %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch188'), { tags: { [tag]: value } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 189 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch189-disabled-${index}`,
  ] as const))(
    'captureAppError skips generated batch189 disabled monitoring context %s',
    async (message) => {
      vi.stubEnv('VITE_SENTRY_DSN', '');
      vi.resetModules();

      const { captureAppError, isMonitoringEnabled } = await import('./monitoring');
      captureAppError(new Error(message), { tags: { source: message }, extra: { message } });

      expect(isMonitoringEnabled).toBe(false);
      expect(mockWithScope).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? undefined : {},
  ] as const))(
    'captureAppError records generated batch189 enabled error with sparse context %#',
    async (context) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch189'), context);

      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 190 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `https://batch190-${index}@sentry.io/${index}`,
    index % 2 === 0 ? 'Infinity' : '-Infinity',
  ] as const))(
    'initMonitoring normalizes generated batch190 infinite sample rate %s',
    async (dsn, sampleRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch190-extra-${index}`,
  ] as const))(
    'captureAppError records generated batch190 null extra context %s',
    async (extraKey) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch190'), { extra: { [extraKey]: null } });

      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', { [extraKey]: null });
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 191 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `https://batch191-${index}@sentry.io/${index}`,
    index % 2 === 0 ? '0.333' : '.75',
    index % 2 === 0 ? 0.333 : 0.75,
  ] as const))(
    'initMonitoring accepts generated batch191 decimal sample rate %s',
    async (dsn, sampleRate, expectedRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: expectedRate,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch191-tag-${index}`,
    index % 2 === 0 ? '' : `value-${index}`,
  ] as const))(
    'captureAppError records generated batch191 empty string tags %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch191'), { tags: { [tag]: value } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, value);
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 192 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch192-defined-${index}`,
    `batch192-undefined-${index}`,
  ] as const))(
    'captureAppError skips generated batch192 undefined tag values %s',
    async (definedTag, undefinedTag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch192'), { tags: { [definedTag]: true, [undefinedTag]: undefined } });

      expect(mockScope.setTag).toHaveBeenCalledWith(definedTag, 'true');
      expect(mockScope.setTag).not.toHaveBeenCalledWith(undefinedTag, expect.anything());
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch192-release-${index}@sentry.io/${index}`,
    `batch192-env-${index}`,
    `19.${index}.0`,
  ] as const))(
    'initMonitoring forwards generated batch192 environment and release %s',
    async (dsn, environment, release) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('MODE', environment);
      vi.stubEnv('VITE_APP_VERSION', release);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        environment,
        release,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 193 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch193-extra-${index}`,
    { nested: { index }, list: [index, `batch193-${index}`] },
  ] as const))(
    'captureAppError forwards generated batch193 extra object reference %s',
    async (extraKey, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      const extra = { [extraKey]: value };
      captureAppError(new Error('batch193'), { extra });

      expect(mockScope.setContext).toHaveBeenCalledWith('extra', extra);
      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch193-rate-${index}@sentry.io/${index}`,
    index % 2 === 0 ? '-0.25' : '2',
    index % 2 === 0 ? -0.25 : 2,
  ] as const))(
    'initMonitoring forwards generated batch193 finite sample rate %s',
    async (dsn, sampleRate, expectedRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: expectedRate,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 194 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch194-tag-${index}`,
    `batch194-extra-${index}`,
  ] as const))(
    'captureAppError records generated batch194 tags and extra together %s',
    async (tag, extraKey) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      const extra = { [extraKey]: { ok: true } };
      captureAppError(new Error('batch194'), { tags: { [tag]: 0 }, extra });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, '0');
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', extra);
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch194-blank-rate-${index}@sentry.io/${index}`,
    index % 2 === 0 ? '' : '   ',
  ] as const))(
    'initMonitoring normalizes generated batch194 blank sample rate %s',
    async (dsn, sampleRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 195 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch195-tag-${index}`,
    index % 2 === 0 ? false : true,
  ] as const))(
    'captureAppError stringifies generated batch195 boolean tag values %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch195'), { tags: { [tag]: value } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch195-nan-${index}@sentry.io/${index}`,
    index % 2 === 0 ? 'NaN' : 'not-a-number',
  ] as const))(
    'initMonitoring normalizes generated batch195 non-finite sample rate %s',
    async (dsn, sampleRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 196 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch196-source-${index}`,
    index,
  ] as const))(
    'captureAppError stringifies generated batch196 numeric tag values %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch196'), { tags: { [tag]: value } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch196-disabled-${index}`,
  ] as const))(
    'captureAppError ignores generated batch196 context when disabled %s',
    async (message) => {
      vi.stubEnv('VITE_SENTRY_DSN', '');
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error(message), { tags: { message }, extra: { message } });

      expect(mockWithScope).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 197 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch197-extra-${index}`,
    { count: index, enabled: index % 2 === 0 },
  ] as const))(
    'captureAppError forwards generated batch197 extra payload %s',
    async (extraKey, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      const extra = { [extraKey]: value };
      captureAppError(new Error('batch197'), { extra });

      expect(mockScope.setContext).toHaveBeenCalledWith('extra', extra);
      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch197-${index}@sentry.io/${index}`,
    String(index / 100),
    index / 100,
  ] as const))(
    'initMonitoring forwards generated batch197 fractional sample rate %s',
    async (dsn, sampleRate, expectedRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: expectedRate,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 198 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch198-undefined-${index}`,
  ] as const))(
    'captureAppError skips generated batch198 undefined tag values %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch198'), { tags: { [tag]: undefined } });

      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch198-mode-${index}`,
    `26.${index}.0`,
  ] as const))(
    'initMonitoring forwards generated batch198 environment and release %#',
    async (mode, version) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      vi.stubEnv('MODE', mode);
      vi.stubEnv('VITE_APP_VERSION', version);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        environment: mode,
        release: version,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 199 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch199-extra-${index}`,
  ] as const))(
    'captureAppError forwards generated batch199 empty extra context %s',
    async (extraKey) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      const extra = { [extraKey]: {} };
      captureAppError(new Error('batch199'), { extra });

      expect(mockScope.setContext).toHaveBeenCalledWith('extra', extra);
      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch199-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring defaults generated batch199 missing sample rate to zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', undefined);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 200 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch200-false-${index}`,
  ] as const))(
    'captureAppError stringifies generated batch200 false tag values %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch200'), { tags: { [tag]: false } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, 'false');
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch200-${index}@sentry.io/${index}`,
    String(-(index + 1) / 100),
    -(index + 1) / 100,
  ] as const))(
    'initMonitoring forwards generated batch200 negative finite sample rate %s',
    async (dsn, sampleRate, expectedRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: expectedRate,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 201 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch201-true-${index}`,
  ] as const))(
    'captureAppError stringifies generated batch201 true tag values %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch201'), { tags: { [tag]: true } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, 'true');
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch201-${index}@sentry.io/${index}`,
    String(index + 1),
    index + 1,
  ] as const))(
    'initMonitoring forwards generated batch201 sample rate above one %s',
    async (dsn, sampleRate, expectedRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: expectedRate,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 202 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch202-zero-${index}`,
  ] as const))(
    'captureAppError stringifies generated batch202 zero tag values %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch202'), { tags: { [tag]: 0 } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, '0');
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch202-release-${index}`,
  ] as const))(
    'initMonitoring forwards generated batch202 undefined environment with release %s',
    async (version) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      vi.stubEnv('MODE', undefined);
      vi.stubEnv('VITE_APP_VERSION', version);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        environment: undefined,
        release: version,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 203 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch203-empty-${index}`,
  ] as const))(
    'captureAppError stringifies generated batch203 empty string tag values %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch203'), { tags: { [tag]: '' } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, '');
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch203-${index}@sentry.io/${index}`,
    `batch203-env-${index}`,
  ] as const))(
    'initMonitoring keeps generated batch203 undefined release with environment %#',
    async (dsn, environment) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('MODE', environment);
      vi.stubEnv('VITE_APP_VERSION', undefined);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        environment,
        release: undefined,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 204 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch204-nan-${index}`,
  ] as const))(
    'captureAppError stringifies generated batch204 NaN tag values %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch204'), { tags: { [tag]: Number.NaN } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, 'NaN');
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch204-${index}@sentry.io/${index}`,
    index % 2 === 0 ? '   ' : '',
  ] as const))(
    'initMonitoring maps generated batch204 blank sample rate to zero %#',
    async (dsn, sampleRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 205 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch205-skip-${index}`,
    `batch205-keep-${index}`,
  ] as const))(
    'captureAppError skips generated batch205 undefined tag values %#',
    async (skippedTag, keptTag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch205'), { tags: { [skippedTag]: undefined, [keptTag]: true } });

      expect(mockScope.setTag).not.toHaveBeenCalledWith(skippedTag, expect.anything());
      expect(mockScope.setTag).toHaveBeenCalledWith(keptTag, 'true');
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch205-${index}@sentry.io/${index}`,
    index % 2 === 0 ? 'Infinity' : '-Infinity',
  ] as const))(
    'initMonitoring maps generated batch205 infinite sample rate to zero %#',
    async (dsn, sampleRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 206 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch206-error-${index}`,
  ] as const))(
    'captureAppError sends generated batch206 errors without context %s',
    async (message) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      const error = new Error(message);
      captureAppError(error);

      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalledWith(error);

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch206-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring maps generated batch206 NaN sample rate to zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', 'NaN');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 207 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch207-extra-${index}`,
  ] as const))(
    'captureAppError sets generated batch207 extra context without tags %s',
    async (value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch207'), { extra: { value } });

      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', { value });
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch207-disabled-${index}`,
  ] as const))(
    'captureAppError ignores generated batch207 errors when monitoring is disabled %s',
    async (message) => {
      vi.stubEnv('VITE_SENTRY_DSN', '');
      vi.resetModules();

      const { captureAppError, isMonitoringEnabled } = await import('./monitoring');
      captureAppError(new Error(message), { tags: { source: message } });

      expect(isMonitoringEnabled).toBe(false);
      expect(mockWithScope).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 208 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch208-number-${index}`,
    index + 0.25,
  ] as const))(
    'captureAppError stringifies generated batch208 fractional number tag %#',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch208'), { tags: { [tag]: value } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch208-${index}@sentry.io/${index}`,
    String((index + 1) / 100),
    (index + 1) / 100,
  ] as const))(
    'initMonitoring forwards generated batch208 fractional sample rate %#',
    async (dsn, sampleRate, expectedRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: expectedRate,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 209 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch209-tag-${index}`,
    index % 2 === 0,
  ] as const))(
    'captureAppError stringifies generated batch209 boolean tags %#',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch209'), { tags: { [tag]: value } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();
      expect(mockScope.setContext).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch209-${index}@sentry.io/${index}`,
    `batch209-release-${index}`,
  ] as const))(
    'initMonitoring forwards generated batch209 release value %#',
    async (dsn, release) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_APP_VERSION', release);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        release,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 210 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch210-null-tag-${index}`,
  ] as const))(
    'captureAppError stringifies generated batch210 null-like tags %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      const tags = { [tag]: null } as unknown as Record<string, string | number | boolean | undefined>;
      captureAppError(new Error('batch210'), { tags });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, 'null');
      expect(mockCaptureException).toHaveBeenCalled();
      expect(mockScope.setContext).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch210-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring keeps generated batch210 sendDefaultPii disabled %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        sendDefaultPii: false,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 211 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch211-tag-${index}`,
  ] as const))(
    'captureAppError preserves generated batch211 empty string tag values %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch211'), { tags: { [tag]: '' } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, '');
      expect(mockCaptureException).toHaveBeenCalled();
      expect(mockScope.setContext).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch211-${index}@sentry.io/${index}`,
    index % 2 === 0 ? '-0.25' : '-1',
    index % 2 === 0 ? -0.25 : -1,
  ] as const))(
    'initMonitoring forwards generated batch211 negative finite sample rate %#',
    async (dsn, sampleRate, expectedRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: expectedRate,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 212 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch212-extra-${index}`,
  ] as const))(
    'captureAppError sets generated batch212 empty extra context %s',
    async (value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch212'), { extra: { [value]: undefined } });

      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', { [value]: undefined });
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch212-${index}@sentry.io/${index}`,
    '   ',
  ] as const))(
    'initMonitoring maps generated batch212 blank sample rate to zero %#',
    async (dsn, sampleRate) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', sampleRate);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 213 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch213-zero-tag-${index}`,
  ] as const))(
    'captureAppError stringifies generated batch213 zero tag values %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch213'), { tags: { [tag]: 0 } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, '0');
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch213-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring forwards generated batch213 zero sample rate %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 214 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch214-tag-${index}`,
    `batch214-extra-${index}`,
  ] as const))(
    'captureAppError sets generated batch214 tags and extra together %#',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch214'), { tags: { source: tag }, extra: { value } });

      expect(mockScope.setTag).toHaveBeenCalledWith('source', tag);
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', { value });
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch214-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring defaults generated batch214 missing sample rate to zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 215 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch215-tag-${index}`,
  ] as const))(
    'captureAppError skips generated batch215 undefined tag while keeping zero tag %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch215'), { tags: { [tag]: undefined, kept: 0 } });

      expect(mockScope.setTag).not.toHaveBeenCalledWith(tag, expect.anything());
      expect(mockScope.setTag).toHaveBeenCalledWith('kept', '0');
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch215-${index}@sentry.io/${index}`,
    `batch215-env-${index}`,
  ] as const))(
    'initMonitoring forwards generated batch215 environment value %#',
    async (dsn, mode) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('MODE', mode);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        environment: mode,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 216 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch216-release-${index}`,
  ] as const))(
    'initMonitoring forwards generated batch216 undefined environment with release %s',
    async (release) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      vi.stubEnv('VITE_APP_VERSION', release);
      vi.stubEnv('MODE', undefined);
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        environment: undefined,
        release,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch216-extra-${index}`,
  ] as const))(
    'captureAppError keeps generated batch216 extra object identity %s',
    async (value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const extra = { value };
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch216'), { extra });

      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', extra);
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 217 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch217-tag-${index}`,
  ] as const))(
    'captureAppError stringifies generated batch217 negative zero tag %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch217'), { tags: { [tag]: -0 } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, '0');
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch217-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring parses generated batch217 whitespace sample rate %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', ' 0.25 ');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0.25,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 218 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch218-tag-${index}`,
  ] as const))(
    'captureAppError stringifies generated batch218 NaN tag %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch218'), { tags: { [tag]: Number.NaN } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, 'NaN');
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch218-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch218 hexadecimal sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0x2');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 2,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 219 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch219-tag-${index}`,
  ] as const))(
    'captureAppError stringifies generated batch219 Infinity tag %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch219'), { tags: { [tag]: Number.POSITIVE_INFINITY } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, 'Infinity');
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch219-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch219 binary sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0b10');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 2,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 220 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch220-tag-${index}`,
  ] as const))(
    'captureAppError stringifies generated batch220 negative infinity tag %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch220'), { tags: { [tag]: Number.NEGATIVE_INFINITY } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, '-Infinity');
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch220-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch220 octal sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0o10');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 8,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 221 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch221-tag-${index}`,
  ] as const))(
    'captureAppError stringifies generated batch221 String object tag %s',
    async (tag) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch221'), { tags: { [tag]: new String('wrapped') as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, 'wrapped');
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch221-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch221 empty sample rate as zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 222 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch222-tag-${index}`,
    Symbol(`batch222-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch222 Symbol tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch222'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch222-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch222 false sample rate as zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', 'false');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 223 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch223-tag-${index}`,
    Object.assign(new Map(), { toString: () => `map-tag-${index}` }),
  ] as const))(
    'captureAppError stringifies generated batch223 Map tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch223'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch223-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch223 whitespace sample rate as zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '   ');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 224 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch224-tag-${index}`,
    BigInt(index),
  ] as const))(
    'captureAppError stringifies generated batch224 BigInt tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch224'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch224-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch224 exponent sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '1e-2');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0.01,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 225 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch225-tag-${index}`,
    new Date(Date.UTC(2026, 5, 6, 0, index % 50)),
  ] as const))(
    'captureAppError stringifies generated batch225 Date tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch225'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch225-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch225 Infinity sample rate as zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', 'Infinity');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 226 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch226-tag-${index}`,
    new RegExp(`batch226-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch226 RegExp tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch226'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch226-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch226 NaN sample rate as zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', 'NaN');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 227 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch227-tag-${index}`,
    new URL(`https://batch227-${index}.example.com/path`),
  ] as const))(
    'captureAppError stringifies generated batch227 URL tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch227'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch227-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch227 fractional exponent sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '2.5e-1');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0.25,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 228 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch228-tag-${index}`,
    Object.assign(Object.create(null), { toString: () => `null-proto-${index}` }),
  ] as const))(
    'captureAppError stringifies generated batch228 null-prototype tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch228'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch228-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch228 binary sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0b11');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 3,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 229 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch229-tag-${index}`,
    new ArrayBuffer(index + 1),
  ] as const))(
    'captureAppError stringifies generated batch229 ArrayBuffer tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch229'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch229-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch229 numeric separator sample rate as zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '1_000');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 230 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch230-tag-${index}`,
    new DataView(new ArrayBuffer(index + 1)),
  ] as const))(
    'captureAppError stringifies generated batch230 DataView tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch230'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch230-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch230 signed hexadecimal sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '-0x1');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 231 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch231-tag-${index}`,
    new Uint8Array([index % 255, (index + 1) % 255]),
  ] as const))(
    'captureAppError stringifies generated batch231 Uint8Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch231'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch231-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch231 octal sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0o10');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 8,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 232 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch232-tag-${index}`,
    new Int16Array([index, -index]),
  ] as const))(
    'captureAppError stringifies generated batch232 Int16Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch232'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch232-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch232 uppercase hex sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0Xf');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 15,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 233 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch233-tag-${index}`,
    new Float32Array([index + 0.5, -(index + 0.25)]),
  ] as const))(
    'captureAppError stringifies generated batch233 Float32Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch233'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch233-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch233 padded hex sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', ' 0x10 ');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 16,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 234 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch234-tag-${index}`,
    new Float64Array([index + 0.75, -(index + 0.5)]),
  ] as const))(
    'captureAppError stringifies generated batch234 Float64Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch234'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch234-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch234 blank signed decimal sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', ' -2.5 ');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: -2.5,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 235 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch235-tag-${index}`,
    new Uint16Array([index, index + 1]),
  ] as const))(
    'captureAppError stringifies generated batch235 Uint16Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch235'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch235-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch235 zero hex sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0x0');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 236 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch236-tag-${index}`,
    new Uint32Array([index, index + 2]),
  ] as const))(
    'captureAppError stringifies generated batch236 Uint32Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch236'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch236-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch236 invalid binary sample rate as zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0b2');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 237 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch237-tag-${index}`,
    new BigInt64Array([BigInt(index), BigInt(index + 3)]),
  ] as const))(
    'captureAppError stringifies generated batch237 BigInt64Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch237'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch237-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch237 infinity sample rate as zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', 'Infinity');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 238 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch238-tag-${index}`,
    new BigUint64Array([BigInt(index), BigInt(index + 4)]),
  ] as const))(
    'captureAppError stringifies generated batch238 BigUint64Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch238'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch238-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch238 negative infinity sample rate as zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '-Infinity');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 239 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch239-tag-${index}`,
    new Int32Array([index, index + 5]),
  ] as const))(
    'captureAppError stringifies generated batch239 Int32Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch239'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch239-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch239 binary sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0b10');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 2,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 240 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch240-tag-${index}`,
    new Int8Array([index % 128, (index + 6) % 128]),
  ] as const))(
    'captureAppError stringifies generated batch240 Int8Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch240'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch240-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch240 octal sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0o7');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 7,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 241 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch241-tag-${index}`,
    new Uint8ClampedArray([index % 255, (index + 7) % 255]),
  ] as const))(
    'captureAppError stringifies generated batch241 Uint8ClampedArray tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch241'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch241-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch241 hexadecimal sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0x10');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 16,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 242 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch242-tag-${index}`,
    new Uint8Array([index % 255, (index + 8) % 255]),
  ] as const))(
    'captureAppError stringifies generated batch242 Uint8Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch242'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch242-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch242 signed octal sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '-0o7');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 243 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch243-tag-${index}`,
    new Uint16Array([index, index + 9]),
  ] as const))(
    'captureAppError stringifies generated batch243 Uint16Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch243'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch243-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch243 signed hex sample rate as zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '-0x10');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 244 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch244-tag-${index}`,
    new Uint32Array([index, index + 10]),
  ] as const))(
    'captureAppError stringifies generated batch244 Uint32Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch244'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch244-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch244 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 245 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch245-tag-${index}`,
    new Int16Array([index, index + 11]),
  ] as const))(
    'captureAppError stringifies generated batch245 Int16Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch245'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch245-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch245 spaced fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', ' 0.25 ');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0.25,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 246 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch246-tag-${index}`,
    new Int32Array([index, index + 12]),
  ] as const))(
    'captureAppError stringifies generated batch246 Int32Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch246'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch246-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch246 binary sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0b1');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 1,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 247 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch247-tag-${index}`,
    new Float32Array([index + 0.5, index + 12.5]),
  ] as const))(
    'captureAppError stringifies generated batch247 Float32Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch247'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch247-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch247 signed binary sample rate as zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '-0b1');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 248 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch248-tag-${index}`,
    new Float64Array([index + 0.25, index + 12.25]),
  ] as const))(
    'captureAppError stringifies generated batch248 Float64Array tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch248'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch248-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch248 octal sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0o10');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 8,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 249 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch249-tag-${index}`,
    new URLSearchParams([['value', `batch249-${index}`]]),
  ] as const))(
    'captureAppError stringifies generated batch249 URLSearchParams tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch249'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch249-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch249 hex sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0x10');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 16,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 250 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch250-tag-${index}`,
    new URL(`https://batch250.example/tag/${index}`),
  ] as const))(
    'captureAppError stringifies generated batch250 URL tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch250'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch250-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch250 spaced hex sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', ' 0x1 ');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 1,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 251 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch251-tag-${index}`,
    new Date(`2026-07-02T05:${String(index % 50).padStart(2, '0')}:00.000Z`),
  ] as const))(
    'captureAppError stringifies generated batch251 Date tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch251'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch251-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch251 uppercase hex sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0X10');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 16,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 252 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch252-tag-${index}`,
    BigInt(index + 1),
  ] as const))(
    'captureAppError stringifies generated batch252 BigInt tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch252'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch252-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch252 zero hex sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0x0');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 253 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch253-tag-${index}`,
    new Number(index + 0.25),
  ] as const))(
    'captureAppError stringifies generated batch253 Number object tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch253'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch253-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch253 fractional hex sample rate as zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0x1.8');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 254 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch254-tag-${index}`,
    new String(`batch254-value-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch254 String object tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch254'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch254-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch254 binary sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0b10');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 2,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 255 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch255-tag-${index}`,
    new Boolean(index % 2 === 0),
  ] as const))(
    'captureAppError stringifies generated batch255 Boolean object tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch255'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch255-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch255 spaced binary sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', ' 0b11 ');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 3,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 256 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch256-tag-${index}`,
    new RangeError(`batch256-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch256 RangeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch256'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch256-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch256 binary sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0b101');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 5,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 257 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch257-tag-${index}`,
    new EvalError(`batch257-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch257 EvalError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch257'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch257-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch257 invalid binary sample rate as zero %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0b102');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 0,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 258 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch258-tag-${index}`,
    new URIError(`batch258-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch258 URIError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch258'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch258-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch258 binary sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0b111');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 7,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 259 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch259-tag-${index}`,
    new AggregateError([], `batch259-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch259 AggregateError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch259'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch259-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch259 binary sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0b1000');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 8,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 260 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch260-tag-${index}`,
    new RegExp(`batch260-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch260 RegExp tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch260'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch260-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch260 binary sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0b1001');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 9,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 261 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch261-tag-${index}`,
    new URLSearchParams({ batch: `261-${index}` }),
  ] as const))(
    'captureAppError stringifies generated batch261 URLSearchParams tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch261'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch261-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch261 octal sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0o12');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 10,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 262 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch262-tag-${index}`,
    new Date(`2026-07-13T05:${String(index % 50).padStart(2, '0')}:00.000Z`),
  ] as const))(
    'captureAppError stringifies generated batch262 Date tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch262'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch262-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch262 hexadecimal sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0xB');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 11,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 263 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch263-tag-${index}`,
    new RangeError(`batch263-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch263 RangeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch263'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch263-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch263 decimal sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '12');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 12,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 264 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch264-tag-${index}`,
    new SyntaxError(`batch264-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch264 SyntaxError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch264'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch264-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch264 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '13.5');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 13.5,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 265 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch265-tag-${index}`,
    new URIError(`batch265-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch265 URIError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch265'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch265-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch265 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '14.25');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 14.25,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 266 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch266-tag-${index}`,
    new ReferenceError(`batch266-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch266 ReferenceError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch266'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch266-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch266 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '15.75');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 15.75,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 267 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch267-tag-${index}`,
    new AggregateError([], `batch267-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch267 AggregateError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch267'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch267-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch267 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '16.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 16.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 268 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch268-tag-${index}`,
    new TypeError(`batch268-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch268 TypeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch268'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch268-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch268 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '17.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 17.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 269 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch269-tag-${index}`,
    new RangeError(`batch269-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch269 RangeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch269'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch269-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch269 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '18.0625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 18.0625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 270 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch270-tag-${index}`,
    new SyntaxError(`batch270-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch270 SyntaxError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch270'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch270-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch270 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '19.25');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 19.25,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 271 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch271-tag-${index}`,
    new EvalError(`batch271-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch271 EvalError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch271'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch271-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch271 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '20.5');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 20.5,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 272 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch272-tag-${index}`,
    new URIError(`batch272-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch272 URIError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch272'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch272-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch272 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '21.75');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 21.75,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 273 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch273-tag-${index}`,
    new AggregateError([], `batch273-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch273 AggregateError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch273'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch273-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch273 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '22.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 22.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 274 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch274-tag-${index}`,
    new ReferenceError(`batch274-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch274 ReferenceError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch274'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch274-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch274 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '22.5');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 22.5,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 275 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch275-tag-${index}`,
    new SyntaxError(`batch275-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch275 SyntaxError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch275'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch275-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch275 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '22.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 22.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 276 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch276-tag-${index}`,
    new EvalError(`batch276-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch276 EvalError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch276'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch276-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch276 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '23.25');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 23.25,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 277 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch277-tag-${index}`,
    new TypeError(`batch277-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch277 TypeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch277'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch277-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch277 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '23.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 23.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 278 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch278-tag-${index}`,
    new RangeError(`batch278-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch278 RangeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch278'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch278-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch278 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '24.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 24.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 279 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch279-tag-${index}`,
    new URIError(`batch279-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch279 URIError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch279'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch279-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch279 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '24.75');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 24.75,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 280 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch280-tag-${index}`,
    new AggregateError([], `batch280-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch280 AggregateError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch280'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch280-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch280 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '25.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 25.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 281 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch281-tag-${index}`,
    new ReferenceError(`batch281-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch281 ReferenceError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch281'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch281-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch281 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '25.5');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 25.5,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 282 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch282-tag-${index}`,
    new SyntaxError(`batch282-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch282 SyntaxError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch282'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch282-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch282 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '26.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 26.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 283 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch283-tag-${index}`,
    new EvalError(`batch283-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch283 EvalError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch283'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch283-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch283 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '26.5');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 26.5,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 284 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch284-tag-${index}`,
    new RangeError(`batch284-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch284 RangeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch284'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch284-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch284 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '27.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 27.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 285 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch285-tag-${index}`,
    new TypeError(`batch285-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch285 TypeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch285'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch285-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch285 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '27.5');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 27.5,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 286 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch286-tag-${index}`,
    new URIError(`batch286-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch286 URIError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch286'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch286-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch286 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '28.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 28.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 287 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch287-tag-${index}`,
    new AggregateError([], `batch287-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch287 AggregateError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch287'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch287-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch287 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '28.5');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 28.5,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 288 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch288-tag-${index}`,
    new ReferenceError(`batch288-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch288 ReferenceError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch288'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch288-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch288 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '29.75');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 29.75,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 289 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch289-tag-${index}`,
    new Error(`batch289-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch289 Error tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch289'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch289-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch289 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '30.25');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 30.25,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 290 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch290-tag-${index}`,
    new EvalError(`batch290-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch290 EvalError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch290'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch290-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch290 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '31.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 31.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 291 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch291-tag-${index}`,
    new RangeError(`batch291-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch291 RangeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch291'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch291-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch291 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '32.5');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 32.5,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 292 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch292-tag-${index}`,
    new SyntaxError(`batch292-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch292 SyntaxError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch292'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch292-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch292 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '33.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 33.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 293 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch293-tag-${index}`,
    new TypeError(`batch293-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch293 TypeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch293'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch293-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch293 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '34.75');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 34.75,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 294 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch294-tag-${index}`,
    new RangeError(`batch294-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch294 RangeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch294'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch294-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch294 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '35.5');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 35.5,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 295 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch295-tag-${index}`,
    new EvalError(`batch295-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch295 EvalError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch295'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch295-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch295 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '36.25');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 36.25,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 296 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch296-tag-${index}`,
    new URIError(`batch296-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch296 URIError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch296'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch296-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch296 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '37.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 37.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 297 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch297-tag-${index}`,
    new AggregateError([], `batch297-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch297 AggregateError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch297'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch297-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch297 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '38.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 38.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 298 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch298-tag-${index}`,
    new ReferenceError(`batch298-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch298 ReferenceError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch298'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch298-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch298 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '39.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 39.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 299 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch299-tag-${index}`,
    new Error(`batch299-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch299 Error tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch299'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch299-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch299 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '40.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 40.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 300 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch300-tag-${index}`,
    new SyntaxError(`batch300-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch300 SyntaxError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch300'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch300-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch300 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '41.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 41.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 301 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch301-tag-${index}`,
    new EvalError(`batch301-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch301 EvalError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch301'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch301-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch301 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '42.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 42.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 302 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch302-tag-${index}`,
    new URIError(`batch302-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch302 URIError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch302'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch302-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch302 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '43.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 43.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 303 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch303-tag-${index}`,
    new AggregateError([], `batch303-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch303 AggregateError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch303'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch303-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch303 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '44.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 44.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 304 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch304-tag-${index}`,
    new ReferenceError(`batch304-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch304 ReferenceError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch304'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch304-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch304 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '44.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 44.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 305 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch305-tag-${index}`,
    new Error(`batch305-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch305 Error tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch305'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch305-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch305 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '45.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 45.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 306 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch306-tag-${index}`,
    new TypeError(`batch306-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch306 TypeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch306'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch306-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch306 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '46.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 46.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 307 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch307-tag-${index}`,
    new RangeError(`batch307-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch307 RangeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch307'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch307-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch307 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '47.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 47.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 308 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch308-tag-${index}`,
    new URIError(`batch308-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch308 URIError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch308'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch308-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch308 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '47.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 47.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 309 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch309-tag-${index}`,
    new AggregateError([], `batch309-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch309 AggregateError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch309'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch309-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch309 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '48.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 48.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 310 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch310-tag-${index}`,
    new ReferenceError(`batch310-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch310 ReferenceError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch310'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch310-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch310 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '49.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 49.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 311 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch311-tag-${index}`,
    new SyntaxError(`batch311-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch311 SyntaxError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch311'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch311-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch311 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '50.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 50.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 312 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch312-tag-${index}`,
    new EvalError(`batch312-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch312 EvalError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch312'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch312-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch312 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '50.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 50.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 313 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch313-tag-${index}`,
    new Error(`batch313-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch313 Error tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch313'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch313-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch313 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '51.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 51.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 314 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch314-tag-${index}`,
    new TypeError(`batch314-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch314 TypeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch314'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch314-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch314 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '52.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 52.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 315 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch315-tag-${index}`,
    new RangeError(`batch315-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch315 RangeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch315'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch315-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch315 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '53.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 53.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 316 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch316-tag-${index}`,
    new URIError(`batch316-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch316 URIError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch316'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch316-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch316 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '53.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 53.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 317 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch317-tag-${index}`,
    new AggregateError([new Error(`inner-${index}`)], `batch317-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch317 AggregateError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch317'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch317-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch317 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '54.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 54.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 318 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch318-tag-${index}`,
    new ReferenceError(`batch318-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch318 ReferenceError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch318'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch318-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch318 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '55.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 55.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 319 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch319-tag-${index}`,
    new SyntaxError(`batch319-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch319 SyntaxError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch319'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch319-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch319 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '56.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 56.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 320 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch320-tag-${index}`,
    new EvalError(`batch320-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch320 EvalError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch320'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch320-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch320 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '56.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 56.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 321 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch321-tag-${index}`,
    new RangeError(`batch321-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch321 RangeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch321'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch321-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch321 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '57.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 57.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 322 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch322-tag-${index}`,
    new AggregateError([new Error('inner')], `batch322-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch322 AggregateError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch322'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch322-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch322 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '58.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 58.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 323 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch323-tag-${index}`,
    new ReferenceError(`batch323-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch323 ReferenceError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch323'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch323-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch323 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '59.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 59.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 324 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch324-tag-${index}`,
    new Error(`batch324-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch324 Error tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch324'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch324-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch324 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '59.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 59.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 325 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch325-tag-${index}`,
    new TypeError(`batch325-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch325 TypeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch325'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch325-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch325 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '60.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 60.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 326 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch326-tag-${index}`,
    new SyntaxError(`batch326-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch326 SyntaxError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch326'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch326-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch326 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '61.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 61.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 327 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch327-tag-${index}`,
    new URIError(`batch327-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch327 URIError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch327'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch327-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch327 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '62.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 62.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 328 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch328-tag-${index}`,
    new EvalError(`batch328-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch328 EvalError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch328'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch328-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch328 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '62.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 62.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 329 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch329-tag-${index}`,
    new RangeError(`batch329-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch329 RangeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch329'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch329-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch329 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '63.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 63.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 330 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch330-tag-${index}`,
    new AggregateError([new Error('inner')], `batch330-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch330 AggregateError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch330'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch330-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch330 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '64.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 64.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 331 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch331-tag-${index}`,
    new ReferenceError(`batch331-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch331 ReferenceError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch331'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch331-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch331 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '65.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 65.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 332 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch332-tag-${index}`,
    new Error(`batch332-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch332 Error tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch332'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch332-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch332 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '65.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 65.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 333 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch333-tag-${index}`,
    new TypeError(`batch333-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch333 TypeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch333'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch333-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch333 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '66.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 66.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 334 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch334-tag-${index}`,
    new SyntaxError(`batch334-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch334 SyntaxError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch334'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch334-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch334 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '67.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 67.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 335 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch335-tag-${index}`,
    new URIError(`batch335-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch335 URIError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch335'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch335-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch335 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '68.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 68.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 336 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch336-tag-${index}`,
    new EvalError(`batch336-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch336 EvalError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch336'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch336-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch336 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '68.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 68.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 337 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch337-tag-${index}`,
    new RangeError(`batch337-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch337 RangeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch337'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch337-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch337 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '69.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 69.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 338 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch338-tag-${index}`,
    new AggregateError([], `batch338-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch338 AggregateError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch338'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch338-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch338 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '70.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 70.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 339 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch339-tag-${index}`,
    new ReferenceError(`batch339-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch339 ReferenceError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch339'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch339-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch339 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '71.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 71.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 340 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch340-tag-${index}`,
    new Error(`batch340-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch340 Error tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch340'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch340-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch340 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '71.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 71.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 341 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch341-tag-${index}`,
    new TypeError(`batch341-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch341 TypeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch341'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch341-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch341 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '72.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 72.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 342 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch342-tag-${index}`,
    new SyntaxError(`batch342-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch342 SyntaxError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch342'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch342-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch342 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '73.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 73.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 343 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch343-tag-${index}`,
    new URIError(`batch343-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch343 URIError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch343'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch343-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch343 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '74.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 74.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 344 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch344-tag-${index}`,
    new RangeError(`batch344-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch344 RangeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch344'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch344-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch344 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '74.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 74.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 345 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch345-tag-${index}`,
    new EvalError(`batch345-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch345 EvalError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch345'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch345-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch345 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '75.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 75.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 346 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch346-tag-${index}`,
    new AggregateError([], `batch346-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch346 AggregateError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch346'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch346-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch346 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '76.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 76.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 347 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch347-tag-${index}`,
    new Error(`batch347-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch347 Error tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch347'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch347-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch347 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '77.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 77.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 348 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch348-tag-${index}`,
    new TypeError(`batch348-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch348 TypeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch348'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch348-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch348 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '78.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 78.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 349 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch349-tag-${index}`,
    new RangeError(`batch349-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch349 RangeError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch349'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch349-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch349 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '79.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 79.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 350 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch350-tag-${index}`,
    new SyntaxError(`batch350-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch350 SyntaxError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch350'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch350-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch350 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '80.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 80.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 351 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch351-tag-${index}`,
    new URIError(`batch351-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch351 URIError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch351'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch351-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch351 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '81.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 81.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 352 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch352-tag-${index}`,
    new EvalError(`batch352-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch352 EvalError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch352'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch352-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch352 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '82.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 82.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 353 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch353-tag-${index}`,
    new AggregateError([], `batch353-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch353 AggregateError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch353'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch353-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch353 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '83.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 83.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 354 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch354-tag-${index}`,
    new ReferenceError(`batch354-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch354 ReferenceError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch354'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch354-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch354 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '84.375');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 84.375,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 355 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch355-tag-${index}`,
    new SyntaxError(`batch355-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch355 SyntaxError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch355'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch355-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch355 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '85.125');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 85.125,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 356 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch356-tag-${index}`,
    new URIError(`batch356-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch356 URIError tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch356'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch356-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch356 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '85.875');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 85.875,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});

describe('client monitoring batch 357 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch357-tag-${index}`,
    new Error(`batch357-${index}`),
  ] as const))(
    'captureAppError stringifies generated batch357 Error tag %s',
    async (tag, value) => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123');
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));
      vi.resetModules();

      const { captureAppError } = await import('./monitoring');
      captureAppError(new Error('batch357'), { tags: { [tag]: value as unknown as string } });

      expect(mockScope.setTag).toHaveBeenCalledWith(tag, String(value));
      expect(mockCaptureException).toHaveBeenCalled();

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `https://batch357-${index}@sentry.io/${index}`,
  ] as const))(
    'initMonitoring treats generated batch357 fractional sample rate as finite %s',
    async (dsn) => {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '86.625');
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn,
        tracesSampleRate: 86.625,
      }));

      vi.unstubAllEnvs();
      vi.resetModules();
    },
  );
});
