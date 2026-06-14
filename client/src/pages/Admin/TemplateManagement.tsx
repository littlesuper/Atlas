import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Copy, ChevronLeft, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import MainLayout from '../../layouts/MainLayout';
import { templatesApi, rolesApi } from '../../api';
import { ProjectTemplate, TemplateActivity, ActivityType } from '../../types';
import { ACTIVITY_TYPE_MAP, PHASE_OPTIONS, DEPENDENCY_TYPE_MAP } from '../../utils/constants';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { arcoBadgeClass } from '../../utils/badgeColor';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PHASE_COLOR: Record<string, string> = { EVT: 'blue', DVT: 'green', PVT: 'purple', MP: 'orange' };
const LABEL_TO_TYPE = Object.fromEntries(
  Object.entries(DEPENDENCY_TYPE_MAP).map(([k, v]) => [v.label, k])
);

const PHASE_NONE = '__none__';

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

interface ConfirmState {
  title: string;
  content: string;
  onOk: () => void | Promise<void>;
}

const TemplateManagement: React.FC = () => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [editing, setEditing] = useState<ProjectTemplate | null>(null);
  const [activities, setActivities] = useState<TemplateActivity[]>([]);
  const [saving, setSaving] = useState(false);
  const [roleOptions, setRoleOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await templatesApi.list();
      setTemplates(res.data);
    } catch {
      toast.error('加载模板列表失败');
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
        setName(full.name);
        setDescription(full.description || '');
        setErrors({});
        setActivities(full.activities || []);
      } catch {
        toast.error('加载模板详情失败');
        return;
      }
    } else {
      setEditing(null);
      setName('');
      setDescription('');
      setErrors({});
      setActivities([]);
    }
    setMode('edit');
  };

  const handleBack = () => {
    setMode('list');
    setEditing(null);
    setName('');
    setDescription('');
    setErrors({});
    setActivities([]);
  };

  const handleDelete = (tpl: ProjectTemplate) => {
    setConfirm({
      title: '确认删除',
      content: `确定要删除模板"${tpl.name}"吗？此操作不可恢复。`,
      onOk: async () => {
        try {
          await templatesApi.delete(tpl.id);
          toast.success('模板删除成功');
          loadTemplates();
        } catch {
          toast.error('模板删除失败');
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
      toast.success('模板复制成功');
      loadTemplates();
    } catch {
      toast.error('模板复制失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const e: Record<string, string> = {};
      if (!name.trim()) e.name = '请输入模板名称';
      setErrors(e);
      if (Object.keys(e).length) return;

      setSaving(true);

      const data = {
        name: name,
        description: description || undefined,
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
        toast.success('模板更新成功');
      } else {
        await templatesApi.create(data);
        toast.success('模板创建成功');
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

  // ---- 排序（上移/下移） ----

  const moveActivity = React.useCallback((fromIndex: number, targetIndex: number) => {
    if (fromIndex === -1 || fromIndex === targetIndex) return;
    setActivities((prev) => {
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const newList = [...prev];
      const [removed] = newList.splice(fromIndex, 1);
      newList.splice(targetIndex, 0, removed);
      return newList.map((a, i) => ({ ...a, sortOrder: i }));
    });
  }, []);

  return (
    <MainLayout>
      <TooltipProvider>
        {mode === 'edit' ? (
          <Sheet open onOpenChange={(o) => !o && handleBack()}>
            <SheetContent
              side="right"
              onInteractOutside={(e) => e.preventDefault()}
              className="flex w-full flex-col gap-0 p-0 sm:max-w-[760px]"
            >
              <SheetHeader className="border-b px-6 py-4">
                <SheetTitle>{editing ? `编辑模板 - ${editing.name}` : '新建模板'}</SheetTitle>
              </SheetHeader>

              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">
                      模板名称<span className="text-destructive ml-0.5">*</span>
                    </Label>
                    <Input
                      placeholder="如：标准路由器项目模板"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setErrors((p) => (p.name ? { ...p, name: '' } : p));
                      }}
                    />
                    {errors.name && <p className="text-destructive text-xs">{errors.name}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">描述</Label>
                    <Input
                      placeholder="模板描述（选填）"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm font-medium">活动列表（{activities.length}）</span>
                  <Button variant="outline" size="sm" onClick={addActivity}>
                    <Plus className="size-4" />
                    添加活动
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24" />
                        <TableHead className="w-16">ID</TableHead>
                        <TableHead className="w-52">活动名称</TableHead>
                        <TableHead className="w-28">类型</TableHead>
                        <TableHead className="w-28">阶段</TableHead>
                        <TableHead className="w-32">角色</TableHead>
                        <TableHead className="w-28">工期</TableHead>
                        <TableHead className="w-40">前置</TableHead>
                        <TableHead className="w-16">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activities.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-muted-foreground h-24 text-center">
                            暂无活动，点击上方"添加活动"开始构建模板
                          </TableCell>
                        </TableRow>
                      ) : (
                        activities.map((record, index) => (
                          <TableRow key={record.id}>
                            <TableCell>
                              <div className="flex items-center gap-0.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7"
                                      aria-label="上移"
                                      disabled={index === 0}
                                      onClick={() => moveActivity(index, index - 1)}
                                    >
                                      <ChevronUp className="size-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>上移</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7"
                                      aria-label="下移"
                                      disabled={index === activities.length - 1}
                                      onClick={() => moveActivity(index, index + 1)}
                                    >
                                      <ChevronDown className="size-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>下移</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7"
                                      aria-label="在下方插入活动"
                                      onClick={() => insertActivity(index + 1)}
                                    >
                                      <Plus className="size-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>在下方插入活动</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-muted-foreground font-mono">{getSeq(record)}</span>
                            </TableCell>
                            <TableCell>
                              <Input
                                key={record.id + '-name'}
                                defaultValue={record.name}
                                placeholder="活动名称"
                                onBlur={(e) => {
                                  const v = e.target.value;
                                  if (v !== record.name) updateActivity(record.id, 'name', v);
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={record.type}
                                onValueChange={(v) => updateActivity(record.id, 'type', v)}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(ACTIVITY_TYPE_MAP).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>
                                      <Badge variant="outline" className={arcoBadgeClass(v.color)}>{v.label}</Badge>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={record.phase || PHASE_NONE}
                                onValueChange={(v) => updateActivity(record.id, 'phase', v === PHASE_NONE ? null : v)}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="阶段" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={PHASE_NONE}>
                                    <span className="text-muted-foreground">无</span>
                                  </SelectItem>
                                  {PHASE_OPTIONS.map((p) => (
                                    <SelectItem key={p} value={p}>
                                      <Badge variant="outline" className={arcoBadgeClass(PHASE_COLOR[p])}>{p}</Badge>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Combobox
                                key={record.id + '-role'}
                                options={roleOptions.map((r) => ({ value: r.id, label: r.name }))}
                                value={record.roleId || undefined}
                                onChange={(v) => updateActivity(record.id, 'roleId', v || null)}
                                placeholder="角色"
                                searchPlaceholder="搜索角色…"
                                allowClear
                              />
                            </TableCell>
                            <TableCell>
                              <div className="relative">
                                <Input
                                  key={record.id + '-dur'}
                                  type="number"
                                  min={1}
                                  step={1}
                                  className="pr-8"
                                  defaultValue={record.planDuration ?? undefined}
                                  onBlur={(e) => {
                                    const v = e.target.value;
                                    updateActivity(record.id, 'planDuration', v !== '' && Number(v) > 0 ? Number(v) : null);
                                  }}
                                />
                                <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs">天</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                key={record.id + '-deps'}
                                defaultValue={getPredecessorSeq(record)}
                                placeholder="如: 3FS+2, 5"
                                className="font-mono text-xs"
                                onBlur={(e) => {
                                  const v = e.target.value;
                                  updateActivity(record.id, 'dependencies', parsePredecessorText(v, record.id));
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-destructive size-7"
                                    aria-label="删除"
                                    onClick={() => removeActivity(record.id)}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>删除</TooltipContent>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <SheetFooter className="flex-row justify-between gap-2 border-t px-6 py-4">
                <Button variant="ghost" onClick={handleBack}>
                  <ChevronLeft className="size-4" />
                  返回
                </Button>
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  {editing ? '保存' : '创建'}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ) : null}

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-sm">共 {templates.length} 个模板</span>
            <Button onClick={() => handleOpen()}>
              <Plus className="size-4" />
              新建模板
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-52">模板名称</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead className="w-24">活动数</TableHead>
                  <TableHead className="w-44">更新时间</TableHead>
                  <TableHead className="w-40 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : templates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground h-32 text-center">
                      暂无数据
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <span
                          className="text-primary cursor-pointer font-medium"
                          onClick={() => handleOpen(record)}
                        >
                          {record.name}
                        </span>
                      </TableCell>
                      <TableCell>{record.description || '-'}</TableCell>
                      <TableCell>{record._count?.activities ?? 0}</TableCell>
                      <TableCell>{dayjs(record.updatedAt).format('YYYY-MM-DD HH:mm')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8" aria-label="编辑" onClick={() => handleOpen(record)}>
                                <Pencil className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>编辑</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8" aria-label="复制" onClick={() => handleDuplicate(record)}>
                                <Copy className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>复制</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive size-8"
                                aria-label="删除"
                                onClick={() => handleDelete(record)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>删除</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirm?.content}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await confirm?.onOk();
                  setConfirm(null);
                }}
              >
                确定
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TooltipProvider>
    </MainLayout>
  );
};

export default TemplateManagement;
