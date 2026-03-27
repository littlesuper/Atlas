import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndoStack } from './useUndoStack';

vi.mock('@arco-design/web-react', () => ({
  Modal: { confirm: vi.fn() },
  Message: { loading: vi.fn(() => vi.fn()), success: vi.fn(), error: vi.fn(), clear: vi.fn() },
}));

import { Modal, Message } from '@arco-design/web-react';

const mockedModalConfirm = Modal.confirm as ReturnType<typeof vi.fn>;

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
      result.current.pushUndo({
        description: '修改了负责人',
        execute: vi.fn(),
      });
    });

    expect(result.current.undoStack).toHaveLength(1);
    expect(result.current.undoStack[0].description).toBe('修改了负责人');
  });

  it('multiple pushUndo items stack correctly', () => {
    const { result } = renderHook(() => useUndoStack());

    act(() => {
      result.current.pushUndo({
        description: '第一个操作',
        execute: vi.fn(),
      });
    });

    act(() => {
      result.current.pushUndo({
        description: '第二个操作',
        execute: vi.fn(),
      });
    });

    act(() => {
      result.current.pushUndo({
        description: '第三个操作',
        execute: vi.fn(),
      });
    });

    expect(result.current.undoStack).toHaveLength(3);
    expect(result.current.undoStack[0].description).toBe('第一个操作');
    expect(result.current.undoStack[1].description).toBe('第二个操作');
    expect(result.current.undoStack[2].description).toBe('第三个操作');
  });

  it('lastDescription returns latest item description', () => {
    const { result } = renderHook(() => useUndoStack());

    act(() => {
      result.current.pushUndo({
        description: '第一个操作',
        execute: vi.fn(),
      });
    });

    expect(result.current.lastDescription).toBe('第一个操作');

    act(() => {
      result.current.pushUndo({
        description: '最新操作',
        execute: vi.fn(),
      });
    });

    expect(result.current.lastDescription).toBe('最新操作');
  });

  it('handleUndo does nothing when stack is empty', () => {
    const { result } = renderHook(() => useUndoStack());

    act(() => {
      result.current.handleUndo();
    });

    expect(mockedModalConfirm).not.toHaveBeenCalled();
  });

  it('handleUndo calls Modal.confirm with correct description', () => {
    const { result } = renderHook(() => useUndoStack());

    const executeFn = vi.fn().mockResolvedValue(undefined);

    act(() => {
      result.current.pushUndo({
        description: '修改了状态',
        execute: executeFn,
      });
    });

    act(() => {
      result.current.handleUndo();
    });

    expect(mockedModalConfirm).toHaveBeenCalledTimes(1);
    const confirmCall = mockedModalConfirm.mock.calls[0][0];
    expect(confirmCall.title).toBe('确认撤回');
    expect(confirmCall.content).toBe('修改了状态');
    expect(confirmCall.okText).toBe('确认撤回');
  });

  it('after successful undo execution, item is removed from stack', async () => {
    const { result } = renderHook(() => useUndoStack());

    const executeFn = vi.fn().mockResolvedValue(undefined);

    act(() => {
      result.current.pushUndo({
        description: '待撤回操作',
        execute: executeFn,
      });
    });

    expect(result.current.undoStack).toHaveLength(1);

    act(() => {
      result.current.handleUndo();
    });

    // Extract the onOk callback from Modal.confirm and invoke it
    const confirmCall = mockedModalConfirm.mock.calls[0][0];
    await act(async () => {
      await confirmCall.onOk();
    });

    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(result.current.undoStack).toHaveLength(0);
    expect(Message.success).toHaveBeenCalledWith('撤回成功');
  });
});
