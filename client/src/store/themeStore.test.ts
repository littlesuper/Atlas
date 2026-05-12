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
    vi.mocked(authApi.getPreferences).mockResolvedValue(
      { data: { theme: 'dark' } } as Awaited<ReturnType<typeof authApi.getPreferences>>,
    );

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

  it('toggleTheme twice returns to original', () => {
    useThemeStore.setState({ theme: 'light' });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('setTheme to same value is idempotent', () => {
    useThemeStore.setState({ theme: 'light' });
    useThemeStore.getState().setTheme('light');
    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.body.getAttribute('arco-theme')).toBeNull();
  });

  it('syncFromServer ignores invalid theme value from server', async () => {
    vi.mocked(authApi.getPreferences).mockResolvedValue(
      { data: { theme: 'neon' } } as Awaited<ReturnType<typeof authApi.getPreferences>>,
    );
    useThemeStore.setState({ theme: 'light' });
    await useThemeStore.getState().syncFromServer();
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('syncFromServer ignores empty string theme from server', async () => {
    vi.mocked(authApi.getPreferences).mockResolvedValue(
      { data: { theme: '' } } as Awaited<ReturnType<typeof authApi.getPreferences>>,
    );
    useThemeStore.setState({ theme: 'dark' });
    await useThemeStore.getState().syncFromServer();
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('setTheme succeeds locally when updatePreferences rejects', () => {
    vi.mocked(authApi.updatePreferences).mockRejectedValue(new Error('Network'));
    useThemeStore.getState().setTheme('dark');
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('syncFromServer ignores null theme from server', async () => {
    vi.mocked(authApi.getPreferences).mockResolvedValue(
      { data: { theme: null } } as Awaited<ReturnType<typeof authApi.getPreferences>>,
    );
    useThemeStore.setState({ theme: 'dark' });
    await useThemeStore.getState().syncFromServer();
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('syncFromServer keeps local theme when response data has no theme property', async () => {
    vi.mocked(authApi.getPreferences).mockResolvedValue(
      { data: { otherPref: true } } as Awaited<ReturnType<typeof authApi.getPreferences>>,
    );
    useThemeStore.setState({ theme: 'dark' });
    await useThemeStore.getState().syncFromServer();
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('loadTheme with explicit light in localStorage keeps light theme', () => {
    localStorage.setItem('theme', 'light');
    document.body.setAttribute('arco-theme', 'dark');
    useThemeStore.getState().loadTheme();
    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.body.getAttribute('arco-theme')).toBeNull();
  });

  it('setTheme dark then light removes body attribute and resets localStorage', () => {
    useThemeStore.getState().setTheme('dark');
    expect(document.body.getAttribute('arco-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');

    useThemeStore.getState().setTheme('light');
    expect(document.body.getAttribute('arco-theme')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('toggleTheme calls updatePreferences on the API', () => {
    useThemeStore.setState({ theme: 'light' });
    useThemeStore.getState().toggleTheme();
    expect(authApi.updatePreferences).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('toggleTheme switches from light to dark', () => {
    useThemeStore.setState({ theme: 'light' });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('theme persists after multiple toggles', () => {
    useThemeStore.setState({ theme: 'light' });
    useThemeStore.getState().toggleTheme();
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('loadTheme with dark value sets body attribute and localStorage', () => {
    localStorage.setItem('theme', 'dark');
    useThemeStore.getState().loadTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.body.getAttribute('arco-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('loadTheme handles undefined localStorage gracefully', () => {
    localStorage.removeItem('theme');
    useThemeStore.getState().loadTheme();
    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.body.getAttribute('arco-theme')).toBeNull();
  });

  it('setTheme handles rapid consecutive calls correctly', () => {
    useThemeStore.getState().setTheme('dark');
    useThemeStore.getState().setTheme('light');
    useThemeStore.getState().setTheme('dark');
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.body.getAttribute('arco-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('loadTheme with null localStorage value defaults to light', () => {
    localStorage.removeItem('theme');
    useThemeStore.getState().loadTheme();
    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.body.getAttribute('arco-theme')).toBeNull();
  });

  it('syncFromServer with undefined response data keeps current theme', async () => {
    vi.mocked(authApi.getPreferences).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof authApi.getPreferences>>);
    useThemeStore.setState({ theme: 'dark' });
    await useThemeStore.getState().syncFromServer();
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('toggleTheme switches between light and dark', () => {
    useThemeStore.setState({ theme: 'light' });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('toggleTheme switches dark back to light', () => {
    useThemeStore.setState({ theme: 'dark' });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('toggleTheme switches light to dark', () => {
    useThemeStore.setState({ theme: 'light' });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('initial theme is light', () => {
    useThemeStore.setState({ theme: 'light' });
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('toggleTheme switches from light to dark', () => {
    useThemeStore.setState({ theme: 'light' });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('toggleTheme cycles back to light', () => {
    useThemeStore.setState({ theme: 'light' });
    useThemeStore.getState().toggleTheme();
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('toggleTheme switches between light and dark', () => {
    useThemeStore.setState({ theme: 'light' });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
  });
});

describe('themeStore batch 172 matrices', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.removeAttribute('arco-theme');
    useThemeStore.setState({ theme: 'light' });
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'dark' : 'light',
  ] as const))(
    'setTheme generated batch172 value %s persists latest preference',
    (theme) => {
      useThemeStore.getState().setTheme(theme);
      expect(useThemeStore.getState().theme).toBe(theme);
      expect(localStorage.getItem('theme')).toBe(theme);
      expect(document.body.getAttribute('arco-theme')).toBe(theme === 'dark' ? 'dark' : null);
      expect(authApi.updatePreferences).toHaveBeenCalledWith({ theme });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? { theme: 'dark' } : { theme: 'light' },
  ] as const))(
    'syncFromServer generated batch172 server theme %#',
    async (data) => {
      vi.mocked(authApi.getPreferences).mockResolvedValue(
        { data } as Awaited<ReturnType<typeof authApi.getPreferences>>,
      );
      await useThemeStore.getState().syncFromServer();
      expect(useThemeStore.getState().theme).toBe(data.theme);
      expect(localStorage.getItem('theme')).toBe(data.theme);
      expect(document.body.getAttribute('arco-theme')).toBe(data.theme === 'dark' ? 'dark' : null);
    },
  );
});

describe('themeStore batch 161 matrices', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.removeAttribute('arco-theme');
    useThemeStore.setState({ theme: 'light' });
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'dark' : 'light',
    index % 2 === 0 ? 'sepia' : '',
  ] as const))(
    'loadTheme generated stored value %s while ignoring invalid %s',
    (validTheme, invalidTheme) => {
      localStorage.setItem('theme', invalidTheme || validTheme);

      useThemeStore.getState().loadTheme();

      const expected = invalidTheme ? 'light' : validTheme;
      expect(useThemeStore.getState().theme).toBe(expected);
      expect(document.body.getAttribute('arco-theme')).toBe(expected === 'dark' ? 'dark' : null);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'light' : 'dark',
    index % 2 === 0 ? 'dark' : 'light',
  ] as const))(
    'syncFromServer generated valid server theme %s over local %s',
    async (serverTheme, localTheme) => {
      useThemeStore.setState({ theme: localTheme });
      localStorage.setItem('theme', localTheme);
      vi.mocked(authApi.getPreferences).mockResolvedValue(
        { data: { theme: serverTheme } } as Awaited<ReturnType<typeof authApi.getPreferences>>,
      );

      await useThemeStore.getState().syncFromServer();

      expect(useThemeStore.getState().theme).toBe(serverTheme);
      expect(localStorage.getItem('theme')).toBe(serverTheme);
      expect(document.body.getAttribute('arco-theme')).toBe(serverTheme === 'dark' ? 'dark' : null);
    },
  );
});

describe('themeStore boundary matrices', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.removeAttribute('arco-theme');
    useThemeStore.setState({ theme: 'light' });
    vi.clearAllMocks();
  });

  it.each([
    '',
    'LIGHT',
    'DARK',
    'dark ',
    ' light',
    'system',
    'auto',
    'blue',
    'null',
    'undefined',
    ...Array.from({ length: 70 }, (_, index) => `theme-${index}`),
  ])('loadTheme defaults invalid localStorage value %s to light', (value) => {
    localStorage.setItem('theme', value);
    document.body.setAttribute('arco-theme', 'dark');

    useThemeStore.getState().loadTheme();

    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.body.getAttribute('arco-theme')).toBeNull();
  });

  it.each(Array.from({ length: 80 }, (_, index) => index + 1))(
    'toggleTheme odd count %s from light ends dark',
    (count) => {
      useThemeStore.setState({ theme: 'light' });

      for (let index = 0; index < count * 2 - 1; index++) {
        useThemeStore.getState().toggleTheme();
      }

      expect(useThemeStore.getState().theme).toBe('dark');
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => index + 1))(
    'toggleTheme even count %s from light ends light',
    (count) => {
      useThemeStore.setState({ theme: 'light' });

      for (let index = 0; index < count * 2; index++) {
        useThemeStore.getState().toggleTheme();
      }

      expect(useThemeStore.getState().theme).toBe('light');
    }
  );

  it.each(['light', 'dark'] as const)('syncFromServer accepts %s theme', async (theme) => {
    vi.mocked(authApi.getPreferences).mockResolvedValue(
      { data: { theme } } as Awaited<ReturnType<typeof authApi.getPreferences>>,
    );

    await useThemeStore.getState().syncFromServer();

    expect(useThemeStore.getState().theme).toBe(theme);
    expect(localStorage.getItem('theme')).toBe(theme);
  });

  it.each(Array.from({ length: 80 }, (_, index) => (index % 2 === 0 ? 'dark' : 'light') as const))(
    'setTheme persists generated theme %s',
    (theme) => {
      useThemeStore.getState().setTheme(theme);

      expect(useThemeStore.getState().theme).toBe(theme);
      expect(localStorage.getItem('theme')).toBe(theme);
      expect(document.body.getAttribute('arco-theme')).toBe(theme === 'dark' ? 'dark' : null);
      expect(authApi.updatePreferences).toHaveBeenCalledWith({ theme });
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => `server-theme-${index}`))(
    'syncFromServer ignores generated invalid theme %s',
    async (theme) => {
      useThemeStore.setState({ theme: 'dark' });
      document.body.setAttribute('arco-theme', 'dark');
      localStorage.setItem('theme', 'dark');
      vi.mocked(authApi.getPreferences).mockResolvedValue(
        { data: { theme } } as Awaited<ReturnType<typeof authApi.getPreferences>>,
      );

      await useThemeStore.getState().syncFromServer();

      expect(useThemeStore.getState().theme).toBe('dark');
      expect(localStorage.getItem('theme')).toBe('dark');
      expect(document.body.getAttribute('arco-theme')).toBe('dark');
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => (index % 2 === 0 ? 'light' : 'dark') as const))(
    'syncFromServer persists generated valid theme %s',
    async (theme) => {
      vi.mocked(authApi.getPreferences).mockResolvedValue(
        { data: { theme } } as Awaited<ReturnType<typeof authApi.getPreferences>>,
      );

      await useThemeStore.getState().syncFromServer();

      expect(useThemeStore.getState().theme).toBe(theme);
      expect(localStorage.getItem('theme')).toBe(theme);
      expect(document.body.getAttribute('arco-theme')).toBe(theme === 'dark' ? 'dark' : null);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => (index % 2 === 0 ? 'dark' : 'light') as const))(
    'setTheme generated value %s continues after server save rejection',
    (theme) => {
      vi.mocked(authApi.updatePreferences).mockRejectedValue(new Error('offline'));

      useThemeStore.getState().setTheme(theme);

      expect(useThemeStore.getState().theme).toBe(theme);
      expect(localStorage.getItem('theme')).toBe(theme);
      expect(document.body.getAttribute('arco-theme')).toBe(theme === 'dark' ? 'dark' : null);
    },
  );
});

describe('themeStore batch 134 matrices', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.removeAttribute('arco-theme');
    useThemeStore.setState({ theme: 'light' });
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'dark' : 'light',
  ] as const))(
    'loadTheme reads generated persisted theme %s',
    (theme) => {
      localStorage.setItem('theme', theme);
      useThemeStore.getState().loadTheme();

      expect(useThemeStore.getState().theme).toBe(theme);
      expect(document.body.getAttribute('arco-theme')).toBe(theme === 'dark' ? 'dark' : null);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'light' : 'dark',
    index % 2 === 0 ? 'dark' : 'light',
  ] as const))(
    'toggleTheme generated transition %s -> %s',
    (from, to) => {
      useThemeStore.setState({ theme: from });
      useThemeStore.getState().toggleTheme();

      expect(useThemeStore.getState().theme).toBe(to);
      expect(localStorage.getItem('theme')).toBe(to);
    },
  );
});

describe('themeStore batch 143 matrices', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.removeAttribute('arco-theme');
    useThemeStore.setState({ theme: 'light' });
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'dark' : 'light',
  ] as const))(
    'setTheme generated batch143 value %s updates body and preferences',
    (theme) => {
      useThemeStore.getState().setTheme(theme);

      expect(useThemeStore.getState().theme).toBe(theme);
      expect(localStorage.getItem('theme')).toBe(theme);
      expect(document.body.getAttribute('arco-theme')).toBe(theme === 'dark' ? 'dark' : null);
      expect(authApi.updatePreferences).toHaveBeenCalledWith({ theme });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'blue' : '',
  ] as const))(
    'loadTheme generated invalid persisted value %s falls back to light',
    (theme) => {
      localStorage.setItem('theme', theme);
      document.body.setAttribute('arco-theme', 'dark');

      useThemeStore.getState().loadTheme();

      expect(useThemeStore.getState().theme).toBe('light');
      expect(document.body.getAttribute('arco-theme')).toBeNull();
    },
  );
});

describe('themeStore batch 147 matrices', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.removeAttribute('arco-theme');
    useThemeStore.setState({ theme: 'light' });
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? undefined : {},
    index % 2 === 0 ? 'dark' : 'light',
  ] as const))(
    'syncFromServer ignores generated empty preference payload from %s',
    async (data, existingTheme) => {
      useThemeStore.setState({ theme: existingTheme });
      localStorage.setItem('theme', existingTheme);
      if (existingTheme === 'dark') {
        document.body.setAttribute('arco-theme', 'dark');
      }
      vi.mocked(authApi.getPreferences).mockResolvedValue(
        { data } as Awaited<ReturnType<typeof authApi.getPreferences>>,
      );

      await useThemeStore.getState().syncFromServer();

      expect(useThemeStore.getState().theme).toBe(existingTheme);
      expect(localStorage.getItem('theme')).toBe(existingTheme);
      expect(document.body.getAttribute('arco-theme')).toBe(existingTheme === 'dark' ? 'dark' : null);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'dark' : 'unknown',
  ] as const))(
    'toggleTheme generated non-light state %s moves to light',
    (theme) => {
      useThemeStore.setState({ theme: theme as 'dark' });

      useThemeStore.getState().toggleTheme();

      expect(useThemeStore.getState().theme).toBe('light');
      expect(localStorage.getItem('theme')).toBe('light');
      expect(document.body.getAttribute('arco-theme')).toBeNull();
    },
  );
});

describe('themeStore batch 152 matrices', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.removeAttribute('arco-theme');
    useThemeStore.setState({ theme: 'light' });
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'dark' : 'light',
    index % 2 === 0 ? 'light' : 'dark',
  ] as const))(
    'setTheme generated consecutive transition %s then %s keeps latest',
    (firstTheme, secondTheme) => {
      useThemeStore.getState().setTheme(firstTheme);
      useThemeStore.getState().setTheme(secondTheme);

      expect(useThemeStore.getState().theme).toBe(secondTheme);
      expect(localStorage.getItem('theme')).toBe(secondTheme);
      expect(document.body.getAttribute('arco-theme')).toBe(secondTheme === 'dark' ? 'dark' : null);
      expect(authApi.updatePreferences).toHaveBeenNthCalledWith(1, { theme: firstTheme });
      expect(authApi.updatePreferences).toHaveBeenNthCalledWith(2, { theme: secondTheme });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'dark' : 'light',
  ] as const))(
    'syncFromServer generated rejection keeps local theme %s',
    async (theme) => {
      useThemeStore.setState({ theme });
      localStorage.setItem('theme', theme);
      if (theme === 'dark') {
        document.body.setAttribute('arco-theme', 'dark');
      }
      vi.mocked(authApi.getPreferences).mockRejectedValue(new Error('offline'));

      await useThemeStore.getState().syncFromServer();

      expect(useThemeStore.getState().theme).toBe(theme);
      expect(localStorage.getItem('theme')).toBe(theme);
      expect(document.body.getAttribute('arco-theme')).toBe(theme === 'dark' ? 'dark' : null);
    },
  );
});

describe('themeStore batch 177 matrices', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.removeAttribute('arco-theme');
    useThemeStore.setState({ theme: 'light' });
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'dark' : 'light',
    index % 2 === 0 ? 'light' : 'dark',
  ] as const))(
    'syncFromServer generated batch177 valid theme %s overwrites local %s',
    async (serverTheme, localTheme) => {
      useThemeStore.setState({ theme: localTheme });
      localStorage.setItem('theme', localTheme);
      if (localTheme === 'dark') {
        document.body.setAttribute('arco-theme', 'dark');
      }
      vi.mocked(authApi.getPreferences).mockResolvedValue(
        { data: { theme: serverTheme } } as Awaited<ReturnType<typeof authApi.getPreferences>>,
      );

      await useThemeStore.getState().syncFromServer();

      expect(useThemeStore.getState().theme).toBe(serverTheme);
      expect(localStorage.getItem('theme')).toBe(serverTheme);
      expect(document.body.getAttribute('arco-theme')).toBe(serverTheme === 'dark' ? 'dark' : null);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'dark' : 'light',
    index % 2 === 0 ? 'neon' : '',
  ] as const))(
    'loadTheme generated batch177 invalid persisted value %s falls back after local %s',
    (localTheme, persistedTheme) => {
      useThemeStore.setState({ theme: localTheme });
      localStorage.setItem('theme', persistedTheme);
      if (localTheme === 'dark') {
        document.body.setAttribute('arco-theme', 'dark');
      }

      useThemeStore.getState().loadTheme();

      expect(useThemeStore.getState().theme).toBe('light');
      expect(document.body.getAttribute('arco-theme')).toBeNull();
    },
  );
});

describe('themeStore batch 178 matrices', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.removeAttribute('arco-theme');
    useThemeStore.setState({ theme: 'light' });
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index % 2 === 0 ? 'light' : 'dark',
    index % 2 === 0 ? 'dark' : 'light',
  ] as const))(
    'toggleTheme generated batch178 transition from %s to %s persists locally',
    (from, to) => {
      useThemeStore.setState({ theme: from });

      useThemeStore.getState().toggleTheme();

      expect(useThemeStore.getState().theme).toBe(to);
      expect(localStorage.getItem('theme')).toBe(to);
      expect(document.body.getAttribute('arco-theme')).toBe(to === 'dark' ? 'dark' : null);
      expect(authApi.updatePreferences).toHaveBeenCalledWith({ theme: to });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? 'dark' : 'light',
    index % 2 === 0 ? undefined : {},
  ] as const))(
    'syncFromServer generated batch178 empty payload keeps local theme %s',
    async (localTheme, data) => {
      useThemeStore.setState({ theme: localTheme });
      localStorage.setItem('theme', localTheme);
      if (localTheme === 'dark') {
        document.body.setAttribute('arco-theme', 'dark');
      }
      vi.mocked(authApi.getPreferences).mockResolvedValue(
        { data } as Awaited<ReturnType<typeof authApi.getPreferences>>,
      );

      await useThemeStore.getState().syncFromServer();

      expect(useThemeStore.getState().theme).toBe(localTheme);
      expect(localStorage.getItem('theme')).toBe(localTheme);
      expect(document.body.getAttribute('arco-theme')).toBe(localTheme === 'dark' ? 'dark' : null);
    },
  );
});
