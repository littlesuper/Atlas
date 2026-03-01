import { useRef, useCallback, useEffect } from 'react';

/**
 * 防抖回调 Hook
 * 返回一个防抖版本的回调函数，以及 flush/cancel 方法
 *
 * @param callback 原始回调函数
 * @param delay 防抖延迟（毫秒）
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const pendingArgsRef = useRef<Parameters<T> | null>(null);

  // 保持 callback 引用最新
  callbackRef.current = callback;

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingArgsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current && pendingArgsRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      callbackRef.current(...pendingArgsRef.current);
      pendingArgsRef.current = null;
    }
  }, []);

  const debouncedFn = useCallback((...args: Parameters<T>) => {
    pendingArgsRef.current = args;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      callbackRef.current(...args);
      pendingArgsRef.current = null;
    }, delay);
  }, [delay]) as (...args: Parameters<T>) => void;

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { debouncedFn, flush, cancel };
}
