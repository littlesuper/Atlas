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
        const saved = prefs.activityColumns as { visible?: string[]; order?: string[] };
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

        setColumnPrefs({ visible, order });
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

  return { columnPrefs, loadColumnPrefs, saveColumnPrefs, defaultPrefs };
}
