import React, { useMemo, useCallback } from 'react';
import type { DateRange } from 'react-day-picker';
import { CalendarIcon, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, User, ProjectMember, Role } from '../types';
import {
  ACTIVITY_STATUS_MAP,
  ACTIVITY_TYPE_MAP,
  DEPENDENCY_TYPE_MAP,
  PHASE_OPTIONS,
} from '../utils/constants';
import { arcoBadgeClass } from '../utils/badgeColor';
import { calcWorkdays, addWorkdays } from '../utils/workday';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { activitiesApi, roleMembersApi } from '../api';

// 列对象形状（替换原 Arco ColumnProps<Activity>，供父级纯 <table> 消费）
export interface ActivityColumn {
  key?: string;
  dataIndex?: string;
  title?: React.ReactNode;
  width?: number;
  align?: 'left' | 'center' | 'right';
  fixed?: 'left' | 'right';
  sorter?: unknown;
  render?: (value: unknown, record: Activity, index: number) => React.ReactNode;
  onHeaderCell?: () => { 'data-column-key': string };
}

// 清除值哨兵（Radix Select 不允许 value=""）
const CLEAR_PHASE = '__clear__';

// 自动展开的 Select 包装（挂载即展开，关闭即 onDismiss）
interface AutoOpenSelectProps {
  value?: string;
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
  onDismiss: () => void;
  onChange: (value: string) => void;
  children: React.ReactNode;
}
const AutoOpenSelect: React.FC<AutoOpenSelectProps> = ({
  value,
  placeholder,
  className,
  allowClear,
  onDismiss,
  onChange,
  children,
}) => {
  const [open, setOpen] = React.useState(true);
  return (
    <Select
      open={open}
      value={value || undefined}
      onValueChange={(v) => onChange(v === CLEAR_PHASE ? '' : v)}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) onDismiss();
      }}
    >
      <SelectTrigger size="sm" className={cn('h-7 text-xs', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowClear && value ? (
          <SelectItem value={CLEAR_PHASE} className="text-muted-foreground text-xs">
            清除
          </SelectItem>
        ) : null}
        {children}
      </SelectContent>
    </Select>
  );
};

// 自动展开的 DatePicker 包装（单日，挂载即展开，关闭即 onDismiss）
interface AutoOpenDatePickerProps {
  value?: Date;
  placeholder?: string;
  className?: string;
  onDismiss: () => void;
  onSelect: (date: Date | undefined) => void;
}
const AutoOpenDatePicker: React.FC<AutoOpenDatePickerProps> = ({
  value,
  placeholder = '选择日期',
  className,
  onDismiss,
  onSelect,
}) => {
  const [open, setOpen] = React.useState(true);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) onDismiss();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-7 justify-start text-left text-xs font-normal', !value && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="mr-1 size-3.5 shrink-0" />
          {value ? dayjs(value).format('YYYY-MM-DD') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onSelect} autoFocus />
      </PopoverContent>
    </Popover>
  );
};

// 自动展开的 RangePicker 包装（区间，挂载即展开，关闭即 onDismiss）
interface AutoOpenRangePickerProps {
  value?: DateRange;
  placeholder?: string;
  className?: string;
  onDismiss: () => void;
  onSelect: (range: DateRange | undefined) => void;
}
const AutoOpenRangePicker: React.FC<AutoOpenRangePickerProps> = ({
  value,
  placeholder = '选择起止日期',
  className,
  onDismiss,
  onSelect,
}) => {
  const [open, setOpen] = React.useState(true);
  const text = value?.from
    ? value.to
      ? `${dayjs(value.from).format('YYYY-MM-DD')} ~ ${dayjs(value.to).format('YYYY-MM-DD')}`
      : dayjs(value.from).format('YYYY-MM-DD')
    : '';
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) onDismiss();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-7 justify-start text-left text-xs font-normal', !text && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="mr-1 size-3.5 shrink-0" />
          {text || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="range" selected={value} onSelect={onSelect} numberOfMonths={2} autoFocus />
      </PopoverContent>
    </Popover>
  );
};

// 内联文本编辑：使用本地状态承载输入，避免父级 re-render 引起的光标跳动（IME 组词时尤为明显）
interface InlineTextEditorProps {
  initialValue: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  placeholder?: string;
  className?: string;
}
const InlineTextEditor: React.FC<InlineTextEditorProps> = ({ initialValue, onChange, onCommit, placeholder, className }) => {
  const [value, setValue] = React.useState(initialValue);
  return (
    <Input
      autoFocus
      className={cn('h-7 text-xs', className)}
      value={value}
      placeholder={placeholder}
      onChange={(e) => { setValue(e.target.value); onChange(e.target.value); }}
      onBlur={onCommit}
      onKeyDown={(e) => { if (e.key === 'Enter') onCommit(); }}
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
const TYPE_LABEL_TO_CODE: Record<string, string> = { FS: '0', SS: '1', FF: '2', SF: '3' };

export { AutoOpenSelect, AutoOpenDatePicker, AutoOpenRangePicker, PHASE_COLOR, formatSeq, dateFmt };

interface UseActivityColumnsOptions {
  activities: Activity[];
  users: User[];
  roles: Role[];
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
    activities, roles, isArchived,
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
      toast.error('更新失败');
    }
  }, [inlineValue, setInlineEditing, showUndoMessage, loadActivities]);

  // 提交前置依赖内联编辑
  const commitPredecessorEdit = useCallback(async (activity: Activity) => {
    setInlineEditing(null);
    const oldText = getPredecessorSeq(activity);
    if (inlineValue.trim() === oldText.trim()) return;
    const deps = parsePredecessorText(inlineValue, activity.id);
    if (deps === null) {
      toast.error('格式错误，示例: 3FS+2, 5');
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
      toast.error('更新失败');
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
      <div className="text-xs">
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
  const columnMap = useMemo<Record<string, ActivityColumn>>(() => ({
    id: {
      title: 'ID',
      width: columnWidths.id,
      onHeaderCell: () => ({ 'data-column-key': 'id' }),
      render: (_: unknown, record: Activity) => (
        <span className="text-muted-foreground font-mono">{getSeq(record)}</span>
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
              className="font-mono"
              onChange={setInlineValue}
              onCommit={() => commitPredecessorEdit(record)}
            />
          );
        }
        const text = getPredecessorSeq(record);
        const tooltipContent = getPredecessorTooltip(record);
        const spanEl = (
          <span
            className="text-muted-foreground inline-block min-h-[18px] min-w-5 cursor-pointer font-mono"
            onClick={() => startInlineEdit(record.id, 'predecessor', text)}
          >
            {text || '-'}
          </span>
        );
        return tooltipContent ? (
          <Tooltip>
            <TooltipTrigger asChild>{spanEl}</TooltipTrigger>
            <TooltipContent side="top">{tooltipContent}</TooltipContent>
          </Tooltip>
        ) : spanEl;
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
              className="w-20"
              value={record.phase || undefined}
              allowClear
              placeholder="阶段"
              onDismiss={() => setInlineEditing(null)}
              onChange={(v) => commitSelectEdit(record, 'phase', v || '')}
            >
              {PHASE_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  <Badge variant="outline" className={cn('px-1.5 py-0 text-xs', arcoBadgeClass(PHASE_COLOR[p]))}>{p}</Badge>
                </SelectItem>
              ))}
            </AutoOpenSelect>
          );
        }
        return (
          <span
            className={cn(canManage ? 'cursor-pointer' : 'cursor-default')}
            onClick={() => canManage && setInlineEditing({ id: record.id, field: 'phase' })}
          >
            {record.phase ? (
              <Badge variant="outline" className={cn('px-1.5 py-0 text-xs', arcoBadgeClass(PHASE_COLOR[record.phase] || 'default'))}>{record.phase}</Badge>
            ) : <span className="text-muted-foreground">-</span>}
          </span>
        );
      },
    },
    name: {
      title: '活动名称',
      width: columnWidths.name,
      dataIndex: 'name',
      onHeaderCell: () => ({ 'data-column-key': 'name' }),
      render: (value: unknown, record: Activity) => {
        const name = value as string;
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
            className={cn('flex items-center gap-1 font-medium', canManage ? 'cursor-pointer' : 'cursor-default')}
            onClick={() => startInlineEdit(record.id, 'name', name)}
          >
            {name}
            {criticalActivityIds.includes(record.id) && (
              <Badge variant="outline" className={cn('px-1 py-0 text-[10px] leading-4', arcoBadgeClass('red'))}>CP</Badge>
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
              className="w-[90px]"
              value={record.type}
              onDismiss={() => setInlineEditing(null)}
              onChange={(v) => commitSelectEdit(record, 'type', v)}
            >
              {Object.entries(ACTIVITY_TYPE_MAP).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  <Badge variant="outline" className={cn('px-1.5 py-0 text-xs', arcoBadgeClass(v.color))}>{v.label}</Badge>
                </SelectItem>
              ))}
            </AutoOpenSelect>
          );
        }
        const cfg = ACTIVITY_TYPE_MAP[record.type as keyof typeof ACTIVITY_TYPE_MAP] ?? { label: record.type, color: 'default' };
        return (
          <Badge
            variant="outline"
            className={cn('px-1.5 py-0 text-xs', arcoBadgeClass(cfg.color), canManage ? 'cursor-pointer' : 'cursor-default')}
            onClick={() => canManage && setInlineEditing({ id: record.id, field: 'type' })}
          >
            {cfg.label}
          </Badge>
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
              className="w-[100px]"
              value={record.status}
              onDismiss={() => setInlineEditing(null)}
              onChange={(v) => commitSelectEdit(record, 'status', v)}
            >
              {Object.entries(ACTIVITY_STATUS_MAP).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </AutoOpenSelect>
          );
        }
        const cfg = ACTIVITY_STATUS_MAP[record.status as keyof typeof ACTIVITY_STATUS_MAP] ?? { label: record.status, color: 'default' };
        return (
          <Badge
            variant="outline"
            className={cn('px-1.5 py-0 text-xs', arcoBadgeClass(cfg.color), canManage ? 'cursor-pointer' : 'cursor-default')}
            onClick={() => canManage && setInlineEditing({ id: record.id, field: 'status' })}
          >
            {cfg.label}
          </Badge>
        );
      },
    },
    assignee: {
      title: '负责人',
      width: columnWidths.assignee,
      onHeaderCell: () => ({ 'data-column-key': 'assignee' }),
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'assigneeIds') {
          if (roles.length === 0) {
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground text-xs">无可选角色</span>
                </TooltipTrigger>
                <TooltipContent side="top">请先在角色管理中创建角色</TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Combobox
              className="h-7 w-[200px] text-xs"
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
              value={record.roleId || undefined}
              allowClear
              placeholder="选择角色"
              searchPlaceholder="搜索角色…"
              onChange={async (roleId: string | undefined) => {
                setInlineEditing(null);
                const oldIds = record.executors?.map((e) => e.userId) ?? [];
                const oldRoleId = record.roleId ?? null;
                if (roleId) {
                  try {
                    const { data: preview } = await roleMembersApi.preview(roleId);
                    const ids = (preview.members || []).map((m) => m.userId);
                    await activitiesApi.update(record.id, { roleId, executorIds: ids });
                    loadActivities();
                    showUndoMessage(record.id, { roleId: oldRoleId, executorIds: oldIds }, record.name);
                  } catch {
                    toast.error('更新失败');
                  }
                } else {
                  try {
                    await activitiesApi.update(record.id, { roleId: null, executorIds: [] });
                    loadActivities();
                    showUndoMessage(record.id, { roleId: oldRoleId, executorIds: oldIds }, record.name);
                  } catch {
                    toast.error('更新失败');
                  }
                }
              }}
            />
          );
        }
        const names = record.executors?.map((e) => e.user?.realName).filter(Boolean).join(', ') || '-';
        const roleName = record.role?.name || null;
        const isEmpty = !record.executors || record.executors.length === 0;
        return (
          <span
            className={cn('inline-flex items-center gap-1', canManage ? 'cursor-pointer' : 'cursor-default')}
            onClick={() => canManage && setInlineEditing({ id: record.id, field: 'assigneeIds' })}
          >
            {isEmpty ? (
              <span className="text-destructive">⚠️ 未配置</span>
            ) : (
              <>
                {roleName && <Badge variant="outline" className={cn('px-1.5 py-0 text-xs', arcoBadgeClass('default'))}>{roleName}</Badge>}
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
            <Input
              autoFocus
              type="number"
              min={1}
              step={1}
              className="h-7 w-[60px] text-xs"
              value={inlineValue}
              onChange={(e) => setInlineValue(e.target.value)}
              onBlur={() => commitPlanDurationEdit(record)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitPlanDurationEdit(record); }}
            />
          );
        }
        const days = record.planStartDate && record.planEndDate
          ? calcWorkdays(dayjs(record.planStartDate), dayjs(record.planEndDate))
          : record.planDuration;
        return (
          <span
            className={cn(canManage ? 'cursor-pointer' : 'cursor-default')}
            onClick={() => startInlineEdit(record.id, 'planDuration', days != null ? String(days) : '')}
          >
            {days != null ? <>{days}<span className="text-muted-foreground pl-0.5 text-xs">天</span></> : <span className="text-muted-foreground">-</span>}
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
              className="w-[240px]"
              value={record.planStartDate && record.planEndDate ? { from: dayjs(record.planStartDate).toDate(), to: dayjs(record.planEndDate).toDate() } : undefined}
              onDismiss={() => setInlineEditing(null)}
              onSelect={(range) => {
                if (range && range.from && range.to) {
                  setInlineEditing(null);
                  const startVal = dayjs(range.from).format("YYYY-MM-DD");
                  const endVal = dayjs(range.to).format("YYYY-MM-DD");
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
                  }).catch(() => toast.error("更新失败"));
                }
              }}
            />
          );
        }
        const hasAnyDate = record.planStartDate || record.planEndDate;
        return (
          <span
            className={cn(
              "whitespace-nowrap",
              isOverdue && "text-destructive",
              !hasDeps && canManage ? "cursor-pointer" : "cursor-default",
            )}
            onClick={() => {
              if (hasDeps) { toast.info("已设置前置依赖，计划时间由系统自动计算"); return; }
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
              className="w-[240px]"
              value={record.startDate && record.endDate ? { from: dayjs(record.startDate).toDate(), to: dayjs(record.endDate).toDate() } : undefined}
              onDismiss={() => setInlineEditing(null)}
              onSelect={(range) => {
                if (range && range.from && range.to) {
                  setInlineEditing(null);
                  const startVal = dayjs(range.from).format("YYYY-MM-DD");
                  const endVal = dayjs(range.to).format("YYYY-MM-DD");
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
                  }).catch(() => toast.error("更新失败"));
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
            className={cn(
              "whitespace-nowrap",
              hasColor && "text-destructive",
              canManage ? "cursor-pointer" : "cursor-default",
            )}
            onClick={() => canManage && setInlineEditing({ id: record.id, field: "actualDates" })}
          >
            {hasAnyDate ? (
              <>
                {dateFmt(record.startDate)} ~ {dateFmt(record.endDate)}
                {days != null && <span className="text-muted-foreground ml-1 text-xs">{days}天</span>}
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
        if (!items || items.length === 0) return <span className="text-muted-foreground">-</span>;
        const checked = items.filter((i) => i.checked).length;
        const total = items.length;
        const allDone = checked === total;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn('text-xs', allDone ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground')}>
                {allDone ? '✅ ' : ''}{checked}/{total}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{`${checked}/${total} 已完成`}</TooltipContent>
          </Tooltip>
        );
      },
    },
    notes: {
      title: '备注',
      dataIndex: 'notes',
      width: columnWidths.notes,
      onHeaderCell: () => ({ 'data-column-key': 'notes' }),
      render: (value: unknown, record: Activity) => {
        const notes = value as string | null;
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
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  'inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap',
                  canManage ? 'cursor-pointer' : 'cursor-default',
                  !notes && 'text-muted-foreground',
                )}
                onClick={() => startInlineEdit(record.id, 'notes', notes || '')}
              >
                {notes || '-'}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{notes || ''}</TooltipContent>
          </Tooltip>
        );
      },
    },
  }), [
    inlineEditing, inlineValue, roles,
    canManage, criticalActivityIds, columnWidths, hasDependencies,
    getSeq, getPredecessorSeq, getPredecessorTooltip, commitPredecessorEdit, commitPlanDurationEdit,
    startInlineEdit, setInlineEditing, setInlineValue, commitInlineEdit, commitSelectEdit,
    showUndoMessage, loadActivities,
  ]);

  // 根据偏好生成最终列数组
  const activityColumns = useMemo<ActivityColumn[]>(() => {
    // 批量选择列
    const checkCol: ActivityColumn | null = canManage ? {
      title: (
        <Checkbox
          checked={activities.length > 0 && selectedIds.size === activities.length}
          onCheckedChange={(checked) => {
            if (checked) {
              setSelectedIds(new Set(activities.map(a => a.id)));
            } else {
              setSelectedIds(new Set());
            }
          }}
          aria-label="全选"
        />
      ),
      width: 36,
      align: 'center' as const,
      render: (_: unknown, record: Activity) => (
        <Checkbox
          checked={selectedIds.has(record.id)}
          onCheckedChange={(checked) => {
            const next = new Set(selectedIds);
            if (checked) next.add(record.id);
            else next.delete(record.id);
            setSelectedIds(next);
          }}
          aria-label={`选择 ${record.name}`}
        />
      ),
    } : null;

    const dragCol: ActivityColumn = {
      title: '',
      dataIndex: 'id',
      width: 50,
      render: (_: unknown, _record: Activity, index: number) => (
        <div className="flex items-center justify-center gap-0">
          {canManage && (
            <span
              className="drag-handle text-muted-foreground cursor-grab"
              onMouseDown={(e: React.MouseEvent) => handleMouseDown(e, index)}
            >
              <GripVertical className="size-4" />
            </span>
          )}
          {canCreate && (
            <span
              className="row-insert-trigger text-muted-foreground cursor-pointer"
              onClick={() => handleInsertActivity(index + 1)}
              title="在下方插入活动"
            >
              <Plus className="size-4" />
            </span>
          )}
        </div>
      ),
    };

    const actionsCol: ActivityColumn = {
      title: '操作',
      width: 100,
      fixed: 'right' as const,
      render: (_: unknown, record: Activity) => (
        <div className="flex items-center gap-1">
          {canManage && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="text-primary size-7" aria-label="编辑" onClick={() => handleOpenDrawer(record)}>
                  <Pencil className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">编辑</TooltipContent>
            </Tooltip>
          )}
          {!isArchived && canManage && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive size-7" aria-label="删除" onClick={() => handleDeleteActivity(record)}>
                  <Trash2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">删除</TooltipContent>
            </Tooltip>
          )}
        </div>
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
