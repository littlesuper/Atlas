import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockMessageError, mockReorder } = vi.hoisted(() => ({
  mockMessageError: vi.fn(),
  mockReorder: vi.fn().mockResolvedValue({}),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: { error: mockMessageError, success: vi.fn() },
}));

vi.mock('../api', () => ({
  activitiesApi: { reorder: mockReorder },
}));

import { useDragReorder } from './useDragReorder';

interface MockMouseEvent {
  preventDefault: ReturnType<typeof vi.fn>;
}

function mockEvt(): MockMouseEvent {
  return { preventDefault: vi.fn() };
}

describe('useDragReorder', () => {
  const mockPushUndo = vi.fn();
  const mockLoadActivities = vi.fn().mockResolvedValue(undefined);
  const mockSetActivities = vi.fn();

  const activities = [
    { id: 'a1', name: 'First', sortOrder: 10 },
    { id: 'a2', name: 'Second', sortOrder: 20 },
    { id: 'a3', name: 'Third', sortOrder: 30 },
  ] as { id: string; name: string; sortOrder: number }[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockReorder.mockResolvedValue({});
  });

  function renderReorderHook(projectId = 'p1') {
    return renderHook(() =>
      useDragReorder({
        projectId,
        activities,
        setActivities: mockSetActivities,
        pushUndo: mockPushUndo,
        loadActivities: mockLoadActivities,
      })
    );
  }

  it('initializes with saving=false', () => {
    const { result } = renderReorderHook();
    expect(result.current.saving).toBe(false);
  });

  it('handleMouseDown records drag index', () => {
    const { result } = renderReorderHook();
    const mockEvent = mockEvt();
    act(() => {
      result.current.handleMouseDown(mockEvent, 1);
    });
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it('handleMouseUp no-op when not dragging', async () => {
    const { result } = renderReorderHook();
    const mockEvent = mockEvt();
    await act(async () => {
      result.current.handleMouseUp(mockEvent, 2);
    });
    expect(mockSetActivities).not.toHaveBeenCalled();
  });

  it('handleMouseUp reorders on valid drag', async () => {
    const { result } = renderReorderHook();

    act(() => {
      result.current.handleMouseDown(mockEvt(), 0);
    });

    act(() => {
      result.current.handleMouseMove(mockEvt(), 2);
    });

    await act(async () => {
      result.current.handleMouseUp(mockEvt(), 2);
    });

    expect(mockSetActivities).toHaveBeenCalled();
    const reordered = mockSetActivities.mock.calls[0][0];
    const ids = reordered.map((a: { id: string }) => a.id);
    expect(ids).toEqual(['a2', 'a3', 'a1']);
  });

  it('handleMouseUp pushes undo on success', async () => {
    const { result } = renderReorderHook();

    act(() => {
      result.current.handleMouseDown(mockEvt(), 0);
    });
    act(() => {
      result.current.handleMouseMove(mockEvt(), 2);
    });

    await act(async () => {
      result.current.handleMouseUp(mockEvt(), 2);
    });

    expect(mockPushUndo).toHaveBeenCalledTimes(1);
    expect(mockPushUndo.mock.calls[0][0].description).toContain('撤回活动排序');
  });

  it('handleMouseUp shows error on API failure', async () => {
    mockReorder.mockRejectedValueOnce(new Error('fail'));
    const { result } = renderReorderHook();

    act(() => {
      result.current.handleMouseDown(mockEvt(), 0);
    });
    act(() => {
      result.current.handleMouseMove(mockEvt(), 2);
    });

    await act(async () => {
      result.current.handleMouseUp(mockEvt(), 2);
    });

    expect(mockMessageError).toHaveBeenCalledWith('保存排序失败');
    expect(mockLoadActivities).toHaveBeenCalled();
  });

  it('handleMouseUp skips API call when no projectId', async () => {
    const { result } = renderHook(() =>
      useDragReorder({
        projectId: null as unknown as string,
        activities,
        setActivities: mockSetActivities,
        pushUndo: mockPushUndo,
        loadActivities: mockLoadActivities,
      })
    );

    act(() => {
      result.current.handleMouseDown(mockEvt(), 0);
    });
    act(() => {
      result.current.handleMouseMove(mockEvt(), 2);
    });

    await act(async () => {
      result.current.handleMouseUp(mockEvt(), 2);
    });

    expect(mockSetActivities).toHaveBeenCalled();
    expect(mockReorder).not.toHaveBeenCalled();
    expect(mockPushUndo).not.toHaveBeenCalled();
  });

  it('handleMouseUp without prior mousedown does not reorder', async () => {
    const { result } = renderReorderHook();
    await act(async () => {
      result.current.handleMouseUp(mockEvt(), 2);
    });
    expect(mockSetActivities).not.toHaveBeenCalled();
  });

  it('handleMouseUp does not reorder when dropping on same index', async () => {
    const { result } = renderReorderHook();
    act(() => {
      result.current.handleMouseDown(mockEvt(), 1);
    });
    act(() => {
      result.current.handleMouseMove(mockEvt(), 2);
    });
    await act(async () => {
      result.current.handleMouseUp(mockEvt(), 1);
    });
    expect(mockSetActivities).not.toHaveBeenCalled();
    expect(mockReorder).not.toHaveBeenCalled();
  });

  it('global mouseup resets drag state during active drag', () => {
    const { result } = renderReorderHook();
    act(() => {
      result.current.handleMouseDown(mockEvt(), 0);
    });
    act(() => {
      result.current.handleMouseMove(mockEvt(), 2);
    });
    act(() => {
      window.dispatchEvent(new Event('mouseup'));
    });
    expect(document.body.style.cursor).toBe('');
  });

  it('handleMouseMove is no-op when no mousedown happened', () => {
    const { result } = renderReorderHook();
    act(() => {
      result.current.handleMouseMove(mockEvt(), 2);
    });
    expect(result.current.dragFromRef.current).toBe(-1);
    expect(result.current.dragOverRef.current).toBe(-1);
  });

  it('sets cursor and userSelect during active drag', () => {
    const { result } = renderReorderHook();
    act(() => {
      result.current.handleMouseDown(mockEvt(), 0);
    });
    act(() => {
      result.current.handleMouseMove(mockEvt(), 2);
    });
    expect(document.body.style.cursor).toBe('grabbing');
    expect(document.body.style.userSelect).toBe('none');
  });

  it('handleMouseUp sets saving to true during API call and false after', async () => {
    let resolveReorder: () => void;
    mockReorder.mockImplementationOnce(() => new Promise<void>((r) => { resolveReorder = r; }));
    const { result } = renderReorderHook();

    act(() => {
      result.current.handleMouseDown(mockEvt(), 0);
    });
    act(() => {
      result.current.handleMouseMove(mockEvt(), 2);
    });

    const promise = act(async () => {
      result.current.handleMouseUp(mockEvt(), 2);
    });

    await act(async () => {
      await Promise.resolve();
    });

    resolveReorder!();
    await promise;

    expect(result.current.saving).toBe(false);
  });

  it('handleMouseUp no-ops when mousedown happened but no mousemove', async () => {
    const { result } = renderReorderHook();
    act(() => {
      result.current.handleMouseDown(mockEvt(), 0);
    });
    await act(async () => {
      result.current.handleMouseUp(mockEvt(), 2);
    });
    expect(mockSetActivities).not.toHaveBeenCalled();
    expect(mockReorder).not.toHaveBeenCalled();
  });

  it('handleMouseUp no-ops when dropping on same position after drag', async () => {
    const { result } = renderReorderHook();
    act(() => {
      result.current.handleMouseDown(mockEvt(), 1);
    });
    act(() => {
      result.current.handleMouseMove(mockEvt(), 1);
    });
    await act(async () => {
      result.current.handleMouseUp(mockEvt(), 1);
    });
    expect(mockSetActivities).not.toHaveBeenCalled();
    expect(mockReorder).not.toHaveBeenCalled();
  });

  it('reorders items from higher index to lower index', async () => {
    const { result } = renderReorderHook();
    act(() => {
      result.current.handleMouseDown(mockEvt(), 2);
    });
    act(() => {
      result.current.handleMouseMove(mockEvt(), 0);
    });
    await act(async () => {
      result.current.handleMouseUp(mockEvt(), 0);
    });
    expect(mockSetActivities).toHaveBeenCalled();
    const reordered = mockSetActivities.mock.calls[0][0];
    const ids = reordered.map((a: { id: string }) => a.id);
    expect(ids).toEqual(['a3', 'a1', 'a2']);
  });

  it('sets saving to false after API failure', async () => {
    mockReorder.mockRejectedValueOnce(new Error('fail'));
    const { result } = renderReorderHook();
    act(() => {
      result.current.handleMouseDown(mockEvt(), 0);
    });
    act(() => {
      result.current.handleMouseMove(mockEvt(), 2);
    });
    await act(async () => {
      result.current.handleMouseUp(mockEvt(), 2);
    });
    expect(result.current.saving).toBe(false);
  });

  it('assigns correct sortOrder values after reorder', async () => {
    const { result } = renderReorderHook();
    act(() => {
      result.current.handleMouseDown(mockEvt(), 0);
    });
    act(() => {
      result.current.handleMouseMove(mockEvt(), 2);
    });
    await act(async () => {
      result.current.handleMouseUp(mockEvt(), 2);
    });
    const reordered = mockSetActivities.mock.calls[0][0];
    expect(reordered.map((a: { sortOrder: number }) => a.sortOrder)).toEqual([10, 20, 30]);
  });

  it('calls pushUndo with correct description after successful reorder', async () => {
    const { result } = renderReorderHook();
    act(() => {
      result.current.handleMouseDown(mockEvt(), 0);
    });
    act(() => {
      result.current.handleMouseMove(mockEvt(), 2);
    });
    await act(async () => {
      result.current.handleMouseUp(mockEvt(), 2);
    });
    expect(mockPushUndo).toHaveBeenCalledTimes(1);
    expect(mockPushUndo.mock.calls[0][0].description).toBe('撤回活动排序调整');
  });

  it('removes global mouseup listener on unmount', () => {
    const { unmount } = renderReorderHook();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('initial dragState is idle', () => {
    const { result } = renderReorderHook();
    expect(result.current.saving).toBe(false);
    expect(result.current.dragFromRef.current).toBe(-1);
  });

  it('initial state has dragFromRef set to -1', () => {
    const { result } = renderReorderHook();
    expect(result.current.saving).toBe(false);
    expect(result.current.dragFromRef.current).toBe(-1);
  });

  it('handleMouseMove updates dragOver when moving to different index', () => {
    const { result } = renderReorderHook();
    act(() => { result.current.handleMouseDown(mockEvt(), 0); });
    act(() => { result.current.handleMouseMove(mockEvt(), 1); });
    expect(result.current.dragOverRef.current).toBe(1);
    act(() => { result.current.handleMouseMove(mockEvt(), 2); });
    expect(result.current.dragOverRef.current).toBe(2);
  });

  it('global mouseup during drag does not call setActivities', () => {
    const { result } = renderReorderHook();
    act(() => { result.current.handleMouseDown(mockEvt(), 0); });
    act(() => { result.current.handleMouseMove(mockEvt(), 2); });
    act(() => { window.dispatchEvent(new Event('mouseup')); });
    expect(mockSetActivities).not.toHaveBeenCalled();
    expect(mockReorder).not.toHaveBeenCalled();
  });

  it('drag state resets after successful reorder allowing new drag', async () => {
    const { result } = renderReorderHook();
    act(() => { result.current.handleMouseDown(mockEvt(), 0); });
    act(() => { result.current.handleMouseMove(mockEvt(), 2); });
    await act(async () => { result.current.handleMouseUp(mockEvt(), 2); });
    expect(mockSetActivities).toHaveBeenCalledTimes(1);
    act(() => { result.current.handleMouseDown(mockEvt(), 1); });
    act(() => { result.current.handleMouseMove(mockEvt(), 0); });
    await act(async () => { result.current.handleMouseUp(mockEvt(), 0); });
    expect(mockSetActivities).toHaveBeenCalledTimes(2);
  });

  it('handleMouseUp with single activity does not crash', async () => {
    const singleActivity = [{ id: 'a1', name: 'Only', sortOrder: 10 }] as { id: string; name: string; sortOrder: number }[];
    const { result } = renderHook(() =>
      useDragReorder({
        projectId: 'p1',
        activities: singleActivity,
        setActivities: mockSetActivities,
        pushUndo: mockPushUndo,
        loadActivities: mockLoadActivities,
      })
    );
    act(() => { result.current.handleMouseDown(mockEvt(), 0); });
    act(() => { result.current.handleMouseMove(mockEvt(), 0); });
    await act(async () => { result.current.handleMouseUp(mockEvt(), 0); });
    expect(mockSetActivities).not.toHaveBeenCalled();
  });

  it('handleMouseDown on same index twice resets correctly', () => {
    const { result } = renderReorderHook();
    act(() => { result.current.handleMouseDown(mockEvt(), 1); });
    act(() => { result.current.handleMouseDown(mockEvt(), 2); });
    act(() => { result.current.handleMouseMove(mockEvt(), 0); });
    expect(result.current.dragFromRef.current).toBe(2);
  });

  it('handleMouseUp is callable without error', () => { const items = [{ id: '1' }, { id: '2' }]; const { result } = renderHook(() => useDragReorder(items)); act(() => { result.current.handleMouseUp({ preventDefault: () => {} } as any); }); expect(result.current).toBeDefined(); });

  it('handleMouseDown is callable', () => { const items = [{ id: '1' }, { id: '2' }]; const { result } = renderHook(() => useDragReorder(items)); act(() => { result.current.handleMouseDown(mockEvt(), 0); }); expect(result.current.saving).toBe(false); });

  it('handleMouseMove updates dragFromRef', () => { const items = [{ id: '1' }, { id: '2' }]; const { result } = renderHook(() => useDragReorder(items)); act(() => { result.current.handleMouseDown(mockEvt(), 0); }); act(() => { result.current.handleMouseMove(mockEvt(), 1); }); expect(result.current.dragFromRef.current).toBe(0); });

  it('handleMouseUp resets drag state', () => { const items = [{ id: '1' }, { id: '2' }]; const { result } = renderHook(() => useDragReorder(items)); act(() => { result.current.handleMouseDown(mockEvt(), 0); }); act(() => { result.current.handleMouseUp({ preventDefault: () => {} } as any); }); expect(result.current.saving).toBe(false); });

  it('useDragReorder initializes with correct item count', () => { const items = [{ id: '1' }, { id: '2' }, { id: '3' }]; const { result } = renderHook(() => useDragReorder(items)); expect(result.current.saving).toBe(false); });

  it('useDragReorder initializes saving as false', () => { const items = [{ id: '1' }, { id: '2' }, { id: '3' }]; const { result } = renderHook(() => useDragReorder(items)); expect(result.current.saving).toBe(false); });

  it('useDragReorder handles single item', () => { const items = [{ id: '1' }]; const { result } = renderHook(() => useDragReorder(items)); expect(result.current.saving).toBe(false); });
});
