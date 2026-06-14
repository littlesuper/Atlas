import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Pencil,
  Send,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { weeklyReportsApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { useReportPermission } from '../../hooks/useReportPermission';
import { WeeklyReport, ReportAttachment } from '../../types';
import AttachmentList from '../../components/AttachmentList';
import SafeHtml from '../../components/SafeHtml';
import { REPORT_STATUS_MAP, PROGRESS_STATUS_MAP } from '../../utils/constants';
import { arcoBadgeClass } from '../../utils/badgeColor';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { toast } from 'sonner';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
dayjs.extend(isoWeek);

interface Props {
  projectId: string;
  managerId?: string;
  collaboratingProjectIds?: string[];
  isArchived?: boolean;
  snapshotData?: WeeklyReport[] | null;
}

const progressIcon = (status: string) => {
  if (status === 'ON_TRACK') return <CheckCircle2 className="size-[18px] text-green-600 dark:text-green-400" />;
  if (status === 'MINOR_ISSUE') return <AlertTriangle className="size-[18px] text-amber-600 dark:text-amber-400" />;
  if (status === 'MAJOR_ISSUE') return <XCircle className="size-[18px] text-red-600 dark:text-red-400" />;
  return <span className="text-muted-foreground">?</span>;
};

const SECTION_PLACEHOLDER: Record<string, string> = {
  changeOverview: '<span style="color:var(--color-text-4)">-</span>',
  keyProgress: '<span style="color:var(--color-text-4)">暂无</span>',
  nextWeekPlan: '<span style="color:var(--color-text-4)">暂无</span>',
  riskWarning: '<span style="color:var(--status-success)">无</span>',
};

const SECTION_COLS: Array<{ key: keyof WeeklyReport; title: string; section?: string; wide?: boolean }> = [
  { key: 'changeOverview', title: '变更概述' },
  { key: 'keyProgress', title: '本周重要进展', section: 'keyProgress', wide: true },
  { key: 'nextWeekPlan', title: '下周工作计划', section: 'nextWeekPlan', wide: true },
  { key: 'riskWarning', title: '风险预警', section: 'riskWarning' },
];

const COLSPAN = 2 + SECTION_COLS.length + 1;

const ProjectWeeklyTab: React.FC<Props> = ({ projectId, managerId, isArchived, snapshotData }) => {
  const navigate = useNavigate();
  const { hasPermission, isProjectManager } = useAuthStore();
  const { canEdit: canEditReport, canDelete } = useReportPermission();
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; content: string; onOk: () => Promise<void> } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await weeklyReportsApi.getByProject(projectId);
      setReports(res.data || []);
    } catch {
      toast.error('加载周报列表失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (snapshotData) {
      setReports(snapshotData);
    } else {
      load();
    }
  }, [snapshotData, load]);

  const handleCreate = () => {
    navigate(`/weekly-reports/new?projectId=${projectId}`);
  };

  const handleSubmit = (report: WeeklyReport) => {
    setConfirm({
      title: '提交周报',
      content: `确定要提交第${report.weekNumber}周周报吗？提交后不可撤回。`,
      onOk: async () => {
        try {
          await weeklyReportsApi.submit(report.id);
          toast.success('周报提交成功');
          load();
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
          load();
        } catch {
          toast.error('删除失败');
        }
      },
    });
  };

  return (
    <TooltipProvider>
      <div>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-muted-foreground text-[13px]">共 {reports.length} 份周报</span>
          {!isArchived && hasPermission('weekly_report', 'create') && isProjectManager(managerId ?? '', projectId) && (
            <Button onClick={handleCreate}>
              <Plus className="size-4" />
              创建周报
            </Button>
          )}
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">周次</TableHead>
                <TableHead className="w-20">状态</TableHead>
                {SECTION_COLS.map((c) => (
                  <TableHead key={c.key as string} className={c.wide ? 'min-w-48' : 'w-44'}>
                    {c.title}
                  </TableHead>
                ))}
                <TableHead className="w-28 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={COLSPAN} className="h-24 text-center">
                    <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : reports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLSPAN} className="text-muted-foreground h-24 text-center">
                    暂无周报
                  </TableCell>
                </TableRow>
              ) : (
                reports.map((report) => {
                  const statusCfg =
                    REPORT_STATUS_MAP[report.status as keyof typeof REPORT_STATUS_MAP] ??
                    { label: report.status, color: 'default' };
                  const progressCfg =
                    PROGRESS_STATUS_MAP[report.progressStatus as keyof typeof PROGRESS_STATUS_MAP] ??
                    { label: report.progressStatus, color: 'default' };

                  return (
                    <TableRow key={report.id}>
                      <TableCell className="align-top">
                        <div className="font-medium">
                          {report.year} 年第 {report.weekNumber} 周
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {dayjs(report.weekStart).format('MM-DD')} ~ {dayjs(report.weekEnd).format('MM-DD')}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col items-start gap-1">
                          <div className="flex items-center gap-1.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">{progressIcon(report.progressStatus)}</span>
                              </TooltipTrigger>
                              <TooltipContent>{progressCfg.label}</TooltipContent>
                            </Tooltip>
                            <Badge variant="outline" className={arcoBadgeClass(statusCfg.color)}>
                              {statusCfg.label}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      {SECTION_COLS.map((col) => {
                        const html = (report[col.key] as string) || SECTION_PLACEHOLDER[col.key as string];
                        const sectionAtts = col.section
                          ? ((report.attachments as ReportAttachment[] | undefined) || []).filter(
                              (a) => a.section === col.section
                            )
                          : [];
                        return (
                          <TableCell key={col.key as string} className="align-top">
                            <div className="overflow-hidden">
                              <SafeHtml
                                className="html-content text-muted-foreground text-[13px]"
                                style={{ maxHeight: 80, overflow: 'hidden' }}
                                html={html}
                              />
                              {sectionAtts.length > 0 && col.section && (
                                <AttachmentList attachments={sectionAtts} section={col.section} readOnly />
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                      <TableCell className="align-top text-right">
                        {!isArchived && canEditReport(report) && (
                          <div className="flex justify-end gap-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  aria-label="编辑周报"
                                  onClick={() => navigate(`/weekly-reports/${report.id}/edit`)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>编辑</TooltipContent>
                            </Tooltip>
                            {report.status === 'DRAFT' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    aria-label="提交周报"
                                    onClick={() => handleSubmit(report)}
                                  >
                                    <Send className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>提交</TooltipContent>
                              </Tooltip>
                            )}
                            {canDelete(report) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-destructive size-8"
                                    aria-label="删除周报"
                                    onClick={() => handleDelete(report)}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>删除</TooltipContent>
                              </Tooltip>
                            )}
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
      </div>
    </TooltipProvider>
  );
};

export default ProjectWeeklyTab;
