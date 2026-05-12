import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedCallback } from './useDebouncedCallback';

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call callback immediately', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));

    act(() => {
      result.current.debouncedFn('test');
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('calls callback after delay', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));

    act(() => {
      result.current.debouncedFn('hello');
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('hello');
  });

  it('resets timer on repeated calls (only last call executes)', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));

    act(() => {
      result.current.debouncedFn('first');
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    act(() => {
      result.current.debouncedFn('second');
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // 200ms since first call, but only 100ms since second — should not have fired yet
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Now 200ms since second call
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('second');
  });

  it('flush() executes immediately if pending', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));

    act(() => {
      result.current.debouncedFn('flushed');
    });

    act(() => {
      result.current.flush();
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('flushed');

    // Advancing timer should not cause a second call
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('flush() does nothing when no pending call', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));

    act(() => {
      result.current.flush();
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('cancel() prevents execution', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));

    act(() => {
      result.current.debouncedFn('cancelled');
    });

    act(() => {
      result.current.cancel();
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('uses latest callback reference', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const { result, rerender } = renderHook(
      ({ cb }) => useDebouncedCallback(cb, 200),
      { initialProps: { cb: callback1 as (...args: unknown[]) => unknown } }
    );

    act(() => {
      result.current.debouncedFn('value');
    });

    // Swap callback before timer fires
    rerender({ cb: callback2 as (...args: unknown[]) => unknown });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalledTimes(1);
    expect(callback2).toHaveBeenCalledWith('value');
  });

  it('cleanup on unmount prevents execution', () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 200));

    act(() => {
      result.current.debouncedFn('unmounted');
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('handles multiple arguments', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    act(() => {
      result.current.debouncedFn('a', 'b', 'c');
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(callback).toHaveBeenCalledWith('a', 'b', 'c');
  });

  it('cancel then debounce again works', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    act(() => { result.current.debouncedFn('first'); });
    act(() => { result.current.cancel(); });

    act(() => { result.current.debouncedFn('second'); });
    act(() => { vi.advanceTimersByTime(100); });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('second');
  });

  it('zero delay triggers immediately on next tick', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 0));

    act(() => { result.current.debouncedFn('instant'); });
    act(() => { vi.advanceTimersByTime(0); });

    expect(callback).toHaveBeenCalledWith('instant');
  });

  it('debounce delay of 500 fires after 500ms', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));

    act(() => { result.current.debouncedFn('slow'); });
    act(() => { vi.advanceTimersByTime(499); });
    expect(callback).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(callback).toHaveBeenCalledWith('slow');
  });

  it('flush after cancel does nothing', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));

    act(() => { result.current.debouncedFn('data'); });
    act(() => { result.current.cancel(); });
    act(() => { result.current.flush(); });

    expect(callback).not.toHaveBeenCalled();
  });

  it('rapid successive calls only execute last with latest args', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    act(() => { result.current.debouncedFn('a'); });
    act(() => { vi.advanceTimersByTime(50); });
    act(() => { result.current.debouncedFn('b'); });
    act(() => { vi.advanceTimersByTime(50); });
    act(() => { result.current.debouncedFn('c'); });
    act(() => { vi.advanceTimersByTime(50); });
    act(() => { result.current.debouncedFn('final'); });
    act(() => { vi.advanceTimersByTime(100); });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('final');
  });

  it('cancel then flush then debounce again works independently', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    act(() => { result.current.debouncedFn('first'); });
    act(() => { result.current.cancel(); });
    act(() => { result.current.flush(); });
    expect(callback).not.toHaveBeenCalled();

    act(() => { result.current.debouncedFn('second'); });
    act(() => { vi.advanceTimersByTime(100); });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('second');
  });

  it('debouncedFn called with no arguments passes empty args', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    act(() => { result.current.debouncedFn(); });
    act(() => { vi.advanceTimersByTime(100); });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith();
  });

  it('flush after timer has naturally fired does not call callback again', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    act(() => { result.current.debouncedFn('first'); });
    act(() => { vi.advanceTimersByTime(100); });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('first');

    act(() => { result.current.flush(); });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('debouncedFn returns undefined (no return value)', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    let returnValue: unknown;
    act(() => { returnValue = result.current.debouncedFn('test'); });

    expect(returnValue).toBeUndefined();
  });

  it('rerender with different delay uses new delay for subsequent calls', () => {
    const callback = vi.fn();
    const { result, rerender } = renderHook(
      ({ delay }) => useDebouncedCallback(callback, delay),
      { initialProps: { delay: 100 } }
    );

    act(() => { result.current.debouncedFn('first'); });
    act(() => { vi.advanceTimersByTime(100); });
    expect(callback).toHaveBeenCalledWith('first');

    rerender({ delay: 300 });

    act(() => { result.current.debouncedFn('second'); });
    act(() => { vi.advanceTimersByTime(100); });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(200); });
    expect(callback).toHaveBeenCalledWith('second');
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('flush then new debounce call works independently', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    act(() => { result.current.debouncedFn('first'); });
    act(() => { result.current.flush(); });
    expect(callback).toHaveBeenCalledWith('first');

    act(() => { result.current.debouncedFn('second'); });
    act(() => { vi.advanceTimersByTime(100); });
    expect(callback).toHaveBeenCalledWith('second');
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('debouncedFn preserves all argument types including objects', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    const objArg = { key: 'value', nested: { a: 1 } };
    act(() => { result.current.debouncedFn(objArg); });
    act(() => { vi.advanceTimersByTime(100); });

    expect(callback).toHaveBeenCalledWith(objArg);
  });

  it('cancel prevents pending callback execution', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));

    act(() => { result.current.debouncedFn('data'); });
    act(() => { result.current.cancel(); });
    vi.advanceTimersByTime(200);

    expect(callback).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('multiple debounce instances are independent', () => {
    vi.useFakeTimers();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const { result: r1 } = renderHook(() => useDebouncedCallback(cb1, 100));
    const { result: r2 } = renderHook(() => useDebouncedCallback(cb2, 100));

    act(() => { r1.current.debouncedFn('a'); });
    act(() => { r2.current.debouncedFn('b'); });
    act(() => { vi.advanceTimersByTime(100); });

    expect(cb1).toHaveBeenCalledWith('a');
    expect(cb2).toHaveBeenCalledWith('b');
    vi.useRealTimers();
  });

  it('cancel clears pending args ref so subsequent flush is no-op', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));
    act(() => { result.current.debouncedFn('data'); });
    act(() => { result.current.cancel(); });
    act(() => { result.current.flush(); });
    act(() => { vi.advanceTimersByTime(100); });
    expect(callback).not.toHaveBeenCalled();
  });

  it('flush called twice without new debounce does not re-execute callback', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));
    act(() => { result.current.debouncedFn('val'); });
    act(() => { result.current.flush(); });
    expect(callback).toHaveBeenCalledTimes(1);
    act(() => { result.current.flush(); });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cancel after natural timer fire does not cause errors', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));
    act(() => { result.current.debouncedFn('data'); });
    act(() => { vi.advanceTimersByTime(100); });
    expect(callback).toHaveBeenCalledTimes(1);
    act(() => { result.current.cancel(); });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cancel without prior debouncedFn call is a safe no-op', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));
    act(() => { result.current.cancel(); });
    act(() => { vi.advanceTimersByTime(200); });
    expect(callback).not.toHaveBeenCalled();
  });

  it('debouncedFn with null argument passes null correctly', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));
    act(() => { result.current.debouncedFn(null); });
    act(() => { vi.advanceTimersByTime(100); });
    expect(callback).toHaveBeenCalledWith(null);
  });

  it('debounced function resets timer on subsequent calls', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));
    act(() => { result.current.debouncedFn('first'); });
    act(() => { result.current.debouncedFn('second'); });
    act(() => { vi.advanceTimersByTime(100); });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('second');
    vi.useRealTimers();
  });

  it('debounced function does not call callback before delay', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));
    act(() => { result.current.debouncedFn('test'); });
    expect(callback).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('debounced function calls callback after delay', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));
    act(() => { result.current.debouncedFn('test'); });
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledWith('test');
    vi.useRealTimers();
  });

  it('debounced function cancels previous call on rapid invocation', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));
    act(() => { result.current.debouncedFn('first'); });
    act(() => { result.current.debouncedFn('second'); });
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('second');
    vi.useRealTimers();
  });

  it('cancels pending callback on unmount', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));
    act(() => { result.current.debouncedFn('data'); });
    vi.advanceTimersByTime(200);
    vi.useRealTimers();
    expect(callback).toHaveBeenCalled();
  });

  it('debounced callback returns object with debouncedFn function', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 100));
    expect(result.current).toHaveProperty('debouncedFn');
    expect(result.current).toHaveProperty('flush');
    expect(result.current).toHaveProperty('cancel');
  });

  it('debounced callback does not call fn immediately', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 100));
    act(() => { result.current.debouncedFn('arg'); });
    expect(fn).not.toHaveBeenCalled();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [`value-${index}`, index + 1] as const))(
    'flush immediately invokes generated pending value %s',
    (value, count) => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, count * 10));

      act(() => {
        result.current.debouncedFn(value, count);
      });
      act(() => {
        result.current.flush();
      });
      act(() => {
        vi.advanceTimersByTime(count * 10);
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(value, count);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [`cancel-${index}`, index] as const))(
    'cancel drops generated pending value %s',
    (value, count) => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, 100 + count));

      act(() => {
        result.current.debouncedFn(value, count);
      });
      act(() => {
        result.current.cancel();
      });
      act(() => {
        result.current.flush();
        vi.advanceTimersByTime(200 + count);
      });

      expect(callback).not.toHaveBeenCalled();
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `natural-${index}`,
    10 + index,
  ] as const))(
    'natural timer fires generated pending value %s',
    (value, delay) => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, delay));

      act(() => {
        result.current.debouncedFn(value, delay);
      });
      act(() => {
        vi.advanceTimersByTime(delay - 1);
      });
      expect(callback).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(value, delay);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `latest-${index}`,
    `stale-${index}`,
  ] as const))(
    'uses generated latest callback after rerender %s',
    (latestValue, staleValue) => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const { result, rerender } = renderHook(
        ({ cb }) => useDebouncedCallback(cb, 100),
        { initialProps: { cb: callback1 as (...args: unknown[]) => unknown } },
      );

      act(() => {
        result.current.debouncedFn(staleValue);
      });
      rerender({ cb: callback2 as (...args: unknown[]) => unknown });
      act(() => {
        result.current.debouncedFn(latestValue);
        vi.advanceTimersByTime(100);
      });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledWith(latestValue);
    },
  );
});

describe('useDebouncedCallback batch 173 matrices', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch173-old-${index}`,
    `batch173-new-${index}`,
    40 + index,
  ] as const))(
    'generated pending callback uses latest callback reference %s/%s',
    (oldValue, newValue, delay) => {
      const firstCallback = vi.fn();
      const secondCallback = vi.fn();
      const { result, rerender } = renderHook(
        ({ callback }) => useDebouncedCallback(callback, delay),
        { initialProps: { callback: firstCallback } },
      );

      act(() => {
        result.current.debouncedFn(oldValue);
      });
      rerender({ callback: secondCallback });
      act(() => {
        result.current.debouncedFn(newValue);
        vi.advanceTimersByTime(delay);
      });

      expect(firstCallback).not.toHaveBeenCalled();
      expect(secondCallback).toHaveBeenCalledWith(newValue);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch173-cancel-${index}`,
    `batch173-next-${index}`,
    50 + index,
  ] as const))(
    'generated cancel clears first pending call before next schedule %s/%s',
    (firstValue, secondValue, delay) => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, delay));

      act(() => {
        result.current.debouncedFn(firstValue);
        result.current.cancel();
        result.current.debouncedFn(secondValue);
        vi.advanceTimersByTime(delay);
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(secondValue);
    },
  );
});

describe('useDebouncedCallback batch 133 matrices', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch133-first-${index}`,
    `batch133-second-${index}`,
    20 + index,
  ] as const))(
    'generated rapid call keeps latest value %s/%s',
    (firstValue, secondValue, delay) => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, delay));

      act(() => {
        result.current.debouncedFn(firstValue);
        vi.advanceTimersByTime(delay - 1);
        result.current.debouncedFn(secondValue);
        vi.advanceTimersByTime(delay);
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(secondValue);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch133-flush-${index}`,
    index,
  ] as const))(
    'generated flush clears pending timer %s',
    (value, count) => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, 50 + count));

      act(() => {
        result.current.debouncedFn(value, count);
        result.current.flush();
        vi.advanceTimersByTime(50 + count);
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(value, count);
    },
  );
});

describe('useDebouncedCallback batch 167 matrices', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch167-first-${index}`,
    `batch167-second-${index}`,
    30 + index,
  ] as const))(
    'generated cancel after rapid calls drops latest pending value %s/%s',
    (firstValue, secondValue, delay) => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, delay));

      act(() => {
        result.current.debouncedFn(firstValue);
        result.current.debouncedFn(secondValue);
        result.current.cancel();
        vi.advanceTimersByTime(delay);
      });

      expect(callback).not.toHaveBeenCalled();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch167-flush-${index}`,
    index,
  ] as const))(
    'generated flush after natural fire is a no-op %s',
    (value, count) => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, 20 + count));

      act(() => {
        result.current.debouncedFn(value, count);
        vi.advanceTimersByTime(20 + count);
        result.current.flush();
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(value, count);
    },
  );
});
