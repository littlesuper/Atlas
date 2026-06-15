import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Send,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { toast } from 'sonner';
import MainLayout from '../../layouts/MainLayout';
import { weeklyReportsApi } from '../../api';
import { WeeklyReport, ReportAttachment } from '../../types';
import { useReportPermission } from '../../hooks/useReportPermission';
import AttachmentList from '../../components/AttachmentList';
import SafeHtml from '../../components/SafeHtml';
import { cn } from '@/lib/utils';
import { PRODUCT_LINE_MAP } from '../../utils/constants';
import { arcoBadgeClass } from '../../utils/badgeColor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

dayjs.extend(isoWeek);

const ALL = '__all__';

const progressIcon = (status: string) => {
  if (status === 'ON_TRACK') return <CheckCircle2 className="size-[18px] text-green-600 dark:text-green-400" />;
  if (status === 'MINOR_ISSUE') return <AlertTriangle className="size-[18px] text-amber-600 dark:text-amber-400" />;
  if (status === 'MAJOR_ISSUE') return <XCircle className="size-[18px] text-red-600 dark:text-red-400" />;
  return <span className="text-muted-foreground">?</span>;
};
const PROGRESS_TOOLTIP: Record<string, string> = {
  ON_TRACK: '正常',
  MINOR_ISSUE: '轻度阻碍',
  MAJOR_ISSUE: '严重阻碍',
};

/** 计算 ISO 周的日期范围 */
export const getWeekRange = (year: number, weekNumber: number) => {
  const d = dayjs().year(year).isoWeek(weekNumber).startOf('isoWeek' as dayjs.OpUnitType);
  return `${d.format('MM-DD')} ~ ${d.add(6, 'day').format('MM-DD')}`;
};

interface WeekGroup {
  key: string;
  year: number;
  weekNumber: number;
  label: string;
  reports: WeeklyReport[];
}

export function groupReportsByWeek(reports: WeeklyReport[]): WeekGroup[] {
  const map = new Map<string, WeeklyReport[]>();
  for (const r of reports) {
    const key = `${r.year}-${r.weekNumber}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  const groups: WeekGroup[] = [];
  for (const [key, groupReports] of map) {
    const [y, w] = key.split('-').map(Number);
    groupReports.sort((a, b) => (a.project?.name || '').localeCompare(b.project?.name || ''));
    groups.push({
      key,
      year: y,
      weekNumber: w,
      label: `${y} 年第 ${w} 周 · ${getWeekRange(y, w)}`,
      reports: groupReports,
    });
  }
  groups.sort((a, b) => (a.year !== b.year ? b.year - a.year : b.weekNumber - a.weekNumber));
  return groups;
}

const SECTION_PLACEHOLDER: Record<string, string> = {
  changeOverview: '<span style="color:var(--color-text-4)">-</span>',
  demandAnalysis: '<span style="color:var(--color-text-4)">-</span>',
  keyProgress: '<span style="color:var(--color-text-4)">暂无</span>',
  nextWeekPlan: '<span style="color:var(--color-text-4)">暂无</span>',
  riskWarning: '<span style="color:var(--status-success)">无</span>',
};

const WeeklyReportsSummary: React.FC = () => {
  const navigate = useNavigate();
  const { canEdit: canEditReport, canDelete } = useReportPermission();

  const [activeTab, setActiveTab] = useState<string>('submitted');
  const [currentWeek, setCurrentWeek] = useState<dayjs.Dayjs | null>(null);
  const [productLine, setProductLine] = useState<string>('');
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [drafts, setDrafts] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; content: string; onOk: () => Promise<void> } | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const weekStart = currentWeek?.startOf('isoWeek' as dayjs.OpUnitType);
  const weekEnd = weekStart?.add(6, 'day');
  const year = currentWeek?.year();
  const weekNumber = currentWeek?.isoWeek();

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { pageSize: 100 };
      if (productLine) params.productLine = productLine;
      const res = await weeklyReportsApi.list(params as Parameters<typeof weeklyReportsApi.list>[0]);
      setReports(res.data?.data || []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [productLine]);

  const loadDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const res = await weeklyReportsApi.getDrafts();
      setDrafts(res.data || []);
    } catch {
      setDrafts([]);
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (activeTab === 'drafts') {
      loadDrafts();
    }
  }, [activeTab, loadDrafts]);

  const handleSubmit = (report: WeeklyReport) => {
    setConfirm({
      title: '提交周报',
      content: `确定要提交第${report.weekNumber}周周报吗？提交后不可撤回。`,
      onOk: async () => {
        try {
          await weeklyReportsApi.submit(report.id);
          toast.success('周报提交成功');
          if (activeTab === 'drafts') loadDrafts();
          loadReports();
        } catch {
          toast.error('提交失败');
        }
      },
    });
  };

  const handleDelete = (report: WeeklyReport) => {
    setConfirm({
      title: '确认删除',
      content: `确定要删除第${report.weekNumber}周周报吗？`,
      onOk: async () => {
        try {
          await weeklyReportsApi.delete(report.id);
          toast.success('删除成功');
          if (activeTab === 'drafts') loadDrafts();
          else loadReports();
        } catch {
          toast.error('删除失败');
        }
      },
    });
  };

  const weekGroups = useMemo<WeekGroup[]>(() => groupReportsByWeek(reports), [reports]);
  const displayGroups = useMemo<WeekGroup[]>(
    () =>
      currentWeek && year !== undefined && weekNumber !== undefined
        ? weekGroups.filter((g) => g.year === year && g.weekNumber === weekNumber)
        : weekGroups,
    [weekGroups, currentWeek, year, weekNumber]
  );

  // 首次加载后默认定位到最新有周报的一周（groupReportsByWeek 已按年/周降序）
  const weekInitRef = useRef(false);
  useEffect(() => {
    if (weekInitRef.current || weekGroups.length === 0) return;
    weekInitRef.current = true;
    const latest = weekGroups[0];
    setCurrentWeek(dayjs().year(latest.year).isoWeek(latest.weekNumber));
  }, [weekGroups]);

  const SECTION_COLS: Array<{ key: keyof WeeklyReport; title: string; section?: string; wide?: boolean }> = [
    { key: 'changeOverview', title: '变更概述' },
    { key: 'demandAnalysis', title: '需求研判' },
    { key: 'keyProgress', title: '本周重要进展', section: 'keyProgress', wide: true },
    { key: 'nextWeekPlan', title: '下周工作计划', section: 'nextWeekPlan', wide: true },
    { key: 'riskWarning', title: '风险预警', section: 'riskWarning' },
  ];

  const renderActions = (record: WeeklyReport, mode: 'submitted' | 'drafts') =>
    mode === 'submitted' ? (
      canEditReport(record) && (
        <div className="flex justify-end gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="编辑周报" onClick={() => navigate(`/weekly-reports/${record.id}/edit`)}>
                <Pencil className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>编辑</TooltipContent>
          </Tooltip>
          {canDelete(record) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive size-8" aria-label="删除周报" onClick={() => handleDelete(record)}>
                  <Trash2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除</TooltipContent>
            </Tooltip>
          )}
        </div>
      )
    ) : (
      <div className="flex justify-end gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="编辑草稿" onClick={() => navigate(`/weekly-reports/${record.id}/edit`)}>
              <Pencil className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>编辑</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="提交周报" onClick={() => handleSubmit(record)}>
              <Send className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>提交</TooltipContent>
        </Tooltip>
        {canDelete(record) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive size-8" aria-label="删除草稿" onClick={() => handleDelete(record)}>
                <Trash2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>删除</TooltipContent>
          </Tooltip>
        )}
      </div>
    );

  const renderReportRow = (record: WeeklyReport, mode: 'submitted' | 'drafts') => {
    const expanded = !collapsedIds.has(record.id);
    const pl = record.project?.productLine || '';
    const cfg = PRODUCT_LINE_MAP[pl as keyof typeof PRODUCT_LINE_MAP] ?? { label: pl || '-', color: 'default' };
    return (
      <React.Fragment key={record.id}>
        <TableRow className="cursor-pointer" data-state={expanded ? 'open' : undefined} onClick={() => toggleExpand(record.id)}>
          <TableCell className="pr-0">
            <ChevronRight className={cn('text-muted-foreground size-4 shrink-0 transition-transform', expanded && 'rotate-90')} />
          </TableCell>
          <TableCell>
            <button
              className="text-primary cursor-pointer text-left font-medium hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/projects/${record.projectId}?tab=weekly`);
              }}
            >
              {record.project?.name || '-'}
            </button>
          </TableCell>
          <TableCell>
            <Badge variant="outline" className={arcoBadgeClass(cfg.color)}>
              {cfg.label}
            </Badge>
          </TableCell>
          <TableCell>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">{progressIcon(record.progressStatus)}</span>
              </TooltipTrigger>
              <TooltipContent>{PROGRESS_TOOLTIP[record.progressStatus] || record.progressStatus}</TooltipContent>
            </Tooltip>
          </TableCell>
          <TableCell className="text-muted-foreground text-[13px] whitespace-nowrap">第 {record.weekNumber} 周</TableCell>
          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
            {renderActions(record, mode)}
          </TableCell>
        </TableRow>
        {expanded && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={COLSPAN} className="bg-muted/30 p-0">
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 px-6 py-4 lg:grid-cols-2">
                {SECTION_COLS.map((col) => {
                  const html = (record[col.key] as string) || SECTION_PLACEHOLDER[col.key as string];
                  const sectionAtts = col.section
                    ? ((record.attachments as ReportAttachment[] | undefined) || []).filter((a) => a.section === col.section)
                    : [];
                  return (
                    <div key={col.key as string} className="min-w-0">
                      <div className="text-muted-foreground mb-1 text-xs font-semibold">{col.title}</div>
                      <SafeHtml className="html-content text-sm break-words" html={html} />
                      {sectionAtts.length > 0 && col.section && (
                        <AttachmentList attachments={sectionAtts} section={col.section} readOnly />
                      )}
                    </div>
                  );
                })}
              </div>
            </TableCell>
          </TableRow>
        )}
      </React.Fragment>
    );
  };

  const ReportTableHead = () => (
    <TableHeader>
      <TableRow>
        <TableHead className="w-9" />
        <TableHead>项目名称</TableHead>
        <TableHead className="w-32">产品线</TableHead>
        <TableHead className="w-20">状态</TableHead>
        <TableHead className="w-24">周次</TableHead>
        <TableHead className="w-28 text-right">操作</TableHead>
      </TableRow>
    </TableHeader>
  );

  const COLSPAN = 6;

  return (
    <MainLayout>
      <TooltipProvider>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="submitted">已提交周报</TabsTrigger>
            <TabsTrigger value="drafts">草稿箱</TabsTrigger>
          </TabsList>

          <TabsContent value="submitted" className="mt-4">
            {/* 周次/产品线筛选：tab 下方单独一行右对齐（与 AI管理「新建配置」布局一致） */}
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                {/* 周次选择器 */}
                <div className="bg-muted flex items-center gap-1 rounded-md p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="上一周"
                    onClick={() => setCurrentWeek((d) => (d ? d.subtract(1, 'week') : dayjs().subtract(1, 'week')))}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <button
                    type="button"
                    className="hover:text-foreground h-7 w-32 text-center text-sm font-normal"
                    onClick={() => setCurrentWeek((d) => (d ? null : dayjs()))}
                    title={currentWeek ? '点击查看全部周次' : '点击回到本周'}
                  >
                    {currentWeek ? `${year} 第 ${weekNumber} 周` : '全部周次'}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="下一周"
                    onClick={() => setCurrentWeek((d) => (d ? d.add(1, 'week') : dayjs().add(1, 'week')))}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>

                {currentWeek && weekStart && weekEnd && (
                  <span className="text-muted-foreground text-[13px]">
                    {weekStart.format('MM-DD')} ~ {weekEnd.format('MM-DD')}
                  </span>
                )}

                {/* 产品线筛选 */}
                <Select value={productLine || ALL} onValueChange={(v) => setProductLine(v === ALL ? '' : v)}>
                  <SelectTrigger className="w-44" size="sm">
                    <SelectValue placeholder="全部产品线" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>全部产品线</SelectItem>
                    {Object.entries(PRODUCT_LINE_MAP).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
            </div>

              {displayGroups.length === 0 && !loading ? (
                <div className="text-muted-foreground py-12 text-center text-sm">
                  {currentWeek ? '该周暂无周报' : '暂无周报'}
                </div>
              ) : (
                displayGroups.map((group) => (
                  <div key={group.key} className="mb-6">
                    {/* 选中单周时，周次已由上方选择器标识，无需重复分组标题；仅“全部周次”时显示 */}
                    {!currentWeek && (
                      <div className="mb-2 border-b pb-1.5 text-sm font-semibold">{group.label}</div>
                    )}
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <ReportTableHead />
                        <TableBody>{group.reports.map((r) => renderReportRow(r, 'submitted'))}</TableBody>
                      </Table>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="drafts" className="mt-4">
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <ReportTableHead />
                  <TableBody>
                    {drafts.length === 0 && !draftsLoading ? (
                      <TableRow>
                        <TableCell colSpan={COLSPAN} className="text-muted-foreground h-24 text-center">
                          暂无草稿
                        </TableCell>
                      </TableRow>
                    ) : (
                      drafts.map((r) => renderReportRow(r, 'drafts'))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
        </Tabs>

        <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirm?.content}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
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
      </TooltipProvider>
    </MainLayout>
  );
};

export default WeeklyReportsSummary;
