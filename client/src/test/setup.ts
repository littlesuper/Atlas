import '@testing-library/jest-dom';

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
