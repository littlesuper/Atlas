import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export interface UndoItem {
  description: string;
  execute: () => Promise<void>;
}

export function useUndoStack() {
  const [undoStack, setUndoStack] = useState<UndoItem[]>([]);

  const pushUndo = useCallback((item: UndoItem) => {
    setUndoStack((prev) => [...prev, item]);
  }, []);

  // 执行撤回（确认 UI 由调用方提供，例如 AlertDialog）
  const handleUndo = useCallback(async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    const loadingId = toast.loading('正在撤回...');
    try {
      await last.execute();
      setUndoStack((p) => p.slice(0, -1));
      toast.dismiss(loadingId);
      toast.success('撤回成功');
    } catch {
      toast.dismiss(loadingId);
      toast.error('撤回失败');
    }
  }, [undoStack]);

  const lastDescription = undoStack.length > 0 ? undoStack[undoStack.length - 1].description : '';

  return { undoStack, pushUndo, handleUndo, lastDescription };
}
