import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Drawer,
  Form,
  Input,
  Select,
  Message,
  Tooltip,
  InputNumber,
} from '@arco-design/web-react';
import {
  IconPlus,
  IconEdit,
  IconDelete,
  IconCopy,
} from '@arco-design/web-react/icon';
import { templatesApi } from '../../api';
import { ProjectTemplate, TemplateActivity, ActivityType, Priority } from '../../types';
import { PRODUCT_LINE_MAP, ACTIVITY_TYPE_MAP, PRIORITY_MAP, PHASE_OPTIONS } from '../../utils/constants';
import dayjs from 'dayjs';

let _idCounter = 0;
const genId = (): string =>
  typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${++_idCounter}`;

const TemplateManagement: React.FC = () => {
  const [form] = Form.useForm();
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editing, setEditing] = useState<ProjectTemplate | null>(null);
  const [activities, setActivities] = useState<TemplateActivity[]>([]);
  const [saving, setSaving] = useState(false);

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
      // Load full template with activities
      try {
        const res = await templatesApi.get(tpl.id);
        const full = res.data;
        setEditing(full);
        form.setFieldsValue({
          name: full.name,
          description: full.description || '',
          productLine: full.productLine || undefined,
          phases: full.phases || [],
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
      // Remap parentId and dependency ids
      const idMap = new Map<string, string>();
      (full.activities || []).forEach((orig, i) => {
        idMap.set(orig.id, acts[i].id);
      });
      const remapped = acts.map((a) => ({
        ...a,
        parentId: a.parentId ? idMap.get(a.parentId) || a.parentId : null,
        dependencies: a.dependencies?.map((d: { id: string; type: string; lag?: number }) => ({
          ...d,
          id: idMap.get(d.id) || d.id,
        })) || null,
      }));

      await templatesApi.create({
        name: `${full.name} (副本)`,
        description: full.description || undefined,
        productLine: full.productLine || undefined,
        phases: full.phases || undefined,
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
        productLine: values.productLine || undefined,
        phases: values.phases?.length ? values.phases : undefined,
        activities: activities.map((a, idx) => ({
          id: a.id,
          parentId: a.parentId || null,
          name: a.name,
          type: a.type || 'TASK',
          phase: a.phase || null,
          priority: a.priority || 'MEDIUM',
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
        parentId: null,
        name: '',
        type: 'TASK' as ActivityType,
        phase: null,
        priority: 'MEDIUM' as Priority,
        planDuration: null,
        dependencies: null,
        notes: null,
        sortOrder: prev.length,
      },
    ]);
  };

  const updateActivity = (id: string, field: string, value: unknown) => {
    setActivities((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
  };

  const removeActivity = (id: string) => {
    setActivities((prev) => {
      // Also remove from dependencies and clear parentId references
      return prev
        .filter((a) => a.id !== id)
        .map((a) => ({
          ...a,
          parentId: a.parentId === id ? null : a.parentId,
          dependencies: a.dependencies?.filter((d) => d.id !== id) || null,
        }));
    });
  };

  const moveActivity = (id: string, direction: 'up' | 'down') => {
    setActivities((prev) => {
      const idx = prev.findIndex((a) => a.id === id);
      if (idx < 0) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next.map((a, i) => ({ ...a, sortOrder: i }));
    });
  };

  // Template list columns
  const columns = [
    {
      title: '模板名称',
      dataIndex: 'name',
      width: 200,
      render: (name: string) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    {
      title: '产品线',
      dataIndex: 'productLine',
      width: 120,
      render: (pl?: string) => {
        if (!pl) return '-';
        const cfg = PRODUCT_LINE_MAP[pl as keyof typeof PRODUCT_LINE_MAP];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : pl;
      },
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

  // Activity table columns (inside drawer)
  const activityColumns = [
    {
      title: '序号',
      width: 60,
      render: (_: unknown, __: unknown, idx: number) => idx + 1,
    },
    {
      title: '活动名称',
      dataIndex: 'name',
      width: 200,
      render: (name: string, record: TemplateActivity) => (
        <Input
          size="small"
          value={name}
          placeholder="活动名称"
          onChange={(v) => updateActivity(record.id, 'name', v)}
        />
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 110,
      render: (type: string, record: TemplateActivity) => (
        <Select
          size="small"
          value={type}
          onChange={(v) => updateActivity(record.id, 'type', v)}
        >
          {Object.entries(ACTIVITY_TYPE_MAP).map(([k, v]) => (
            <Select.Option key={k} value={k}>{v.label}</Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: '阶段',
      dataIndex: 'phase',
      width: 100,
      render: (phase: string | null, record: TemplateActivity) => (
        <Select
          size="small"
          value={phase || undefined}
          allowClear
          placeholder="选择"
          onChange={(v) => updateActivity(record.id, 'phase', v || null)}
        >
          {PHASE_OPTIONS.map((p) => (
            <Select.Option key={p} value={p}>{p}</Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 100,
      render: (priority: string, record: TemplateActivity) => (
        <Select
          size="small"
          value={priority}
          onChange={(v) => updateActivity(record.id, 'priority', v)}
        >
          {Object.entries(PRIORITY_MAP).map(([k, v]) => (
            <Select.Option key={k} value={k}>{v.label}</Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: '工期(天)',
      dataIndex: 'planDuration',
      width: 90,
      render: (dur: number | null, record: TemplateActivity) => (
        <InputNumber
          size="small"
          value={dur ?? undefined}
          min={1}
          placeholder="天"
          onChange={(v) => updateActivity(record.id, 'planDuration', v || null)}
        />
      ),
    },
    {
      title: '父活动',
      dataIndex: 'parentId',
      width: 150,
      render: (parentId: string | null, record: TemplateActivity) => (
        <Select
          size="small"
          value={parentId || undefined}
          allowClear
          placeholder="无"
          onChange={(v) => updateActivity(record.id, 'parentId', v || null)}
        >
          {activities
            .filter((a) => a.id !== record.id)
            .map((a) => (
              <Select.Option key={a.id} value={a.id}>
                {a.name || '(未命名)'}
              </Select.Option>
            ))}
        </Select>
      ),
    },
    {
      title: '前置依赖',
      dataIndex: 'dependencies',
      width: 180,
      render: (deps: TemplateActivity['dependencies'], record: TemplateActivity) => (
        <Select
          size="small"
          mode="multiple"
          value={(deps || []).map((d) => d.id)}
          allowClear
          placeholder="选择"
          onChange={(ids: string[]) => {
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
        </Select>
      ),
    },
    {
      title: '操作',
      width: 100,
      render: (_: unknown, record: TemplateActivity, idx: number) => (
        <Space>
          <Tooltip content="上移">
            <Button
              type="text"
              size="mini"
              disabled={idx === 0}
              onClick={() => moveActivity(record.id, 'up')}
            >
              ↑
            </Button>
          </Tooltip>
          <Tooltip content="下移">
            <Button
              type="text"
              size="mini"
              disabled={idx === activities.length - 1}
              onClick={() => moveActivity(record.id, 'down')}
            >
              ↓
            </Button>
          </Tooltip>
          <Tooltip content="删除">
            <Button
              type="text"
              status="danger"
              icon={<IconDelete />}
              size="mini"
              onClick={() => removeActivity(record.id)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <>
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
        width={1100}
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

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label="产品线" field="productLine" style={{ flex: 1 }}>
              <Select placeholder="选择产品线（选填）" allowClear>
                {Object.entries(PRODUCT_LINE_MAP).map(([k, v]) => (
                  <Select.Option key={k} value={k}>{v.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="阶段" field="phases" style={{ flex: 1 }}>
              <Select mode="multiple" placeholder="选择阶段（选填）" allowClear>
                {PHASE_OPTIONS.map((p) => (
                  <Select.Option key={p} value={p}>{p}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>
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
          scroll={{ x: 1200 }}
          size="small"
          noDataElement={
            <div style={{ padding: '24px 0', color: 'var(--color-text-3)' }}>
              暂无活动，点击上方"添加活动"开始构建模板
            </div>
          }
        />
      </Drawer>
    </>
  );
};

export default TemplateManagement;
