import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from './circuitBreaker';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    cb = new CircuitBreaker('test');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 1. Successful execution returns value (CLOSED)
  it('should return the value from a successful execution in CLOSED state', async () => {
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.getState()).toEqual({ state: 'CLOSED', failureCount: 0 });
  });

  // 2. Failed execution increments failure count
  it('should increment failure count on failed execution', async () => {
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    expect(cb.getState()).toEqual({ state: 'CLOSED', failureCount: 1 });
  });

  it('should increment failure count on each consecutive failure', async () => {
    await expect(cb.execute(() => Promise.reject(new Error('fail 1')))).rejects.toThrow();
    expect(cb.getState().failureCount).toBe(1);

    await expect(cb.execute(() => Promise.reject(new Error('fail 2')))).rejects.toThrow();
    expect(cb.getState().failureCount).toBe(2);
  });

  // 3. Reaching failure threshold transitions to OPEN
  it('should transition to OPEN when failure count reaches threshold', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(cb.getState()).toEqual({ state: 'OPEN', failureCount: 3 });
  });

  // 4. OPEN state rejects immediately
  it('should reject immediately in OPEN state without calling the function', async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    const fn = vi.fn(() => Promise.resolve('should not run'));
    await expect(cb.execute(fn)).rejects.toThrow('熔断器 [test] 已开启，服务暂时不可用');
    expect(fn).not.toHaveBeenCalled();
  });

  // 5. After resetTimeout, transitions to HALF_OPEN
  it('should transition to HALF_OPEN after resetTimeout elapses', async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(cb.getState().state).toBe('OPEN');

    // Advance time past resetTimeout
    vi.advanceTimersByTime(60_000);

    // Next execute call should transition to HALF_OPEN and run the function
    const result = await cb.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    // Success in HALF_OPEN resets to CLOSED
    expect(cb.getState().state).toBe('CLOSED');
  });

  it('should still be OPEN if resetTimeout has not fully elapsed', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    vi.advanceTimersByTime(59_999);

    await expect(cb.execute(() => Promise.resolve('try'))).rejects.toThrow(
      '熔断器 [test] 已开启，服务暂时不可用'
    );
  });

  // 6. HALF_OPEN success resets to CLOSED
  it('should reset to CLOSED on successful execution in HALF_OPEN state', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    vi.advanceTimersByTime(60_000);

    const result = await cb.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(cb.getState()).toEqual({ state: 'CLOSED', failureCount: 0 });
  });

  // 7. HALF_OPEN failure reopens to OPEN
  it('should transition back to OPEN on failure in HALF_OPEN state', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    vi.advanceTimersByTime(60_000);

    await expect(cb.execute(() => Promise.reject(new Error('still broken')))).rejects.toThrow(
      'still broken'
    );
    expect(cb.getState().state).toBe('OPEN');
  });

  // 8. Exceeding halfOpenRequests in HALF_OPEN throws
  it('should reject when halfOpenRequests limit is exceeded in HALF_OPEN state', async () => {
    const cb2 = new CircuitBreaker('test-half', {
      failureThreshold: 2,
      resetTimeout: 5000,
      halfOpenRequests: 1,
    });

    // Trip the breaker
    for (let i = 0; i < 2; i++) {
      await expect(cb2.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(cb2.getState().state).toBe('OPEN');

    vi.advanceTimersByTime(5000);

    // First call in HALF_OPEN: allowed (uses the 1 halfOpenRequest slot)
    // Make it a slow promise so it doesn't resolve before our second call
    let resolveFirst!: (value: string) => void;
    const slowPromise = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });

    const firstCall = cb2.execute(() => slowPromise);

    // Second call should be rejected because halfOpenRequests (1) is exhausted
    await expect(cb2.execute(() => Promise.resolve('extra'))).rejects.toThrow(
      '熔断器 [test-half] 半开状态，等待试探请求完成'
    );

    // Resolve the first call to clean up
    resolveFirst('done');
    await firstCall;
  });

  it('should allow multiple halfOpenRequests when configured', async () => {
    const cb3 = new CircuitBreaker('test-multi', {
      failureThreshold: 2,
      resetTimeout: 5000,
      halfOpenRequests: 3,
    });

    for (let i = 0; i < 2; i++) {
      await expect(cb3.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    vi.advanceTimersByTime(5000);

    // Should allow up to 3 requests in HALF_OPEN
    // Each successful call resets to CLOSED, so we test sequential calls
    // Actually, the first success will reset to CLOSED.
    // To test multiple half-open attempts, we need pending promises.
    let resolvers: Array<(v: string) => void> = [];
    const makeSlowPromise = () =>
      new Promise<string>((resolve) => {
        resolvers.push(resolve);
      });

    const call1 = cb3.execute(makeSlowPromise);
    const call2 = cb3.execute(makeSlowPromise);
    const call3 = cb3.execute(makeSlowPromise);

    // 4th call should be rejected
    await expect(cb3.execute(() => Promise.resolve('extra'))).rejects.toThrow(
      '熔断器 [test-multi] 半开状态，等待试探请求完成'
    );

    // Clean up
    resolvers.forEach((r) => r('done'));
    await Promise.all([call1, call2, call3]);
  });

  // 9. Custom options override defaults
  it('should use custom failureThreshold', async () => {
    const cb4 = new CircuitBreaker('custom', { failureThreshold: 5 });

    for (let i = 0; i < 4; i++) {
      await expect(cb4.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    // Still CLOSED after 4 failures (threshold is 5)
    expect(cb4.getState().state).toBe('CLOSED');
    expect(cb4.getState().failureCount).toBe(4);

    await expect(cb4.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(cb4.getState().state).toBe('OPEN');
    expect(cb4.getState().failureCount).toBe(5);
  });

  it('should use custom resetTimeout', async () => {
    const cb5 = new CircuitBreaker('custom-timeout', {
      failureThreshold: 1,
      resetTimeout: 10_000,
    });

    await expect(cb5.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(cb5.getState().state).toBe('OPEN');

    // Not enough time
    vi.advanceTimersByTime(9_999);
    await expect(cb5.execute(() => Promise.resolve('try'))).rejects.toThrow(
      '熔断器 [custom-timeout] 已开启，服务暂时不可用'
    );

    // Enough time
    vi.advanceTimersByTime(1);
    const result = await cb5.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(cb5.getState().state).toBe('CLOSED');
  });

  // 10. getState returns correct state info
  it('should return initial state as CLOSED with zero failures', () => {
    expect(cb.getState()).toEqual({ state: 'CLOSED', failureCount: 0 });
  });

  it('should return accurate state after partial failures', async () => {
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(cb.getState()).toEqual({ state: 'CLOSED', failureCount: 2 });
  });

  it('should return OPEN state with accumulated failure count', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(cb.getState()).toEqual({ state: 'OPEN', failureCount: 3 });
  });

  // 11. Success in CLOSED resets failure count to 0
  it('should reset failure count to 0 after a successful execution', async () => {
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(cb.getState().failureCount).toBe(2);

    await cb.execute(() => Promise.resolve('success'));
    expect(cb.getState()).toEqual({ state: 'CLOSED', failureCount: 0 });
  });

  it('should reset failure count even after multiple failures followed by success', async () => {
    // Fail twice (below threshold of 3), then succeed
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

    const result = await cb.execute(() => Promise.resolve('back'));
    expect(result).toBe('back');
    expect(cb.getState()).toEqual({ state: 'CLOSED', failureCount: 0 });

    // Subsequent failure should start from 0
    await expect(cb.execute(() => Promise.reject(new Error('fail again')))).rejects.toThrow();
    expect(cb.getState().failureCount).toBe(1);
  });

  // Additional edge cases

  it('should store the name on the instance', () => {
    const named = new CircuitBreaker('my-service');
    expect(named.name).toBe('my-service');
  });

  it('should propagate the original error from a failed execution', async () => {
    const originalError = new Error('specific error message');
    await expect(cb.execute(() => Promise.reject(originalError))).rejects.toThrow(
      'specific error message'
    );
  });

  it('should handle async functions that return different types', async () => {
    const strResult = await cb.execute(() => Promise.resolve('hello'));
    expect(strResult).toBe('hello');

    const objResult = await cb.execute(() => Promise.resolve({ key: 'value' }));
    expect(objResult).toEqual({ key: 'value' });

    const arrResult = await cb.execute(() => Promise.resolve([1, 2, 3]));
    expect(arrResult).toEqual([1, 2, 3]);
  });

  it('should fully recover after OPEN -> HALF_OPEN -> CLOSED cycle', async () => {
    // Trip to OPEN
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(cb.getState().state).toBe('OPEN');

    // Wait for reset
    vi.advanceTimersByTime(60_000);

    // Recover
    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toEqual({ state: 'CLOSED', failureCount: 0 });

    // Should work normally again, requiring full threshold to trip
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(cb.getState()).toEqual({ state: 'CLOSED', failureCount: 1 });

    await cb.execute(() => Promise.resolve('still ok'));
    expect(cb.getState()).toEqual({ state: 'CLOSED', failureCount: 0 });
  });

  it('should track failure count correctly after HALF_OPEN failure and re-opening', async () => {
    // Trip to OPEN
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    // Wait and fail in HALF_OPEN
    vi.advanceTimersByTime(60_000);
    await expect(cb.execute(() => Promise.reject(new Error('still failing')))).rejects.toThrow();
    expect(cb.getState().state).toBe('OPEN');
    // failureCount incremented again
    expect(cb.getState().failureCount).toBe(4);

    // Wait again and succeed
    vi.advanceTimersByTime(60_000);
    await cb.execute(() => Promise.resolve('finally'));
    expect(cb.getState()).toEqual({ state: 'CLOSED', failureCount: 0 });
  });
});
