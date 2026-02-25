import { create } from 'zustand';
import { authApi } from '../api';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  loadTheme: () => void;
  syncFromServer: () => Promise<void>;
}

const applyTheme = (theme: Theme) => {
  if (theme === 'dark') {
    document.body.setAttribute('arco-theme', 'dark');
  } else {
    document.body.removeAttribute('arco-theme');
  }
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'light',

  loadTheme: () => {
    const saved = localStorage.getItem('theme') as Theme | null;
    const theme = saved === 'dark' ? 'dark' : 'light';
    applyTheme(theme);
    set({ theme });
  },

  setTheme: (theme: Theme) => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
    set({ theme });
    // 异步保存到服务端，失败不影响本地
    authApi.updatePreferences({ theme }).catch(() => {});
  },

  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    get().setTheme(next);
  },

  syncFromServer: async () => {
    try {
      const res = await authApi.getPreferences();
      const serverTheme = res.data?.theme as Theme | undefined;
      if (serverTheme && (serverTheme === 'light' || serverTheme === 'dark')) {
        applyTheme(serverTheme);
        localStorage.setItem('theme', serverTheme);
        set({ theme: serverTheme });
      }
    } catch {
      // 服务端不可用时使用本地值
    }
  },
}));
