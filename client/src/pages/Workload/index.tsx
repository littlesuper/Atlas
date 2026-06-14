import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import MainLayout from '../../layouts/MainLayout';
import { activitiesApi, projectsApi } from '../../api';
import { Project, WorkloadResponse, WorkloadMember, WorkloadIssue } from '../../types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';

const OVERLOAD_THRESHOLD = 5;

export const computeMaxBar = (members: WorkloadMember[]): number =>
  Math.max(1, ...members.map((m) => m.inProgress + m.notStarted + m.overdue));

export const isMemberOverloaded = (m: WorkloadMember): boolean => m.inProgress >= OVERLOAD_THRESHOLD;

export const computeBarWidth = (member: WorkloadMember, maxBar: number): number => {
  const total = member.inProgress + member.notStarted + member.overdue;
  return total > 0 ? (total / maxBar) * 100 : 0;
};

export function formatIssueDetail(record: WorkloadIssue): { text: string; color: string; fontWeight?: number } {
  if (record.type === 'overdue') {
    return { text: `逾期 ${record.overdueDays} 天`, color: 'var(--status-danger)', fontWeight: 500 };
  }
  const start = record.planStartDate ? new Date(record.planStartDate).toLocaleDateString('zh-CN') : '-';
  const end = record.planEndDate ? new Date(record.planEndDate).toLocaleDateString('zh-CN') : '-';
  return { text: `${start} ~ ${end}`, color: 'var(--color-text-2)' };
}

const ALL = '__all__';

const WorkloadPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<WorkloadResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | undefined>(undefined);

  useEffect(() => {
    projectsApi.list({ pageSize: 100 }).then((res) => setProjects(res.data.data || [])).catch(() => {});
  }, []);

  const loadWorkload = useCallback(async () => {
    setLoading(true);
    try {
      const params: { projectId?: string } = {};
      if (selectedProject) params.projectId = selectedProject;
      const res = await activitiesApi.getWorkload(params);
      setData(res.data || null);
    } catch {
      toast.error('加载资源负载失败');
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    loadWorkload();
  }, [loadWorkload]);

  const summary = data?.summary;
  const members = data?.members || [];
  const issues = data?.issues || [];
  const maxBar = computeMaxBar(members);

  const summaryCards = [
    { label: '逾期任务', value: summary?.totalOverdue, cls: 'text-red-600 dark:text-red-400' },
    { label: '无人负责', value: summary?.totalUnassigned, cls: 'text-amber-600 dark:text-amber-400' },
    { label: '超载人员', value: summary?.overloadedCount, cls: 'text-red-700 dark:text-red-500' },
  ];

  return (
    <MainLayout>
      <TooltipProvider>
        <div className="flex flex-col gap-4">
          {/* A. 汇总卡片 */}
          <div className="grid grid-cols-3 gap-4">
            {summaryCards.map((c) => (
              <Card key={c.label} className="p-4">
                <div className="text-muted-foreground text-xs">{c.label}</div>
                <div className={`mt-1 text-2xl font-semibold ${c.cls}`}>{c.value ?? '-'}</div>
              </Card>
            ))}
          </div>

          {/* B. 人员负载 */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-medium">人员负载</h3>
              <Select
                value={selectedProject ?? ALL}
                onValueChange={(v) => setSelectedProject(v === ALL ? undefined : v)}
              >
                <SelectTrigger className="w-60">
                  <SelectValue placeholder="筛选项目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部项目</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center text-sm">暂无数据</div>
            ) : (
              <div className="flex flex-col gap-2">
                {members.map((m) => {
                  const overloaded = isMemberOverloaded(m);
                  const total = m.inProgress + m.notStarted + m.overdue;
                  const barWidth = computeBarWidth(m, maxBar);
                  return (
                    <div
                      key={m.userId}
                      className={`flex items-center gap-3 rounded-md px-3 py-2 ${overloaded ? 'bg-red-50 dark:bg-red-500/10' : ''}`}
                    >
                      <div className="w-20 shrink-0 truncate font-medium">{m.realName}</div>
                      <div className="flex flex-1 items-center gap-2">
                        <div className="bg-muted h-5 flex-1 overflow-hidden rounded">
                          {total > 0 && (
                            <div className="flex h-full" style={{ width: `${barWidth}%`, transition: 'width 0.3s' }}>
                              {m.inProgress > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div style={{ flex: m.inProgress, background: 'var(--status-in-progress)', minWidth: 2 }} />
                                  </TooltipTrigger>
                                  <TooltipContent>进行中: {m.inProgress}</TooltipContent>
                                </Tooltip>
                              )}
                              {m.notStarted > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div style={{ flex: m.notStarted, background: 'var(--status-not-started)', minWidth: 2 }} />
                                  </TooltipTrigger>
                                  <TooltipContent>未开始: {m.notStarted}</TooltipContent>
                                </Tooltip>
                              )}
                              {m.overdue > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div style={{ flex: m.overdue, background: 'var(--status-danger)', minWidth: 2 }} />
                                  </TooltipTrigger>
                                  <TooltipContent>逾期: {m.overdue}</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs whitespace-nowrap">
                        <span>{m.inProgress}进行中</span>
                        {m.overdue > 0 && <span className="text-red-600 dark:text-red-400">{m.overdue}逾期</span>}
                        {overloaded && (
                          <Badge variant="outline" className="border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">
                            超载
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* C. 需关注 */}
          <Card className="p-5">
            <h3 className="mb-4 text-base font-medium">需关注</h3>
            {issues.length === 0 && !loading ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
                <Check className="size-4 text-green-600" />
                暂无需关注事项
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">类型</TableHead>
                    <TableHead>活动名称</TableHead>
                    <TableHead className="w-44">所属项目</TableHead>
                    <TableHead className="w-28">负责人</TableHead>
                    <TableHead className="w-48">详情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map((record: WorkloadIssue) => {
                    const detail = formatIssueDetail(record);
                    return (
                      <TableRow key={`${record.type}-${record.activityId}`}>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="inline-block size-2 rounded-full"
                              style={{ background: record.type === 'overdue' ? 'var(--status-danger)' : 'var(--status-warning)' }}
                            />
                            {record.type === 'overdue' ? '逾期' : '无人负责'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <button className="hover:text-primary cursor-pointer hover:underline" onClick={() => navigate(`/projects/${record.projectId}`)}>
                            {record.activityName}
                          </button>
                        </TableCell>
                        <TableCell>
                          <button className="text-primary cursor-pointer hover:underline" onClick={() => navigate(`/projects/${record.projectId}`)}>
                            {record.projectName}
                          </button>
                        </TableCell>
                        <TableCell>
                          {record.assigneeNames.length > 0 ? record.assigneeNames.join('、') : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell style={{ color: detail.color, fontWeight: detail.fontWeight }}>{detail.text}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      </TooltipProvider>
    </MainLayout>
  );
};

export default WorkloadPage;
