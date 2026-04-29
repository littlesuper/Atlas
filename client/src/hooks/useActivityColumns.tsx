import React, { useMemo, useCallback } from 'react';
import {
  Input,
  Select,
  Tag,
  Tooltip,
  Space,
  InputNumber,
  Message,
} from '@arco-design/web-react';
import {
  IconEdit,
  IconDelete,
  IconDragDotVertical,
  IconPlus,
} from '@arco-design/web-react/icon';
import { Activity, User, ProjectMember } from '../types';
import {
  ACTIVITY_STATUS_MAP,
  ACTIVITY_TYPE_MAP,
  DEPENDENCY_TYPE_MAP,
  PHASE_OPTIONS,
  PROJECT_MEMBER_ROLE_MAP,
  PROJECT_MEMBER_ROLE_KEYS,
} from '../utils/constants';
import { calcWorkdays, addWorkdays } from '../utils/workday';
import dayjs from 'dayjs';
import { activitiesApi } from '../api';

// 自动展开的 Select 包装
const AutoOpenSelect: React.FC<React.ComponentProps<typeof Select> & { onDismiss: () => void }> = ({ onDismiss, children, ...props }) => {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [popupVisible, setPopupVisible] = React.useState(true);
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
      <Select {...props} popupVisible={popupVisible} onVisibleChange={setPopupVisible}>{children}</Select>
    </div>
  );
};

// 自动展开的 DatePicker 包装
import { DatePicker } from '@arco-design/web-react';

const AutoOpenDatePicker: React.FC<React.ComponentProps<typeof DatePicker> & { onDismiss: () => void }> = ({ onDismiss, ...props }) => {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const input = wrapRef.current?.querySelector('input') as HTMLElement;
      if (input) { input.focus(); input.click(); }
    }, 50);
    return () => clearTimeout(timer);
  }, []);
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!document.contains(target)) return;
      if (wrapRef.current?.contains(target)) return;
      if (target.closest('.arco-picker-container, .arco-picker-range-container, .arco-trigger')) return;
      onDismiss();
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onDismiss]);
  return (
    <div ref={wrapRef} style={{ display: 'inline-block' }}>
      <DatePicker {...props} />
    </div>
  );
};

// 自动展开的 RangePicker 包装
const AutoOpenRangePicker: React.FC<React.ComponentProps<typeof DatePicker.RangePicker> & { onDismiss: () => void }> = ({ onDismiss, ...props }) => {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const input = wrapRef.current?.querySelector('input') as HTMLElement;
      if (input) { input.focus(); input.click(); }
    }, 50);
    return () => clearTimeout(timer);
  }, []);
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!document.contains(target)) return;
      if (wrapRef.current?.contains(target)) return;
      if (target.closest('.arco-picker-container, .arco-picker-range-container, .arco-trigger')) return;
      onDismiss();
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onDismiss]);
  return (
    <div ref={wrapRef} style={{ display: 'inline-block' }}>
      <DatePicker.RangePicker {...props} />
    </div>
  );
};

// 内联文本编辑：使用本地状态承载输入，避免父级 re-render 引起的光标跳动（IME 组词时尤为明显）
interface InlineTextEditorProps {
  initialValue: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  placeholder?: string;
  style?: React.CSSProperties;
}
const InlineTextEditor: React.FC<InlineTextEditorProps> = ({ initialValue, onChange, onCommit, placeholder, style }) => {
  const [value, setValue] = React.useState(initialValue);
  return (
    <Input
      autoFocus
      size="small"
      value={value}
      placeholder={placeholder}
      style={style}
      onChange={(v) => { setValue(v); onChange(v); }}
      onBlur={onCommit}
      onPressEnter={onCommit}
    />
  );
};

// 阶段颜色配置
const PHASE_COLOR: Record<string, string> = { EVT: 'blue', DVT: 'green', PVT: 'purple', MP: 'orange' };

// 格式化3位序号
function formatSeq(n: number): string {
  return String(n).padStart(3, '0');
}

const dateFmt = (d?: string | null) => d ? dayjs(d).format('YY年MM月DD日') : '-';

export { AutoOpenSelect, AutoOpenDatePicker, AutoOpenRangePicker, PHASE_COLOR, formatSeq, dateFmt };

interface UseActivityColumnsOptions {
  activities: Activity[];
  users: User[];
  project: { managerId: string; id: string; manager?: { id: string; realName?: string; username?: string }; members?: ProjectMember[] } | null;
  isArchived: boolean;
  canManage: boolean;
  canCreate: boolean;
  criticalActivityIds: string[];
  // inline edit
  inlineEditing: { id: string; field: string } | null;
  setInlineEditing: (v: { id: string; field: string } | null) => void;
  inlineValue: string;
  setInlineValue: (v: string) => void;
  startInlineEdit: (id: string, field: string, value: string) => void;
  showUndoMessage: (id: string, rollback: Record<string, unknown>, name?: string) => void;
  commitInlineEdit: (activity: Activity, field: string) => void;
  commitSelectEdit: (activity: Activity, field: string, value: string) => void;
  // actions
  handleOpenDrawer: (activity: Activity) => void;
  handleDeleteActivity: (activity: Activity) => void;
  handleInsertActivity: (atIndex: number) => void;
  handleMouseDown: (e: React.MouseEvent, index: number) => void;
  // data helpers
  loadActivities: () => Promise<void>;
  // column prefs
  columnPrefsVisible: string[];
  columnPrefsOrder: string[];
  columnWidths: Record<string, number>;
  // selection
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
}

// 列宽映射
export const COLUMN_WIDTH_MAP: Record<string, number> = {
  id: 60,
  predecessor: 100,
  phase: 80,
  name: 240,
  type: 80,
  status: 100,
  assignee: 120,
  planDuration: 70,
  planDates: 230,
  actualDates: 260,
  checkItems: 100,
  notes: 300,
};

export function useActivityColumns(opts: UseActivityColumnsOptions) {
  const {
    activities, users, project, isArchived,
    canManage, canCreate, criticalActivityIds,
    inlineEditing, setInlineEditing, inlineValue, setInlineValue,
    startInlineEdit, showUndoMessage, commitInlineEdit, commitSelectEdit,
    handleOpenDrawer, handleDeleteActivity, handleInsertActivity, handleMouseDown,
    loadActivities,
    columnPrefsVisible, columnPrefsOrder, columnWidths,
    selectedIds, setSelectedIds,
  } = opts;

  // 活动 ID → 序号映射
  const activitySeqMap = useMemo(() => {
    const map = new Map<string, number>();
    activities.forEach((a, i) => map.set(a.id, i + 1));
    return map;
  }, [activities]);

  // 项目成员按角色分组：负责人下拉的选项数据来源
  const assigneeRoleOptions = useMemo(() => {
    const byRole = new Map<string, { userId: string; name: string }[]>();
    const pushUser = (role: string, userId: string, name: string) => {
      if (!byRole.has(role)) byRole.set(role, []);
      const list = byRole.get(role)!;
      if (!list.some((u) => u.userId === userId)) list.push({ userId, name });
    };

    if (project?.manager) {
      const m = project.manager;
      pushUser('PROJECT_MANAGER', m.id, m.realName || m.username || m.id.slice(0, 6));
    } else if (project?.managerId) {
      const u = users.find((x) => x.id === project.managerId);
      if (u) pushUser('PROJECT_MANAGER', u.id, u.realName || u.username || u.id.slice(0, 6));
    }

    project?.members?.forEach((m) => {
      const role = m.role || 'COLLABORATOR';
      const userId = m.user.id;
      const name = m.user.realName || m.user.username || userId.slice(0, 6);
      pushUser(role, userId, name);
    });

    const orderedKeys: string[] = ['PROJECT_MANAGER', ...PROJECT_MEMBER_ROLE_KEYS];
    return orderedKeys
      .filter((k) => byRole.has(k))
      .map((k) => {
        const meta =
          k === 'PROJECT_MANAGER'
            ? { label: '项目经理', color: 'red' as const }
            : PROJECT_MEMBER_ROLE_MAP[k as keyof typeof PROJECT_MEMBER_ROLE_MAP];
        return {
          key: k,
          label: meta.label,
          color: meta.color as string,
          users: byRole.get(k)!,
        };
      });
  }, [project?.manager, project?.managerId, project?.members, users]);

  const getSeq = useCallback((activity: Activity): string => {
    return formatSeq(activitySeqMap.get(activity.id) || 0);
  }, [activitySeqMap]);

  // 获取前置任务序号显示
  const getPredecessorSeq = useCallback((activity: Activity): string => {
    if (!activity.dependencies) return '';
    const rawDeps = activity.dependencies;
    const deps = Array.isArray(rawDeps)
      ? rawDeps
      : (() => { try { return JSON.parse(rawDeps as unknown as string) as typeof rawDeps; } catch { return []; } })();
    if (!deps || deps.length === 0) return '';
    return deps.map((dep) => {
      const idx = activitySeqMap.get(dep.id);
      const seq = idx ? String(idx) : '?';
      const typeLabel = DEPENDENCY_TYPE_MAP[dep.type as keyof typeof DEPENDENCY_TYPE_MAP]?.label || 'FS';
      const lag = dep.lag ?? 0;
      const lagStr = lag > 0 ? `+${lag}` : lag < 0 ? String(lag) : '';
      return `${seq}${typeLabel}${lagStr}`;
    }).join(', ');
  }, [activitySeqMap]);

  // 解析前置依赖文本
  const TYPE_LABEL_TO_CODE: Record<string, string> = { FS: '0', SS: '1', FF: '2', SF: '3' };
  const parsePredecessorText = useCallback((text: string, selfId: string): { id: string; type: string; lag: number }[] | null => {
    const trimmed = text.trim();
    if (!trimmed) return [];
    const seqToId = new Map<number, string>();
    activities.forEach((a, i) => seqToId.set(i + 1, a.id));
    const parts = trimmed.split(/[,，;；\s]+/).filter(Boolean);
    const result: { id: string; type: string; lag: number }[] = [];
    for (const part of parts) {
      const m = part.match(/^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\d+)?$/i);
      if (!m) return null;
      const seq = parseInt(m[1], 10);
      const typeLabel = (m[2] || 'FS').toUpperCase();
      const lag = m[3] ? parseInt(m[3], 10) : 0;
      const targetId = seqToId.get(seq);
      if (!targetId || targetId === selfId) return null;
      result.push({ id: targetId, type: TYPE_LABEL_TO_CODE[typeLabel] || '0', lag });
    }
    return result;
  }, [activities]);

  // 提交计划工期内联编辑
  const commitPlanDurationEdit = useCallback(async (activity: Activity) => {
    setInlineEditing(null);
    const newDur = parseInt(inlineValue, 10);
    if (!newDur || newDur <= 0) return;
    const oldDur = activity.planStartDate && activity.planEndDate
      ? calcWorkdays(dayjs(activity.planStartDate), dayjs(activity.planEndDate))
      : activity.planDuration;
    if (newDur === oldDur) return;
    const payload: Record<string, unknown> = { planDuration: newDur };
    if (activity.planStartDate) {
      const endDate = addWorkdays(dayjs(activity.planStartDate), newDur);
      payload.planEndDate = endDate.format('YYYY-MM-DD');
    }
    const rollback: Record<string, unknown> = { planDuration: oldDur };
    if (activity.planEndDate) {
      rollback.planEndDate = dayjs(activity.planEndDate).format('YYYY-MM-DD');
    }
    try {
      await activitiesApi.update(activity.id, payload);
      loadActivities();
      showUndoMessage(activity.id, rollback, activity.name);
    } catch {
      Message.error('更新失败');
    }
  }, [inlineValue, setInlineEditing, showUndoMessage, loadActivities]);

  // 提交前置依赖内联编辑
  const commitPredecessorEdit = useCallback(async (activity: Activity) => {
    setInlineEditing(null);
    const oldText = getPredecessorSeq(activity);
    if (inlineValue.trim() === oldText.trim()) return;
    const deps = parsePredecessorText(inlineValue, activity.id);
    if (deps === null) {
      Message.error('格式错误，示例: 3FS+2, 5');
      return;
    }
    const oldDeps = Array.isArray(activity.dependencies)
      ? activity.dependencies.map((d) => ({ id: d.id, type: d.type, lag: d.lag ?? 0 }))
      : null;
    try {
      await activitiesApi.update(activity.id, { dependencies: deps.length > 0 ? deps : null });
      loadActivities();
      showUndoMessage(activity.id, { dependencies: oldDeps }, activity.name);
    } catch {
      Message.error('更新失败');
    }
  }, [inlineValue, setInlineEditing, getPredecessorSeq, parsePredecessorText, showUndoMessage, loadActivities]);

  // 前置依赖 Tooltip 内容
  const getPredecessorTooltip = useCallback((activity: Activity): React.ReactNode => {
    if (!activity.dependencies) return null;
    const rawDeps = activity.dependencies;
    const deps = Array.isArray(rawDeps)
      ? rawDeps
      : (() => { try { return JSON.parse(rawDeps as unknown as string) as typeof rawDeps; } catch { return []; } })();
    if (!deps || deps.length === 0) return null;
    return (
      <div style={{ fontSize: 12 }}>
        {deps.map((dep, i) => {
          const predActivity = activities.find(a => a.id === dep.id);
          const seq = activitySeqMap.get(dep.id);
          const seqStr = seq ? formatSeq(seq) : '?';
          const depTypeMap: Record<string, { label: string; fullLabel: string }> = DEPENDENCY_TYPE_MAP;
          const typeInfo = depTypeMap[dep.type];
          const typeLabel = typeInfo?.fullLabel || typeInfo?.label || 'FS';
          const lag = dep.lag ?? 0;
          const lagStr = lag !== 0 ? ` (${lag > 0 ? '+' : ''}${lag}天)` : '';
          return (
            <div key={i}>
              {seqStr} {predActivity?.name || '未知活动'} — {typeLabel}{lagStr}
            </div>
          );
        })}
      </div>
    );
  }, [activities, activitySeqMap]);

  // 判断是否有前置依赖
  const hasDependencies = useCallback((record: Activity): boolean => {
    return !!(record.dependencies && (Array.isArray(record.dependencies) ? record.dependencies.length > 0 : (() => { try { const d = JSON.parse(record.dependencies as unknown as string); return Array.isArray(d) && d.length > 0; } catch { return false; } })()));
  }, []);

  // 表格列配置
  const columnMap = useMemo<Record<string, { title: string; width?: number; dataIndex?: string; fixed?: 'right'; onHeaderCell?: () => Record<string, unknown>; render?: (...args: any[]) => React.ReactNode }>>(() => ({
    id: {
      title: 'ID',
      width: columnWidths.id,
      onHeaderCell: () => ({ 'data-column-key': 'id' }),
      render: (_: unknown, record: Activity) => (
        <span style={{ fontFamily: 'monospace', color: 'var(--color-text-3)' }}>{getSeq(record)}</span>
      ),
    },
    predecessor: {
      title: '前置',
      width: columnWidths.predecessor,
      onHeaderCell: () => ({ 'data-column-key': 'predecessor' }),
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'predecessor') {
          return (
            <InlineTextEditor
              initialValue={inlineValue}
              placeholder="如: 3FS+2, 5"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              onChange={setInlineValue}
              onCommit={() => commitPredecessorEdit(record)}
            />
          );
        }
        const text = getPredecessorSeq(record);
        const tooltipContent = getPredecessorTooltip(record);
        const spanEl = (
          <span
            style={{ fontFamily: 'monospace', color: 'var(--color-text-3)', cursor: 'pointer', display: 'inline-block', minWidth: 20, minHeight: 18 }}
            onClick={() => startInlineEdit(record.id, 'predecessor', text)}
          >
            {text || '-'}
          </span>
        );
        return tooltipContent ? <Tooltip content={tooltipContent}>{spanEl}</Tooltip> : spanEl;
      },
    },
    phase: {
      title: '阶段',
      width: columnWidths.phase,
      onHeaderCell: () => ({ 'data-column-key': 'phase' }),
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'phase') {
          return (
            <AutoOpenSelect
              size="small"
              style={{ width: 80 }}
              value={record.phase || undefined}
              allowClear
              placeholder="阶段"
              onDismiss={() => setInlineEditing(null)}
              onChange={(v) => commitSelectEdit(record, 'phase', v || '')}
            >
              {PHASE_OPTIONS.map((p) => (
                <Select.Option key={p} value={p}><Tag color={PHASE_COLOR[p]}>{p}</Tag></Select.Option>
              ))}
            </AutoOpenSelect>
          );
        }
        return (
          <span
            style={{ cursor: canManage ? 'pointer' : 'default' }}
            onClick={() => canManage && setInlineEditing({ id: record.id, field: 'phase' })}
          >
            {record.phase ? <Tag color={PHASE_COLOR[record.phase] || 'default'}>{record.phase}</Tag> : <span style={{ color: 'var(--color-text-4)' }}>-</span>}
          </span>
        );
      },
    },
    name: {
      title: '活动名称',
      width: columnWidths.name,
      dataIndex: 'name',
      onHeaderCell: () => ({ 'data-column-key': 'name' }),
      render: (name: string, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'name') {
          return (
            <InlineTextEditor
              initialValue={inlineValue}
              onChange={setInlineValue}
              onCommit={() => commitInlineEdit(record, 'name')}
            />
          );
        }
        return (
          <span
            style={{ fontWeight: 500, cursor: canManage ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => startInlineEdit(record.id, 'name', name)}
          >
            {name}
            {criticalActivityIds.includes(record.id) && (
              <Tag size="small" color="red" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>CP</Tag>
            )}
          </span>
        );
      },
    },
    type: {
      title: '类型',
      width: columnWidths.type,
      onHeaderCell: () => ({ 'data-column-key': 'type' }),
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'type') {
          return (
            <AutoOpenSelect
              size="small"
              style={{ width: 90 }}
              value={record.type}
              onDismiss={() => setInlineEditing(null)}
              onChange={(v) => commitSelectEdit(record, 'type', v)}
            >
              {Object.entries(ACTIVITY_TYPE_MAP).map(([k, v]) => (
                <Select.Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Select.Option>
              ))}
            </AutoOpenSelect>
          );
        }
        const cfg = ACTIVITY_TYPE_MAP[record.type as keyof typeof ACTIVITY_TYPE_MAP] ?? { label: record.type, color: 'default' };
        return (
          <Tag
            color={cfg.color}
            style={{ cursor: canManage ? 'pointer' : 'default' }}
            onClick={() => canManage && setInlineEditing({ id: record.id, field: 'type' })}
          >
            {cfg.label}
          </Tag>
        );
      },
    },
    status: {
      title: '状态',
      width: columnWidths.status,
      onHeaderCell: () => ({ 'data-column-key': 'status' }),
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'status') {
          return (
            <AutoOpenSelect
              size="small"
              style={{ width: 100 }}
              value={record.status}
              onDismiss={() => setInlineEditing(null)}
              onChange={(v) => commitSelectEdit(record, 'status', v)}
            >
              {Object.entries(ACTIVITY_STATUS_MAP).map(([k, v]) => (
                <Select.Option key={k} value={k}>{v.label}</Select.Option>
              ))}
            </AutoOpenSelect>
          );
        }
        const cfg = ACTIVITY_STATUS_MAP[record.status as keyof typeof ACTIVITY_STATUS_MAP] ?? { label: record.status, color: 'default' };
        return (
          <Tag
            color={cfg.color}
            style={{ cursor: canManage ? 'pointer' : 'default' }}
            onClick={() => canManage && setInlineEditing({ id: record.id, field: 'status' })}
          >
            {cfg.label}
          </Tag>
        );
      },
    },
    assignee: {
      title: '负责人',
      width: columnWidths.assignee,
      onHeaderCell: () => ({ 'data-column-key': 'assignee' }),
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'assigneeIds') {
          const currentAssigneeIds = new Set(record.executors?.map((e) => e.userId) ?? []);
          const preselectedRoles = assigneeRoleOptions
            .filter((opt) => opt.users.some((u) => currentAssigneeIds.has(u.userId)))
            .map((opt) => opt.key);

          if (assigneeRoleOptions.length === 0) {
            return (
              <Tooltip content="请先在项目编辑页配置项目成员">
                <span style={{ color: 'var(--color-text-3)', fontSize: 12 }}>无可选角色</span>
              </Tooltip>
            );
          }

          return (
            <AutoOpenSelect
              mode="multiple"
              size="small"
              allowClear
              showSearch
              filterOption={(input, option) => {
                const key = option?.props?.value as string;
                const opt = assigneeRoleOptions.find((o) => o.key === key);
                if (!opt) return false;
                const lower = input.toLowerCase();
                return (
                  opt.label.toLowerCase().includes(lower) ||
                  opt.users.some((u) => u.name.toLowerCase().includes(lower))
                );
              }}
              style={{ width: 200 }}
              value={preselectedRoles}
              placeholder="选择角色"
              onDismiss={() => setInlineEditing(null)}
              onChange={(roleKeys: string[]) => {
                setInlineEditing(null);
                const userIdSet = new Set<string>();
                for (const k of roleKeys) {
                  const opt = assigneeRoleOptions.find((o) => o.key === k);
                  if (opt) opt.users.forEach((u) => userIdSet.add(u.userId));
                }
                const newIds = Array.from(userIdSet);
                const oldIds = record.executors?.map((e) => e.userId) ?? [];
                activitiesApi.update(record.id, { executorIds: newIds }).then(() => {
                  loadActivities();
                  showUndoMessage(record.id, { executorIds: oldIds }, record.name);
                }).catch(() => Message.error('更新失败'));
              }}
            >
              {assigneeRoleOptions.map((opt) => (
                <Select.Option key={opt.key} value={opt.key}>
                  <Tag color={opt.color} size="small" style={{ marginRight: 6 }}>{opt.label}</Tag>
                  <span style={{ color: 'var(--color-text-2)' }}>
                    {opt.users.map((u) => u.name).join('、')}
                  </span>
                </Select.Option>
              ))}
            </AutoOpenSelect>
          );
        }
        const names = record.executors?.map((e) => e.user?.realName).filter(Boolean).join(', ') || '-';
        const roleName = record.role?.name || null;
        const isEmpty = !record.executors || record.executors.length === 0;
        return (
          <span
            style={{ cursor: canManage ? 'pointer' : 'default' }}
            onClick={() => canManage && setInlineEditing({ id: record.id, field: 'assigneeIds' })}
          >
            {isEmpty ? (
              <span style={{ color: 'rgb(var(--danger-6))' }}>⚠️ 未配置</span>
            ) : (
              <>
                {roleName && <Tag size="small" style={{ marginRight: 4 }}>{roleName}</Tag>}
                {names}
              </>
            )}
          </span>
        );
      },
    },
    planDuration: {
      title: '计划工期',
      width: columnWidths.planDuration,
      onHeaderCell: () => ({ 'data-column-key': 'planDuration' }),
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'planDuration') {
          return (
            <InputNumber
              autoFocus
              size="small"
              style={{ width: 60 }}
              min={1}
              precision={0}
              suffix="天"
              value={inlineValue ? parseInt(inlineValue, 10) : undefined}
              onChange={(v) => setInlineValue(v != null ? String(v) : '')}
              onBlur={() => commitPlanDurationEdit(record)}
              onKeyDown={(e) => { if ((e as unknown as React.KeyboardEvent).key === 'Enter') commitPlanDurationEdit(record); }}
            />
          );
        }
        const days = record.planStartDate && record.planEndDate
          ? calcWorkdays(dayjs(record.planStartDate), dayjs(record.planEndDate))
          : record.planDuration;
        return (
          <span
            style={{ cursor: canManage ? 'pointer' : 'default' }}
            onClick={() => startInlineEdit(record.id, 'planDuration', days != null ? String(days) : '')}
          >
            {days != null ? <>{days}<span style={{ fontSize: 12, color: 'var(--color-text-3)', paddingLeft: 2 }}>天</span></> : <span style={{ color: 'var(--color-text-4)' }}>-</span>}
          </span>
        );
      },
    },
    planDates: {
      title: "计划时间",
      width: columnWidths.planDates,
      onHeaderCell: () => ({ "data-column-key": "planDates" }),
      render: (_: unknown, record: Activity) => {
        const hasDeps = hasDependencies(record);
        const isOverdue = record.planEndDate && record.status !== "COMPLETED" && dayjs(record.planEndDate).isBefore(dayjs(), "day");
        if (inlineEditing?.id === record.id && inlineEditing.field === "planDates") {
          return (
            <AutoOpenRangePicker
              size="small"
              style={{ width: 240 }}
              format="YYYY-MM-DD"
              value={record.planStartDate && record.planEndDate ? [dayjs(record.planStartDate), dayjs(record.planEndDate)] : undefined}
              onDismiss={() => setInlineEditing(null)}
              onChange={(dateStr) => {
                setInlineEditing(null);
                if (dateStr && dateStr[0] && dateStr[1]) {
                  const startVal = dateStr[0] as string;
                  const endVal = dateStr[1] as string;
                  const duration = calcWorkdays(dayjs(startVal), dayjs(endVal));
                  const payload: Record<string, unknown> = { planStartDate: startVal, planEndDate: endVal, planDuration: duration };
                  const rollback: Record<string, unknown> = {
                    planStartDate: record.planStartDate || undefined,
                    planEndDate: record.planEndDate || undefined,
                    planDuration: record.planDuration ?? undefined,
                  };
                  activitiesApi.update(record.id, payload).then(() => {
                    loadActivities();
                    showUndoMessage(record.id, rollback, record.name);
                  }).catch(() => Message.error("更新失败"));
                }
              }}
            />
          );
        }
        const hasAnyDate = record.planStartDate || record.planEndDate;
        return (
          <span
            style={{
              whiteSpace: "nowrap",
              color: isOverdue ? "rgb(var(--danger-6))" : undefined,
              cursor: !hasDeps && canManage ? "pointer" : "default",
            }}
            onClick={() => {
              if (hasDeps) { Message.info("已设置前置依赖，计划时间由系统自动计算"); return; }
              if (canManage) setInlineEditing({ id: record.id, field: "planDates" });
            }}
          >
            {hasAnyDate ? `${dateFmt(record.planStartDate)} ~ ${dateFmt(record.planEndDate)}` : "-"}
          </span>
        );
      },
    },
    actualDates: {
      title: "实际时间",
      width: columnWidths.actualDates,
      onHeaderCell: () => ({ "data-column-key": "actualDates" }),
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === "actualDates") {
          return (
            <AutoOpenRangePicker
              size="small"
              style={{ width: 240 }}
              format="YYYY-MM-DD"
              value={record.startDate && record.endDate ? [dayjs(record.startDate), dayjs(record.endDate)] : undefined}
              onDismiss={() => setInlineEditing(null)}
              onChange={(dateStr) => {
                setInlineEditing(null);
                if (dateStr && dateStr[0] && dateStr[1]) {
                  const startVal = dateStr[0] as string;
                  const endVal = dateStr[1] as string;
                  const dur = calcWorkdays(dayjs(startVal), dayjs(endVal));
                  const payload: Record<string, unknown> = { startDate: startVal, endDate: endVal, duration: dur };
                  const rollback: Record<string, unknown> = {
                    startDate: record.startDate || undefined,
                    endDate: record.endDate || undefined,
                    duration: record.duration ?? undefined,
                  };
                  activitiesApi.update(record.id, payload).then(() => {
                    loadActivities();
                    showUndoMessage(record.id, rollback, record.name);
                  }).catch(() => Message.error("更新失败"));
                }
              }}
            />
          );
        }
        const isLate = record.planStartDate && record.startDate && dayjs(record.startDate).isAfter(dayjs(record.planStartDate), "day");
        const isOverdue = record.planEndDate && record.endDate && dayjs(record.endDate).isAfter(dayjs(record.planEndDate), "day");
        const hasColor = isLate || isOverdue;
        const days = record.startDate && record.endDate ? calcWorkdays(dayjs(record.startDate), dayjs(record.endDate)) : record.duration;
        const hasAnyDate = record.startDate || record.endDate;
        return (
          <span
            style={{
              whiteSpace: "nowrap",
              color: hasColor ? "rgb(var(--danger-6))" : undefined,
              cursor: canManage ? "pointer" : "default",
            }}
            onClick={() => canManage && setInlineEditing({ id: record.id, field: "actualDates" })}
          >
            {hasAnyDate ? (
              <>
                {dateFmt(record.startDate)} ~ {dateFmt(record.endDate)}
                {days != null && <span style={{ fontSize: 12, color: "var(--color-text-3)", marginLeft: 4 }}>{days}天</span>}
              </>
            ) : "-"}
          </span>
        );
      },
    },
    checkItems: {
      title: '检查项',
      dataIndex: 'checkItems',
      width: columnWidths.checkItems,
      onHeaderCell: () => ({ 'data-column-key': 'checkItems' }),
      render: (_: unknown, record: Activity) => {
        const items = record.checkItems;
        if (!items || items.length === 0) return <span style={{ color: 'var(--color-text-4)' }}>-</span>;
        const checked = items.filter((i) => i.checked).length;
        const total = items.length;
        const allDone = checked === total;
        return (
          <Tooltip content={`${checked}/${total} 已完成`}>
            <span style={{ fontSize: 12, color: allDone ? 'rgb(var(--green-6))' : 'var(--color-text-2)' }}>
              {allDone ? '\u2705 ' : ''}{checked}/{total}
            </span>
          </Tooltip>
        );
      },
    },
    notes: {
      title: '备注',
      dataIndex: 'notes',
      width: columnWidths.notes,
      onHeaderCell: () => ({ 'data-column-key': 'notes' }),
      render: (notes: string | null, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'notes') {
          return (
            <InlineTextEditor
              initialValue={inlineValue}
              onChange={setInlineValue}
              onCommit={() => commitInlineEdit(record, 'notes')}
            />
          );
        }
        return (
          <Tooltip content={notes || ''}>
            <span
              style={{
                cursor: canManage ? 'pointer' : 'default',
                maxWidth: '100%',
                display: 'inline-block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: notes ? undefined : 'var(--color-text-4)',
              }}
              onClick={() => startInlineEdit(record.id, 'notes', notes || '')}
            >
              {notes || '-'}
            </span>
          </Tooltip>
        );
      },
    },
  }), [
    inlineEditing, inlineValue, users, project, activities, activitySeqMap,
    assigneeRoleOptions,
    canManage, criticalActivityIds, columnWidths, hasDependencies,
    getSeq, getPredecessorSeq, getPredecessorTooltip, commitPredecessorEdit, commitPlanDurationEdit,
    startInlineEdit, setInlineEditing, setInlineValue, commitInlineEdit, commitSelectEdit,
    showUndoMessage, loadActivities,
  ]);

  // 根据偏好生成最终列数组
  const activityColumns = useMemo(() => {
    // 批量选择列
    const checkCol = canManage ? {
      title: (
        <input
          type="checkbox"
          checked={activities.length > 0 && selectedIds.size === activities.length}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedIds(new Set(activities.map(a => a.id)));
            } else {
              setSelectedIds(new Set());
            }
          }}
          style={{ cursor: 'pointer' }}
        />
      ),
      width: 36,
      align: 'center' as const,
      render: (_: unknown, record: Activity) => (
        <input
          type="checkbox"
          checked={selectedIds.has(record.id)}
          onChange={(e) => {
            const next = new Set(selectedIds);
            if (e.target.checked) next.add(record.id);
            else next.delete(record.id);
            setSelectedIds(next);
          }}
          style={{ cursor: 'pointer' }}
        />
      ),
    } : null;

    const dragCol = {
      title: '',
      dataIndex: 'id',
      width: 50,
      render: (_: unknown, _record: Activity, index: number) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
          {canManage && (
            <div
              className="drag-handle"
              onMouseDown={(e: React.MouseEvent) => handleMouseDown(e, index)}
            >
              <IconDragDotVertical />
            </div>
          )}
          {canCreate && (
            <div
              className="row-insert-trigger"
              onClick={() => handleInsertActivity(index + 1)}
              title="在下方插入活动"
            >
              <IconPlus />
            </div>
          )}
        </div>
      ),
    };

    const actionsCol = {
      title: '操作',
      width: 100,
      fixed: 'right' as const,
      render: (_: unknown, record: Activity) => (
        <Space size={4}>
          {canManage && (
            <Tooltip content="编辑">
              <IconEdit style={{ cursor: 'pointer', color: 'rgb(var(--primary-6))' }} onClick={() => handleOpenDrawer(record)} />
            </Tooltip>
          )}
          {!isArchived && canManage && (
            <Tooltip content="删除">
              <IconDelete style={{ cursor: 'pointer', color: 'rgb(var(--danger-6))' }} onClick={() => handleDeleteActivity(record)} />
            </Tooltip>
          )}
        </Space>
      ),
    };

    const visibleSet = new Set(columnPrefsVisible);
    const middleCols = columnPrefsOrder
      .filter((key) => visibleSet.has(key) && columnMap[key])
      .map((key) => columnMap[key]);

    return [...(checkCol ? [checkCol] : []), dragCol, ...middleCols, actionsCol];
  }, [
    columnMap, columnPrefsVisible, columnPrefsOrder,
    activities, selectedIds, canManage, canCreate, isArchived,
    handleMouseDown, handleInsertActivity, handleOpenDrawer, handleDeleteActivity,
    setSelectedIds,
  ]);

  // 动态计算 scroll.x
  const scrollX = useMemo(() => {
    const visibleSet = new Set(columnPrefsVisible);
    const dynamicWidth = columnPrefsOrder
      .filter((key) => visibleSet.has(key))
      .reduce((sum, key) => sum + (columnWidths[key] || COLUMN_WIDTH_MAP[key] || 100), 0);
    return dynamicWidth + 36 + 50 + 100;
  }, [columnPrefsVisible, columnPrefsOrder, columnWidths]);

  return {
    activityColumns,
    scrollX,
    activitySeqMap,
    getSeq,
    getPredecessorSeq,
    parsePredecessorText,
  };
}
