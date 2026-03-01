import { useState, useCallback } from 'react';
import { Message } from '@arco-design/web-react';
import { authApi } from '../api';
import type { ColumnDef, ColumnPrefs } from '../pages/Project/Detail/ColumnSettings';

interface UseColumnPrefsOptions {
  columnDefs: ColumnDef[];
  defaultVisible: string[];
  defaultOrder: string[];
}

export function useColumnPrefs({ columnDefs, defaultVisible, defaultOrder }: UseColumnPrefsOptions) {
  const defaultPrefs: ColumnPrefs = { visible: defaultVisible, order: defaultOrder };
  const [columnPrefs, setColumnPrefs] = useState<ColumnPrefs>(defaultPrefs);

  const loadColumnPrefs = useCallback(async () => {
    try {
      const res = await authApi.getPreferences();
      const prefs = res.data as Record<string, unknown>;
      if (prefs?.activityColumns) {
        const saved = prefs.activityColumns as { visible?: string[]; order?: string[]; widths?: Record<string, number> };
        const validKeys = new Set(columnDefs.map((d) => d.key));
        const nonRemovableKeys = columnDefs.filter((d) => !d.removable).map((d) => d.key);

        let visible = (saved.visible || defaultVisible).filter((k) => validKeys.has(k));
        let order = (saved.order || defaultOrder).filter((k) => validKeys.has(k));

        for (const key of nonRemovableKeys) {
          if (!visible.includes(key)) visible.push(key);
        }

        const savedOrderSet = new Set(saved.order || []);
        for (const key of defaultOrder) {
          const isNew = !savedOrderSet.has(key);
          if (!order.includes(key)) {
            if (key !== 'notes' && order[order.length - 1] === 'notes') {
              order.splice(order.length - 1, 0, key);
            } else {
              order.push(key);
            }
          }
          if (isNew && !visible.includes(key)) visible.push(key);
        }

        // Load widths, filtering to valid keys only
        let widths: Record<string, number> | undefined;
        if (saved.widths && typeof saved.widths === 'object') {
          const filtered: Record<string, number> = {};
          for (const [k, v] of Object.entries(saved.widths)) {
            if (validKeys.has(k) && typeof v === 'number' && v >= 40) {
              filtered[k] = v;
            }
          }
          if (Object.keys(filtered).length > 0) widths = filtered;
        }

        setColumnPrefs({ visible, order, widths });
      }
    } catch {
      // Silently use default config on failure
    }
  }, [columnDefs, defaultVisible, defaultOrder]);

  const saveColumnPrefs = useCallback(async (prefs: ColumnPrefs) => {
    setColumnPrefs(prefs);
    try {
      await authApi.updatePreferences({ activityColumns: prefs });
    } catch {
      Message.error('保存列设置失败');
    }
  }, []);

  /** Update widths locally without persisting (for real-time drag feedback) */
  const updateWidthsLocal = useCallback((widths: Record<string, number>) => {
    setColumnPrefs((prev) => ({ ...prev, widths }));
  }, []);

  /** Persist widths to backend */
  const persistWidths = useCallback(async (widths: Record<string, number>) => {
    try {
      // Read current prefs state via a callback to get fresh value
      const currentPrefs = await new Promise<ColumnPrefs>((resolve) => {
        setColumnPrefs((prev) => {
          resolve(prev);
          return prev;
        });
      });
      await authApi.updatePreferences({ activityColumns: { ...currentPrefs, widths } });
    } catch {
      // Silent fail for width persistence
    }
  }, []);

  return { columnPrefs, loadColumnPrefs, saveColumnPrefs, defaultPrefs, updateWidthsLocal, persistWidths };
}
