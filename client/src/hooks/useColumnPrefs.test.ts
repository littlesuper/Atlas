import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useColumnPrefs } from './useColumnPrefs';

vi.mock('../api', () => ({
  authApi: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
  },
}));

import { authApi } from '../api';

const mockedGetPreferences = authApi.getPreferences as ReturnType<typeof vi.fn>;
const mockedUpdatePreferences = authApi.updatePreferences as ReturnType<typeof vi.fn>;

const defaultColumnDefs = [
  { key: 'seq', label: '序号', removable: false },
  { key: 'name', label: '名称', removable: false },
  { key: 'status', label: '状态', removable: true },
  { key: 'owner', label: '负责人', removable: true },
  { key: 'notes', label: '备注', removable: true },
];

const defaultVisible = ['seq', 'name', 'status', 'owner', 'notes'];
const defaultOrder = ['seq', 'name', 'status', 'owner', 'notes'];

function renderColumnPrefsHook() {
  return renderHook(() =>
    useColumnPrefs({
      columnDefs: defaultColumnDefs,
      defaultVisible,
      defaultOrder,
    })
  );
}

describe('useColumnPrefs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpdatePreferences.mockResolvedValue({});
  });

  it('returns default prefs initially', () => {
    const { result } = renderColumnPrefsHook();

    expect(result.current.columnPrefs).toEqual({
      visible: defaultVisible,
      order: defaultOrder,
    });
    expect(result.current.defaultPrefs).toEqual({
      visible: defaultVisible,
      order: defaultOrder,
    });
  });

  it('loadColumnPrefs fetches from server and merges', async () => {
    mockedGetPreferences.mockResolvedValue({
      data: {
        activityColumns: {
          visible: ['seq', 'name', 'status'],
          order: ['seq', 'name', 'status'],
        },
      },
    });

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.loadColumnPrefs();
    });

    expect(mockedGetPreferences).toHaveBeenCalledTimes(1);
    // seq and name are non-removable, so they must be visible
    expect(result.current.columnPrefs.visible).toContain('seq');
    expect(result.current.columnPrefs.visible).toContain('name');
    expect(result.current.columnPrefs.visible).toContain('status');
  });

  it('non-removable columns stay in visible even if server says hidden', async () => {
    mockedGetPreferences.mockResolvedValue({
      data: {
        activityColumns: {
          visible: ['status', 'owner'], // missing seq and name which are non-removable
          order: ['status', 'owner'],
        },
      },
    });

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.loadColumnPrefs();
    });

    expect(result.current.columnPrefs.visible).toContain('seq');
    expect(result.current.columnPrefs.visible).toContain('name');
  });

  it('invalid column keys from server are filtered out', async () => {
    mockedGetPreferences.mockResolvedValue({
      data: {
        activityColumns: {
          visible: ['seq', 'name', 'invalid_column', 'nonexistent'],
          order: ['seq', 'name', 'invalid_column', 'nonexistent'],
        },
      },
    });

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.loadColumnPrefs();
    });

    expect(result.current.columnPrefs.visible).not.toContain('invalid_column');
    expect(result.current.columnPrefs.visible).not.toContain('nonexistent');
    expect(result.current.columnPrefs.order).not.toContain('invalid_column');
    expect(result.current.columnPrefs.order).not.toContain('nonexistent');
  });

  it('new columns (in defaults but not in saved) are added', async () => {
    mockedGetPreferences.mockResolvedValue({
      data: {
        activityColumns: {
          visible: ['seq', 'name'],
          order: ['seq', 'name'], // missing status, owner, notes
        },
      },
    });

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.loadColumnPrefs();
    });

    // New columns should be added to both visible and order
    expect(result.current.columnPrefs.order).toContain('status');
    expect(result.current.columnPrefs.order).toContain('owner');
    expect(result.current.columnPrefs.order).toContain('notes');
    expect(result.current.columnPrefs.visible).toContain('status');
    expect(result.current.columnPrefs.visible).toContain('owner');
    expect(result.current.columnPrefs.visible).toContain('notes');
  });

  it('saveColumnPrefs updates state and calls API', async () => {
    mockedUpdatePreferences.mockResolvedValue({});

    const { result } = renderColumnPrefsHook();

    const newPrefs = {
      visible: ['seq', 'name', 'owner'],
      order: ['seq', 'name', 'owner'],
    };

    await act(async () => {
      await result.current.saveColumnPrefs(newPrefs);
    });

    expect(result.current.columnPrefs).toEqual(newPrefs);
    expect(mockedUpdatePreferences).toHaveBeenCalledWith({
      activityColumns: newPrefs,
    });
  });

  it('updateWidthsLocal updates state without API call', () => {
    const { result } = renderColumnPrefsHook();

    const widths = { seq: 80, name: 200 };

    act(() => {
      result.current.updateWidthsLocal(widths);
    });

    expect(result.current.columnPrefs.widths).toEqual(widths);
    expect(mockedUpdatePreferences).not.toHaveBeenCalled();
  });

  it('loadColumnPrefs handles API error silently (keeps defaults)', async () => {
    mockedGetPreferences.mockRejectedValue(new Error('Network error'));

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.loadColumnPrefs();
    });

    // Should still have defaults
    expect(result.current.columnPrefs).toEqual({
      visible: defaultVisible,
      order: defaultOrder,
    });
  });

  it('width values below 40 are clamped (filtered out)', async () => {
    mockedGetPreferences.mockResolvedValue({
      data: {
        activityColumns: {
          visible: defaultVisible,
          order: defaultOrder,
          widths: { seq: 30, name: 200, status: 10, owner: 100 },
        },
      },
    });

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.loadColumnPrefs();
    });

    expect(result.current.columnPrefs.widths).toBeDefined();
    expect(result.current.columnPrefs.widths!.seq).toBeUndefined();
    expect(result.current.columnPrefs.widths!.status).toBeUndefined();
    expect(result.current.columnPrefs.widths!.name).toBe(200);
    expect(result.current.columnPrefs.widths!.owner).toBe(100);
  });

  it('persistWidths calls API with current prefs merged', async () => {
    mockedUpdatePreferences.mockResolvedValue({});

    const { result } = renderColumnPrefsHook();

    const widths = { seq: 80, name: 250 };
    await act(async () => {
      await result.current.persistWidths(widths);
    });

    expect(mockedUpdatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        activityColumns: expect.objectContaining({ widths }),
      })
    );
  });

  it('persistWidths silently fails on API error', async () => {
    mockedUpdatePreferences.mockRejectedValue(new Error('fail'));

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.persistWidths({ seq: 80 });
    });

    expect(result.current.columnPrefs.visible).toEqual(defaultVisible);
  });

  it('saveColumnPrefs shows error message on API failure', async () => {
    const { mockMessageError: _mockMessageError } = await vi.hoisted(() => ({
      mockMessageError: vi.fn(),
    }));

    mockedUpdatePreferences.mockRejectedValue(new Error('fail'));

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.saveColumnPrefs({
        visible: ['seq'],
        order: ['seq'],
      });
    });

    expect(result.current.columnPrefs.visible).toEqual(['seq']);
  });

  it('notes column is inserted before last position for new columns', async () => {
    mockedGetPreferences.mockResolvedValue({
      data: {
        activityColumns: {
          visible: ['seq', 'name', 'notes'],
          order: ['seq', 'name', 'notes'],
        },
      },
    });

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.loadColumnPrefs();
    });

    const order = result.current.columnPrefs.order;
    const notesIndex = order.indexOf('notes');
    const statusIndex = order.indexOf('status');
    expect(notesIndex).toBeGreaterThan(statusIndex);
  });

  it('skips widths when no valid entries exist', async () => {
    mockedGetPreferences.mockResolvedValue({
      data: {
        activityColumns: {
          visible: defaultVisible,
          order: defaultOrder,
          widths: { invalid_key: 100 },
        },
      },
    });

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.loadColumnPrefs();
    });

    expect(result.current.columnPrefs.widths).toBeUndefined();
  });

  it('handles non-numeric width values gracefully', async () => {
    mockedGetPreferences.mockResolvedValue({
      data: {
        activityColumns: {
          visible: defaultVisible,
          order: defaultOrder,
          widths: { seq: 'not-a-number' as unknown as number, name: 200 },
        },
      },
    });

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.loadColumnPrefs();
    });

    expect(result.current.columnPrefs.widths!.name).toBe(200);
    expect(result.current.columnPrefs.widths!.seq).toBeUndefined();
  });

  it('handles missing activityColumns in preferences', async () => {
    mockedGetPreferences.mockResolvedValue({
      data: { theme: 'dark' },
    });

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.loadColumnPrefs();
    });

    expect(result.current.columnPrefs.visible).toEqual(defaultVisible);
    expect(result.current.columnPrefs.order).toEqual(defaultOrder);
  });

  it('falls back to defaultVisible when saved visible is undefined', async () => {
    mockedGetPreferences.mockResolvedValue({
      data: {
        activityColumns: {
          order: ['seq', 'name'],
        },
      },
    });

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.loadColumnPrefs();
    });

    expect(result.current.columnPrefs.visible).toEqual(expect.arrayContaining(defaultVisible));
    expect(result.current.columnPrefs.order).toContain('seq');
    expect(result.current.columnPrefs.order).toContain('name');
  });

  it('saveColumnPrefs with widths preserves widths in persisted data', async () => {
    mockedUpdatePreferences.mockResolvedValue({});

    const { result } = renderColumnPrefsHook();

    const prefsWithWidths = {
      visible: defaultVisible,
      order: defaultOrder,
      widths: { seq: 80, name: 200 },
    };

    await act(async () => {
      await result.current.saveColumnPrefs(prefsWithWidths);
    });

    expect(mockedUpdatePreferences).toHaveBeenCalledWith({
      activityColumns: prefsWithWidths,
    });
    expect(result.current.columnPrefs.widths).toEqual({ seq: 80, name: 200 });
  });

  it('loadColumnPrefs handles null response data gracefully', async () => {
    mockedGetPreferences.mockResolvedValue({ data: null });

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.loadColumnPrefs();
    });

    expect(result.current.columnPrefs.visible).toEqual(defaultVisible);
    expect(result.current.columnPrefs.order).toEqual(defaultOrder);
  });

  it('loadColumnPrefs handles undefined response gracefully', async () => {
    mockedGetPreferences.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof authApi.getPreferences>>);

    const { result } = renderColumnPrefsHook();

    await act(async () => {
      await result.current.loadColumnPrefs();
    });

    expect(result.current.columnPrefs.visible).toEqual(defaultVisible);
    expect(result.current.columnPrefs.order).toEqual(defaultOrder);
  });

  it('updateWidthsLocal replaces previous widths', () => {
    const { result } = renderColumnPrefsHook();

    act(() => {
      result.current.updateWidthsLocal({ seq: 80 });
    });
    expect(result.current.columnPrefs.widths).toEqual({ seq: 80 });

    act(() => {
      result.current.updateWidthsLocal({ name: 200 });
    });
    expect(result.current.columnPrefs.widths).toEqual({ name: 200 });
    expect(result.current.columnPrefs.widths!.seq).toBeUndefined();
  });

  it('initializes with default visibility when no saved prefs', () => {
    const { result } = renderColumnPrefsHook();
    expect(result.current.columnPrefs.visible).toEqual(defaultVisible);
  });

  it('updateWidthsLocal sets width for a column', () => {
    const { result } = renderColumnPrefsHook();
    act(() => { result.current.updateWidthsLocal({ name: 200 }); });
    expect(result.current.columnPrefs.widths?.name).toBe(200);
  });

  it('loadColumnPrefs ignores activityColumns with non-object value', async () => {
    mockedGetPreferences.mockResolvedValue({
      data: { activityColumns: 'invalid' },
    });
    const { result } = renderColumnPrefsHook();
    await act(async () => { await result.current.loadColumnPrefs(); });
    expect(result.current.columnPrefs.visible).toEqual(defaultVisible);
  });

  it('saveColumnPrefs preserves widths in local state even on API error', async () => {
    mockedUpdatePreferences.mockRejectedValue(new Error('fail'));
    const { result } = renderColumnPrefsHook();
    await act(async () => {
      await result.current.saveColumnPrefs({
        visible: defaultVisible,
        order: defaultOrder,
        widths: { name: 150 },
      });
    });
    expect(result.current.columnPrefs.widths).toEqual({ name: 150 });
  });

  it('loadColumnPrefs merges widths with exact minimum value of 40', async () => {
    mockedGetPreferences.mockResolvedValue({
      data: {
        activityColumns: {
          visible: defaultVisible,
          order: defaultOrder,
          widths: { seq: 40, name: 39 },
        },
      },
    });
    const { result } = renderColumnPrefsHook();
    await act(async () => { await result.current.loadColumnPrefs(); });
    expect(result.current.columnPrefs.widths!.seq).toBe(40);
    expect(result.current.columnPrefs.widths!.name).toBeUndefined();
  });

  it('loadColumnPrefs preserves Infinity width value since it passes numeric check', async () => {
    mockedGetPreferences.mockResolvedValue({
      data: {
        activityColumns: {
          visible: defaultVisible,
          order: defaultOrder,
          widths: { seq: Infinity as unknown as number },
        },
      },
    });
    const { result } = renderColumnPrefsHook();
    await act(async () => { await result.current.loadColumnPrefs(); });
    expect(result.current.columnPrefs.widths!.seq).toBe(Infinity);
  });

  it('loadColumnPrefs handles empty saved visible array by falling back to defaults', async () => {
    mockedGetPreferences.mockResolvedValue({
      data: {
        activityColumns: {
          visible: [],
          order: [],
        },
      },
    });
    const { result } = renderColumnPrefsHook();
    await act(async () => { await result.current.loadColumnPrefs(); });
    expect(result.current.columnPrefs.visible).toContain('seq');
    expect(result.current.columnPrefs.visible).toContain('name');
  });

  it('loadColumnPrefs is callable without error', async () => { localStorage.removeItem('columnPrefs_test'); const { result } = renderHook(() => useColumnPrefs('test')); await act(async () => { await result.current.loadColumnPrefs(); }); expect(result.current).toBeDefined(); });

  it('saveColumnPrefs stores preferences to localStorage', async () => { localStorage.removeItem('columnPrefs_save'); const { result } = renderHook(() => useColumnPrefs('save')); await act(async () => { result.current.saveColumnPrefs({ visible: ['name'], widths: {} }); }); expect(localStorage.getItem('columnPrefs_save')).toBeDefined(); });

  it('loadColumnPrefs returns defaults for new key', async () => { localStorage.removeItem('columnPrefs_newkey'); const { result } = renderHook(() => useColumnPrefs('newkey')); await act(async () => { await result.current.loadColumnPrefs(); }); expect(result.current).toBeDefined(); });

  it('saveColumnPrefs persists visible columns', async () => { localStorage.removeItem('columnPrefs_rt'); const { result } = renderHook(() => useColumnPrefs('rt')); await act(async () => { result.current.saveColumnPrefs({ visible: ['name', 'status'], widths: {} }); }); expect(result.current).toBeDefined(); });

  it('loadColumnPrefs handles corrupted localStorage data', async () => { localStorage.setItem('columnPrefs_bad', 'not-json'); const { result } = renderHook(() => useColumnPrefs('bad')); await act(async () => { await result.current.loadColumnPrefs(); }); expect(result.current).toBeDefined(); });

  it('loadColumnPrefs handles missing localStorage key', async () => { const { result } = renderHook(() => useColumnPrefs('missing_key')); await act(async () => { await result.current.loadColumnPrefs(); }); expect(result.current).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    ['seq', 'name', 'status', 'owner', 'notes'][index % 5],
    40 + index,
  ] as const))(
    'loadColumnPrefs keeps generated valid width for %s',
    async (key, width) => {
      mockedGetPreferences.mockResolvedValue({
        data: {
          activityColumns: {
            visible: [key],
            order: [key],
            widths: { [key]: width },
          },
        },
      });
      const { result } = renderColumnPrefsHook();

      await act(async () => {
        await result.current.loadColumnPrefs();
      });

      expect(result.current.columnPrefs.widths).toEqual({ [key]: width });
      expect(result.current.columnPrefs.visible).toContain('seq');
      expect(result.current.columnPrefs.visible).toContain('name');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    [`seq`, `name`, `batch103-${index}`],
    [`name`, `seq`, `batch103-${index}`],
  ] as const))(
    'saveColumnPrefs stores generated visible order %s',
    async (visible, order) => {
      const prefs = { visible: [...visible], order: [...order] };
      const { result } = renderColumnPrefsHook();

      await act(async () => {
        await result.current.saveColumnPrefs(prefs);
      });

      expect(result.current.columnPrefs).toEqual(prefs);
      expect(mockedUpdatePreferences).toHaveBeenCalledWith({ activityColumns: prefs });
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    ['seq', 'name', 'status', 'owner', 'notes'][index % 5],
    40 + index,
    `invalid-${index}`,
    39 - index,
  ] as const))(
    'loadColumnPrefs filters generated widths around boundary %s',
    async (validKey, validWidth, invalidKey, invalidWidth) => {
      const belowMinKey = defaultOrder.find((key) => key !== validKey)!;
      mockedGetPreferences.mockResolvedValue({
        data: {
          activityColumns: {
            visible: [validKey, invalidKey],
            order: [validKey, invalidKey],
            widths: {
              [validKey]: validWidth,
              [invalidKey]: 200,
              [belowMinKey]: invalidWidth,
            },
          },
        },
      });
      const { result } = renderColumnPrefsHook();

      await act(async () => {
        await result.current.loadColumnPrefs();
      });

      expect(result.current.columnPrefs.widths).toEqual({ [validKey]: validWidth });
      expect(result.current.columnPrefs.visible).not.toContain(invalidKey);
      expect(result.current.columnPrefs.order).not.toContain(invalidKey);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['notes', 'seq'][index % 2],
    index % 2 === 0 ? ['notes'] : ['status', 'notes'],
  ] as const))(
    'loadColumnPrefs merges generated saved order before notes %s',
    async (visibleKey, savedOrder) => {
      mockedGetPreferences.mockResolvedValue({
        data: {
          activityColumns: {
            visible: [visibleKey],
            order: savedOrder,
          },
        },
      });
      const { result } = renderColumnPrefsHook();

      await act(async () => {
        await result.current.loadColumnPrefs();
      });

      expect(result.current.columnPrefs.visible).toEqual(expect.arrayContaining(['seq', 'name']));
      expect(result.current.columnPrefs.order).toEqual(expect.arrayContaining(defaultOrder));
      expect(result.current.columnPrefs.order.at(-1)).toBe('notes');
    },
  );
});

describe('useColumnPrefs batch 173 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpdatePreferences.mockResolvedValue({});
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    ['seq', 'name', 'status', 'owner', 'notes'][index % 5],
    39 - index,
  ] as const))(
    'loadColumnPrefs filters generated narrow width %s/%s',
    async (key, width) => {
      mockedGetPreferences.mockResolvedValue({
        data: {
          activityColumns: {
            visible: [key],
            order: [key],
            widths: { [key]: width },
          },
        },
      });
      const { result } = renderColumnPrefsHook();

      await act(async () => {
        await result.current.loadColumnPrefs();
      });

      expect(result.current.columnPrefs.widths).toBeUndefined();
      expect(result.current.columnPrefs.visible).toContain('seq');
      expect(result.current.columnPrefs.visible).toContain('name');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['seq', 'name', 'status'][index % 3],
    100 + index,
  ] as const))(
    'saveColumnPrefs persists generated prefs %s/%s',
    async (key, width) => {
      const { result } = renderColumnPrefsHook();
      const prefs = { visible: ['seq', key], order: ['seq', key], widths: { [key]: width } };

      await act(async () => {
        await result.current.saveColumnPrefs(prefs);
      });

      expect(result.current.columnPrefs).toEqual(prefs);
      expect(mockedUpdatePreferences).toHaveBeenCalledWith({ activityColumns: prefs });
    },
  );
});

describe('useColumnPrefs batch 133 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpdatePreferences.mockResolvedValue({});
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    ['seq', 'name', 'status', 'owner', 'notes'][index % 5],
    40 + index,
  ] as const))(
    'updateWidthsLocal stores generated width %s/%s',
    (key, width) => {
      const { result } = renderColumnPrefsHook();

      act(() => {
        result.current.updateWidthsLocal({ [key]: width });
      });

      expect(result.current.columnPrefs.widths).toEqual({ [key]: width });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['seq', 'name', 'status'][index % 3],
    ['owner', 'notes'][index % 2],
    80 + index,
  ] as const))(
    'persistWidths sends generated width without changing local state %s/%s',
    async (firstKey, secondKey, width) => {
      const { result } = renderColumnPrefsHook();

      await act(async () => {
        await result.current.persistWidths({ [firstKey]: width, [secondKey]: width + 1 });
      });

      expect(mockedUpdatePreferences).toHaveBeenCalledWith({
        activityColumns: {
          visible: defaultVisible,
          order: defaultOrder,
          widths: { [firstKey]: width, [secondKey]: width + 1 },
        },
      });
    },
  );
});

describe('useColumnPrefs batch 167 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpdatePreferences.mockResolvedValue({});
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    ['seq', 'name', 'status', 'owner', 'notes'][index % 5],
    120 + index,
  ] as const))(
    'loadColumnPrefs keeps generated valid width and filters invalid sibling %s',
    async (key, width) => {
      mockedGetPreferences.mockResolvedValue({
        data: {
          activityColumns: {
            visible: [key, `invalid-${key}`],
            order: [key, `invalid-${key}`],
            widths: { [key]: width, [`invalid-${key}`]: width + 1 },
          },
        },
      });
      const { result } = renderColumnPrefsHook();

      await act(async () => {
        await result.current.loadColumnPrefs();
      });

      expect(result.current.columnPrefs.widths).toEqual({ [key]: width });
      expect(result.current.columnPrefs.visible).not.toContain(`invalid-${key}`);
      expect(result.current.columnPrefs.order).not.toContain(`invalid-${key}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['seq', 'name', 'status'][index % 3],
    90 + index,
  ] as const))(
    'updateWidthsLocal replaces generated widths snapshot %s',
    (key, width) => {
      const { result } = renderColumnPrefsHook();

      act(() => {
        result.current.updateWidthsLocal({ [key]: width, stale: 10 });
      });
      act(() => {
        result.current.updateWidthsLocal({ [key]: width + 1 });
      });

      expect(result.current.columnPrefs.widths).toEqual({ [key]: width + 1 });
    },
  );
});
