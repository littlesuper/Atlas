import React, { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { activitiesApi } from '../../../api';
import { Activity, ResourceConflict, WhatIfResult, AiScheduleSuggestion } from '../../../types';
import { cn } from '@/lib/utils';
import { arcoBadgeClass } from '../../../utils/badgeColor';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

export const getDateColorHelper = (original: string | null, newDate: string | null) => {
  if (!original || !newDate) return 'rgb(var(--warning-6))';
  return dayjs(newDate).isBefore(dayjs(original)) ? 'rgb(var(--success-6))' : 'rgb(var(--warning-6))';
};

// Arco 色名 → shadcn Badge className
const Tag = ({ color, label, className }: { color?: string; label: React.ReactNode; className?: string }) => (
  <Badge variant="outline" className={cn(arcoBadgeClass(color), className)}>
    {label}
  </Badge>
);

interface SchedulingToolsProps {
  projectId: string;
  activities: Activity[];
  onRefresh: () => void;
  isArchived?: boolean;
}

const SchedulingTools: React.FC<SchedulingToolsProps> = ({ projectId, activities, onRefresh, isArchived }) => {
  // Resource conflicts
  const [conflicts, setConflicts] = useState<ResourceConflict[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [conflictsLoaded, setConflictsLoaded] = useState(false);

  // What-if
  const [whatIfActivityId, setWhatIfActivityId] = useState<string>('');
  const [whatIfDays, setWhatIfDays] = useState<number>(5);
  const [whatIfDirection, setWhatIfDirection] = useState<'delay' | 'advance'>('delay');
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | null>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);

  // AI suggestions
  const [aiResult, setAiResult] = useState<AiScheduleSuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // 确认弹窗（替代 Modal.confirm）
  const [confirmState, setConfirmState] = useState<{
    title: string;
    content: string;
    onOk: () => void | Promise<void>;
  } | null>(null);

  // Non-completed activities for what-if dropdown
  const activeActivities = activities.filter(
    (a) => a.status !== 'COMPLETED' && a.status !== 'CANCELLED'
  );

  // ---- Resource conflict detection ----
  const [conflictScope, setConflictScope] = useState<'project' | 'all'>('all');

  const loadConflicts = useCallback(async () => {
    setConflictsLoading(true);
    try {
      const params = conflictScope === 'project' ? { projectId } : undefined;
      const res = await activitiesApi.getResourceConflicts(params);
      setConflicts(res.data || []);
      setConflictsLoaded(true);
    } catch {
      toast.error('加载资源冲突失败');
    } finally {
      setConflictsLoading(false);
    }
  }, [projectId, conflictScope]);

  // ---- What-if simulation ----
  const runWhatIf = async () => {
    if (!whatIfActivityId) {
      toast.warning('请选择要模拟的活动');
      return;
    }
    setWhatIfLoading(true);
    try {
      const days = whatIfDirection === 'advance' ? -whatIfDays : whatIfDays;
      const res = await activitiesApi.whatIf(projectId, whatIfActivityId, days);
      setWhatIfResult(res.data);
    } catch {
      toast.error('模拟失败');
    } finally {
      setWhatIfLoading(false);
    }
  };

  // ---- Apply what-if results ----
  const handleApplyWhatIf = () => {
    if (!whatIfResult || whatIfResult.affected.length === 0) return;
    setConfirmState({
      title: '确认应用模拟结果',
      content: `此操作将先归档当前活动快照，然后批量更新 ${whatIfResult.affected.length} 个活动的计划日期。是否继续？`,
      onOk: async () => {
        setApplyLoading(true);
        try {
          const affected = whatIfResult.affected.map((a) => ({
            id: a.id,
            newStart: a.newStart,
            newEnd: a.newEnd,
          }));
          const label = `What-If 模拟应用 (${whatIfDirection === 'advance' ? '提前' : '延期'} ${whatIfDays} 工作日)`;
          await activitiesApi.applyWhatIf(projectId, affected, label);
          toast.success('模拟结果已成功应用');
          setWhatIfResult(null);
          onRefresh();
        } catch {
          toast.error('应用模拟结果失败');
        } finally {
          setApplyLoading(false);
        }
      },
    });
  };

  // ---- AI scheduling suggestions ----
  const runAiSchedule = async () => {
    setAiLoading(true);
    try {
      const res = await activitiesApi.getAiSchedule(projectId);
      setAiResult(res.data);
    } catch {
      toast.error('AI 排期建议获取失败');
    } finally {
      setAiLoading(false);
    }
  };

  const getDateColor = getDateColorHelper;

  return (
    <div className="flex flex-col gap-4">
      {/* Resource conflict detection */}
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-base">资源冲突检测</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <p className="text-muted-foreground mb-3 text-sm">
            检测同一人员在同一时间段被分配到多个活动的冲突情况，支持跨项目全局检测。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border p-0.5">
              <Button
                type="button"
                size="sm"
                variant={conflictScope === 'all' ? 'default' : 'ghost'}
                className="h-7"
                onClick={() => { setConflictScope('all'); setConflictsLoaded(false); setConflicts([]); }}
              >
                所有项目
              </Button>
              <Button
                type="button"
                size="sm"
                variant={conflictScope === 'project' ? 'default' : 'ghost'}
                className="h-7"
                onClick={() => { setConflictScope('project'); setConflictsLoaded(false); setConflicts([]); }}
              >
                仅当前项目
              </Button>
            </div>
            <Button onClick={loadConflicts} disabled={conflictsLoading}>
              {conflictsLoading && <Loader2 className="size-4 animate-spin" />}
              {conflictsLoaded ? '刷新检测' : '开始检测'}
            </Button>
          </div>

          {conflictsLoaded && (
            <div className="mt-3">
              {conflicts.length === 0 ? (
                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
                  未发现资源冲突
                </div>
              ) : (
                <>
                  <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    {`发现 ${conflicts.length} 个人员存在时间冲突`}
                  </div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">人员</TableHead>
                          <TableHead>冲突活动</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {conflicts.map((row) => (
                          <TableRow key={row.userId}>
                            <TableCell>
                              <span className="font-medium">{row.realName}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                {row.activities.map((a) => {
                                  const isOtherProject = a.projectId !== projectId;
                                  return (
                                    <div key={a.id} className="text-xs">
                                      <Tag
                                        color={isOtherProject ? 'orange' : 'blue'}
                                        label={a.projectName}
                                        className="mr-1 px-1.5 py-0 text-[11px]"
                                      />
                                      <span>{a.name}</span>
                                      <span className="text-muted-foreground ml-2">
                                        {dayjs(a.planStartDate).format('MM-DD')} ~ {dayjs(a.planEndDate).format('MM-DD')}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* What-if simulation */}
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-base">What-If 模拟</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <p className="text-muted-foreground mb-3 text-sm">
            模拟某个活动延期或提前完成后对下游依赖活动和项目整体结束日期的影响（不会实际修改数据）。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Combobox
              options={activeActivities.map((a) => ({ value: a.id, label: a.name }))}
              value={whatIfActivityId || undefined}
              onChange={(v) => setWhatIfActivityId(v || '')}
              placeholder="选择要模拟的活动"
              searchPlaceholder="搜索活动…"
              className="w-[300px]"
            />
            <div className="inline-flex rounded-md border p-0.5">
              <Button
                type="button"
                size="sm"
                variant={whatIfDirection === 'delay' ? 'default' : 'ghost'}
                className="h-7"
                onClick={() => { setWhatIfDirection('delay'); setWhatIfResult(null); }}
              >
                延期
              </Button>
              <Button
                type="button"
                size="sm"
                variant={whatIfDirection === 'advance' ? 'default' : 'ghost'}
                className="h-7"
                onClick={() => { setWhatIfDirection('advance'); setWhatIfResult(null); }}
              >
                提前
              </Button>
            </div>
            <Input
              type="number"
              className="w-20"
              value={whatIfDays}
              min={1}
              max={365}
              onChange={(e) => {
                const n = Number(e.target.value);
                setWhatIfDays(Number.isNaN(n) ? 5 : n || 5);
              }}
            />
            <span className="text-sm">工作日</span>
            <Button onClick={runWhatIf} disabled={whatIfLoading}>
              {whatIfLoading && <Loader2 className="size-4 animate-spin" />}
              模拟
            </Button>
          </div>

          {whatIfResult && (
            <div className="mt-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Tag
                  color={whatIfDirection === 'advance' ? 'green' : 'orange'}
                  label={`影响 ${whatIfResult.affectedCount} 个下游活动`}
                />
                {whatIfResult.projectEndDateBefore && whatIfResult.projectEndDateAfter && (
                  <span className="text-muted-foreground text-[13px]">
                    项目结束日期：{dayjs(whatIfResult.projectEndDateBefore).format('YYYY-MM-DD')}
                    {' → '}
                    <span
                      className="font-medium"
                      style={{
                        color: dayjs(whatIfResult.projectEndDateAfter).isBefore(dayjs(whatIfResult.projectEndDateBefore))
                          ? 'rgb(var(--success-6))' : 'rgb(var(--warning-6))',
                      }}
                    >
                      {dayjs(whatIfResult.projectEndDateAfter).format('YYYY-MM-DD')}
                    </span>
                  </span>
                )}
              </div>
              {whatIfResult.affected.length > 0 ? (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">活动名称</TableHead>
                          <TableHead className="w-[120px]">原计划开始</TableHead>
                          <TableHead className="w-[120px]">原计划结束</TableHead>
                          <TableHead className="w-[120px]">新开始日期</TableHead>
                          <TableHead className="w-[120px]">新结束日期</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {whatIfResult.affected.map((record) => (
                          <TableRow key={record.id}>
                            <TableCell>{record.name}</TableCell>
                            <TableCell>
                              {record.originalStart ? dayjs(record.originalStart).format('YYYY-MM-DD') : '-'}
                            </TableCell>
                            <TableCell>
                              {record.originalEnd ? dayjs(record.originalEnd).format('YYYY-MM-DD') : '-'}
                            </TableCell>
                            <TableCell>
                              {record.newStart ? (
                                <span style={{ color: getDateColor(record.originalStart, record.newStart) }}>
                                  {dayjs(record.newStart).format('YYYY-MM-DD')}
                                </span>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              {record.newEnd ? (
                                <span style={{ color: getDateColor(record.originalEnd, record.newEnd) }}>
                                  {dayjs(record.newEnd).format('YYYY-MM-DD')}
                                </span>
                              ) : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="mt-3">
                    <Button
                      className="bg-amber-500 text-white hover:bg-amber-600"
                      onClick={handleApplyWhatIf}
                      disabled={isArchived || applyLoading}
                    >
                      {applyLoading && <Loader2 className="size-4 animate-spin" />}
                      一键导入更新
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground py-8 text-center text-sm">无下游受影响活动</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI scheduling suggestions */}
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-base">AI 排期建议</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <p className="text-muted-foreground mb-3 text-sm">
            基于历史项目数据和 AI 分析，为活动推荐合理工期并识别潜在风险。
          </p>
          <Button onClick={runAiSchedule} disabled={aiLoading}>
            {aiLoading && <Loader2 className="size-4 animate-spin" />}
            获取 AI 建议
          </Button>

          {aiResult && (
            <div className="mt-4">
              {/* Summary */}
              {aiResult.summary && (
                <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                  {aiResult.summary}
                </div>
              )}

              {/* Duration suggestions */}
              {aiResult.suggestions.length > 0 && (
                <Card className="mb-3 gap-3 py-4">
                  <CardHeader className="px-4">
                    <CardTitle className="text-base">工期建议</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[200px]">活动名称</TableHead>
                            <TableHead className="w-[120px]">建议工期(天)</TableHead>
                            <TableHead>理由</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {aiResult.suggestions.map((s) => (
                            <TableRow key={s.name}>
                              <TableCell>{s.name}</TableCell>
                              <TableCell>
                                <Tag color="blue" label={`${s.suggestedDuration} 天`} />
                              </TableCell>
                              <TableCell>{s.reason}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Risk warnings */}
              {aiResult.risks.length > 0 && (
                <Card className="gap-3 py-4">
                  <CardHeader className="px-4">
                    <CardTitle className="text-base">风险提示</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[200px]">活动</TableHead>
                            <TableHead>风险</TableHead>
                            <TableHead className="w-[100px]">严重程度</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {aiResult.risks.map((r) => {
                            const color = r.severity === 'high' ? 'red' : r.severity === 'medium' ? 'orange' : 'blue';
                            const label = r.severity === 'high' ? '高' : r.severity === 'medium' ? '中' : '低';
                            return (
                              <TableRow key={r.activity}>
                                <TableCell>{r.activity}</TableCell>
                                <TableCell>{r.risk}</TableCell>
                                <TableCell>
                                  <Tag color={color} label={label} />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 确认弹窗（替代 Modal.confirm） */}
      <AlertDialog open={!!confirmState} onOpenChange={(o) => !o && setConfirmState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmState?.content}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const fn = confirmState?.onOk;
                setConfirmState(null);
                fn?.();
              }}
            >
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SchedulingTools;
