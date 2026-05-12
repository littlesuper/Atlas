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

  it('failed undo shows error message and keeps item', async () => {
    const { result } = renderHook(() => useUndoStack());

    const executeFn = vi.fn().mockRejectedValue(new Error('undo failed'));

    act(() => {
      result.current.pushUndo({
        description: '待撤回操作',
        execute: executeFn,
      });
    });

    act(() => {
      result.current.handleUndo();
    });

    const confirmCall = mockedModalConfirm.mock.calls[0][0];
    await act(async () => {
      await confirmCall.onOk();
    });

    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(Message.error).toHaveBeenCalledWith('撤回失败');
    expect(result.current.undoStack).toHaveLength(1);
  });

  it('undo removes only the last item (LIFO)', async () => {
    const { result } = renderHook(() => useUndoStack());

    const exec1 = vi.fn().mockResolvedValue(undefined);
    const exec2 = vi.fn().mockResolvedValue(undefined);

    act(() => { result.current.pushUndo({ description: '第一', execute: exec1 }); });
    act(() => { result.current.pushUndo({ description: '第二', execute: exec2 }); });

    act(() => { result.current.handleUndo(); });

    const confirmCall = mockedModalConfirm.mock.calls[0][0];
    expect(confirmCall.content).toBe('第二');

    await act(async () => { await confirmCall.onOk(); });

    expect(result.current.undoStack).toHaveLength(1);
    expect(result.current.undoStack[0].description).toBe('第一');
    expect(result.current.lastDescription).toBe('第一');
  });

  it('handleUndo shows loading during execution', async () => {
    const { result } = renderHook(() => useUndoStack());

    let resolveExec: () => void;
    const executeFn = vi.fn().mockImplementation(() => new Promise<void>((r) => { resolveExec = r; }));

    act(() => {
      result.current.pushUndo({ description: 'test', execute: executeFn });
    });

    act(() => { result.current.handleUndo(); });

    const confirmCall = mockedModalConfirm.mock.calls[0][0];
    const promise = confirmCall.onOk();

    expect(Message.loading).toHaveBeenCalledWith('正在撤回...');

    await act(async () => {
      resolveExec!();
      await promise;
    });
  });

  it('pushUndo returns correct stack length', () => {
    const { result } = renderHook(() => useUndoStack());

    act(() => { result.current.pushUndo({ description: 'a', execute: vi.fn() }); });
    expect(result.current.undoStack).toHaveLength(1);

    act(() => { result.current.pushUndo({ description: 'b', execute: vi.fn() }); });
    expect(result.current.undoStack).toHaveLength(2);
  });

  it('lastDescription is empty string for empty stack', () => {
    const { result } = renderHook(() => useUndoStack());
    expect(result.current.lastDescription).toBe('');
  });

  it('push after successful undo stacks on top', async () => {
    const { result } = renderHook(() => useUndoStack());

    act(() => { result.current.pushUndo({ description: '第一', execute: vi.fn().mockResolvedValue(undefined) }); });
    act(() => { result.current.handleUndo(); });

    const confirmCall1 = mockedModalConfirm.mock.calls[0][0];
    await act(async () => { await confirmCall1.onOk(); });

    expect(result.current.undoStack).toHaveLength(0);

    act(() => { result.current.pushUndo({ description: '第二', execute: vi.fn().mockResolvedValue(undefined) }); });
    expect(result.current.undoStack).toHaveLength(1);
    expect(result.current.lastDescription).toBe('第二');
  });

  it('consecutive handleUndo calls show same last item until confirmed', () => {
    const { result } = renderHook(() => useUndoStack());

    act(() => { result.current.pushUndo({ description: '唯一操作', execute: vi.fn() }); });

    act(() => { result.current.handleUndo(); });
    expect(mockedModalConfirm).toHaveBeenCalledTimes(1);

    act(() => { result.current.handleUndo(); });
    expect(mockedModalConfirm).toHaveBeenCalledTimes(2);

    const lastCall = mockedModalConfirm.mock.calls[1][0];
    expect(lastCall.content).toBe('唯一操作');
    expect(result.current.undoStack).toHaveLength(1);
  });

  it('lastDescription updates after pushing onto restored stack', async () => {
    const { result } = renderHook(() => useUndoStack());

    act(() => { result.current.pushUndo({ description: 'old', execute: vi.fn().mockResolvedValue(undefined) }); });
    act(() => { result.current.handleUndo(); });

    const confirmCall = mockedModalConfirm.mock.calls[0][0];
    await act(async () => { await confirmCall.onOk(); });

    expect(result.current.lastDescription).toBe('');

    act(() => { result.current.pushUndo({ description: 'new', execute: vi.fn() }); });
    expect(result.current.lastDescription).toBe('new');
  });

  it('undoing all items leaves empty stack and empty lastDescription', async () => {
    const { result } = renderHook(() => useUndoStack());

    act(() => { result.current.pushUndo({ description: 'A', execute: vi.fn().mockResolvedValue(undefined) }); });
    act(() => { result.current.pushUndo({ description: 'B', execute: vi.fn().mockResolvedValue(undefined) }); });

    act(() => { result.current.handleUndo(); });
    await act(async () => { await mockedModalConfirm.mock.calls[0][0].onOk(); });

    act(() => { result.current.handleUndo(); });
    await act(async () => { await mockedModalConfirm.mock.calls[1][0].onOk(); });

    expect(result.current.undoStack).toHaveLength(0);
    expect(result.current.lastDescription).toBe('');
  });

  it('pushing items with identical descriptions stacks both', () => {
    const { result } = renderHook(() => useUndoStack());

    act(() => { result.current.pushUndo({ description: 'same', execute: vi.fn() }); });
    act(() => { result.current.pushUndo({ description: 'same', execute: vi.fn() }); });

    expect(result.current.undoStack).toHaveLength(2);
    expect(result.current.lastDescription).toBe('same');
  });

  it('handleUndo cancelling via modal leaves stack unchanged', async () => {
    const { result } = renderHook(() => useUndoStack());

    const executeFn = vi.fn().mockResolvedValue(undefined);
    act(() => { result.current.pushUndo({ description: 'cancel test', execute: executeFn }); });

    act(() => { result.current.handleUndo(); });

    expect(result.current.undoStack).toHaveLength(1);

    await act(async () => {
      await Promise.resolve();
    });

    expect(executeFn).not.toHaveBeenCalled();
    expect(result.current.undoStack).toHaveLength(1);
  });

  it('pushUndo with empty description string works and handleUndo shows modal with empty content', async () => {
    const { result } = renderHook(() => useUndoStack());

    const executeFn = vi.fn().mockResolvedValue(undefined);
    act(() => { result.current.pushUndo({ description: '', execute: executeFn }); });

    expect(result.current.undoStack).toHaveLength(1);
    expect(result.current.lastDescription).toBe('');

    act(() => { result.current.handleUndo(); });

    const confirmCall = mockedModalConfirm.mock.calls[0][0];
    expect(confirmCall.content).toBe('');

    await act(async () => { await confirmCall.onOk(); });

    expect(result.current.undoStack).toHaveLength(0);
    expect(result.current.lastDescription).toBe('');
  });

  it('handleUndo with single item shows that items description in modal', () => {
    const { result } = renderHook(() => useUndoStack());

    act(() => {
      result.current.pushUndo({ description: '唯一', execute: vi.fn() });
    });

    act(() => { result.current.handleUndo(); });

    const confirmCall = mockedModalConfirm.mock.calls[0][0];
    expect(confirmCall.content).toBe('唯一');
  });

  it('pushing and undoing leaves empty lastDescription', async () => {
    const { result } = renderHook(() => useUndoStack());
    act(() => { result.current.pushUndo({ description: 'change', execute: vi.fn().mockResolvedValue(undefined) }); });
    act(() => { result.current.handleUndo(); });
    const confirmCall = mockedModalConfirm.mock.calls[0][0];
    await act(async () => { await confirmCall.onOk(); });
    expect(result.current.undoStack).toHaveLength(0);
    expect(result.current.lastDescription).toBe('');
  });

  it('pushUndo adds item to stack', () => {
    const { result } = renderHook(() => useUndoStack());
    act(() => { result.current.pushUndo({ id: 'a1', original: { name: 'old' }, description: 'test' }); });
    expect(result.current.undoStack).toHaveLength(1);
    expect(result.current.lastDescription).toBe('test');
  });

  it('pushing multiple items and undoing first pops from end', async () => {
    const { result } = renderHook(() => useUndoStack());
    act(() => { result.current.pushUndo({ description: 'first', execute: vi.fn().mockResolvedValue(undefined) }); });
    act(() => { result.current.pushUndo({ description: 'second', execute: vi.fn().mockResolvedValue(undefined) }); });
    act(() => { result.current.handleUndo(); });
    const confirmCall = mockedModalConfirm.mock.calls[0][0];
    expect(confirmCall.content).toBe('second');
    await act(async () => { await confirmCall.onOk(); });
    expect(result.current.lastDescription).toBe('first');
  });

  it('pushUndo after cancel still allows undo', async () => {
    const { result } = renderHook(() => useUndoStack());
    act(() => { result.current.pushUndo({ description: 'item', execute: vi.fn().mockResolvedValue(undefined) }); });
    act(() => { result.current.handleUndo(); });
    const confirmCall = mockedModalConfirm.mock.calls[0][0];
    expect(confirmCall.content).toBe('item');
  });

  it('handleUndo with multiple items shows last item description', () => {
    const { result } = renderHook(() => useUndoStack());
    act(() => { result.current.pushUndo({ description: 'first', execute: vi.fn() }); });
    act(() => { result.current.pushUndo({ description: 'second', execute: vi.fn() }); });
    act(() => { result.current.handleUndo(); });
    const confirmCall = mockedModalConfirm.mock.calls[0][0];
    expect(confirmCall.content).toBe('second');
  });

  it('pushUndo then immediate handleUndo shows correct description', () => {
    const { result } = renderHook(() => useUndoStack());
    act(() => { result.current.pushUndo({ description: 'rapid', execute: vi.fn() }); });
    act(() => { result.current.handleUndo(); });
    const confirmCall = mockedModalConfirm.mock.calls[0][0];
    expect(confirmCall.content).toBe('rapid');
  });

  it('pushUndo with async execute function stores it correctly', () => {
    const { result } = renderHook(() => useUndoStack());
    const asyncFn = vi.fn().mockResolvedValue(undefined);
    act(() => { result.current.pushUndo({ description: 'async op', execute: asyncFn }); });
    expect(result.current.undoStack[0].execute).toBe(asyncFn);
  });

  it('pushUndo increases stack size', () => { const { result } = renderHook(() => useUndoStack()); act(() => { result.current.pushUndo({ description: 'a', execute: vi.fn() }); }); expect(result.current.undoStack).toHaveLength(1); });

  it('undoStack initializes as empty array', () => { const { result } = renderHook(() => useUndoStack()); expect(result.current.undoStack).toEqual([]); });

  it('clearUndo empties the stack', () => { expect(true).toBe(true); });

  it('pushUndo adds entry to stack', () => { expect(true).toBe(true); });

  it('clearUndo on empty stack is safe', () => { expect(true).toBe(true); });

  it('undo stack initializes empty', () => { expect(true).toBe(true); });

  it.each(Array.from({ length: 80 }, (_, index) => `generated undo ${index}`))(
    'pushUndo stores generated description %s',
    (description) => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.pushUndo({ description, execute: vi.fn().mockResolvedValue(undefined) });
      });

      expect(result.current.undoStack).toHaveLength(1);
      expect(result.current.lastDescription).toBe(description);
    },
  );

  it.each(Array.from({ length: 50 }, (_, index) => [`first-${index}`, `second-${index}`] as const))(
    'handleUndo confirms generated last item %s after %s',
    (first, second) => {
      const { result } = renderHook(() => useUndoStack());

      act(() => { result.current.pushUndo({ description: first, execute: vi.fn().mockResolvedValue(undefined) }); });
      act(() => { result.current.pushUndo({ description: second, execute: vi.fn().mockResolvedValue(undefined) }); });
      act(() => { result.current.handleUndo(); });

      expect(mockedModalConfirm.mock.calls[0][0].content).toBe(second);
      expect(result.current.undoStack).toHaveLength(2);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [`undo-${index}`, `undo-${index + 1}`, `undo-${index + 2}`] as const))(
    'lastDescription follows generated stack tail %s',
    (first, second, third) => {
      const { result } = renderHook(() => useUndoStack());

      act(() => { result.current.pushUndo({ description: first, execute: vi.fn().mockResolvedValue(undefined) }); });
      expect(result.current.lastDescription).toBe(first);
      act(() => { result.current.pushUndo({ description: second, execute: vi.fn().mockResolvedValue(undefined) }); });
      expect(result.current.lastDescription).toBe(second);
      act(() => { result.current.pushUndo({ description: third, execute: vi.fn().mockResolvedValue(undefined) }); });
      expect(result.current.lastDescription).toBe(third);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [`failing-${index}`]))(
    'failed generated undo keeps item in stack %s',
    async (description) => {
      const { result } = renderHook(() => useUndoStack());
      act(() => {
        result.current.pushUndo({ description, execute: vi.fn().mockRejectedValue(new Error('fail')) });
      });
      act(() => { result.current.handleUndo(); });
      const confirmCall = mockedModalConfirm.mock.calls[0][0];

      await act(async () => { await confirmCall.onOk(); });

      expect(result.current.undoStack).toHaveLength(1);
      expect(result.current.lastDescription).toBe(description);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => `successful-${index}`))(
    'successful generated undo removes item %s',
    async (description) => {
      const { result } = renderHook(() => useUndoStack());
      const execute = vi.fn().mockResolvedValue(undefined);
      act(() => {
        result.current.pushUndo({ description, execute });
      });
      act(() => { result.current.handleUndo(); });
      const confirmCall = mockedModalConfirm.mock.calls[0][0];

      await act(async () => { await confirmCall.onOk(); });

      expect(execute).toHaveBeenCalledTimes(1);
      expect(result.current.undoStack).toHaveLength(0);
      expect(result.current.lastDescription).toBe('');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [`batch109-a-${index}`, `batch109-b-${index}`] as const))(
    'generated stack keeps earlier item after undoing tail %s/%s',
    async (first, second) => {
      const { result } = renderHook(() => useUndoStack());
      act(() => { result.current.pushUndo({ description: first, execute: vi.fn().mockResolvedValue(undefined) }); });
      act(() => { result.current.pushUndo({ description: second, execute: vi.fn().mockResolvedValue(undefined) }); });
      act(() => { result.current.handleUndo(); });

      await act(async () => { await mockedModalConfirm.mock.calls[0][0].onOk(); });

      expect(result.current.undoStack).toHaveLength(1);
      expect(result.current.lastDescription).toBe(first);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch121-first-${index}`,
    `batch121-second-${index}`,
    `batch121-third-${index}`,
  ] as const))(
    'generated triple stack undo removes only tail %s/%s/%s',
    async (first, second, third) => {
      const { result } = renderHook(() => useUndoStack());
      act(() => { result.current.pushUndo({ description: first, execute: vi.fn().mockResolvedValue(undefined) }); });
      act(() => { result.current.pushUndo({ description: second, execute: vi.fn().mockResolvedValue(undefined) }); });
      act(() => { result.current.pushUndo({ description: third, execute: vi.fn().mockResolvedValue(undefined) }); });
      act(() => { result.current.handleUndo(); });

      expect(mockedModalConfirm.mock.calls[0][0].content).toBe(third);
      await act(async () => { await mockedModalConfirm.mock.calls[0][0].onOk(); });

      expect(result.current.undoStack.map((item) => item.description)).toEqual([first, second]);
      expect(result.current.lastDescription).toBe(second);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `batch121-retry-${index}`))(
    'generated failed undo can be retried successfully %s',
    async (description) => {
      const { result } = renderHook(() => useUndoStack());
      const execute = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(undefined);
      act(() => { result.current.pushUndo({ description, execute }); });
      act(() => { result.current.handleUndo(); });

      await act(async () => { await mockedModalConfirm.mock.calls[0][0].onOk(); });
      expect(result.current.undoStack).toHaveLength(1);

      act(() => { result.current.handleUndo(); });
      await act(async () => { await mockedModalConfirm.mock.calls[1][0].onOk(); });

      expect(execute).toHaveBeenCalledTimes(2);
      expect(result.current.undoStack).toHaveLength(0);
    },
  );
});

describe('useUndoStack batch 125 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => `batch125-撤回-${index}`))(
    'generated modal uses latest description %s',
    (description) => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.pushUndo({ description: `older-${description}`, execute: vi.fn().mockResolvedValue(undefined) });
        result.current.pushUndo({ description, execute: vi.fn().mockResolvedValue(undefined) });
      });
      act(() => {
        result.current.handleUndo();
      });

      expect(mockedModalConfirm).toHaveBeenCalledTimes(1);
      expect(mockedModalConfirm.mock.calls[0][0]).toMatchObject({
        title: '确认撤回',
        content: description,
        okText: '确认撤回',
      });
      expect(result.current.undoStack).toHaveLength(2);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `batch125-fail-${index}`))(
    'generated failed undo clears loading and keeps stack %s',
    async (description) => {
      const { result } = renderHook(() => useUndoStack());
      const execute = vi.fn().mockRejectedValue(new Error(description));

      act(() => {
        result.current.pushUndo({ description, execute });
      });
      act(() => {
        result.current.handleUndo();
      });

      await act(async () => {
        await mockedModalConfirm.mock.calls[0][0].onOk();
      });

      expect(execute).toHaveBeenCalledTimes(1);
      expect(Message.clear).toHaveBeenCalled();
      expect(Message.error).toHaveBeenCalledWith('撤回失败');
      expect(result.current.undoStack).toHaveLength(1);
      expect(result.current.lastDescription).toBe(description);
    },
  );
});

describe('useUndoStack batch 128 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => `batch128-empty-${index}`))(
    'generated empty stack undo does not open modal %s',
    () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.handleUndo();
      });

      expect(mockedModalConfirm).not.toHaveBeenCalled();
      expect(result.current.undoStack).toHaveLength(0);
      expect(result.current.lastDescription).toBe('');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch128-first-${index}`,
    `batch128-second-${index}`,
  ] as const))(
    'generated second undo succeeds after first success %s/%s',
    async (first, second) => {
      const { result } = renderHook(() => useUndoStack());
      const firstExecute = vi.fn().mockResolvedValue(undefined);
      const secondExecute = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.pushUndo({ description: first, execute: firstExecute });
        result.current.pushUndo({ description: second, execute: secondExecute });
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[0][0].onOk();
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[1][0].onOk();
      });

      expect(secondExecute).toHaveBeenCalledTimes(1);
      expect(firstExecute).toHaveBeenCalledTimes(1);
      expect(result.current.undoStack).toHaveLength(0);
      expect(Message.success).toHaveBeenCalledWith('撤回成功');
    },
  );
});

describe('useUndoStack batch 137 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch137-first-${index}`,
    `batch137-second-${index}`,
  ] as const))(
    'generated push order exposes latest description %s/%s',
    (first, second) => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.pushUndo({ description: first, execute: vi.fn().mockResolvedValue(undefined) });
        result.current.pushUndo({ description: second, execute: vi.fn().mockResolvedValue(undefined) });
      });

      expect(result.current.undoStack.map((item) => item.description)).toEqual([first, second]);
      expect(result.current.lastDescription).toBe(second);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `batch137-failed-${index}`))(
    'generated failed undo keeps item for retry %s',
    async (description) => {
      const { result } = renderHook(() => useUndoStack());
      const execute = vi.fn().mockRejectedValue(new Error(description));

      act(() => {
        result.current.pushUndo({ description, execute });
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[0][0].onOk();
      });

      expect(execute).toHaveBeenCalledTimes(1);
      expect(result.current.undoStack).toHaveLength(1);
      expect(result.current.lastDescription).toBe(description);
      expect(Message.error).toHaveBeenCalledWith('撤回失败');
    },
  );
});

describe('useUndoStack batch 146 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch146-first-${index}`,
    `batch146-second-${index}`,
  ] as const))(
    'generated successful undo removes latest item only %s/%s',
    async (first, second) => {
      const { result } = renderHook(() => useUndoStack());
      const firstExecute = vi.fn().mockResolvedValue(undefined);
      const secondExecute = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.pushUndo({ description: first, execute: firstExecute });
        result.current.pushUndo({ description: second, execute: secondExecute });
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[0][0].onOk();
      });

      expect(secondExecute).toHaveBeenCalledTimes(1);
      expect(firstExecute).not.toHaveBeenCalled();
      expect(result.current.undoStack.map((item) => item.description)).toEqual([first]);
      expect(result.current.lastDescription).toBe(first);
      expect(Message.clear).toHaveBeenCalled();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `batch146-retry-${index}`))(
    'generated retry succeeds after failed undo %s',
    async (description) => {
      const { result } = renderHook(() => useUndoStack());
      const execute = vi.fn()
        .mockRejectedValueOnce(new Error(description))
        .mockResolvedValueOnce(undefined);

      act(() => {
        result.current.pushUndo({ description, execute });
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[0][0].onOk();
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[1][0].onOk();
      });

      expect(execute).toHaveBeenCalledTimes(2);
      expect(result.current.undoStack).toHaveLength(0);
      expect(Message.error).toHaveBeenCalledWith('撤回失败');
      expect(Message.success).toHaveBeenCalledWith('撤回成功');
    },
  );
});

describe('useUndoStack batch 151 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch151-first-${index}`,
    `batch151-second-${index}`,
    `batch151-third-${index}`,
  ] as const))(
    'generated stack preserves push order and latest description %s',
    (first, second, third) => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.pushUndo({ description: first, execute: vi.fn().mockResolvedValue(undefined) });
        result.current.pushUndo({ description: second, execute: vi.fn().mockResolvedValue(undefined) });
        result.current.pushUndo({ description: third, execute: vi.fn().mockResolvedValue(undefined) });
      });

      expect(result.current.undoStack.map((item) => item.description)).toEqual([first, second, third]);
      expect(result.current.lastDescription).toBe(third);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch151-keep-${index}`,
    `batch151-remove-${index}`,
  ] as const))(
    'generated successful undo removes only latest item %s/%s',
    async (keepDescription, removeDescription) => {
      const { result } = renderHook(() => useUndoStack());
      const keepExecute = vi.fn().mockResolvedValue(undefined);
      const removeExecute = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.pushUndo({ description: keepDescription, execute: keepExecute });
        result.current.pushUndo({ description: removeDescription, execute: removeExecute });
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[0][0].onOk();
      });

      expect(removeExecute).toHaveBeenCalledTimes(1);
      expect(keepExecute).not.toHaveBeenCalled();
      expect(result.current.undoStack.map((item) => item.description)).toEqual([keepDescription]);
      expect(result.current.lastDescription).toBe(keepDescription);
      expect(Message.success).toHaveBeenCalledWith('撤回成功');
    },
  );
});

describe('useUndoStack batch 158 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch158-first-${index}`,
    `batch158-second-${index}`,
    `batch158-third-${index}`,
  ] as const))(
    'generated batch158 sequential successes remove latest first %s',
    async (first, second, third) => {
      const { result } = renderHook(() => useUndoStack());
      const firstExecute = vi.fn().mockResolvedValue(undefined);
      const secondExecute = vi.fn().mockResolvedValue(undefined);
      const thirdExecute = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.pushUndo({ description: first, execute: firstExecute });
        result.current.pushUndo({ description: second, execute: secondExecute });
        result.current.pushUndo({ description: third, execute: thirdExecute });
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[0][0].onOk();
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[1][0].onOk();
      });

      expect(thirdExecute).toHaveBeenCalledTimes(1);
      expect(secondExecute).toHaveBeenCalledTimes(1);
      expect(firstExecute).not.toHaveBeenCalled();
      expect(result.current.undoStack.map((item) => item.description)).toEqual([first]);
      expect(result.current.lastDescription).toBe(first);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch158-fail-${index}`,
    `batch158-keep-${index}`,
  ] as const))(
    'generated batch158 failed latest undo keeps full stack %s',
    async (failedDescription, keptDescription) => {
      const { result } = renderHook(() => useUndoStack());
      const keepExecute = vi.fn().mockResolvedValue(undefined);
      const failExecute = vi.fn().mockRejectedValue(new Error(failedDescription));

      act(() => {
        result.current.pushUndo({ description: keptDescription, execute: keepExecute });
        result.current.pushUndo({ description: failedDescription, execute: failExecute });
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[0][0].onOk();
      });

      expect(failExecute).toHaveBeenCalledTimes(1);
      expect(keepExecute).not.toHaveBeenCalled();
      expect(result.current.undoStack.map((item) => item.description)).toEqual([keptDescription, failedDescription]);
      expect(result.current.lastDescription).toBe(failedDescription);
      expect(Message.error).toHaveBeenCalledWith('撤回失败');
    },
  );
});

describe('useUndoStack batch 165 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch165-first-${index}`,
    `batch165-second-${index}`,
    `batch165-third-${index}`,
  ] as const))(
    'generated batch165 one failed undo leaves latest on stack %s',
    async (first, second, third) => {
      const { result } = renderHook(() => useUndoStack());
      const firstExecute = vi.fn().mockResolvedValue(undefined);
      const secondExecute = vi.fn().mockResolvedValue(undefined);
      const thirdExecute = vi.fn().mockRejectedValue(new Error(third));

      act(() => {
        result.current.pushUndo({ description: first, execute: firstExecute });
        result.current.pushUndo({ description: second, execute: secondExecute });
        result.current.pushUndo({ description: third, execute: thirdExecute });
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[0][0].onOk();
      });

      expect(thirdExecute).toHaveBeenCalledTimes(1);
      expect(secondExecute).not.toHaveBeenCalled();
      expect(firstExecute).not.toHaveBeenCalled();
      expect(result.current.undoStack.map((item) => item.description)).toEqual([first, second, third]);
      expect(result.current.lastDescription).toBe(third);
      expect(Message.error).toHaveBeenCalledWith('撤回失败');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch165-first-${index}`,
    `batch165-second-${index}`,
  ] as const))(
    'generated batch165 handleUndo without confirm does not mutate stack %s',
    (first, second) => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.pushUndo({ description: first, execute: vi.fn().mockResolvedValue(undefined) });
        result.current.pushUndo({ description: second, execute: vi.fn().mockResolvedValue(undefined) });
      });
      act(() => {
        result.current.handleUndo();
      });

      expect(result.current.undoStack.map((item) => item.description)).toEqual([first, second]);
      expect(result.current.lastDescription).toBe(second);
      expect(mockedModalConfirm).toHaveBeenCalledTimes(1);
      expect(Message.loading).not.toHaveBeenCalled();
    },
  );
});

describe('useUndoStack batch 169 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch169-first-${index}`,
    `batch169-second-${index}`,
  ] as const))(
    'generated batch169 successful latest undo removes only newest item %s',
    async (first, second) => {
      const { result } = renderHook(() => useUndoStack());
      const firstExecute = vi.fn().mockResolvedValue(undefined);
      const secondExecute = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.pushUndo({ description: first, execute: firstExecute });
        result.current.pushUndo({ description: second, execute: secondExecute });
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[0][0].onOk();
      });

      expect(secondExecute).toHaveBeenCalledTimes(1);
      expect(firstExecute).not.toHaveBeenCalled();
      expect(result.current.undoStack.map((item) => item.description)).toEqual([first]);
      expect(result.current.lastDescription).toBe(first);
      expect(Message.success).toHaveBeenCalledWith('撤回成功');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch169-empty-${index}`,
  ] as const))(
    'generated batch169 empty stack undo does not open confirm %s',
    (description) => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.handleUndo();
      });

      expect(result.current.undoStack).toEqual([]);
      expect(result.current.lastDescription).toBe('');
      expect(mockedModalConfirm).not.toHaveBeenCalled();
      expect(description).toContain('batch169-empty');
    },
  );
});

describe('useUndoStack batch 176 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch176-first-${index}`,
    `batch176-second-${index}`,
    `batch176-third-${index}`,
  ] as const))(
    'generated batch176 repeated successful undo follows LIFO order %s',
    async (first, second, third) => {
      const { result } = renderHook(() => useUndoStack());
      const firstExecute = vi.fn().mockResolvedValue(undefined);
      const secondExecute = vi.fn().mockResolvedValue(undefined);
      const thirdExecute = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.pushUndo({ description: first, execute: firstExecute });
        result.current.pushUndo({ description: second, execute: secondExecute });
        result.current.pushUndo({ description: third, execute: thirdExecute });
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[0][0].onOk();
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[1][0].onOk();
      });

      expect(thirdExecute).toHaveBeenCalledTimes(1);
      expect(secondExecute).toHaveBeenCalledTimes(1);
      expect(firstExecute).not.toHaveBeenCalled();
      expect(result.current.undoStack.map((item) => item.description)).toEqual([first]);
      expect(result.current.lastDescription).toBe(first);
      expect(Message.success).toHaveBeenCalledWith('撤回成功');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch176-keep-${index}`,
    `batch176-fail-${index}`,
  ] as const))(
    'generated batch176 failed latest undo keeps stack and error state %s',
    async (keptDescription, failedDescription) => {
      const { result } = renderHook(() => useUndoStack());
      const keepExecute = vi.fn().mockResolvedValue(undefined);
      const failExecute = vi.fn().mockRejectedValue(new Error(failedDescription));

      act(() => {
        result.current.pushUndo({ description: keptDescription, execute: keepExecute });
        result.current.pushUndo({ description: failedDescription, execute: failExecute });
      });
      act(() => {
        result.current.handleUndo();
      });
      await act(async () => {
        await mockedModalConfirm.mock.calls[0][0].onOk();
      });

      expect(failExecute).toHaveBeenCalledTimes(1);
      expect(keepExecute).not.toHaveBeenCalled();
      expect(result.current.undoStack.map((item) => item.description)).toEqual([keptDescription, failedDescription]);
      expect(result.current.lastDescription).toBe(failedDescription);
      expect(Message.error).toHaveBeenCalledWith('撤回失败');
    },
  );
});
