import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndoStack } from './useUndoStack';

const { mockLoading, mockSuccess, mockError, mockDismiss } = vi.hoisted(() => ({
  mockLoading: vi.fn(() => 'toast-id'),
  mockSuccess: vi.fn(),
  mockError: vi.fn(),
  mockDismiss: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { loading: mockLoading, success: mockSuccess, error: mockError, dismiss: mockDismiss },
}));

describe('useUndoStack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initial state: empty stack, empty description', () => {
    const { result } = renderHook(() => useUndoStack());
    expect(result.current.undoStack).toEqual([]);
    expect(result.current.lastDescription).toBe('');
  });

  it('pushUndo adds item to stack', () => {
    const { result } = renderHook(() => useUndoStack());
    act(() => {
      result.current.pushUndo({ description: '修改了负责人', execute: vi.fn() });
    });
    expect(result.current.undoStack).toHaveLength(1);
    expect(result.current.undoStack[0].description).toBe('修改了负责人');
  });

  it('multiple pushUndo items stack in order', () => {
    const { result } = renderHook(() => useUndoStack());
    act(() => { result.current.pushUndo({ description: '第一个操作', execute: vi.fn() }); });
    act(() => { result.current.pushUndo({ description: '第二个操作', execute: vi.fn() }); });
    act(() => { result.current.pushUndo({ description: '第三个操作', execute: vi.fn() }); });
    expect(result.current.undoStack.map((i) => i.description)).toEqual(['第一个操作', '第二个操作', '第三个操作']);
  });

  it('lastDescription returns latest item description', () => {
    const { result } = renderHook(() => useUndoStack());
    act(() => { result.current.pushUndo({ description: '第一个操作', execute: vi.fn() }); });
    expect(result.current.lastDescription).toBe('第一个操作');
    act(() => { result.current.pushUndo({ description: '最新操作', execute: vi.fn() }); });
    expect(result.current.lastDescription).toBe('最新操作');
  });

  it('handleUndo does nothing when stack is empty', async () => {
    const { result } = renderHook(() => useUndoStack());
    await act(async () => { await result.current.handleUndo(); });
    expect(mockLoading).not.toHaveBeenCalled();
    expect(mockSuccess).not.toHaveBeenCalled();
  });

  it('handleUndo executes the last item, pops it, and toasts success', async () => {
    const { result } = renderHook(() => useUndoStack());
    const executeFn = vi.fn().mockResolvedValue(undefined);
    act(() => { result.current.pushUndo({ description: '修改了状态', execute: executeFn }); });

    await act(async () => { await result.current.handleUndo(); });

    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(result.current.undoStack).toHaveLength(0);
    expect(mockLoading).toHaveBeenCalledWith('正在撤回...');
    expect(mockSuccess).toHaveBeenCalledWith('撤回成功');
  });

  it('failed undo keeps the item and toasts error', async () => {
    const { result } = renderHook(() => useUndoStack());
    const executeFn = vi.fn().mockRejectedValue(new Error('undo failed'));
    act(() => { result.current.pushUndo({ description: '待撤回操作', execute: executeFn }); });

    await act(async () => { await result.current.handleUndo(); });

    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(mockError).toHaveBeenCalledWith('撤回失败');
    expect(result.current.undoStack).toHaveLength(1);
  });

  it('undo removes only the last item (LIFO)', async () => {
    const { result } = renderHook(() => useUndoStack());
    const exec1 = vi.fn().mockResolvedValue(undefined);
    const exec2 = vi.fn().mockResolvedValue(undefined);
    act(() => { result.current.pushUndo({ description: '第一', execute: exec1 }); });
    act(() => { result.current.pushUndo({ description: '第二', execute: exec2 }); });

    await act(async () => { await result.current.handleUndo(); });

    expect(exec2).toHaveBeenCalledTimes(1);
    expect(exec1).not.toHaveBeenCalled();
    expect(result.current.undoStack.map((i) => i.description)).toEqual(['第一']);
    expect(result.current.lastDescription).toBe('第一');
  });

  it('push after a successful undo stacks on top', async () => {
    const { result } = renderHook(() => useUndoStack());
    act(() => { result.current.pushUndo({ description: '第一', execute: vi.fn().mockResolvedValue(undefined) }); });
    await act(async () => { await result.current.handleUndo(); });
    expect(result.current.undoStack).toHaveLength(0);
    act(() => { result.current.pushUndo({ description: '第二', execute: vi.fn() }); });
    expect(result.current.lastDescription).toBe('第二');
  });

  it('dismisses the loading toast on both success and failure', async () => {
    const { result } = renderHook(() => useUndoStack());
    act(() => { result.current.pushUndo({ description: 'ok', execute: vi.fn().mockResolvedValue(undefined) }); });
    await act(async () => { await result.current.handleUndo(); });
    expect(mockDismiss).toHaveBeenCalledWith('toast-id');

    mockDismiss.mockClear();
    act(() => { result.current.pushUndo({ description: 'bad', execute: vi.fn().mockRejectedValue(new Error('x')) }); });
    await act(async () => { await result.current.handleUndo(); });
    expect(mockDismiss).toHaveBeenCalledWith('toast-id');
  });

  it.each(Array.from({ length: 40 }, (_, index) => `generated-${index}`))(
    'pushUndo stores generated description %s and lastDescription tracks it',
    (description) => {
      const { result } = renderHook(() => useUndoStack());
      act(() => { result.current.pushUndo({ description, execute: vi.fn().mockResolvedValue(undefined) }); });
      expect(result.current.undoStack).toHaveLength(1);
      expect(result.current.lastDescription).toBe(description);
    }
  );

  it.each(Array.from({ length: 40 }, (_, index) => [`first-${index}`, `second-${index}`] as const))(
    'successful undo of %s/%s removes only the tail',
    async (first, second) => {
      const { result } = renderHook(() => useUndoStack());
      act(() => { result.current.pushUndo({ description: first, execute: vi.fn().mockResolvedValue(undefined) }); });
      act(() => { result.current.pushUndo({ description: second, execute: vi.fn().mockResolvedValue(undefined) }); });
      await act(async () => { await result.current.handleUndo(); });
      expect(result.current.undoStack.map((i) => i.description)).toEqual([first]);
      expect(result.current.lastDescription).toBe(first);
    }
  );

  it.each(Array.from({ length: 40 }, (_, index) => `failing-${index}`))(
    'failed undo of %s keeps the item for retry',
    async (description) => {
      const { result } = renderHook(() => useUndoStack());
      act(() => { result.current.pushUndo({ description, execute: vi.fn().mockRejectedValue(new Error('fail')) }); });
      await act(async () => { await result.current.handleUndo(); });
      expect(result.current.undoStack).toHaveLength(1);
      expect(result.current.lastDescription).toBe(description);
    }
  );
});
