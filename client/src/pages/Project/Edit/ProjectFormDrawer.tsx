import React, { useEffect, useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import { Save, Users, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { projectsApi, usersApi, templatesApi } from '../../../api';
import { Project, User, ProjectTemplate } from '../../../types';
import {
  STATUS_MAP,
  PRIORITY_MAP,
  PRODUCT_LINE_MAP,
  PROJECT_MEMBER_ROLE_MAP,
  PROJECT_MEMBER_ROLE_KEYS,
} from '../../../utils/constants';
import { arcoBadgeClass } from '../../../utils/badgeColor';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { MultiSelect, type SelectOption } from '@/components/ui/multi-select';
import { DateRangePicker } from '@/components/ui/date-range-picker';

export const getUserLabel = (u: User) => u.realName || u.username || u.id.slice(0, 8);

type RoleKey = keyof typeof PROJECT_MEMBER_ROLE_MAP;

interface ProjectFormDrawerProps {
  visible: boolean;
  projectId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FormValues {
  name: string;
  description: string;
  productLine: string;
  status: string;
  priority: string;
  managerId?: string;
  templateId?: string;
}

const DEFAULTS: FormValues = {
  name: '',
  description: '',
  productLine: 'DANDELION',
  status: 'IN_PROGRESS',
  priority: 'MEDIUM',
  managerId: undefined,
  templateId: undefined,
};

const emptyRoleMap = (): Record<RoleKey, string[]> => {
  const init = {} as Record<RoleKey, string[]>;
  PROJECT_MEMBER_ROLE_KEYS.forEach((k) => {
    init[k] = [];
  });
  return init;
};

const userToOption = (u: User): SelectOption => ({
  value: u.id,
  label: getUserLabel(u),
  sublabel: u.username ? `(${u.username})` : undefined,
});

function Field({
  label,
  htmlFor,
  required,
  error,
  extra,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  extra?: string;
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
      {extra && !error && <p className="text-muted-foreground text-xs">{extra}</p>}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

const ProjectFormDrawer: React.FC<ProjectFormDrawerProps> = ({ visible, projectId, onClose, onSuccess }) => {
  const isCreate = !projectId;

  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [values, setValues] = useState<FormValues>(DEFAULTS);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [memberRoleMap, setMemberRoleMap] = useState<Record<RoleKey, string[]>>(emptyRoleMap);

  const managerId = values.managerId || '';

  const setField = <K extends keyof FormValues>(key: K, val: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => (prev[key as string] ? { ...prev, [key as string]: '' } : prev));
  };

  const memberCount = useMemo(() => {
    const set = new Set<string>();
    Object.values(memberRoleMap).forEach((ids) => ids.forEach((id) => set.add(id)));
    return set.size;
  }, [memberRoleMap]);

  const resetState = () => {
    setValues(DEFAULTS);
    setDateRange(undefined);
    setErrors({});
    setMemberRoleMap(emptyRoleMap());
  };

  const loadUsers = async () => {
    const res = await usersApi.list();
    setUsers((res.data.data || []).filter((u) => u.canLogin !== false || u.status !== 'DISABLED'));
  };

  const loadTemplates = async () => {
    if (!isCreate) return;
    try {
      const res = await templatesApi.list();
      setTemplates(res.data || []);
    } catch {
      // ignore
    }
  };

  const loadProject = async () => {
    if (isCreate || !projectId) return;
    setLoading(true);
    try {
      const res = await projectsApi.get(projectId);
      const project: Project = res.data;
      setValues({
        name: project.name,
        description: project.description || '',
        productLine: project.productLine,
        status: project.status,
        priority: project.priority,
        managerId: project.managerId,
        templateId: undefined,
      });
      setDateRange({
        from: dayjs(project.startDate).toDate(),
        to: project.endDate ? dayjs(project.endDate).toDate() : undefined,
      });

      const mres = await projectsApi.getMembers(projectId);
      const next = emptyRoleMap();
      for (const m of mres.data) {
        const role = (PROJECT_MEMBER_ROLE_KEYS as string[]).includes(m.role) ? (m.role as RoleKey) : 'OTHER';
        if (!next[role].includes(m.userId)) {
          next[role].push(m.userId);
        }
      }
      setMemberRoleMap(next);
    } catch {
      toast.error('加载项目信息失败');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    resetState();
    loadUsers();
    loadTemplates();
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, projectId]);

  const handleManagerChange = (newManagerId?: string) => {
    setField('managerId', newManagerId);
    if (newManagerId) {
      setMemberRoleMap((prev) => {
        const next = { ...prev };
        for (const k of PROJECT_MEMBER_ROLE_KEYS) {
          if (next[k].includes(newManagerId)) {
            next[k] = next[k].filter((id) => id !== newManagerId);
          }
        }
        return next;
      });
    }
  };

  const handleRoleMembersChange = (role: RoleKey, ids: string[]) => {
    setMemberRoleMap((prev) => ({ ...prev, [role]: ids }));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!values.name.trim()) e.name = '请输入项目名称';
    if (!values.productLine) e.productLine = '请选择产品线';
    if (!values.status) e.status = '请选择状态';
    if (!values.priority) e.priority = '请选择优先级';
    if (!dateRange?.from) e.dateRange = '请选择起止时间';
    else if (dateRange.from && dateRange.to && dayjs(dateRange.to).isBefore(dayjs(dateRange.from)))
      e.dateRange = '结束日期不能早于开始日期';
    if (!values.managerId) e.managerId = '请选择项目经理';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const data = {
        name: values.name,
        description: values.description,
        productLine: values.productLine,
        status: values.status,
        priority: values.priority,
        startDate: dayjs(dateRange!.from).format('YYYY-MM-DD'),
        endDate: dateRange!.to ? dayjs(dateRange!.to).format('YYYY-MM-DD') : undefined,
        managerId: values.managerId!,
      };

      const memberPayload: Array<{ userId: string; role: string }> = [];
      for (const role of PROJECT_MEMBER_ROLE_KEYS) {
        for (const uid of memberRoleMap[role]) {
          if (uid === values.managerId) continue;
          memberPayload.push({ userId: uid, role });
        }
      }

      let savedId = projectId;
      if (isCreate) {
        const res = await projectsApi.create(data);
        savedId = res.data.id;

        if (values.templateId) {
          try {
            const inst = await templatesApi.instantiate(values.templateId, {
              projectId: savedId,
              startDate: data.startDate,
            });
            toast.success(`项目已创建，并从模板生成 ${inst.data.count} 个活动`);
          } catch {
            toast.warning('项目已创建，但模板实例化失败');
          }
        } else {
          toast.success('项目创建成功');
        }
      } else {
        await projectsApi.update(projectId!, data);
        toast.success('项目更新成功');
      }

      if (savedId) {
        await projectsApi.replaceMembers(savedId, memberPayload);
      }

      onSuccess?.();
      onClose();
    } catch (e) {
      console.error('保存失败', e);
    } finally {
      setSaving(false);
    }
  };

  const managerOptions = users.map(userToOption);
  const memberOptions = users.filter((u) => u.id !== managerId).map(userToOption);

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
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[760px]"
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{isCreate ? '新建项目' : '编辑项目'}</SheetTitle>
        </SheetHeader>

        <div className="relative flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="bg-background/60 absolute inset-0 z-10 flex items-center justify-center">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          )}

          {/* 基础信息 */}
          <Card className="space-y-4 p-4">
            <div className="text-sm font-semibold">基础信息</div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="项目名称" htmlFor="project-name" required error={errors.name} className="col-span-2">
                <Input
                  id="project-name"
                  placeholder="请输入项目名称"
                  value={values.name}
                  onChange={(e) => setField('name', e.target.value)}
                />
              </Field>
              <Field label="产品线" required error={errors.productLine}>
                <Select value={values.productLine} onValueChange={(v) => setField('productLine', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="产品线" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRODUCT_LINE_MAP).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        <Badge variant="outline" className={arcoBadgeClass(value.color)}>
                          {value.label}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="项目描述" htmlFor="project-desc">
              <Textarea
                id="project-desc"
                placeholder="请输入项目描述"
                rows={3}
                maxLength={500}
                value={values.description}
                onChange={(e) => setField('description', e.target.value)}
              />
            </Field>

            {isCreate && templates.length > 0 && (
              <Field label="项目模板" extra="选择模板后，创建项目时将自动生成活动计划">
                <Combobox
                  options={templates.map((t) => ({
                    value: t.id,
                    label: t.name,
                    sublabel: t._count?.activities ? `${t._count.activities} 个活动` : undefined,
                  }))}
                  value={values.templateId}
                  onChange={(v) => setField('templateId', v)}
                  placeholder="选择模板（可选）"
                  allowClear
                />
              </Field>
            )}

            <div className="grid grid-cols-4 gap-3">
              <Field label="状态" required error={errors.status}>
                <Select value={values.status} onValueChange={(v) => setField('status', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="状态" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_MAP)
                      .filter(([key]) => key !== 'ARCHIVED')
                      .map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          <Badge variant="outline" className={arcoBadgeClass(value.color)}>
                            {value.label}
                          </Badge>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="优先级" required error={errors.priority}>
                <Select value={values.priority} onValueChange={(v) => setField('priority', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="优先级" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_MAP).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        <Badge variant="outline" className={arcoBadgeClass(value.color)}>
                          {value.label}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="计划周期" required error={errors.dateRange} className="col-span-2">
                <DateRangePicker value={dateRange} onChange={setDateRange} />
              </Field>
            </div>
          </Card>

          {/* 项目成员 */}
          <Card className="space-y-4 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4" />
              <span>项目成员（按角色分组）</span>
              <Badge variant="outline" className={arcoBadgeClass('arcoblue')}>
                {memberCount} 人
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="项目经理"
                required
                error={errors.managerId}
                extra="项目经理拥有项目的最高权限"
              >
                <Combobox
                  options={managerOptions}
                  value={values.managerId}
                  onChange={handleManagerChange}
                  placeholder="选择项目经理"
                  searchPlaceholder="搜索用户…"
                />
              </Field>
              <Field
                label={
                  <span>
                    项目协作者
                    <span className="text-muted-foreground ml-2 text-xs">{memberRoleMap.COLLABORATOR.length} 人</span>
                  </span>
                }
                extra="可选，跨角色的项目协作成员"
              >
                <MultiSelect
                  options={memberOptions}
                  value={memberRoleMap.COLLABORATOR}
                  onChange={(ids) => handleRoleMembersChange('COLLABORATOR', ids)}
                  placeholder="选择项目协作者"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t pt-4">
              {PROJECT_MEMBER_ROLE_KEYS.filter((k) => k !== 'COLLABORATOR').map((roleKey) => {
                const meta = PROJECT_MEMBER_ROLE_MAP[roleKey];
                const value = memberRoleMap[roleKey];
                return (
                  <div key={roleKey} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn('min-w-[90px] justify-center', arcoBadgeClass(meta.color))}
                      >
                        {meta.label}
                      </Badge>
                      <span className="text-muted-foreground text-xs">{value.length} 人</span>
                    </div>
                    <MultiSelect
                      options={memberOptions}
                      value={value}
                      onChange={(ids) => handleRoleMembersChange(roleKey, ids)}
                      placeholder={`选择${meta.label}`}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {isCreate ? '创建项目' : '保存修改'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default ProjectFormDrawer;
