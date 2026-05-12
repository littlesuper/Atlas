import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table,
  Button,
  Space,
  Modal,
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
  IconLeft,
} from '@arco-design/web-react/icon';
import MainLayout from '../../layouts/MainLayout';
import { templatesApi, rolesApi } from '../../api';
import { ProjectTemplate, TemplateActivity, ActivityType } from '../../types';
import { ACTIVITY_TYPE_MAP, PHASE_OPTIONS, DEPENDENCY_TYPE_MAP } from '../../utils/constants';
import dayjs from 'dayjs';

const PHASE_COLOR: Record<string, string> = { EVT: 'blue', DVT: 'green', PVT: 'purple', MP: 'orange' };
const LABEL_TO_TYPE = Object.fromEntries(
  Object.entries(DEPENDENCY_TYPE_MAP).map(([k, v]) => [v.label, k])
);

let _idCounter = 0;
const genId = (): string =>
  typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${++_idCounter}`;

export const formatSeq = (n: number): string => String(n).padStart(3, '0');

export function getPredecessorSeqHelper(
  activity: TemplateActivity,
  activitySeqMap: Map<string, number>,
): string {
  if (!activity.dependencies || activity.dependencies.length === 0) return '';
  return activity.dependencies.map((dep) => {
    const seq = activitySeqMap.get(dep.id);
    const seqStr = seq != null ? formatSeq(seq) : '?';
    const typeLabel = DEPENDENCY_TYPE_MAP[dep.type as keyof typeof DEPENDENCY_TYPE_MAP]?.label || 'FS';
    const lag = dep.lag ?? 0;
    const lagStr = lag > 0 ? `+${lag}` : lag < 0 ? String(lag) : '';
    return `${seqStr}${typeLabel}${lagStr}`;
  }).join(', ');
}

export function parsePredecessorTextHelper(
  text: string,
  selfId: string,
  seqToIdMap: Map<number, string>,
): TemplateActivity['dependencies'] {
  if (!text.trim()) return null;
  const parts = text.split(/[,，]\s*/);
  const deps: { id: string; type: string; lag?: number }[] = [];
  for (const part of parts) {
    const m = part.trim().match(/^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\d+)?$/i);
    if (!m) continue;
    const seq = parseInt(m[1], 10);
    const id = seqToIdMap.get(seq);
    if (!id || id === selfId) continue;
    const typeLabel = (m[2] || 'FS').toUpperCase();
    const type = LABEL_TO_TYPE[typeLabel] || '0';
    const lag = m[3] ? parseInt(m[3], 10) : 0;
    deps.push({ id, type, ...(lag !== 0 ? { lag } : {}) });
  }
  return deps.length > 0 ? deps : null;
}

export function remapActivityIds(
  activities: TemplateActivity[],
  idGenerator: () => string = genId,
): { activities: TemplateActivity[]; idMap: Map<string, string> } {
  const newActs = activities.map((a) => ({ ...a, id: idGenerator() }));
  const idMap = new Map<string, string>();
  activities.forEach((orig, i) => idMap.set(orig.id, newActs[i].id));
  const remapped = newActs.map((a) => ({
    ...a,
    dependencies: a.dependencies?.map((d: { id: string; type: string; lag?: number }) => ({
      ...d,
      id: idMap.get(d.id) || d.id,
    })) || null,
  }));
  return { activities: remapped, idMap };
}

const TemplateManagement: React.FC = () => {
  const [form] = Form.useForm();
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [editing, setEditing] = useState<ProjectTemplate | null>(null);
  const [activities, setActivities] = useState<TemplateActivity[]>([]);
  const [saving, setSaving] = useState(false);
  const [roleOptions, setRoleOptions] = useState<Array<{ id: string; name: string }>>([]);

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
    rolesApi.list().then((res) => {
      setRoleOptions(res.data);
    }).catch(() => {});
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
    setMode('edit');
  };

  const handleBack = () => {
    setMode('list');
    setEditing(null);
    form.resetFields();
    setActivities([]);
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
      const { activities: remapped } = remapActivityIds(full.activities || []);

      await templatesApi.create({
        name: `${full.name} (副本)`,
        description: full.description || undefined,
        activities: remapped,
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
          roleId: a.roleId || null,
          sortOrder: a.sortOrder ?? idx,
        })),
      };

      if (editing) {
        await templatesApi.update(editing.id, data);
        Message.success('模板更新成功');
      } else {
        await templatesApi.create(data);
        Message.success('模板创建成功');
      }

      setMode('list');
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
        roleId: null,
        sortOrder: prev.length,
      },
    ]);
  };

  const insertActivity = React.useCallback((atIndex: number) => {
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
        roleId: null,
        sortOrder: atIndex,
      };
      const next = [...prev];
      next.splice(atIndex, 0, newAct);
      return next.map((a, i) => ({ ...a, sortOrder: i }));
    });
  }, [editing?.id]);

  const updateActivity = React.useCallback((id: string, field: string, value: unknown) => {
    setActivities((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
  }, []);

  const removeActivity = React.useCallback((id: string) => {
    setActivities((prev) => {
      return prev
        .filter((a) => a.id !== id)
        .map((a) => ({
          ...a,
          dependencies: a.dependencies?.filter((d) => d.id !== id) || null,
        }));
    });
  }, []);

  // ---- 前置依赖：MS Project 格式 ----

  const activitySeqMap = React.useMemo(() => {
    const m = new Map<string, number>();
    activities.forEach((a, i) => m.set(a.id, i + 1));
    return m;
  }, [activities]);

  const seqToIdMap = React.useMemo(() => {
    const m = new Map<number, string>();
    activities.forEach((a, i) => m.set(i + 1, a.id));
    return m;
  }, [activities]);

  const getSeq = React.useCallback((record: TemplateActivity): string => {
    const idx = activitySeqMap.get(record.id);
    return idx != null ? formatSeq(idx) : '?';
  }, [activitySeqMap]);

  const getPredecessorSeq = React.useCallback((activity: TemplateActivity): string => {
    return getPredecessorSeqHelper(activity, activitySeqMap);
  }, [activitySeqMap]);

  const parsePredecessorText = React.useCallback((text: string, selfId: string): TemplateActivity['dependencies'] => {
    return parsePredecessorTextHelper(text, selfId, seqToIdMap);
  }, [seqToIdMap]);

  // ---- 拖拽排序 ----

  const handleMouseDown = React.useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    dragIndexRef.current = index;
  }, []);

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
      render: (name: string, record: ProjectTemplate) => (
        <span
          style={{ fontWeight: 500, color: 'var(--color-text-1)', cursor: 'pointer' }}
          onClick={() => handleOpen(record)}
        >
          {name}
        </span>
      ),
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

  const activityColumns = React.useMemo(() => [
    {
      title: '',
      width: 44,
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
      title: 'ID',
      width: 66,
      render: (_: unknown, record: TemplateActivity) => (
        <span style={{ fontFamily: 'monospace', color: 'var(--color-text-3)' }}>{getSeq(record)}</span>
      ),
    },
    {
      title: '活动名称',
      dataIndex: 'name',
      width: 220,
      render: (_: string, record: TemplateActivity) => (
        <Input
          key={record.id + '-name'}
          defaultValue={record.name}
          placeholder="活动名称"
          style={{ background: 'var(--color-fill-1)', borderColor: 'var(--color-border-2)' }}
          onBlur={(e) => {
            const v = (e.target as HTMLInputElement).value;
            if (v !== record.name) updateActivity(record.id, 'name', v);
          }}
        />
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 100,
      render: (_: string, record: TemplateActivity) => (
        <Select
          value={record.type}
          style={{ background: 'var(--color-fill-1)', borderColor: 'var(--color-border-2)' }}
          onChange={(v) => updateActivity(record.id, 'type', v)}
        >
          {Object.entries(ACTIVITY_TYPE_MAP).map(([k, v]) => (
            <Select.Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: '阶段',
      dataIndex: 'phase',
      width: 110,
      render: (_: string | null, record: TemplateActivity) => (
        <Select
          value={record.phase || undefined}
          allowClear
          placeholder="阶段"
          style={{ background: 'var(--color-fill-1)', borderColor: 'var(--color-border-2)' }}
          onChange={(v) => updateActivity(record.id, 'phase', v || null)}
        >
          {PHASE_OPTIONS.map((p) => (
            <Select.Option key={p} value={p}><Tag color={PHASE_COLOR[p]}>{p}</Tag></Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: '角色',
      dataIndex: 'roleId',
      width: 120,
      render: (_: string | null, record: TemplateActivity) => (
        <Select
          key={record.id + '-role'}
          value={record.roleId || undefined}
          allowClear
          placeholder="角色"
          style={{ background: 'var(--color-fill-1)', borderColor: 'var(--color-border-2)' }}
          onChange={(v) => updateActivity(record.id, 'roleId', v || null)}
          showSearch
          filterOption={(input, option) =>
            (option?.props?.children as string)?.toLowerCase().includes(input.toLowerCase())
          }
        >
          {roleOptions.map(r => (
            <Select.Option key={r.id} value={r.id}>{r.name}</Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: '工期',
      dataIndex: 'planDuration',
      width: 100,
      render: (_: number | null, record: TemplateActivity) => (
        <InputNumber
          key={record.id + '-dur'}
          style={{ width: '100%', background: 'var(--color-fill-1)', borderColor: 'var(--color-border-2)' }}
          min={1}
          precision={0}
          suffix="天"
          defaultValue={record.planDuration ?? undefined}
          onBlur={(v) => updateActivity(record.id, 'planDuration', v != null && Number(v) > 0 ? Number(v) : null)}
        />
      ),
    },
    {
      title: '前置',
      dataIndex: 'dependencies',
      width: 150,
      render: (_: TemplateActivity['dependencies'], record: TemplateActivity) => (
        <Input
          key={record.id + '-deps'}
          defaultValue={getPredecessorSeq(record)}
          placeholder="如: 3FS+2, 5"
          style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--color-fill-1)', borderColor: 'var(--color-border-2)' }}
          onBlur={(e) => {
            const v = (e.target as HTMLInputElement).value;
            updateActivity(record.id, 'dependencies', parsePredecessorText(v, record.id));
          }}
        />
      ),
    },
    {
      title: '操作',
      width: 64,
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
  ], [updateActivity, removeActivity, insertActivity, handleMouseDown, roleOptions, getSeq, getPredecessorSeq, parsePredecessorText]);

  if (mode === 'edit') {
    return (
      <MainLayout>
        <div className="toolbar">
          <div className="toolbar-left" style={{ display: 'flex', alignItems: 'center' }}>
            <Button type="text" icon={<IconLeft />} onClick={handleBack} style={{ marginRight: 8, color: 'var(--color-text-2)' }}>
              返回
            </Button>
            <span style={{ fontWeight: 500, fontSize: 15, color: 'var(--color-text-1)' }}>
              {editing ? `编辑模板 - ${editing.name}` : '新建模板'}
            </span>
          </div>
          <Button type="primary" loading={saving} onClick={handleSubmit}>
            {editing ? '保存' : '创建'}
          </Button>
        </div>

        <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item
            label="模板名称"
            field="name"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="如：标准路由器项目模板" style={{ width: 280, background: 'var(--color-fill-1)', borderColor: 'var(--color-border-2)' }} />
          </Form.Item>

          <Form.Item label="描述" field="description">
            <Input placeholder="模板描述（选填）" style={{ width: 360, background: 'var(--color-fill-1)', borderColor: 'var(--color-border-2)' }} />
          </Form.Item>
        </Form>

        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--color-text-2)' }}>活动列表（{activities.length}）</span>
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
              row: ({ children, record: _record, index, ...rest }: { children: React.ReactNode; record: TemplateActivity; index: number; [key: string]: unknown }) => {
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
      </MainLayout>
    );
  }

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
      />
    </MainLayout>
  );
};

export default TemplateManagement;
