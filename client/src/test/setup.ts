import '@testing-library/jest-dom';

// jsdom 某些版本的 localStorage 是不完整的 Proxy，缺少 clear 等方法。
// 用完整的 Storage mock 替换。
{
  const store: Record<string, string> = {};
  const mockStorage: Storage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() { return Object.keys(store).length; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true });
}

// jsdom 不实现 window.matchMedia，Arco Design 的 Grid/Row 组件需要它。
// 提供一个最小化的 mock，使所有使用 Arco Design 的组件测试可以在 jsdom 中运行。
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
