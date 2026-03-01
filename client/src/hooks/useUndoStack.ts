import { useState, useCallback } from 'react';
import { Modal, Message } from '@arco-design/web-react';

export interface UndoItem {
  description: string;
  execute: () => Promise<void>;
}

export function useUndoStack() {
  const [undoStack, setUndoStack] = useState<UndoItem[]>([]);

  const pushUndo = useCallback((item: UndoItem) => {
    setUndoStack(prev => [...prev, item]);
  }, []);

  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      Modal.confirm({
        title: '确认撤回',
        content: last.description,
        okText: '确认撤回',
        onOk: async () => {
          Message.loading('正在撤回...');
          try {
            await last.execute();
            setUndoStack(p => p.slice(0, -1));
            Message.clear();
            Message.success('撤回成功');
          } catch {
            Message.clear();
            Message.error('撤回失败');
          }
        },
      });
      return prev;
    });
  }, []);

  const lastDescription = undoStack.length > 0 ? undoStack[undoStack.length - 1].description : '';

  return { undoStack, pushUndo, handleUndo, lastDescription };
}
