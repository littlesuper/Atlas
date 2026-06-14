import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { checkItemsApi } from '../../../api';
import { CheckItem } from '../../../types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';

export function computeCheckProgress(items: CheckItem[]): { checked: number; total: number; percent: number } {
  const checked = items.filter((i) => i.checked).length;
  const total = items.length;
  const percent = total > 0 ? Math.round((checked / total) * 100) : 0;
  return { checked, total, percent };
}

interface CheckItemsProps {
  activityId: string;
}

const CheckItems: React.FC<CheckItemsProps> = ({ activityId }) => {
  const [items, setItems] = useState<CheckItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await checkItemsApi.list(activityId);
      setItems(res.data);
    } catch {
      toast.error('加载检查项失败');
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const res = await checkItemsApi.create({ activityId, title });
      setItems((prev) => [...prev, res.data]);
      setNewTitle('');
    } catch {
      toast.error('添加失败');
    }
  };

  const handleToggle = async (item: CheckItem) => {
    try {
      const res = await checkItemsApi.update(item.id, { checked: !item.checked });
      setItems((prev) => prev.map((i) => (i.id === item.id ? res.data : i)));
    } catch {
      toast.error('更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await checkItemsApi.delete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      toast.error('删除失败');
    }
  };

  const handleEditStart = (item: CheckItem) => {
    setEditingId(item.id);
    setEditingTitle(item.title);
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    const title = editingTitle.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    try {
      const res = await checkItemsApi.update(editingId, { title });
      setItems((prev) => prev.map((i) => (i.id === editingId ? res.data : i)));
    } catch {
      toast.error('更新失败');
    }
    setEditingId(null);
  };

  const { checkedCount, totalCount, percent } = (() => {
    const p = computeCheckProgress(items);
    return { checkedCount: p.checked, totalCount: p.total, percent: p.percent };
  })();

  return (
    <div className="relative w-full">
      {loading && (
        <div className="bg-background/60 absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      )}
      <div>
        {/* 标题行 */}
        <div className="mb-2 flex items-center justify-between">
          <span className="text-muted-foreground text-[13px] font-medium">检查项</span>
          {totalCount > 0 && (
            <span className="text-muted-foreground text-xs">
              {checkedCount}/{totalCount}
            </span>
          )}
        </div>

        {/* 进度条 */}
        {totalCount > 0 && (
          <Progress
            value={percent}
            className={cn('mb-2 h-1.5', percent === 100 && '[&>div]:bg-emerald-500')}
          />
        )}

        {/* 检查项列表 */}
        <div className="flex flex-col gap-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded py-1">
              <Checkbox checked={item.checked} onCheckedChange={() => handleToggle(item)} />
              {editingId === item.id ? (
                <Input
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEditSave();
                  }}
                  onBlur={handleEditSave}
                  autoFocus
                  className="h-7 flex-1 text-[13px]"
                />
              ) : (
                <span
                  onClick={() => handleEditStart(item)}
                  className={cn(
                    'flex-1 cursor-pointer text-[13px] leading-[22px]',
                    item.checked ? 'text-muted-foreground line-through' : 'text-foreground'
                  )}
                >
                  {item.title}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive size-7 shrink-0 opacity-50"
                aria-label="删除检查项"
                onClick={() => handleDelete(item.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {/* 新增输入框 */}
        <div className="mt-2 flex gap-2">
          <Input
            placeholder="添加检查项..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
            className="h-7 flex-1 text-[13px]"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="添加检查项"
            onClick={handleAdd}
            disabled={!newTitle.trim()}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CheckItems;
