import React, { useState, useRef, useCallback } from 'react';
import { Plus, Trash2, Upload, CalendarIcon } from 'lucide-react';
import dayjs from 'dayjs';
import { Activity, User } from '../../../types';
import {
  ACTIVITY_STATUS_MAP,
  ACTIVITY_TYPE_MAP,
  DEPENDENCY_TYPE_MAP,
  PHASE_OPTIONS,
} from '../../../utils/constants';
import { calcWorkdays, addWorkdays, subtractWorkdays } from '../../../utils/workday';
import { rolesApi, roleMembersApi } from '../../../api';
import { arcoBadgeClass } from '../../../utils/badgeColor';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { MultiSelect, type SelectOption } from '@/components/ui/multi-select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import ActivityComments from './ActivityComments';
import CheckItems from './CheckItems';

const PHASE_COLOR: Record<string, string> = { EVT: 'blue', DVT: 'green', PVT: 'purple', MP: 'orange' };

// 三方联动辅助
export type DateTriple = { start: dayjs.Dayjs | null; end: dayjs.Dayjs | null; dur: number | null };
export function resolveTriple(t: DateTriple, changed: 'start' | 'end' | 'dur'): DateTriple {
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
  defaultAssigneeId?: string;
  onSubmit: (values: ActivityDrawerValues, planDuration: number | null, actualDuration: number | null, formDeps: { id: string; type: string; lag: number }[]) => Promise<void>;
  onImportFile: (file: File) => void;
}

export type ActivityDrawerValues = {
  name: string;
  description?: string;
  type?: string;
  phase?: string;
  status?: string;
  planStart?: Parameters<typeof dayjs>[0];
  planEnd?: Parameters<typeof dayjs>[0];
  actualStart?: Parameters<typeof dayjs>[0];
  actualEnd?: Parameters<typeof dayjs>[0];
  roleId?: string | null;
  executorIds?: string[];
  notes?: string;
};

const userToOption = (u: User): SelectOption => ({
  value: u.id,
  label: `${u.realName}${!u.canLogin ? ' (仅联系人)' : ''}`,
});

function Field({
  label,
  htmlFor,
  required,
  error,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function DatePickerField({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value?: dayjs.Dayjs;
  onChange: (d: dayjs.Dayjs | null) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-start text-left font-normal', !value && 'text-muted-foreground')}
        >
          <CalendarIcon className="mr-2 size-4 shrink-0" />
          {value ? value.format('YYYY-MM-DD') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ? value.toDate() : undefined}
          onSelect={(d) => {
            onChange(d ? dayjs(d) : null);
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

const ActivityDrawer: React.FC<ActivityDrawerProps> = ({
  visible,
  onClose,
  editingActivity,
  activities,
  users,
  activitySeqMap,
  defaultAssigneeId,
  onSubmit,
  onImportFile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [planDuration, setPlanDuration] = useState<number | null>(null);
  const [actualDuration, setActualDuration] = useState<number | null>(null);
  const [formDeps, setFormDeps] = useState<Array<{ id: string; type: string; lag: number }>>([]);
  const [roleOptions, setRoleOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [roleUserIds, setRoleUserIds] = useState<string[] | null>(null);

  // 表单字段状态（受控）
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string>('TASK');
  const [phase, setPhase] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string>('NOT_STARTED');
  const [planStart, setPlanStart] = useState<dayjs.Dayjs | null>(null);
  const [planEnd, setPlanEnd] = useState<dayjs.Dayjs | null>(null);
  const [actualStart, setActualStart] = useState<dayjs.Dayjs | null>(null);
  const [actualEnd, setActualEnd] = useState<dayjs.Dayjs | null>(null);
  const [roleId, setRoleId] = useState<string | undefined>(undefined);
  const [executorIds, setExecutorIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const syncExecutorSearchA11yLabel = useCallback(() => {
    window.requestAnimationFrame(() => {
      document
        .querySelectorAll<HTMLInputElement>('[cmdk-input]')
        .forEach((input) => {
          if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', '执行人搜索');
        });
    });
  }, []);

  React.useEffect(() => {
    rolesApi.list().then((res) => {
      setRoleOptions(res.data);
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (visible) {
      syncExecutorSearchA11yLabel();
    }
  }, [roleUserIds, syncExecutorSearchA11yLabel, visible]);

  const handleRoleChange = async (value: string | undefined) => {
    setRoleId(value);
    setErrors((prev) => (prev.roleId ? { ...prev, roleId: '' } : prev));
    if (value) {
      try {
        const { data: preview } = await roleMembersApi.preview(value);
        const ids = (preview.members || []).map((m) => m.userId);
        setRoleUserIds(ids);
        setExecutorIds(ids);
      } catch {
        setRoleUserIds([]);
        setExecutorIds([]);
      }
    } else {
      setRoleUserIds(null);
      setExecutorIds([]);
    }
  };

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
    setPhase(activity.phase ?? undefined);
    setName(activity.name ?? '');
    setDescription(activity.description ?? '');
    setType(activity.type ?? 'TASK');
    setStatus(activity.status ?? 'NOT_STARTED');
    setPlanStart(activity.planStartDate ? dayjs(activity.planStartDate) : null);
    setPlanEnd(activity.planEndDate ? dayjs(activity.planEndDate) : null);
    setActualStart(activity.startDate ? dayjs(activity.startDate) : null);
    setActualEnd(activity.endDate ? dayjs(activity.endDate) : null);
    setRoleId(activity.roleId ?? undefined);
    setExecutorIds(activity.executors?.map((e) => e.userId) ?? []);
    setNotes(activity.notes ?? '');
    if (activity.roleId) {
      roleMembersApi.preview(activity.roleId).then(({ data: preview }) => {
        setRoleUserIds((preview.members || []).map((m) => m.userId));
      }).catch(() => {});
    } else {
      setRoleUserIds(null);
    }
    const rawDeps = activity.dependencies;
    const deps = Array.isArray(rawDeps)
      ? rawDeps
      : (() => { try { return JSON.parse(rawDeps as unknown as string) as typeof rawDeps; } catch { return []; } })();
    setFormDeps((deps || []).map((d) => ({ id: d.id, type: d.type, lag: d.lag ?? 0 })));
  }, []);

  // 当编辑活动变更时重新填充表单
  React.useEffect(() => {
    if (visible) {
      if (editingActivity) {
        populateFormFromActivity(editingActivity);
      } else {
        setPlanDuration(null);
        setActualDuration(null);
        setFormDeps([]);
        setRoleUserIds(null);
        setName('');
        setDescription('');
        setType('TASK');
        setPhase(undefined);
        setStatus('NOT_STARTED');
        setPlanStart(null);
        setPlanEnd(null);
        setActualStart(null);
        setActualEnd(null);
        setRoleId(undefined);
        setNotes('');
        setErrors({});
        setExecutorIds(defaultAssigneeId ? [defaultAssigneeId] : []);
      }
    }
  }, [defaultAssigneeId, editingActivity, populateFormFromActivity, visible]);

  // 三方联动：计划时间
  const handlePlanChange = (changed: 'start' | 'end' | 'dur', value: dayjs.Dayjs | number | null) => {
    if (formDeps.some((d) => d.id)) {
      if (changed === 'dur') setPlanDuration(value as number | null);
      return;
    }
    let start = planStart;
    let end = planEnd;
    let dur = planDuration;
    if (changed === 'start') start = value as dayjs.Dayjs | null;
    else if (changed === 'end') end = value as dayjs.Dayjs | null;
    else dur = value as number | null;
    if (changed !== 'dur' && start && end && end.isBefore(start, 'day')) {
      setErrors((prev) => ({ ...prev, planDate: '结束时间不能早于开始时间' }));
      return;
    }
    setErrors((prev) => (prev.planDate ? { ...prev, planDate: '' } : prev));
    const result = resolveTriple({ start, end, dur }, changed);
    setPlanStart(result.start ?? null);
    setPlanEnd(result.end ?? null);
    setPlanDuration(result.dur);
  };

  // 三方联动：实际时间
  const handleActualChange = (changed: 'start' | 'end' | 'dur', value: dayjs.Dayjs | number | null) => {
    let start = actualStart;
    let end = actualEnd;
    let dur = actualDuration;
    if (changed === 'start') start = value as dayjs.Dayjs | null;
    else if (changed === 'end') end = value as dayjs.Dayjs | null;
    else dur = value as number | null;
    if (changed !== 'dur' && start && end && end.isBefore(start, 'day')) {
      setErrors((prev) => ({ ...prev, actualDate: '结束时间不能早于开始时间' }));
      return;
    }
    setErrors((prev) => (prev.actualDate ? { ...prev, actualDate: '' } : prev));
    const result = resolveTriple({ start, end, dur }, changed);
    setActualStart(result.start ?? null);
    setActualEnd(result.end ?? null);
    setActualDuration(result.dur);
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!phase) e.phase = '请选择阶段';
    if (!name.trim()) e.name = '请输入活动名称';
    if (!type) e.type = '请选择类型';
    setErrors((prev) => ({ ...prev, ...e, phase: e.phase || '', name: e.name || '', type: e.type || '' }));
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      const values: ActivityDrawerValues = {
        name,
        description,
        type,
        phase,
        status,
        planStart: planStart ?? undefined,
        planEnd: planEnd ?? undefined,
        actualStart: actualStart ?? undefined,
        actualEnd: actualEnd ?? undefined,
        roleId,
        executorIds,
        notes,
      };
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

  const depsLocked = formDeps.some((d) => d.id);
  const executorOptions = (roleUserIds !== null ? users.filter((u) => roleUserIds.includes(u.id)) : users).map(userToOption);

  return (
    <Sheet
      open={visible}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        onInteractOutside={(e) => e.preventDefault()}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[700px]"
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{editingActivity ? '编辑活动' : '新建活动'}</SheetTitle>
          <SheetDescription className="sr-only">活动</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {/* 第一行：阶段 + 活动名称 */}
          <div className="grid gap-3" style={{ gridTemplateColumns: '140px 1fr' }}>
            <Field label="阶段" required error={errors.phase}>
              <Select value={phase} onValueChange={(v) => { setPhase(v); setErrors((prev) => (prev.phase ? { ...prev, phase: '' } : prev)); }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  {PHASE_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      <Badge variant="outline" className={arcoBadgeClass(PHASE_COLOR[p])}>{p}</Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="活动名称" htmlFor="activity-name" required error={errors.name}>
              <Input
                id="activity-name"
                placeholder="请输入活动名称"
                value={name}
                onChange={(e) => { setName(e.target.value); setErrors((prev) => (prev.name ? { ...prev, name: '' } : prev)); }}
              />
            </Field>
          </div>

          {/* 描述 */}
          <Field label="描述" htmlFor="activity-desc">
            <Textarea
              id="activity-desc"
              placeholder="请输入描述"
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          {/* 类型 / 状态 / 角色 / 执行人 */}
          <div className="grid gap-3" style={{ gridTemplateColumns: '100px 100px 150px 1fr' }}>
            <Field label="类型" required error={errors.type}>
              <Select value={type} onValueChange={(v) => { setType(v); setErrors((prev) => (prev.type ? { ...prev, type: '' } : prev)); }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="类型" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIVITY_TYPE_MAP).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      <Badge variant="outline" className={arcoBadgeClass(v.color)}>{v.label}</Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="状态">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIVITY_STATUS_MAP).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      <Badge variant="outline" className={arcoBadgeClass(v.color)}>{v.label}</Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="角色">
              <Combobox
                options={roleOptions.map((r) => ({ value: r.id, label: r.name }))}
                value={roleId}
                onChange={handleRoleChange}
                placeholder="选择角色"
                searchPlaceholder="搜索角色…"
                allowClear
              />
            </Field>
            <Field label="执行人">
              <MultiSelect
                options={executorOptions}
                value={executorIds}
                onChange={setExecutorIds}
                placeholder={roleUserIds !== null ? '已按角色筛选' : '请选择角色后自动填入'}
              />
            </Field>
          </div>

          {/* 分隔线 */}
          <Separator />

          {/* 前置依赖 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[13px] font-medium">前置依赖</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFormDeps([...formDeps, { id: '', type: '0', lag: 0 }])}
              >
                <Plus className="size-4" />
                添加
              </Button>
            </div>
            {formDeps.length === 0 ? (
              <div className="text-muted-foreground py-1 text-[13px]">无前置依赖</div>
            ) : (
              formDeps.map((dep, idx) => (
                <div key={idx} className="grid items-center gap-2" style={{ gridTemplateColumns: '1fr 120px 80px 32px' }}>
                  <Combobox
                    options={activities
                      .filter((a) =>
                        (editingActivity ? a.id !== editingActivity.id : true) &&
                        !formDeps.some((d, di) => di !== idx && d.id === a.id)
                      )
                      .map((a) => ({
                        value: a.id,
                        label: `${String(activitySeqMap.get(a.id) || 0)} - ${a.name}`,
                      }))}
                    value={dep.id || undefined}
                    onChange={(v) => {
                      const next = [...formDeps];
                      next[idx] = { ...next[idx], id: v || '' };
                      setFormDeps(next);
                    }}
                    placeholder="选择活动"
                    searchPlaceholder="搜索活动…"
                    allowClear
                  />
                  <Select
                    value={dep.type}
                    onValueChange={(v) => {
                      const next = [...formDeps];
                      next[idx] = { ...next[idx], type: v };
                      setFormDeps(next);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DEPENDENCY_TYPE_MAP).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.fullLabel}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="relative">
                    <Input
                      type="number"
                      max={9999}
                      value={dep.lag}
                      onChange={(e) => {
                        const next = [...formDeps];
                        const n = e.target.value === '' ? 0 : Number(e.target.value);
                        next[idx] = { ...next[idx], lag: Number.isNaN(n) ? 0 : n };
                        setFormDeps(next);
                      }}
                      placeholder="延迟"
                      className="pr-7"
                    />
                    <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs">天</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-8"
                    aria-label="删除依赖"
                    onClick={() => setFormDeps(formDeps.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {depsLocked && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
              已设置前置依赖，计划开始/结束日期将由系统根据依赖关系自动计算。可设置工期辅助推算。
            </div>
          )}

          <span className="text-muted-foreground block text-[13px] font-medium">时间</span>
          {/* 计划时间 */}
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 100px' }}>
            <Field label="计划开始" error={errors.planDate}>
              <DatePickerField
                value={planStart ?? undefined}
                placeholder="开始日期"
                disabled={depsLocked}
                onChange={(d) => handlePlanChange('start', d)}
              />
            </Field>
            <Field label="计划结束">
              <DatePickerField
                value={planEnd ?? undefined}
                placeholder="结束日期"
                disabled={depsLocked}
                onChange={(d) => handlePlanChange('end', d)}
              />
            </Field>
            <Field label="计划工期(天)">
              <Input
                type="number"
                min={1}
                max={9999}
                value={planDuration ?? ''}
                onChange={(e) => handlePlanChange('dur', e.target.value === '' ? null : Number(e.target.value))}
                placeholder="计划工期"
              />
            </Field>
          </div>

          {/* 实际时间 */}
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 100px' }}>
            <Field label="实际开始" error={errors.actualDate}>
              <DatePickerField
                value={actualStart ?? undefined}
                placeholder="开始日期"
                onChange={(d) => handleActualChange('start', d)}
              />
            </Field>
            <Field label="实际结束">
              <DatePickerField
                value={actualEnd ?? undefined}
                placeholder="结束日期"
                onChange={(d) => handleActualChange('end', d)}
              />
            </Field>
            <Field label="实际工期(天)">
              <Input
                type="number"
                min={1}
                max={9999}
                value={actualDuration ?? ''}
                onChange={(e) => handleActualChange('dur', e.target.value === '' ? null : Number(e.target.value))}
                placeholder="实际工期"
              />
            </Field>
          </div>

          {/* 备注 */}
          <Field label="备注" htmlFor="activity-notes">
            <Textarea
              id="activity-notes"
              placeholder="请输入备注"
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          {/* 检查项 */}
          {editingActivity && (
            <div className="border-t pt-4">
              <CheckItems activityId={editingActivity.id} />
            </div>
          )}

          {/* 评论 & 变更历史 */}
          {editingActivity && (
            <div className="border-t pt-4">
              <ActivityComments activityId={editingActivity.id} />
            </div>
          )}
        </div>

        <SheetFooter className="flex-row items-center justify-between border-t px-6 py-4">
          <div>
            {!editingActivity && (
              <>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="size-4" />
                  批量导入
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={handleImportExcel}
                />
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={handleSubmit}>
              {editingActivity ? '保存' : '创建'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default ActivityDrawer;
