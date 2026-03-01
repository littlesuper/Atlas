import React, { useState, useRef, useCallback } from 'react';
import {
  Drawer,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Tag,
  Space,
  InputNumber,
  Message,
} from '@arco-design/web-react';
import {
  IconPlus,
  IconDelete,
  IconUpload,
} from '@arco-design/web-react/icon';
import { Activity, User } from '../../../types';
import {
  PRIORITY_MAP,
  ACTIVITY_STATUS_MAP,
  ACTIVITY_TYPE_MAP,
  DEPENDENCY_TYPE_MAP,
  PHASE_OPTIONS,
} from '../../../utils/constants';
import { calcWorkdays, addWorkdays, subtractWorkdays } from '../../../utils/workday';
import ActivityComments from './ActivityComments';
import dayjs from 'dayjs';

const PHASE_COLOR: Record<string, string> = { EVT: 'blue', DVT: 'cyan', PVT: 'purple', MP: 'orange' };

// 三方联动辅助
type DateTriple = { start: dayjs.Dayjs | null; end: dayjs.Dayjs | null; dur: number | null };
function resolveTriple(t: DateTriple, changed: 'start' | 'end' | 'dur'): DateTriple {
  const { start, end, dur } = t;
  if (changed === 'start') {
    if (start && end) return { start, end, dur: calcWorkdays(start, end) };
    if (start && dur && dur > 0) return { start, end: addWorkdays(start, dur), dur };
  } else if (changed === 'end') {
    if (start && end) return { start, end, dur: calcWorkdays(start, end) };
    if (end && dur && dur > 0) return { start: subtractWorkdays(end, dur), end, dur };
  } else {
    if (start && dur && dur > 0) return { start, end: addWorkdays(start, dur), dur };
    if (end && dur && dur > 0) return { start: subtractWorkdays(end, dur), end, dur };
  }
  return t;
}

interface ActivityDrawerProps {
  visible: boolean;
  onClose: () => void;
  editingActivity: Activity | null;
  activities: Activity[];
  users: User[];
  activitySeqMap: Map<string, number>;
  onSubmit: (values: any, planDuration: number | null, actualDuration: number | null, formDeps: { id: string; type: string; lag: number }[]) => Promise<void>;
  onImportFile: (file: File) => void;
}

const ActivityDrawer: React.FC<ActivityDrawerProps> = ({
  visible,
  onClose,
  editingActivity,
  activities,
  users,
  activitySeqMap,
  onSubmit,
  onImportFile,
}) => {
  const [form] = Form.useForm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [planDuration, setPlanDuration] = useState<number | null>(null);
  const [actualDuration, setActualDuration] = useState<number | null>(null);
  const [formDeps, setFormDeps] = useState<Array<{ id: string; type: string; lag: number }>>([]);

  // 用活动数据填充表单
  const populateFormFromActivity = useCallback((activity: Activity) => {
    const pd = activity.planStartDate && activity.planEndDate
      ? calcWorkdays(dayjs(activity.planStartDate), dayjs(activity.planEndDate))
      : activity.planDuration ?? null;
    const ad = activity.startDate && activity.endDate
      ? calcWorkdays(dayjs(activity.startDate), dayjs(activity.endDate))
      : activity.duration ?? null;
    setPlanDuration(pd);
    setActualDuration(ad);
    form.setFieldsValue({
      phase: activity.phase,
      name: activity.name,
      description: activity.description,
      type: activity.type,
      status: activity.status,
      priority: activity.priority,
      planStart: activity.planStartDate ? dayjs(activity.planStartDate) : undefined,
      planEnd: activity.planEndDate ? dayjs(activity.planEndDate) : undefined,
      actualStart: activity.startDate ? dayjs(activity.startDate) : undefined,
      actualEnd: activity.endDate ? dayjs(activity.endDate) : undefined,
      assigneeIds: activity.assignees?.map((a) => a.id) ?? [],
      notes: activity.notes,
    });
    const rawDeps = activity.dependencies;
    const deps = Array.isArray(rawDeps)
      ? rawDeps
      : (() => { try { return JSON.parse(rawDeps as unknown as string) as typeof rawDeps; } catch { return []; } })();
    setFormDeps((deps || []).map((d) => ({ id: d.id, type: d.type, lag: d.lag ?? 0 })));
  }, [form]);

  // 当编辑活动变更时重新填充表单
  React.useEffect(() => {
    if (visible) {
      if (editingActivity) {
        populateFormFromActivity(editingActivity);
      } else {
        setPlanDuration(null);
        setActualDuration(null);
        setFormDeps([]);
        form.resetFields();
      }
    }
  }, [visible, editingActivity]);

  // 三方联动：计划时间
  const handlePlanChange = (changed: 'start' | 'end' | 'dur', value: dayjs.Dayjs | number | null) => {
    if (formDeps.some((d) => d.id)) {
      if (changed === 'dur') setPlanDuration(value as number | null);
      return;
    }
    let start = form.getFieldValue('planStart') as dayjs.Dayjs | null ?? null;
    let end = form.getFieldValue('planEnd') as dayjs.Dayjs | null ?? null;
    let dur = planDuration;
    if (changed === 'start') start = value as dayjs.Dayjs | null;
    else if (changed === 'end') end = value as dayjs.Dayjs | null;
    else dur = value as number | null;
    if (changed !== 'dur' && start && end && end.isBefore(start, 'day')) {
      Message.error('结束时间不能早于开始时间');
      return;
    }
    const result = resolveTriple({ start, end, dur }, changed);
    form.setFieldsValue({ planStart: result.start ?? undefined, planEnd: result.end ?? undefined });
    setPlanDuration(result.dur);
  };

  // 三方联动：实际时间
  const handleActualChange = (changed: 'start' | 'end' | 'dur', value: dayjs.Dayjs | number | null) => {
    let start = form.getFieldValue('actualStart') as dayjs.Dayjs | null ?? null;
    let end = form.getFieldValue('actualEnd') as dayjs.Dayjs | null ?? null;
    let dur = actualDuration;
    if (changed === 'start') start = value as dayjs.Dayjs | null;
    else if (changed === 'end') end = value as dayjs.Dayjs | null;
    else dur = value as number | null;
    if (changed !== 'dur' && start && end && end.isBefore(start, 'day')) {
      Message.error('结束时间不能早于开始时间');
      return;
    }
    const result = resolveTriple({ start, end, dur }, changed);
    form.setFieldsValue({ actualStart: result.start ?? undefined, actualEnd: result.end ?? undefined });
    setActualDuration(result.dur);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      await onSubmit(values, planDuration, actualDuration, formDeps);
    } catch (e) {
      console.error('提交失败', e);
    }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    onImportFile(file);
  };

  return (
    <Drawer
      width={700}
      title={editingActivity ? '编辑活动' : '新建活动'}
      visible={visible}
      onCancel={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {!editingActivity && (
              <>
                <Button icon={<IconUpload />} onClick={() => fileInputRef.current?.click()}>
                  批量导入
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={handleImportExcel}
                />
              </>
            )}
          </div>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" onClick={handleSubmit}>
              {editingActivity ? '保存' : '创建'}
            </Button>
          </Space>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ type: 'TASK', status: 'NOT_STARTED', priority: 'MEDIUM' }}
      >
        {/* 第一行：阶段 + 活动名称 */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
          <Form.Item label="阶段" field="phase" rules={[{ required: true, message: '请选择阶段' }]}>
            <Select placeholder="请选择">
              {PHASE_OPTIONS.map((p) => (
                <Select.Option key={p} value={p}>
                  <Tag color={PHASE_COLOR[p]}>{p}</Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="活动名称" field="name" rules={[{ required: true, message: '请输入活动名称' }]}>
            <Input placeholder="请输入活动名称" />
          </Form.Item>
        </div>

        {/* 描述 */}
        <Form.Item label="描述" field="description">
          <Input.TextArea placeholder="请输入描述" rows={3} maxLength={500} showWordLimit />
        </Form.Item>

        {/* 类型 / 状态 / 优先级 / 负责人 */}
        <div style={{ display: 'grid', gridTemplateColumns: '100px 100px 100px 1fr', gap: 12 }}>
          <Form.Item label="类型" field="type" rules={[{ required: true }]}>
            <Select placeholder="类型">
              {Object.entries(ACTIVITY_TYPE_MAP).map(([k, v]) => (
                <Select.Option key={k} value={k}>
                  <Tag color={v.color}>{v.label}</Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="状态" field="status">
            <Select placeholder="状态">
              {Object.entries(ACTIVITY_STATUS_MAP).map(([k, v]) => (
                <Select.Option key={k} value={k}>
                  <Tag color={v.color}>{v.label}</Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="优先级" field="priority" rules={[{ required: true }]}>
            <Select placeholder="优先级">
              {Object.entries(PRIORITY_MAP).map(([k, v]) => (
                <Select.Option key={k} value={k}>
                  <Tag color={v.color}>{v.label}</Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="负责人" field="assigneeIds">
            <Select mode="multiple" placeholder="请选择负责人" allowClear showSearch filterOption={(input, option) =>
              (option?.props?.children as string)?.toLowerCase().includes(input.toLowerCase())
            }>
              {users.map((u) => (
                <Select.Option key={u.id} value={u.id}>
                  {u.realName}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </div>

        {/* 分隔线 */}
        <div style={{ borderTop: '1px solid var(--color-border-2)', margin: '4px 0 16px' }} />

        {/* 前置依赖 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-2)' }}>前置依赖</span>
            <Button
              type="text"
              size="small"
              icon={<IconPlus />}
              onClick={() => setFormDeps([...formDeps, { id: '', type: '0', lag: 0 }])}
            >
              添加
            </Button>
          </div>
          {formDeps.length === 0 ? (
            <div style={{ color: 'var(--color-text-4)', fontSize: 13, padding: '4px 0' }}>无前置依赖</div>
          ) : (
            formDeps.map((dep, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <Select
                  placeholder="选择活动"
                  showSearch
                  allowClear
                  value={dep.id || undefined}
                  onChange={(v) => {
                    const next = [...formDeps];
                    next[idx] = { ...next[idx], id: v || '' };
                    setFormDeps(next);
                  }}
                  filterOption={(input, option) =>
                    (option?.props?.children as string)?.toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {activities
                    .filter((a) =>
                      (editingActivity ? a.id !== editingActivity.id : true) &&
                      !formDeps.some((d, di) => di !== idx && d.id === a.id)
                    )
                    .map((a) => (
                      <Select.Option key={a.id} value={a.id}>
                        {String(activitySeqMap.get(a.id) || 0)} - {a.name}
                      </Select.Option>
                    ))}
                </Select>
                <Select
                  value={dep.type}
                  onChange={(v) => {
                    const next = [...formDeps];
                    next[idx] = { ...next[idx], type: v };
                    setFormDeps(next);
                  }}
                >
                  {Object.entries(DEPENDENCY_TYPE_MAP).map(([k, v]) => (
                    <Select.Option key={k} value={k}>{v.fullLabel}</Select.Option>
                  ))}
                </Select>
                <InputNumber
                  value={dep.lag}
                  onChange={(v) => {
                    const next = [...formDeps];
                    next[idx] = { ...next[idx], lag: v ?? 0 };
                    setFormDeps(next);
                  }}
                  suffix="天"
                  placeholder="延迟"
                  style={{ width: '100%' }}
                />
                <Button
                  type="text"
                  status="danger"
                  icon={<IconDelete />}
                  size="small"
                  onClick={() => setFormDeps(formDeps.filter((_, i) => i !== idx))}
                />
              </div>
            ))
          )}
        </div>

        {formDeps.some((d) => d.id) && (
          <div style={{ background: 'var(--color-primary-light-1)', border: '1px solid var(--info-border)', borderRadius: 4, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--info-color)' }}>
            已设置前置依赖，计划开始/结束日期将由系统根据依赖关系自动计算。可设置工期辅助推算。
          </div>
        )}

        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-2)', marginBottom: 8, display: 'block' }}>时间</span>
        {/* 计划时间 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12 }}>
          <Form.Item label="计划开始" field="planStart">
            <DatePicker
              style={{ width: '100%' }}
              placeholder="开始日期"
              disabled={formDeps.some((d) => d.id)}
              onChange={(_s, d) => handlePlanChange('start', d ? dayjs(d as unknown as string) : null)}
            />
          </Form.Item>
          <Form.Item label="计划结束" field="planEnd">
            <DatePicker
              style={{ width: '100%' }}
              placeholder="结束日期"
              disabled={formDeps.some((d) => d.id)}
              onChange={(_s, d) => handlePlanChange('end', d ? dayjs(d as unknown as string) : null)}
            />
          </Form.Item>
          <Form.Item label="计划工期(天)">
            <InputNumber
              min={1}
              value={planDuration ?? undefined}
              onChange={(v) => handlePlanChange('dur', v ?? null)}
              placeholder="计划工期"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </div>

        {/* 实际时间 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12 }}>
          <Form.Item label="实际开始" field="actualStart">
            <DatePicker
              style={{ width: '100%' }}
              placeholder="开始日期"
              onChange={(_s, d) => handleActualChange('start', d ? dayjs(d as unknown as string) : null)}
            />
          </Form.Item>
          <Form.Item label="实际结束" field="actualEnd">
            <DatePicker
              style={{ width: '100%' }}
              placeholder="结束日期"
              onChange={(_s, d) => handleActualChange('end', d ? dayjs(d as unknown as string) : null)}
            />
          </Form.Item>
          <Form.Item label="实际工期(天)">
            <InputNumber
              min={1}
              value={actualDuration ?? undefined}
              onChange={(v) => handleActualChange('dur', v ?? null)}
              placeholder="实际工期"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </div>

        {/* 备注 */}
        <Form.Item label="备注" field="notes">
          <Input.TextArea placeholder="请输入备注" rows={3} maxLength={500} showWordLimit />
        </Form.Item>
      </Form>

      {/* 评论 & 变更历史 */}
      {editingActivity && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--color-border-2)', paddingTop: 16 }}>
          <ActivityComments activityId={editingActivity.id} />
        </div>
      )}
    </Drawer>
  );
};

export default ActivityDrawer;
