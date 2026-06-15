import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { holidaysApi, Holiday, HolidaySource, SourceStatusResult } from '../../api';
import { cn } from '@/lib/utils';
import { arcoBadgeClass } from '../../utils/badgeColor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

const HOLIDAY_TYPE_MAP: Record<Holiday['type'], { label: string; color: string }> = {
  HOLIDAY: { label: '放假', color: 'red' },
  MAKEUP: { label: '调休补班', color: 'orange' },
};

const SOURCE_TAG_MAP: Record<HolidaySource, { label: string; color: string }> = {
  OFFICIAL_API: { label: '官方源', color: 'arcoblue' },
  BUILT_IN: { label: '系统内置', color: 'gray' },
  ALGORITHM: { label: '⚠ 算法推算', color: 'orange' },
  MANUAL_INPUT: { label: '手动录入', color: 'green' },
};

export const computeYearOptions = (
  currentYear: number,
  knownYears: number[],
  data: Holiday[],
): number[] => {
  const years = new Set<number>();
  for (let y = currentYear - 1; y <= currentYear + 5; y++) years.add(y);
  knownYears.forEach((y) => years.add(y));
  data.forEach((d) => years.add(d.year));
  return Array.from(years).sort((a, b) => a - b);
};

export const formatHolidayDate = (date: string | dayjs.Dayjs): string =>
  typeof date === 'string' ? date : dayjs(date).format('YYYY-MM-DD');

interface FormValues {
  date: string | dayjs.Dayjs | null;
  name: string;
  type: Holiday['type'];
}
const EMPTY_FORM: FormValues = { date: null, name: '', type: 'HOLIDAY' };

const HolidayManagement: React.FC = () => {
  const currentYear = dayjs().year();
  const [yearFilter, setYearFilter] = useState<number>(currentYear);
  const [data, setData] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [knownYears, setKnownYears] = useState<number[]>([]);
  const [sourceStatus, setSourceStatus] = useState<SourceStatusResult | null>(null);
  const [sourceStatusLoading, setSourceStatusLoading] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const setField = <K extends keyof FormValues>(k: K, v: FormValues[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setFormErrors((p) => (p[k as string] ? { ...p, [k as string]: '' } : p));
  };

  const [generateVisible, setGenerateVisible] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateYear, setGenerateYear] = useState<string>(String(currentYear));
  const [generateError, setGenerateError] = useState<string>('');

  const [confirm, setConfirm] = useState<{ title: string; content: string; onOk: () => void } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await holidaysApi.list({ year: yearFilter });
      setData(res.data);
    } catch {
      // 错误已由请求拦截器统一提示
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

  const loadKnownYears = async () => {
    try {
      const res = await holidaysApi.knownYears();
      setKnownYears(res.data.knownYears);
    } catch {
      // ignore
    }
  };

  const loadSourceStatus = useCallback(async () => {
    setSourceStatusLoading(true);
    try {
      const res = await holidaysApi.sourceStatus(yearFilter);
      setSourceStatus(res.data);
    } catch {
      setSourceStatus(null);
    } finally {
      setSourceStatusLoading(false);
    }
  }, [yearFilter]);

  useEffect(() => {
    loadKnownYears();
  }, []);

  useEffect(() => {
    load();
    loadSourceStatus();
  }, [yearFilter, load, loadSourceStatus]);

  const yearOptions = useMemo(() => {
    return computeYearOptions(currentYear, knownYears, data);
  }, [currentYear, knownYears, data]);

  const handleOpenModal = (holiday?: Holiday) => {
    setFormErrors({});
    if (holiday) {
      setEditing(holiday);
      setForm({
        date: holiday.date,
        name: holiday.name,
        type: holiday.type,
      });
    } else {
      setEditing(null);
      setForm({ date: null, name: '', type: 'HOLIDAY' });
    }
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    const e: Record<string, string> = {};
    if (!form.date) e.date = '请选择日期';
    if (!form.name.trim()) e.name = '请输入名称';
    if (!form.type) e.type = '请选择类型';
    setFormErrors(e);
    if (Object.keys(e).length) return;

    try {
      const payload = {
        date: formatHolidayDate(form.date as string | dayjs.Dayjs),
        name: form.name,
        type: form.type,
      };

      if (editing) {
        await holidaysApi.update(editing.id, payload);
        toast.success('节假日已更新');
      } else {
        await holidaysApi.create(payload);
        toast.success('节假日已新增');
      }
      setModalVisible(false);
      load();
    } catch {
      // Form validate error or API error already handled by interceptor
    }
  };

  const handleDelete = async (holiday: Holiday) => {
    try {
      await holidaysApi.delete(holiday.id);
      toast.success('已删除');
      load();
    } catch {
      // ignore
    }
  };

  const handleGenerate = async (year: number) => {
    const existing = data.length;
    if (existing > 0) {
      return new Promise<boolean>((resolve) => {
        setConfirm({
          title: '确认覆盖',
          content: `${year} 年已有 ${existing} 条数据，确认覆盖吗？手动添加的记录也会被清除。`,
          onOk: async () => {
            const result = await doGenerate(year, true);
            resolve(result);
          },
        });
      });
    } else {
      return doGenerate(year, false);
    }
  };

  const doGenerate = async (year: number, overwrite: boolean): Promise<boolean> => {
    setGenerating(true);
    try {
      const res = await holidaysApi.generate(year, overwrite, true);
      const result = res.data;

      if (result.source === 'OFFICIAL_API') {
        toast.success(`已从官方源生成 ${result.count} 条数据`);
      } else {
        toast.warning(`已使用系统内置数据生成 ${result.count} 条`);
      }

      if (result.warning) {
        toast.warning(result.warning, { description: '数据源回退', duration: Infinity });
      }

      setGenerateVisible(false);
      setGenerateYear(String(currentYear));
      setGenerateError('');
      setYearFilter(year);
      loadKnownYears();
      load();
      return true;
    } catch {
      return false;
    } finally {
      setGenerating(false);
    }
  };

  const handleClearYear = async () => {
    try {
      await holidaysApi.deleteYear(yearFilter);
      toast.success(`${yearFilter} 年节假日已清空`);
      load();
      loadSourceStatus();
    } catch {
      // ignore
    }
  };

  const renderBanner = () => {
    if (sourceStatusLoading) {
      return <Loader2 className="text-muted-foreground mr-2 size-4 animate-spin" />;
    }
    if (!sourceStatus) return null;

    const { officialAvailable, officialPapers, builtInAvailable, existing } = sourceStatus;

    if (officialAvailable) {
      return (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
          <span>
            已检测到 {yearFilter} 年官方数据（holiday-cn，共 {sourceStatus.officialDaysCount} 天）
            {officialPapers.length > 0 && (
              <>
                {' '}依据：
                <a
                  href={officialPapers[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  查看原文
                </a>
              </>
            )}
            {existing > 0 && (
              <span className="text-muted-foreground ml-2">（当前已有 {existing} 条数据）</span>
            )}
          </span>
        </div>
      );
    }

    if (builtInAvailable || existing > 0) {
      return (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <span>暂时无法连接官方数据源，可使用系统内置数据生成</span>
          <Button size="sm" variant="outline" onClick={loadSourceStatus}>
            重试
          </Button>
        </div>
      );
    }

    return (
      <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
        {`${yearFilter} 年数据暂未发布（国务院通常于每年 11 月公布次年安排），可手动新增`}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {renderBanner()}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>年份：</span>
            <Select value={String(yearFilter)} onValueChange={(v) => setYearFilter(Number(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground text-[13px]">共 {data.length} 条</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setGenerateVisible(true)}>
              <RefreshCw className="size-4" />
              按年生成
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                setConfirm({
                  title: '清空当年',
                  content: `确认清空 ${yearFilter} 年所有节假日？`,
                  onOk: handleClearYear,
                })
              }
            >
              清空当年
            </Button>
            <Button onClick={() => handleOpenModal()}>
              <Plus className="size-4" />
              新增节假日
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">日期</TableHead>
                <TableHead className="w-[200px]">名称</TableHead>
                <TableHead className="w-[120px]">类型</TableHead>
                <TableHead className="w-[140px]">来源</TableHead>
                <TableHead className="w-[120px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground h-32 text-center">
                    暂无数据
                  </TableCell>
                </TableRow>
              ) : (
                data.map((record) => {
                  const typeCfg = HOLIDAY_TYPE_MAP[record.type];
                  const srcCfg = SOURCE_TAG_MAP[record.source] || { label: record.source, color: 'gray' };
                  const sourceTag = (
                    <Badge variant="outline" className={arcoBadgeClass(srcCfg.color)}>
                      {srcCfg.label}
                    </Badge>
                  );
                  return (
                    <TableRow key={record.id}>
                      <TableCell>
                        <span>
                          {record.date}{' '}
                          <span className="text-muted-foreground text-xs">
                            {dayjs(record.date).format('ddd')}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>{record.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={arcoBadgeClass(typeCfg.color)}>
                          {typeCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {record.sourceUrl ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={record.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="no-underline"
                              >
                                {sourceTag}
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>
                              <span>
                                点击查看原文
                                <br />
                                {record.sourceUrl}
                              </span>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          sourceTag
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label="编辑"
                                onClick={() => handleOpenModal(record)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>编辑</TooltipContent>
                          </Tooltip>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive size-8"
                            aria-label="删除"
                            onClick={() =>
                              setConfirm({
                                title: '确认删除',
                                content: '确认删除该节假日？',
                                onOk: () => handleDelete(record),
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* 编辑/新增 */}
        <Dialog open={modalVisible} onOpenChange={(o) => !o && setModalVisible(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? '编辑节假日' : '新增节假日'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">
                  日期<span className="text-destructive ml-0.5">*</span>
                </Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      <CalendarIcon className="mr-2 size-4" />
                      {form.date ? formatHolidayDate(form.date) : '选择日期'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.date ? dayjs(formatHolidayDate(form.date)).toDate() : undefined}
                      onSelect={(d) => {
                        setField('date', d ? dayjs(d).format('YYYY-MM-DD') : null);
                        setDatePickerOpen(false);
                      }}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
                {formErrors.date && <p className="text-destructive text-xs">{formErrors.date}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">
                  名称<span className="text-destructive ml-0.5">*</span>
                </Label>
                <Input
                  placeholder="如：春节、劳动节调休补班"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                />
                {formErrors.name && <p className="text-destructive text-xs">{formErrors.name}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">
                  类型<span className="text-destructive ml-0.5">*</span>
                </Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setField('type', v as Holiday['type'])}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOLIDAY">放假（HOLIDAY）</SelectItem>
                    <SelectItem value="MAKEUP">调休补班（MAKEUP）</SelectItem>
                  </SelectContent>
                </Select>
                {formErrors.type && <p className="text-destructive text-xs">{formErrors.type}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalVisible(false)}>
                取消
              </Button>
              <Button onClick={handleSubmit}>确定</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 按年生成 */}
        <Dialog open={generateVisible} onOpenChange={(o) => !o && setGenerateVisible(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>按年生成节假日</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                优先从 holiday-cn 获取官方数据。若该年已有数据，生成前需确认覆盖。
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">
                  年份<span className="text-destructive ml-0.5">*</span>
                </Label>
                <Input
                  type="number"
                  placeholder="如 2026"
                  value={generateYear}
                  onChange={(e) => {
                    setGenerateYear(e.target.value);
                    if (generateError) setGenerateError('');
                  }}
                />
                {generateError && <p className="text-destructive text-xs">{generateError}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setGenerateVisible(false)}>
                  取消
                </Button>
                <Button
                  disabled={generating}
                  onClick={async () => {
                    const trimmed = generateYear.trim();
                    if (!trimmed) {
                      setGenerateError('请输入年份');
                      return;
                    }
                    const year = Number(trimmed);
                    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
                      setGenerateError('年份须在 2020 ~ 2100 之间');
                      return;
                    }
                    setGenerateError('');
                    await handleGenerate(year);
                  }}
                >
                  {generating && <Loader2 className="size-4 animate-spin" />}
                  生成
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirm?.content}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                className={cn(confirm?.title === '确认删除' && 'bg-destructive text-white hover:bg-destructive/90')}
                onClick={() => {
                  confirm?.onOk();
                  setConfirm(null);
                }}
              >
                确定
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
};

export default HolidayManagement;
