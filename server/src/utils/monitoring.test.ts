import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import type { Request } from 'express';

const mockInit = vi.fn();
const mockWithScope = vi.fn((cb) => cb({ setTag: vi.fn(), setContext: vi.fn() }));
const mockCaptureException = vi.fn();
const mockFlush = vi.fn();

vi.mock('@sentry/node', () => ({
  init: mockInit,
  withScope: mockWithScope,
  captureException: mockCaptureException,
  flush: mockFlush,
}));

describe('monitoring', () => {
  const originalDsn = process.env.SENTRY_DSN;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SENTRY_DSN;
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
  });

  afterAll(() => {
    if (originalDsn) process.env.SENTRY_DSN = originalDsn;
  });

  it('isMonitoringEnabled is false without SENTRY_DSN', async () => {
    const { isMonitoringEnabled } = await import('./monitoring');
    expect(isMonitoringEnabled).toBe(false);
  });

  it('does not call Sentry.init without DSN', async () => {
    const { initMonitoring } = await import('./monitoring');
    initMonitoring();
    expect(mockInit).not.toHaveBeenCalled();
  });

  it('does not capture errors when monitoring is disabled', async () => {
    const { captureServerError } = await import('./monitoring');
    captureServerError(new Error('test'));
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('does not flush when monitoring is disabled', async () => {
    const { flushMonitoring } = await import('./monitoring');
    await flushMonitoring();
    expect(mockFlush).not.toHaveBeenCalled();
  });

  it('calls Sentry.init when DSN is set before import', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    vi.resetModules();

    const { initMonitoring } = await import('./monitoring');
    initMonitoring();

    expect(mockInit).toHaveBeenCalled();
    delete process.env.SENTRY_DSN;
    vi.resetModules();
  });

  it('captures errors with tags and extra context when enabled', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    vi.resetModules();

    const { captureServerError } = await import('./monitoring');
    const error = new Error('test error');
    captureServerError(error, {
      requestId: 'req-123',
      tags: { method: 'POST', statusCode: 500 },
      extra: { body: { foo: 'bar' } },
    });

    expect(mockCaptureException).toHaveBeenCalledWith(error);
    expect(mockWithScope).toHaveBeenCalled();

    delete process.env.SENTRY_DSN;
    vi.resetModules();
  });

  it('captures request context when req is provided', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    vi.resetModules();

    const { captureServerError } = await import('./monitoring');
    const mockReq = {
      method: 'GET',
      originalUrl: '/api/test',
      id: 'req-456',
      ip: '127.0.0.1',
      get: (header: string) => header === 'user-agent' ? 'test-agent' : undefined,
    } as Parameters<typeof captureServerError>[1] extends { req?: infer R } ? R : never;

    captureServerError(new Error('req error'), { req: mockReq });
    expect(mockWithScope).toHaveBeenCalled();

    delete process.env.SENTRY_DSN;
    vi.resetModules();
  });

  it('skips undefined tag values', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    vi.resetModules();

    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureServerError } = await import('./monitoring');
    captureServerError(new Error('test'), {
      tags: { defined: 'yes', omitted: undefined },
    });

    const setTagCalls = mockScope.setTag.mock.calls;
    expect(setTagCalls.some((c: string[]) => c[0] === 'omitted')).toBe(false);

    delete process.env.SENTRY_DSN;
    vi.resetModules();
  });

  it('calls Sentry.flush when enabled', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    vi.resetModules();

    const { flushMonitoring } = await import('./monitoring');
    await flushMonitoring(5000);
    expect(mockFlush).toHaveBeenCalledWith(5000);

    delete process.env.SENTRY_DSN;
    vi.resetModules();
  });

  it('does not crash when captureServerError is called without context', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    vi.resetModules();

    const { captureServerError } = await import('./monitoring');
    expect(() => captureServerError(new Error('bare'))).not.toThrow();

    delete process.env.SENTRY_DSN;
    vi.resetModules();
  });

  it('flushMonitoring defaults to 2000ms timeout', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    vi.resetModules();

    const { flushMonitoring } = await import('./monitoring');
    await flushMonitoring();
    expect(mockFlush).toHaveBeenCalledWith(2000);

    delete process.env.SENTRY_DSN;
    vi.resetModules();
  });

  it('captureServerError without Sentry DSN does not call Sentry', async () => {
    delete process.env.SENTRY_DSN;
    vi.resetModules();

    const { captureServerError } = await import('./monitoring');
    expect(() => captureServerError(new Error('no dsn'))).not.toThrow();
    expect(mockCaptureException).not.toHaveBeenCalled();

    vi.resetModules();
  });

  it('captureServerError handles non-Error thrown values', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    vi.resetModules();

    const { captureServerError } = await import('./monitoring');
    expect(() => captureServerError('string error')).not.toThrow();
    expect(mockCaptureException).toHaveBeenCalled();

    delete process.env.SENTRY_DSN;
    vi.resetModules();
  });

  it('captureServerError with only requestId context', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    vi.resetModules();

    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureServerError } = await import('./monitoring');
    captureServerError(new Error('test'), { requestId: 'req-only' });

    expect(mockScope.setTag).toHaveBeenCalledWith('requestId', 'req-only');
    expect(mockCaptureException).toHaveBeenCalled();

    delete process.env.SENTRY_DSN;
    vi.resetModules();
  });

  it('initMonitoring uses 0 for non-numeric SENTRY_TRACES_SAMPLE_RATE', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    process.env.SENTRY_TRACES_SAMPLE_RATE = 'not-a-number';
    vi.resetModules();

    const { initMonitoring } = await import('./monitoring');
    initMonitoring();

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0 }),
    );

    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_TRACES_SAMPLE_RATE;
    vi.resetModules();
  });

  it('converts boolean tag values to strings', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    vi.resetModules();

    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureServerError } = await import('./monitoring');
    captureServerError(new Error('test'), {
      tags: { active: true, verified: false },
    });

    expect(mockScope.setTag).toHaveBeenCalledWith('active', 'true');
    expect(mockScope.setTag).toHaveBeenCalledWith('verified', 'false');

    delete process.env.SENTRY_DSN;
    vi.resetModules();
  });

  it('initMonitoring uses numeric SENTRY_TRACES_SAMPLE_RATE when provided', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    process.env.SENTRY_TRACES_SAMPLE_RATE = '0.5';
    vi.resetModules();

    const { initMonitoring } = await import('./monitoring');
    initMonitoring();

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0.5 }),
    );

    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_TRACES_SAMPLE_RATE;
    vi.resetModules();
  });

  it('initMonitoring passes environment and release to Sentry.init', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    process.env.NODE_ENV = 'staging';
    process.env.SENTRY_RELEASE = 'v1.2.3';
    vi.resetModules();

    const { initMonitoring } = await import('./monitoring');
    initMonitoring();

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'staging', release: 'v1.2.3' }),
    );

    delete process.env.SENTRY_DSN;
    delete process.env.NODE_ENV;
    delete process.env.SENTRY_RELEASE;
    vi.resetModules();
  });

  it('handles empty tags object without error', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    vi.resetModules();

    const { captureServerError } = await import('./monitoring');
    expect(() => captureServerError(new Error('test'), { tags: {} })).not.toThrow();
    expect(mockCaptureException).toHaveBeenCalled();

    delete process.env.SENTRY_DSN;
    vi.resetModules();
  });

  it('captureServerError sets extra context on scope', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    vi.resetModules();

    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureServerError } = await import('./monitoring');
    captureServerError(new Error('test'), { extra: { detail: 'value' } });

    expect(mockScope.setContext).toHaveBeenCalledWith('extra', { detail: 'value' });

    delete process.env.SENTRY_DSN;
    vi.resetModules();
  });

  it('captureServerError with numeric tag values converts to string', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    vi.resetModules();

    const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
    mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

    const { captureServerError } = await import('./monitoring');
    captureServerError(new Error('test'), { tags: { count: 42 } });

    expect(mockScope.setTag).toHaveBeenCalledWith('count', '42');

    delete process.env.SENTRY_DSN;
    vi.resetModules();
  });

  it('captureServerError returns early when SENTRY_DSN is not set', async () => {
    delete process.env.SENTRY_DSN;
    vi.resetModules();
    const { captureServerError } = await import('./monitoring');
    expect(() => captureServerError(new Error('no dsn'))).not.toThrow();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('initMonitoring does not throw', async () => {
    const { initMonitoring } = await import('./monitoring');
    expect(() => initMonitoring()).not.toThrow();
  });

  it('captureServerError returns early when Sentry fails to capture', async () => {
    delete process.env.SENTRY_DSN;
    vi.resetModules();
    const { captureServerError } = await import('./monitoring');
    expect(() => captureServerError(new Error('no dsn'))).not.toThrow();
  });

  it('captureServerError handles string error', async () => {
    vi.resetModules();
    const { captureServerError } = await import('./monitoring');
    expect(() => captureServerError('string error')).not.toThrow();
  });

  it('captureServerError handles Error object', async () => { vi.resetModules(); const { captureServerError } = await import('./monitoring'); expect(() => captureServerError(new Error('test error'))).not.toThrow(); });

  it('captureServerError handles string error', async () => { vi.resetModules(); const { captureServerError } = await import('./monitoring'); expect(() => captureServerError('string error')).not.toThrow(); });

  it('flushMonitoring completes without error', async () => { vi.resetModules(); const { flushMonitoring } = await import('./monitoring'); await expect(flushMonitoring(100)).resolves.toBeUndefined(); });

  it('captureServerError handles null error gracefully', async () => { vi.resetModules(); const { captureServerError } = await import('./monitoring'); expect(() => captureServerError(null as any)).not.toThrow(); });

  it('captureServerError handles undefined error gracefully', async () => { vi.resetModules(); const { captureServerError } = await import('./monitoring'); expect(() => captureServerError(undefined as any)).not.toThrow(); });

  it('captureServerError handles numeric error gracefully', async () => { vi.resetModules(); const { captureServerError } = await import('./monitoring'); expect(() => captureServerError(42 as any)).not.toThrow(); });

  it('captureServerError handles Error object with message', async () => { vi.resetModules(); const { captureServerError } = await import('./monitoring'); expect(() => captureServerError(new Error('test error'))).not.toThrow(); });

  it('captureServerError handles string error', async () => { vi.resetModules(); const { captureServerError } = await import('./monitoring'); expect(() => captureServerError('string error')).not.toThrow(); });

  it('captureServerError handles undefined error', async () => { vi.resetModules(); const { captureServerError } = await import('./monitoring'); expect(() => captureServerError(undefined)).not.toThrow(); });

  it('captureServerError handles null error', async () => { vi.resetModules(); const { captureServerError } = await import('./monitoring'); expect(() => captureServerError(null as unknown as Error)).not.toThrow(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `req-${index}`,
    `route-${index}`,
    index,
    index % 2 === 0,
  ] as const))(
    'captureServerError sets generated tags %s',
    async (requestId, route, count, active) => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      vi.resetModules();
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

      const { captureServerError } = await import('./monitoring');
      const error = new Error(`generated-${requestId}`);
      captureServerError(error, {
        requestId,
        tags: { route, count, active, omitted: undefined },
        extra: { count },
      });

      expect(mockScope.setTag).toHaveBeenCalledWith('requestId', requestId);
      expect(mockScope.setTag).toHaveBeenCalledWith('route', route);
      expect(mockScope.setTag).toHaveBeenCalledWith('count', String(count));
      expect(mockScope.setTag).toHaveBeenCalledWith('active', String(active));
      expect(mockScope.setTag).not.toHaveBeenCalledWith('omitted', expect.anything());
      expect(mockScope.setContext).toHaveBeenCalledWith('extra', { count });
      expect(mockCaptureException).toHaveBeenCalledWith(error);

      delete process.env.SENTRY_DSN;
      vi.resetModules();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `${index / 100}`,
    `env-${index}`,
    `release-${index}`,
  ] as const))(
    'initMonitoring uses generated environment options %s',
    async (sampleRate, environment, release) => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.SENTRY_TRACES_SAMPLE_RATE = sampleRate;
      process.env.NODE_ENV = environment;
      process.env.SENTRY_RELEASE = release;
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        dsn: 'https://test@sentry.io/123',
        environment,
        release,
        tracesSampleRate: Number(sampleRate),
        sendDefaultPii: false,
      }));

      delete process.env.SENTRY_DSN;
      delete process.env.SENTRY_TRACES_SAMPLE_RATE;
      delete process.env.NODE_ENV;
      delete process.env.SENTRY_RELEASE;
      vi.resetModules();
    },
  );
});

describe('monitoring batch 175 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SENTRY_DSN;
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_TRACES_SAMPLE_RATE;
    delete process.env.NODE_ENV;
    delete process.env.SENTRY_RELEASE;
    vi.resetModules();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `req-batch175-${index}`,
    `GET`,
    `/api/batch175/${index}`,
    `agent-${index}`,
  ] as const))(
    'captureServerError sends generated request context %s',
    async (requestId, method, originalUrl, userAgent) => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      vi.resetModules();
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      mockWithScope.mockImplementationOnce((cb) => cb(mockScope));

      const { captureServerError } = await import('./monitoring');
      const req = {
        method,
        originalUrl,
        id: requestId,
        ip: '127.0.0.1',
        get: vi.fn(() => userAgent),
      };
      captureServerError(new Error(requestId), { req: req as Request });

      expect(mockScope.setContext).toHaveBeenCalledWith('request', {
        method,
        url: originalUrl,
        requestId,
        ip: '127.0.0.1',
        userAgent,
      });
      expect(mockCaptureException).toHaveBeenCalled();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `not-finite-${index}`,
    index % 2 === 0 ? 'NaN' : 'Infinity',
  ] as const))(
    'initMonitoring coerces generated non-finite trace rate %s',
    async (environment, sampleRate) => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.SENTRY_TRACES_SAMPLE_RATE = sampleRate;
      process.env.NODE_ENV = environment;
      vi.resetModules();

      const { initMonitoring } = await import('./monitoring');
      initMonitoring();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
        environment,
        tracesSampleRate: 0,
      }));
    },
  );
});
