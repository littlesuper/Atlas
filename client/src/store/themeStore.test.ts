import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api', () => ({
  authApi: {
    updatePreferences: vi.fn().mockResolvedValue({}),
    getPreferences: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import { useThemeStore } from './themeStore';
import { authApi } from '../api';

describe('themeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.removeAttribute('arco-theme');
    useThemeStore.setState({ theme: 'light' });
    vi.clearAllMocks();
  });

  // ─── Initial state ────────────────────────────────────────
  it('defaults to light theme', () => {
    expect(useThemeStore.getState().theme).toBe('light');
  });

  // ─── setTheme ─────────────────────────────────────────────
  it('setTheme("dark") updates state, localStorage, and body attribute', () => {
    useThemeStore.getState().setTheme('dark');

    expect(useThemeStore.getState().theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.body.getAttribute('arco-theme')).toBe('dark');
  });

  it('setTheme("light") removes body attribute', () => {
    document.body.setAttribute('arco-theme', 'dark');
    useThemeStore.getState().setTheme('light');

    expect(useThemeStore.getState().theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.body.getAttribute('arco-theme')).toBeNull();
  });

  it('setTheme calls authApi.updatePreferences', () => {
    useThemeStore.getState().setTheme('dark');
    expect(authApi.updatePreferences).toHaveBeenCalledWith({ theme: 'dark' });
  });

  // ─── toggleTheme ──────────────────────────────────────────
  it('toggleTheme switches from light to dark', () => {
    useThemeStore.setState({ theme: 'light' });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('toggleTheme switches from dark to light', () => {
    useThemeStore.setState({ theme: 'dark' });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
  });

  // ─── loadTheme ────────────────────────────────────────────
  it('loadTheme reads "dark" from localStorage', () => {
    localStorage.setItem('theme', 'dark');
    useThemeStore.getState().loadTheme();

    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.body.getAttribute('arco-theme')).toBe('dark');
  });

  it('loadTheme defaults to light when localStorage is empty', () => {
    useThemeStore.getState().loadTheme();
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('loadTheme defaults to light for invalid localStorage value', () => {
    localStorage.setItem('theme', 'rainbow');
    useThemeStore.getState().loadTheme();
    expect(useThemeStore.getState().theme).toBe('light');
  });

  // ─── syncFromServer ───────────────────────────────────────
  it('syncFromServer updates theme from server preference', async () => {
    vi.mocked(authApi.getPreferences).mockResolvedValue({ data: { theme: 'dark' } } as any);

    await useThemeStore.getState().syncFromServer();

    expect(useThemeStore.getState().theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('syncFromServer keeps local value on server error', async () => {
    vi.mocked(authApi.getPreferences).mockRejectedValue(new Error('Network'));

    useThemeStore.setState({ theme: 'light' });
    await useThemeStore.getState().syncFromServer();

    expect(useThemeStore.getState().theme).toBe('light');
  });
});
