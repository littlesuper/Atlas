import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table,
  Button,
  Space,
  Modal,
  Drawer,
  Form,
  Input,
  Select,
  Message,
  Tooltip,
  InputNumber,
  Tag,
} from '@arco-design/web-react';
import {
  IconPlus,
  IconEdit,
  IconDelete,
  IconCopy,
  IconDragDotVertical,
} from '@arco-design/web-react/icon';
import MainLayout from '../../layouts/MainLayout';
import { templatesApi } from '../../api';
import { ProjectTemplate, TemplateActivity, ActivityType } from '../../types';
import { ACTIVITY_TYPE_MAP, PHASE_OPTIONS } from '../../utils/constants';
import dayjs from 'dayjs';

const PHASE_COLOR: Record<string, string> = { EVT: 'blue', DVT: 'cyan', PVT: 'purple', MP: 'orange' };

let _idCounter = 0;
const genId = (): string =>
  typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${++_idCounter}`;

// 自动展开的 Select 包装：mount 后自动 click 触发下拉展开
const AutoOpenSelect: React.FC<React.ComponentProps<typeof Select> & { onDismiss: () => void }> = ({ onDismiss, children, ...props }) => {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const input = wrapRef.current?.querySelector('.arco-select-view') as HTMLElement;
      input?.click();
    }, 50);
    return () => clearTimeout(timer);
  }, []);
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      const popup = document.querySelector('.arco-select-popup');
      if (wrapRef.current?.contains(e.target as Node)) return;
      if (popup?.contains(e.target as Node)) return;
      onDismiss();
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onDismiss]);
  return (
    <div ref={wrapRef} style={{ display: 'inline-block' }}>
      <Select {...props}>{children}</Select>
    </div>
  );
};

const TemplateManagement: React.FC = () => {
  const [form] = Form.useForm();
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editing, setEditing] = useState<ProjectTemplate | null>(null);
  const [activities, setActivities] = useState<TemplateActivity[]>([]);
  const [saving, setSaving] = useState(false);

  // 点击编辑状态
  const [inlineEditing, setInlineEditing] = useState<{ id: string; field: string } | null>(null);
  const [inlineValue, setInlineValue] = useState<string>('');

  // 拖拽排序状态
  const dragIndexRef = useRef(-1);
  const isDraggingRef = useRef(false);
  const dragFromRef = useRef(-1);
  const dragOverRef = useRef(-1);
  const [, forceRender] = useState(0);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await templatesApi.list();
      setTemplates(res.data);
    } catch {
      Message.error('加载模板列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleOpen = async (tpl?: ProjectTemplate) => {
    if (tpl) {
      try {
        const res = await templatesApi.get(tpl.id);
        const full = res.data;
        setEditing(full);
        form.setFieldsValue({
          name: full.name,
          description: full.description || '',
        });
        setActivities(full.activities || []);
      } catch {
        Message.error('加载模板详情失败');
        return;
      }
    } else {
      setEditing(null);
      form.resetFields();
      setActivities([]);
    }
    setInlineEditing(null);
    setDrawerVisible(true);
  };

  const handleDelete = (tpl: ProjectTemplate) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除模板"${tpl.name}"吗？此操作不可恢复。`,
      onOk: async () => {
        try {
          await templatesApi.delete(tpl.id);
          Message.success('模板删除成功');
          loadTemplates();
        } catch {
          Message.error('模板删除失败');
        }
      },
    });
  };

  const handleDuplicate = async (tpl: ProjectTemplate) => {
    try {
      const res = await templatesApi.get(tpl.id);
      const full = res.data;
      const acts = (full.activities || []).map((a) => ({
        ...a,
        id: genId(),
      }));
      const idMap = new Map<string, string>();
      (full.activities || []).forEach((orig, i) => {
        idMap.set(orig.id, acts[i].id);
      });
      const remapped = acts.map((a) => ({
        ...a,
        dependencies: a.dependencies?.map((d: { id: string; type: string; lag?: number }) => ({
          ...d,
          id: idMap.get(d.id) || d.id,
        })) || null,
      }));

      await templatesApi.create({
        name: `${full.name} (副本)`,
        description: full.description || undefined,
        activities: remapped as any,
      });
      Message.success('模板复制成功');
      loadTemplates();
    } catch {
      Message.error('模板复制失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      setSaving(true);

      const data = {
        name: values.name,
        description: values.description || undefined,
        activities: activities.map((a, idx) => ({
          id: a.id,
          name: a.name,
          type: a.type || 'TASK',
          phase: a.phase || null,
          planDuration: a.planDuration || null,
          dependencies: a.dependencies || null,
          notes: a.notes || null,
          sortOrder: a.sortOrder ?? idx,
        })),
      };

      if (editing) {
        await templatesApi.update(editing.id, data);
        Message.success('模板更新成功');
      } else {
        await templatesApi.create(data as any);
        Message.success('模板创建成功');
      }

      setDrawerVisible(false);
      loadTemplates();
    } catch (err) {
      console.error('保存模板失败', err);
    } finally {
      setSaving(false);
    }
  };

  // ---- Activity editing ----

  const addActivity = () => {
    setActivities((prev) => [
      ...prev,
      {
        id: genId(),
        templateId: editing?.id || '',
        name: '',
        type: 'TASK' as ActivityType,
        phase: null,
        planDuration: null,
        dependencies: null,
        notes: null,
        sortOrder: prev.length,
      },
    ]);
  };

  const insertActivity = (atIndex: number) => {
    setActivities((prev) => {
      const newAct: TemplateActivity = {
        id: genId(),
        templateId: editing?.id || '',
        name: '',
        type: 'TASK' as ActivityType,
        phase: null,
        planDuration: null,
        dependencies: null,
        notes: null,
        sortOrder: atIndex,
      };
      const next = [...prev];
      next.splice(atIndex, 0, newAct);
      return next.map((a, i) => ({ ...a, sortOrder: i }));
    });
  };

  const updateActivity = (id: string, field: string, value: unknown) => {
    setActivities((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
  };

  const removeActivity = (id: string) => {
    setActivities((prev) => {
      return prev
        .filter((a) => a.id !== id)
        .map((a) => ({
          ...a,
          dependencies: a.dependencies?.filter((d) => d.id !== id) || null,
        }));
    });
  };

  // ---- 点击编辑 ----

  const startInlineEdit = (activityId: string, field: string, currentValue: string) => {
    setInlineEditing({ id: activityId, field });
    setInlineValue(currentValue);
  };

  const commitInlineEdit = (activity: TemplateActivity, field: string) => {
    setInlineEditing(null);
    updateActivity(activity.id, field, inlineValue || (field === 'name' ? '' : null));
  };

  const commitNumberEdit = (activity: TemplateActivity) => {
    setInlineEditing(null);
    const num = parseInt(inlineValue, 10);
    updateActivity(activity.id, 'planDuration', num > 0 ? num : null);
  };

  // 全局点击外部关闭内联编辑
  useEffect(() => {
    if (!inlineEditing) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.arco-select-popup, .arco-select, .arco-input-wrapper, .arco-input-number')) return;
      setInlineEditing(null);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInlineEditing(null);
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler, true);
    }, 0);
    document.addEventListener('keydown', keyHandler, true);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler, true); document.removeEventListener('keydown', keyHandler, true); };
  }, [inlineEditing]);

  // ---- 拖拽排序 ----

  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    dragIndexRef.current = index;
  };

  const handleMouseMove = (e: React.MouseEvent, index: number) => {
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
  };

  const resetDragState = () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    isDraggingRef.current = false;
    dragFromRef.current = -1;
    dragOverRef.current = -1;
    dragIndexRef.current = -1;
    forceRender((n) => n + 1);
  };

  const handleMouseUp = (e: React.MouseEvent, targetIndex: number) => {
    e.preventDefault();
    if (!isDraggingRef.current) {
      dragIndexRef.current = -1;
      return;
    }
    const fromIndex = dragIndexRef.current;
    resetDragState();

    if (fromIndex === -1 || fromIndex === targetIndex) return;

    setActivities((prev) => {
      const newList = [...prev];
      const [removed] = newList.splice(fromIndex, 1);
      newList.splice(targetIndex, 0, removed);
      return newList.map((a, i) => ({ ...a, sortOrder: i }));
    });
  };

  // 全局 mouseup 兜底
  useEffect(() => {
    const cleanup = () => {
      if (isDraggingRef.current) resetDragState();
    };
    window.addEventListener('mouseup', cleanup);
    return () => window.removeEventListener('mouseup', cleanup);
  }, []);

  // Template list columns
  const columns = [
    {
      title: '模板名称',
      dataIndex: 'name',
      width: 200,
      render: (name: string) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      render: (desc?: string) => desc || '-',
    },
    {
      title: '活动数',
      dataIndex: '_count',
      width: 90,
      render: (c?: { activities: number }) => c?.activities ?? 0,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 170,
      sorter: (a: ProjectTemplate, b: ProjectTemplate) =>
        new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
      render: (d: string) => dayjs(d).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      width: 150,
      fixed: 'right' as const,
      render: (_: unknown, record: ProjectTemplate) => (
        <Space>
          <Tooltip content="编辑">
            <Button
              type="text"
              icon={<IconEdit />}
              size="small"
              onClick={() => handleOpen(record)}
            />
          </Tooltip>
          <Tooltip content="复制">
            <Button
              type="text"
              icon={<IconCopy />}
              size="small"
              onClick={() => handleDuplicate(record)}
            />
          </Tooltip>
          <Tooltip content="删除">
            <Button
              type="text"
              status="danger"
              icon={<IconDelete />}
              size="small"
              onClick={() => handleDelete(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // Activity table columns (inside drawer) — click-to-edit
  const activityColumns = [
    {
      title: '',
      width: 50,
      render: (_: unknown, _record: TemplateActivity, index: number) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
          <div
            className="drag-handle"
            onMouseDown={(e: React.MouseEvent) => handleMouseDown(e, index)}
          >
            <IconDragDotVertical />
          </div>
          <div
            className="row-insert-trigger"
            onClick={() => insertActivity(index + 1)}
            title="在下方插入活动"
          >
            <IconPlus />
          </div>
        </div>
      ),
    },
    {
      title: '活动名称',
      dataIndex: 'name',
      render: (name: string, record: TemplateActivity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'name') {
          return (
            <Input
              autoFocus
              size="small"
              value={inlineValue}
              placeholder="活动名称"
              onChange={setInlineValue}
              onBlur={() => commitInlineEdit(record, 'name')}
              onPressEnter={() => commitInlineEdit(record, 'name')}
            />
          );
        }
        return (
          <span
            style={{ fontWeight: 500, cursor: 'pointer', display: 'inline-block', minWidth: 40, minHeight: 18 }}
            onClick={() => startInlineEdit(record.id, 'name', name || '')}
          >
            {name || <span style={{ color: 'var(--color-text-4)' }}>点击输入名称</span>}
          </span>
        );
      },
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 90,
      render: (type: string, record: TemplateActivity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'type') {
          return (
            <AutoOpenSelect
              size="small"
              style={{ width: 100 }}
              value={record.type}
              onDismiss={() => setInlineEditing(null)}
              onChange={(v) => {
                setInlineEditing(null);
                updateActivity(record.id, 'type', v);
              }}
            >
              {Object.entries(ACTIVITY_TYPE_MAP).map(([k, v]) => (
                <Select.Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Select.Option>
              ))}
            </AutoOpenSelect>
          );
        }
        const cfg = ACTIVITY_TYPE_MAP[type as keyof typeof ACTIVITY_TYPE_MAP] ?? { label: type, color: 'default' };
        return (
          <Tag
            color={cfg.color}
            style={{ cursor: 'pointer' }}
            onClick={() => setInlineEditing({ id: record.id, field: 'type' })}
          >
            {cfg.label}
          </Tag>
        );
      },
    },
    {
      title: '阶段',
      dataIndex: 'phase',
      width: 80,
      render: (phase: string | null, record: TemplateActivity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'phase') {
          return (
            <AutoOpenSelect
              size="small"
              style={{ width: 90 }}
              value={record.phase || undefined}
              allowClear
              placeholder="阶段"
              onDismiss={() => setInlineEditing(null)}
              onChange={(v) => {
                setInlineEditing(null);
                updateActivity(record.id, 'phase', v || null);
              }}
            >
              {PHASE_OPTIONS.map((p) => (
                <Select.Option key={p} value={p}><Tag color={PHASE_COLOR[p]}>{p}</Tag></Select.Option>
              ))}
            </AutoOpenSelect>
          );
        }
        return (
          <span
            style={{ cursor: 'pointer', display: 'inline-block', minWidth: 20, minHeight: 18 }}
            onClick={() => setInlineEditing({ id: record.id, field: 'phase' })}
          >
            {phase ? <Tag color={PHASE_COLOR[phase] || 'default'}>{phase}</Tag> : <span style={{ color: 'var(--color-text-4)' }}>-</span>}
          </span>
        );
      },
    },
    {
      title: '工期',
      dataIndex: 'planDuration',
      width: 80,
      render: (dur: number | null, record: TemplateActivity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'planDuration') {
          return (
            <InputNumber
              autoFocus
              size="small"
              style={{ width: 70 }}
              min={1}
              precision={0}
              suffix="天"
              value={inlineValue ? parseInt(inlineValue, 10) : undefined}
              onChange={(v) => setInlineValue(v != null ? String(v) : '')}
              onBlur={() => commitNumberEdit(record)}
              onKeyDown={(e) => { if ((e as unknown as React.KeyboardEvent).key === 'Enter') commitNumberEdit(record); }}
            />
          );
        }
        return (
          <span
            style={{ cursor: 'pointer', display: 'inline-block', minWidth: 20, minHeight: 18 }}
            onClick={() => startInlineEdit(record.id, 'planDuration', dur != null ? String(dur) : '')}
          >
            {dur != null ? `${dur}天` : <span style={{ color: 'var(--color-text-4)' }}>-</span>}
          </span>
        );
      },
    },
    {
      title: '前置依赖',
      dataIndex: 'dependencies',
      width: 160,
      render: (deps: TemplateActivity['dependencies'], record: TemplateActivity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'dependencies') {
          return (
            <AutoOpenSelect
              size="small"
              mode="multiple"
              style={{ width: 180 }}
              value={(deps || []).map((d) => d.id)}
              allowClear
              placeholder="选择依赖"
              onDismiss={() => setInlineEditing(null)}
              onChange={(ids: string[]) => {
                setInlineEditing(null);
                const newDeps = ids.map((depId) => {
                  const existing = (deps || []).find((d) => d.id === depId);
                  return existing || { id: depId, type: '0' };
                });
                updateActivity(record.id, 'dependencies', newDeps.length > 0 ? newDeps : null);
              }}
            >
              {activities
                .filter((a) => a.id !== record.id)
                .map((a) => (
                  <Select.Option key={a.id} value={a.id}>
                    {a.name || '(未命名)'}
                  </Select.Option>
                ))}
            </AutoOpenSelect>
          );
        }
        const text = (deps || [])
          .map((d) => {
            const target = activities.find((a) => a.id === d.id);
            return target?.name || '(未命名)';
          })
          .join(', ');
        return (
          <span
            style={{ cursor: 'pointer', display: 'inline-block', minWidth: 20, minHeight: 18, color: text ? undefined : 'var(--color-text-4)' }}
            onClick={() => setInlineEditing({ id: record.id, field: 'dependencies' })}
          >
            {text || '-'}
          </span>
        );
      },
    },
    {
      title: '操作',
      width: 50,
      render: (_: unknown, record: TemplateActivity) => (
        <Tooltip content="删除">
          <Button
            type="text"
            status="danger"
            icon={<IconDelete />}
            size="mini"
            onClick={() => removeActivity(record.id)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <MainLayout>
      <div className="toolbar">
        <div className="toolbar-left">
          共 {templates.length} 个模板
        </div>
        <Button type="primary" icon={<IconPlus />} onClick={() => handleOpen()}>
          新建模板
        </Button>
      </div>

      <Table
        columns={columns}
        data={templates}
        loading={loading}
        rowKey="id"
        pagination={false}
        scroll={{ x: 900 }}
      />

      <Drawer
        width={1200}
        title={editing ? `编辑模板 - ${editing.name}` : '新建模板'}
        visible={drawerVisible}
        onCancel={() => setDrawerVisible(false)}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setDrawerVisible(false)}>取消</Button>
              <Button type="primary" loading={saving} onClick={handleSubmit}>
                {editing ? '保存' : '创建'}
              </Button>
            </Space>
          </div>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="模板名称"
            field="name"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="如：标准路由器项目模板" />
          </Form.Item>

          <Form.Item label="描述" field="description">
            <Input.TextArea placeholder="模板描述（选填）" rows={2} />
          </Form.Item>
        </Form>

        <div style={{ marginTop: 16, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 500 }}>活动列表（{activities.length}）</span>
          <Button type="outline" size="small" icon={<IconPlus />} onClick={addActivity}>
            添加活动
          </Button>
        </div>

        <Table
          columns={activityColumns}
          data={activities}
          rowKey="id"
          pagination={false}
          noDataElement={
            <div style={{ padding: '24px 0', color: 'var(--color-text-3)' }}>
              暂无活动，点击上方"添加活动"开始构建模板
            </div>
          }
          components={{
            body: {
              row: ({ children, record, index, ...rest }: { children: React.ReactNode; record: TemplateActivity; index: number; [key: string]: unknown }) => {
                const isSource = dragFromRef.current === index;
                const isTarget = dragOverRef.current === index && dragOverRef.current !== dragFromRef.current;
                const insertAbove = isTarget && dragFromRef.current > index;
                const insertBelow = isTarget && dragFromRef.current < index;
                const cls = [
                  typeof rest.className === 'string' ? rest.className : '',
                  isSource ? 'drag-source' : '',
                  insertAbove ? 'drag-insert-above' : '',
                  insertBelow ? 'drag-insert-below' : '',
                ].filter(Boolean).join(' ');
                return (
                  <tr
                    {...rest}
                    className={cls}
                    onMouseMove={(e) => handleMouseMove(e, index)}
                    onMouseUp={(e) => handleMouseUp(e, index)}
                  >
                    {children}
                  </tr>
                );
              },
            },
          }}
        />
      </Drawer>
    </MainLayout>
  );
};

export default TemplateManagement;
