import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Upload, Pencil, Trash2, CalendarIcon, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { riskItemsApi } from '../../../api';
import { RiskItem, RiskItemLog, RiskAssessment } from '../../../types';
import { RISK_LEVEL_MAP, RISK_ITEM_STATUS_MAP } from '../../../utils/constants';
import { getApiErrorMessage } from '../../../utils/apiError';
import { arcoBadgeClass } from '../../../utils/badgeColor';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props {
  projectId: string;
  latestAssessment?: RiskAssessment;
  isArchived?: boolean;
  projectMembers?: Array<{ id: string; realName: string }>;
}

const ALL = '__all__';
const OWNER_NONE = '__none__';

export { getApiErrorMessage };

function Field({
  label,
  required,
  error,
  children,
  className,
}: {
  label: React.ReactNode;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-sm">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

interface CreateForm {
  title: string;
  description: string;
  severity: string;
  ownerId: string;
  dueDate?: Date;
}

const EMPTY_CREATE: CreateForm = {
  title: '',
  description: '',
  severity: '',
  ownerId: '',
  dueDate: undefined,
};

const RiskItemsPanel: React.FC<Props> = ({ projectId, latestAssessment, isArchived, projectMembers = [] }) => {
  const [items, setItems] = useState<RiskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [createVisible, setCreateVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RiskItem | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [dueOpen, setDueOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const setField = <K extends keyof CreateForm>(k: K, v: CreateForm[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setFormErrors((p) => (p[k as string] ? { ...p, [k as string]: '' } : p));
  };

  const resetForm = () => {
    setForm(EMPTY_CREATE);
    setFormErrors({});
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof riskItemsApi.list>[0] = { projectId, pageSize: 50 };
      if (statusFilter) params.status = statusFilter;
      const res = await riskItemsApi.list(params);
      setItems(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch {
      toast.error('加载风险项失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = '请输入标题';
    if (!form.severity) e.severity = '请选择严重度';
    setFormErrors(e);
    if (Object.keys(e).length) return;
    try {
      await riskItemsApi.create({
        projectId,
        title: form.title,
        description: form.description || undefined,
        severity: form.severity,
        ownerId: form.ownerId || undefined,
        dueDate: form.dueDate ? dayjs(form.dueDate).format('YYYY-MM-DD') : undefined,
      });
      toast.success('创建成功');
      setCreateVisible(false);
      resetForm();
      load();
    } catch (error: unknown) {
      const message = getApiErrorMessage(error);
      if (message) toast.error(message);
    }
  };

  const handleImportFromAssessment = async () => {
    if (!latestAssessment) return;
    try {
      const res = await riskItemsApi.fromAssessment(latestAssessment.id);
      toast.success(`已导入 ${res.data.created} 个风险项`);
      load();
    } catch {
      toast.error('导入失败');
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await riskItemsApi.update(id, { status: newStatus });
      toast.success('状态已更新');
      load();
      if (selectedItem?.id === id) {
        loadDetail(id);
      }
    } catch {
      toast.error('更新失败');
    }
  };

  const handleDelete = (id: string) => {
    setDeleteTargetId(id);
  };

  const confirmDelete = async () => {
    const id = deleteTargetId;
    if (!id) return;
    try {
      await riskItemsApi.delete(id);
      toast.success('已删除');
      load();
      if (selectedItem?.id === id) setDetailVisible(false);
    } catch {
      toast.error('删除失败');
    } finally {
      setDeleteTargetId(null);
    }
  };

  const loadDetail = async (id: string) => {
    try {
      const res = await riskItemsApi.get(id);
      setSelectedItem(res.data);
      setDetailVisible(true);
    } catch {
      toast.error('加载详情失败');
    }
  };

  const handleComment = async () => {
    if (!selectedItem || !commentInput.trim()) return;
    try {
      await riskItemsApi.comment(selectedItem.id, commentInput.trim());
      setCommentInput('');
      loadDetail(selectedItem.id);
    } catch {
      toast.error('评论失败');
    }
  };

  const severityColor: Record<string, string> = {
    LOW: 'green',
    MEDIUM: 'orange',
    HIGH: 'red',
    CRITICAL: 'red',
  };

  const hasActionItems = latestAssessment?.aiEnhancedData?.actionItems &&
    latestAssessment.aiEnhancedData.actionItems.length > 0;

  return (
    <TooltipProvider>
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-muted-foreground text-sm font-medium">
            风险项管理
            {total > 0 && <span className="text-muted-foreground ml-2 text-xs font-normal">({total})</span>}
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter || ALL}
              onValueChange={(v) => setStatusFilter(v === ALL ? '' : v)}
            >
              <SelectTrigger className="w-[120px]" size="sm">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部状态</SelectItem>
                {Object.entries(RISK_ITEM_STATUS_MAP).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    {info.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isArchived && hasActionItems && (
              <Button variant="outline" size="sm" onClick={handleImportFromAssessment}>
                <Upload className="size-4" />
                从评估导入
              </Button>
            )}
            {!isArchived && (
              <Button size="sm" onClick={() => setCreateVisible(true)}>
                <Plus className="size-4" />
                新建
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">严重度</TableHead>
                <TableHead>标题</TableHead>
                <TableHead className="w-[90px]">负责人</TableHead>
                <TableHead className="w-[90px]">状态</TableHead>
                <TableHead className="w-[100px]">到期日</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <Loader2 className="text-muted-foreground mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground h-24 text-center">
                    暂无风险项
                  </TableCell>
                </TableRow>
              ) : (
                items.map((record) => {
                  const info = RISK_ITEM_STATUS_MAP[record.status as keyof typeof RISK_ITEM_STATUS_MAP];
                  return (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Badge variant="outline" className={arcoBadgeClass(severityColor[record.severity] || 'default')}>
                          {RISK_LEVEL_MAP[record.severity as keyof typeof RISK_LEVEL_MAP]?.label?.replace('风险', '') || record.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-primary cursor-pointer text-left hover:underline"
                          onClick={() => loadDetail(record.id)}
                        >
                          {record.title}
                        </button>
                      </TableCell>
                      <TableCell>{record.owner?.realName || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={arcoBadgeClass(info?.color || 'default')}>
                          {info?.label || record.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{record.dueDate ? dayjs(record.dueDate).format('MM-DD') : '-'}</TableCell>
                      <TableCell>
                        {!isArchived && (
                          <div className="flex items-center gap-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  aria-label="编辑"
                                  onClick={() => loadDetail(record.id)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>编辑</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-destructive size-8"
                                  aria-label="删除"
                                  onClick={() => handleDelete(record.id)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>删除</TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* 新建 Dialog */}
        <Dialog
          open={createVisible}
          onOpenChange={(o) => {
            if (!o) {
              setCreateVisible(false);
              resetForm();
            }
          }}
        >
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>新建风险项</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Field label="标题" required error={formErrors.title}>
                <Input
                  placeholder="风险项标题"
                  value={form.title}
                  onChange={(e) => setField('title', e.target.value)}
                />
              </Field>
              <Field label="描述">
                <Textarea
                  placeholder="详细描述"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                />
              </Field>
              <div className="flex gap-4">
                <Field label="严重度" required error={formErrors.severity} className="flex-1">
                  <Select value={form.severity} onValueChange={(v) => setField('severity', v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择严重度" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(RISK_LEVEL_MAP).map(([key, info]) => (
                        <SelectItem key={key} value={key}>
                          {info.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="负责人" className="flex-1">
                  <Select
                    value={form.ownerId || OWNER_NONE}
                    onValueChange={(v) => setField('ownerId', v === OWNER_NONE ? '' : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择负责人" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={OWNER_NONE}>未分配</SelectItem>
                      {projectMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.realName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="到期日">
                <Popover open={dueOpen} onOpenChange={setDueOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.dueDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 size-4 shrink-0" />
                      {form.dueDate ? dayjs(form.dueDate).format('YYYY-MM-DD') : '选择到期日'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.dueDate}
                      onSelect={(d) => {
                        setField('dueDate', d);
                        setDueOpen(false);
                      }}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
              </Field>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCreateVisible(false);
                  resetForm();
                }}
              >
                取消
              </Button>
              <Button onClick={handleCreate}>确定</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 详情抽屉 */}
        <Sheet open={detailVisible} onOpenChange={(o) => !o && setDetailVisible(false)}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]">
            <SheetHeader className="border-b px-6 py-4">
              <SheetTitle>{selectedItem?.title || '风险项详情'}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {selectedItem && (
                <div>
                  {/* Status + Severity */}
                  <div className="mb-4 flex items-center gap-2">
                    <Badge variant="outline" className={arcoBadgeClass(severityColor[selectedItem.severity] || 'default')}>
                      {RISK_LEVEL_MAP[selectedItem.severity as keyof typeof RISK_LEVEL_MAP]?.label || selectedItem.severity}
                    </Badge>
                    <Select
                      value={selectedItem.status}
                      onValueChange={(v) => handleStatusChange(selectedItem.id, v)}
                      disabled={isArchived}
                    >
                      <SelectTrigger className="w-[120px]" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(RISK_ITEM_STATUS_MAP).map(([key, info]) => (
                          <SelectItem key={key} value={key}>
                            {info.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Description */}
                  {selectedItem.description && (
                    <div className="text-muted-foreground mb-4 text-[13px] leading-relaxed">
                      {selectedItem.description}
                    </div>
                  )}

                  {/* Meta info */}
                  <div className="text-muted-foreground mb-4 space-y-0.5 text-xs">
                    <div>负责人: {selectedItem.owner?.realName || '未分配'}</div>
                    <div>来源: {selectedItem.source}</div>
                    <div>创建时间: {dayjs(selectedItem.createdAt).format('YYYY-MM-DD HH:mm')}</div>
                    {selectedItem.dueDate && <div>到期日: {dayjs(selectedItem.dueDate).format('YYYY-MM-DD')}</div>}
                    {selectedItem.resolvedAt && <div>解决时间: {dayjs(selectedItem.resolvedAt).format('YYYY-MM-DD HH:mm')}</div>}
                  </div>

                  {/* Timeline */}
                  <div className="mb-2 text-[13px] font-medium">活动记录</div>
                  {selectedItem.logs && selectedItem.logs.length > 0 ? (
                    <ol className="space-y-3">
                      {selectedItem.logs.map((log: RiskItemLog) => (
                        <li key={log.id} className="border-muted relative border-l pl-4">
                          <span className="bg-primary absolute top-1.5 -left-[3px] size-1.5 rounded-full" />
                          <div className="text-xs">
                            <span className="font-medium">{log.user?.realName || '系统'}</span>
                            <span className="text-muted-foreground ml-2">
                              {dayjs(log.createdAt).format('MM-DD HH:mm')}
                            </span>
                          </div>
                          <div className="text-muted-foreground mt-0.5 text-xs">{log.content}</div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="text-muted-foreground text-xs">暂无记录</div>
                  )}

                  {/* Comment input */}
                  {!isArchived && (
                    <div className="mt-4">
                      <Textarea
                        placeholder="添加评论..."
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        rows={2}
                      />
                      <Button
                        size="sm"
                        className="mt-2"
                        onClick={handleComment}
                        disabled={!commentInput.trim()}
                      >
                        发送
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* 删除确认 */}
        <AlertDialog open={!!deleteTargetId} onOpenChange={(o) => !o && setDeleteTargetId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除</AlertDialogTitle>
              <AlertDialogDescription>确定要删除该风险项吗？</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={confirmDelete}>
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
};

export default RiskItemsPanel;
