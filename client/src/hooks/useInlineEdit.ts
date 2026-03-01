import { useState, useEffect, useCallback } from 'react';
import { Message } from '@arco-design/web-react';
import { activitiesApi } from '../api';
import { Activity } from '../types';
import { UndoItem } from './useUndoStack';

interface UseInlineEditOptions {
  isArchived: boolean;
  canManage: boolean;
  pushUndo: (item: UndoItem) => void;
  loadActivities: () => Promise<void>;
  loadProject: () => Promise<void>;
  setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
}

export function useInlineEdit({
  isArchived,
  canManage,
  pushUndo,
  loadActivities,
  loadProject,
  setActivities,
}: UseInlineEditOptions) {
  const [inlineEditing, setInlineEditing] = useState<{ id: string; field: string } | null>(null);
  const [inlineValue, setInlineValue] = useState<string>('');

  // 全局点击外部关闭内联编辑
  useEffect(() => {
    if (!inlineEditing) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!document.contains(target)) return;
      if (target.closest('.arco-picker-dropdown, .arco-picker-range-wrapper, .arco-picker-panel, .arco-select-popup, .arco-picker, .arco-select, .arco-input-wrapper, .arco-input-number, .arco-picker-container')) return;
      if (['name', 'notes', 'planDuration'].includes(inlineEditing.field)) return;
      setInlineEditing(null);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInlineEditing(null);
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler, true);
    }, 0);
    document.addEventListener('keydown', keyHandler, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler, true);
      document.removeEventListener('keydown', keyHandler, true);
    };
  }, [inlineEditing]);

  const startInlineEdit = useCallback((activityId: string, field: string, currentValue: string) => {
    if (isArchived || !canManage) return;
    setInlineEditing({ id: activityId, field });
    setInlineValue(currentValue);
  }, [isArchived, canManage]);

  const showUndoMessage = useCallback((activityId: string, rollbackPayload: Record<string, unknown>, activityName?: string) => {
    pushUndo({
      description: `撤回对活动「${activityName || '未知'}」的修改`,
      execute: async () => {
        await activitiesApi.update(activityId, rollbackPayload);
        loadActivities();
        loadProject();
      },
    });
    Message.success('更新成功');
  }, [pushUndo, loadActivities, loadProject]);

  const commitInlineEdit = useCallback(async (activity: Activity, field: string) => {
    setInlineEditing(null);
    const original = (activity as unknown as Record<string, unknown>)[field] as string;
    if (inlineValue === original || inlineValue === (original ?? '')) return;
    try {
      await activitiesApi.update(activity.id, { [field]: inlineValue || undefined });
      setActivities((prev) => prev.map((a) => a.id === activity.id ? { ...a, [field]: inlineValue } : a));
      showUndoMessage(activity.id, { [field]: original ?? undefined }, activity.name);
    } catch {
      Message.error('更新失败');
    }
  }, [inlineValue, setActivities, showUndoMessage]);

  const commitSelectEdit = useCallback(async (activity: Activity, field: string, value: string) => {
    setInlineEditing(null);
    const oldValue = (activity as unknown as Record<string, unknown>)[field] as string;
    try {
      await activitiesApi.update(activity.id, { [field]: value });
      setActivities((prev) => prev.map((a) => a.id === activity.id ? { ...a, [field]: value } : a));
      showUndoMessage(activity.id, { [field]: oldValue }, activity.name);
    } catch {
      Message.error('更新失败');
    }
  }, [setActivities, showUndoMessage]);

  return {
    inlineEditing,
    setInlineEditing,
    inlineValue,
    setInlineValue,
    startInlineEdit,
    showUndoMessage,
    commitInlineEdit,
    commitSelectEdit,
  };
}
