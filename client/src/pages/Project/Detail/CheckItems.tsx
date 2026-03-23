import React, { useState, useEffect, useCallback } from 'react';
import {
  Checkbox,
  Input,
  Button,
  Message,
  Spin,
  Progress,
  Typography,
} from '@arco-design/web-react';
import { IconPlus, IconDelete } from '@arco-design/web-react/icon';
import { checkItemsApi } from '../../../api';
import { CheckItem } from '../../../types';

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
      Message.error('加载检查项失败');
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
      Message.error('添加失败');
    }
  };

  const handleToggle = async (item: CheckItem) => {
    try {
      const res = await checkItemsApi.update(item.id, { checked: !item.checked });
      setItems((prev) => prev.map((i) => (i.id === item.id ? res.data : i)));
    } catch {
      Message.error('更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await checkItemsApi.delete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      Message.error('删除失败');
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
      Message.error('更新失败');
    }
    setEditingId(null);
  };

  const checkedCount = items.filter((i) => i.checked).length;
  const totalCount = items.length;
  const percent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  return (
    <Spin loading={loading} style={{ width: '100%' }}>
      <div>
        {/* 标题行 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-2)' }}>
            检查项
          </span>
          {totalCount > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {checkedCount}/{totalCount}
            </Typography.Text>
          )}
        </div>

        {/* 进度条 */}
        {totalCount > 0 && (
          <Progress
            percent={percent}
            size="small"
            style={{ marginBottom: 8 }}
            color={percent === 100 ? 'var(--color-success-6)' : undefined}
          />
        )}

        {/* 检查项列表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 0',
                borderRadius: 4,
              }}
            >
              <Checkbox
                checked={item.checked}
                onChange={() => handleToggle(item)}
              />
              {editingId === item.id ? (
                <Input
                  size="small"
                  value={editingTitle}
                  onChange={setEditingTitle}
                  onPressEnter={handleEditSave}
                  onBlur={handleEditSave}
                  autoFocus
                  style={{ flex: 1 }}
                />
              ) : (
                <span
                  onClick={() => handleEditStart(item)}
                  style={{
                    flex: 1,
                    cursor: 'pointer',
                    textDecoration: item.checked ? 'line-through' : 'none',
                    color: item.checked ? 'var(--color-text-4)' : 'var(--color-text-1)',
                    fontSize: 13,
                    lineHeight: '22px',
                  }}
                >
                  {item.title}
                </span>
              )}
              <Button
                type="text"
                status="danger"
                icon={<IconDelete />}
                size="mini"
                onClick={() => handleDelete(item.id)}
                style={{ opacity: 0.5, flexShrink: 0 }}
              />
            </div>
          ))}
        </div>

        {/* 新增输入框 */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Input
            size="small"
            placeholder="添加检查项..."
            value={newTitle}
            onChange={setNewTitle}
            onPressEnter={handleAdd}
            style={{ flex: 1 }}
          />
          <Button
            type="text"
            size="small"
            icon={<IconPlus />}
            onClick={handleAdd}
            disabled={!newTitle.trim()}
          />
        </div>
      </div>
    </Spin>
  );
};

export default CheckItems;
