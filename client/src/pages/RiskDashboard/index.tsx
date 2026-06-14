import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, Minus, Lightbulb, AlertCircle, CheckCircle2 } from 'lucide-react';
import MainLayout from '../../layouts/MainLayout';
import { riskApi } from '../../api';
import { RiskDashboardData, RiskDashboardInsights } from '../../types';
import { RISK_LEVEL_MAP } from '../../utils/constants';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';

const RISK_COLORS: Record<string, string> = {
  LOW: 'var(--risk-low-color)',
  MEDIUM: 'var(--risk-medium-color)',
  HIGH: 'var(--risk-high-color)',
  CRITICAL: 'var(--risk-critical-color)',
};
const RISK_BG: Record<string, string> = { LOW: '#E8FFEA', MEDIUM: '#FFF7E8', HIGH: '#FFECE8', CRITICAL: '#FFECE8' };

export const truncateText = (v: string, maxLen: number): string => v.slice(0, maxLen) + (v.length > maxLen ? '...' : '');

export function buildStatCards(riskDistribution: Record<string, number>) {
  return [
    { label: '低风险', count: riskDistribution.LOW, color: RISK_COLORS.LOW, bg: RISK_BG.LOW },
    { label: '中风险', count: riskDistribution.MEDIUM, color: RISK_COLORS.MEDIUM, bg: RISK_BG.MEDIUM },
    { label: '高风险', count: riskDistribution.HIGH, color: RISK_COLORS.HIGH, bg: RISK_BG.HIGH },
    { label: '严重风险', count: riskDistribution.CRITICAL, color: RISK_COLORS.CRITICAL, bg: RISK_BG.CRITICAL },
  ];
}

const riskBadgeClass: Record<string, string> = {
  LOW: 'border-transparent bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  MEDIUM: 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  HIGH: 'border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  CRITICAL: 'border-transparent bg-red-200 text-red-800 dark:bg-red-500/25 dark:text-red-300',
};
const riskNumClass: Record<string, string> = {
  LOW: 'text-green-600 dark:text-green-400',
  MEDIUM: 'text-amber-600 dark:text-amber-400',
  HIGH: 'text-red-600 dark:text-red-400',
  CRITICAL: 'text-red-700 dark:text-red-500',
};
const levelCards = [
  { key: 'LOW', label: '低风险' },
  { key: 'MEDIUM', label: '中风险' },
  { key: 'HIGH', label: '高风险' },
  { key: 'CRITICAL', label: '严重风险' },
] as const;

const RiskDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<RiskDashboardData | null>(null);
  const [insights, setInsights] = useState<RiskDashboardInsights | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [dashRes, insRes] = await Promise.all([
          riskApi.getDashboard(),
          riskApi.getInsights().catch(() => ({ data: null })),
        ]);
        setDashboard(dashRes.data);
        setInsights(insRes.data);
      } catch {
        toast.error('加载风险仪表盘失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-[1200px] space-y-4">
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </MainLayout>
    );
  }

  if (!dashboard) {
    return (
      <MainLayout>
        <div className="text-muted-foreground p-10 text-center">暂无风险数据</div>
      </MainLayout>
    );
  }

  const { riskDistribution, projects, topActionItems } = dashboard;

  const trendIcon = (trend: string) => {
    if (trend === 'IMPROVING') return <TrendingDown className="size-4 text-green-600" />;
    if (trend === 'WORSENING') return <TrendingUp className="size-4 text-red-600" />;
    return <Minus className="text-muted-foreground size-4" />;
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">风险总览</h2>
          <p className="text-muted-foreground mt-1 text-sm">跨项目风险全景视图</p>
        </div>

        {/* AI 洞察 */}
        {insights && insights.topConcerns.length > 0 && (
          <Card className="border-l-primary mb-5 rounded-l-none border-l-4 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Lightbulb className="text-primary size-[18px]" />
              <span className="text-[15px] font-medium">本周最需关注</span>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {insights.topConcerns.map((concern, i) => (
                <li key={i}>{concern}</li>
              ))}
            </ul>
            {(insights.improvements.length > 0 || insights.deteriorations.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-6">
                {insights.improvements.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-green-600">改善 ↓</span>
                    {insights.improvements.map((item, i) => (
                      <div key={i} className="text-muted-foreground mt-0.5 text-xs">{item}</div>
                    ))}
                  </div>
                )}
                {insights.deteriorations.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-red-600">恶化 ↑</span>
                    {insights.deteriorations.map((item, i) => (
                      <div key={i} className="text-muted-foreground mt-0.5 text-xs">{item}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* 风险分布 */}
        <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {levelCards.map((c) => (
            <Card key={c.key} className="flex flex-row items-center justify-between p-4">
              <div>
                <div className="text-muted-foreground text-xs">{c.label}</div>
                <div className={cn('mt-1 text-2xl font-bold', riskNumClass[c.key])}>{riskDistribution[c.key] ?? 0}</div>
              </div>
              <div className={cn('flex size-10 items-center justify-center rounded-full', riskBadgeClass[c.key])}>
                {c.key === 'LOW' ? <CheckCircle2 className="size-5" /> : <AlertCircle className="size-5" />}
              </div>
            </Card>
          ))}
        </div>

        {/* 项目风险矩阵 */}
        <Card className="mb-5 overflow-hidden p-4">
          <div className="mb-3 text-sm font-medium">项目风险矩阵</div>
          {projects.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>项目</TableHead>
                  <TableHead className="w-24">产品线</TableHead>
                  <TableHead className="w-28">风险等级</TableHead>
                  <TableHead className="w-20">趋势</TableHead>
                  <TableHead className="w-36">评估时间</TableHead>
                  <TableHead>AI 摘要</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((record) => {
                  const info = RISK_LEVEL_MAP[record.riskLevel as keyof typeof RISK_LEVEL_MAP];
                  return (
                    <TableRow
                      key={record.projectId}
                      className="cursor-pointer"
                      onClick={() => navigate(`/projects/${record.projectId}?tab=risk`)}
                    >
                      <TableCell className="text-primary font-medium">{record.projectName}</TableCell>
                      <TableCell>{record.productLine || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('font-semibold', riskBadgeClass[record.riskLevel])}>
                          {info?.label || record.riskLevel}
                        </Badge>
                      </TableCell>
                      <TableCell>{trendIcon(record.trendDirection)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{dayjs(record.assessedAt).format('MM-DD HH:mm')}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{record.aiInsights ? truncateText(record.aiInsights, 60) : '-'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-muted-foreground py-8 text-center text-sm">暂无进行中项目的风险评估数据</div>
          )}
        </Card>

        {/* 行动项 */}
        {topActionItems.length > 0 && (
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertCircle className="size-4 text-amber-600" />
              <span className="text-sm font-medium">待办行动项</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {topActionItems.map((item, i) => (
                <div key={i} className="bg-muted/50 flex items-center gap-2 rounded-md px-3 py-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      'shrink-0',
                      item.priority === 'HIGH'
                        ? riskBadgeClass.HIGH
                        : item.priority === 'MEDIUM'
                          ? riskBadgeClass.MEDIUM
                          : riskBadgeClass.LOW
                    )}
                  >
                    {item.priority}
                  </Badge>
                  <span className="flex-1 text-sm">{item.action}</span>
                  <button
                    className="text-primary shrink-0 cursor-pointer text-xs hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/projects/${item.projectId}?tab=risk`);
                    }}
                  >
                    {item.projectName}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </MainLayout>
  );
};

export default RiskDashboard;
