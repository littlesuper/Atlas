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

    // Widths below 40 should be filtered out
    expect(result.current.columnPrefs.widths).toBeDefined();
    expect(result.current.columnPrefs.widths!.seq).toBeUndefined();
    expect(result.current.columnPrefs.widths!.status).toBeUndefined();
    expect(result.current.columnPrefs.widths!.name).toBe(200);
    expect(result.current.columnPrefs.widths!.owner).toBe(100);
  });
});
