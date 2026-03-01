import { useState, useRef, useEffect, useCallback } from 'react';
import { Message } from '@arco-design/web-react';
import { activitiesApi } from '../api';
import { Activity } from '../types';
import { UndoItem } from './useUndoStack';

interface UseDragReorderOptions {
  projectId: string | undefined;
  activities: Activity[];
  setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
  pushUndo: (item: UndoItem) => void;
  loadActivities: () => Promise<void>;
}

export function useDragReorder({
  projectId,
  activities,
  setActivities,
  pushUndo,
  loadActivities,
}: UseDragReorderOptions) {
  const dragIndexRef = useRef<number>(-1);
  const isDraggingRef = useRef(false);
  const dragFromRef = useRef(-1);
  const dragOverRef = useRef(-1);
  const [saving, setSaving] = useState(false);
  const [, forceRender] = useState(0);

  const resetDragState = useCallback(() => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    isDraggingRef.current = false;
    dragFromRef.current = -1;
    dragOverRef.current = -1;
    dragIndexRef.current = -1;
    forceRender((n) => n + 1);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    dragIndexRef.current = index;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent, index: number) => {
    if (dragIndexRef.current === -1) return;
    e.preventDefault();
    let needRender = false;
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      dragFromRef.current = dragIndexRef.current;
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      needRender = true;
    }
    if (dragOverRef.current !== index) {
      dragOverRef.current = index;
      needRender = true;
    }
    if (needRender) forceRender((n) => n + 1);
  }, []);

  const handleMouseUp = useCallback(async (e: React.MouseEvent, targetIndex: number) => {
    e.preventDefault();
    if (!isDraggingRef.current) {
      dragIndexRef.current = -1;
      return;
    }
    const fromIndex = dragIndexRef.current;
    resetDragState();

    if (fromIndex === -1 || fromIndex === targetIndex) return;

    const newList = [...activities];
    const [removed] = newList.splice(fromIndex, 1);
    newList.splice(targetIndex, 0, removed);
    const reordered = newList.map((a, i) => ({ ...a, sortOrder: (i + 1) * 10 }));
    setActivities(reordered);

    if (!projectId) return;
    const oldOrder = activities.map((a, i) => ({ id: a.id, sortOrder: (i + 1) * 10 }));
    setSaving(true);
    try {
      await activitiesApi.reorder(projectId, reordered.map((a, i) => ({ id: a.id, sortOrder: (i + 1) * 10 })));
      pushUndo({
        description: `撤回活动排序调整`,
        execute: async () => {
          await activitiesApi.reorder(projectId!, oldOrder);
          loadActivities();
        },
      });
    } catch {
      Message.error('保存排序失败');
      loadActivities();
    } finally {
      setSaving(false);
    }
  }, [activities, projectId, setActivities, pushUndo, loadActivities, resetDragState]);

  // 全局 mouseup 兜底
  useEffect(() => {
    const cleanup = () => {
      if (isDraggingRef.current) resetDragState();
    };
    window.addEventListener('mouseup', cleanup);
    return () => window.removeEventListener('mouseup', cleanup);
  }, [resetDragState]);

  return {
    saving,
    dragFromRef,
    dragOverRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
