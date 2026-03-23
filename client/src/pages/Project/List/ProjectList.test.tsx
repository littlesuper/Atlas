import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock the API module
vi.mock('@/api/request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock authStore
const mockAuthStore = {
  isAuthenticated: true,
  user: { id: '1', username: 'admin', realName: 'Admin' },
  hasPermission: vi.fn(() => true),
  isProjectManager: vi.fn(() => true),
  loading: false,
  fetchUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  loginWithWecom: vi.fn(),
  updateProfile: vi.fn(),
};

vi.mock('@/store/authStore', () => ({
  useAuthStore: vi.fn((selector) => {
    if (typeof selector === 'function') return selector(mockAuthStore);
    return mockAuthStore;
  }),
}));

// Mock the Layout component if it exists or the page imports it
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ProjectList', () => {
  it('should be importable', async () => {
    // Simple smoke test - verify the module can be imported
    const module = await import('./index');
    expect(module).toBeDefined();
  });
});
