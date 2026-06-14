import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Zap, Trash2, TrendingUp, TrendingDown, Minus, Lightbulb, User, CircleAlert, Loader2 } from 'lucide-react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  MarkAreaComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { toast } from 'sonner';
import { riskApi } from '../../../api';
import { RiskAssessment, RiskComparison } from '../../../types';
import { RISK_LEVEL_MAP } from '../../../utils/constants';
import { arcoBadgeClass } from '../../../utils/badgeColor';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import RiskItemsPanel from './RiskItemsPanel';
import dayjs from 'dayjs';

echarts.use([LineChart, GridComponent, TooltipComponent, MarkAreaComponent, CanvasRenderer]);

interface Props {
  projectId: string;
  isArchived?: boolean;
  snapshotData?: RiskAssessment[] | null;
}

const RISK_LEVEL_CONFIG: Record<string, { color: string; bgVar: string }> = {
  LOW:      { color: 'var(--risk-low-color)', bgVar: 'var(--risk-low-bg)' },
  MEDIUM:   { color: 'var(--risk-medium-color)', bgVar: 'var(--risk-medium-bg)' },
  HIGH:     { color: 'var(--risk-high-color)', bgVar: 'var(--risk-high-bg)' },
  CRITICAL: { color: 'var(--risk-critical-color)', bgVar: 'var(--risk-high-bg)' },
};

const SEVERITY_COLOR: Record<string, string> = {
  LOW: 'green',
  MEDIUM: 'orange',
  HIGH: 'red',
  CRITICAL: 'red',
};

/** Normalize Chinese / English / mixed-case risk level to canonical UPPERCASE key */
export function normalizeRiskLevel(level: string): string {
  const upper = level?.toUpperCase?.() || '';
  if (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(upper)) return upper;
  const cnMap: Record<string, string> = { '低': 'LOW', '低风险': 'LOW', '中': 'MEDIUM', '中风险': 'MEDIUM', '高': 'HIGH', '高风险': 'HIGH', '严重': 'CRITICAL', '严重风险': 'CRITICAL' };
  return cnMap[level] || upper;
}

const RISK_LEVEL_VALUE: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const SOURCE_LABEL: Record<string, { text: string; color: string }> = {
  ai: { text: 'AI 评估', color: 'arcoblue' },
  rule_engine: { text: '规则引擎', color: 'gray' },
  scheduled_ai: { text: '定时 AI', color: 'purple' },
  scheduled_rule: { text: '定时规则', color: 'gray' },
};

type ChartTooltipParam = { dataIndex?: number };
type ChartColorParam = { value: number };

const RiskAssessmentTab: React.FC<Props> = ({ projectId, isArchived, snapshotData }) => {
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [trendData, setTrendData] = useState<RiskAssessment[]>([]);
  const [comparison, setComparison] = useState<RiskComparison | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadPage = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await riskApi.getHistory(projectId, { page: p, pageSize });
      const data = res.data;
      if (Array.isArray(data)) {
        setAssessments(data);
        setTotal(data.length);
      } else {
        setAssessments(data.data || []);
        setTotal(data.total || 0);
      }
    } catch {
      toast.error('加载风险评估历史失败');
    } finally {
      setLoading(false);
    }
  }, [pageSize, projectId]);

  const loadTrend = useCallback(async () => {
    try {
      const res = await riskApi.getTrend(projectId);
      const data = res.data;
      if (Array.isArray(data)) {
        setTrendData(data);
      } else {
        setTrendData(data.data || []);
      }
    } catch {
      // 趋势数据加载失败不影响主功能
    }
  }, [projectId]);

  const loadComparison = useCallback(async () => {
    try {
      const res = await riskApi.getComparison(projectId);
      setComparison(res.data);
    } catch {
      // silent
    }
  }, [projectId]);

  useEffect(() => {
    if (snapshotData) {
      setAssessments(snapshotData);
      setTotal(snapshotData.length);
    } else {
      loadPage(1);
      loadTrend();
      loadComparison();
      setPage(1);
    }
  }, [loadComparison, loadPage, loadTrend, snapshotData]);

  const handleDelete = (assessmentId: string) => {
    setDeleteTarget(assessmentId);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await riskApi.delete(deleteTarget);
      toast.success('已删除');
      loadPage(page);
      loadTrend();
      loadComparison();
    } catch {
      toast.error('删除失败');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleAssess = async () => {
    setAssessing(true);
    try {
      await riskApi.assess(projectId);
      toast.success('风险评估完成');
      await Promise.all([loadPage(page), loadTrend(), loadComparison()]);
    } catch {
      // axios 拦截器已显示后端错误信息
    } finally {
      setAssessing(false);
    }
  };

  const latest = assessments[0];
  const history = assessments.slice(1);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* 操作栏 */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-muted-foreground text-[13px]">
          {assessments.length > 0 ? `共 ${total} 次评估记录` : ''}
        </span>
        {!isArchived && (
          <Button onClick={handleAssess} disabled={assessing}>
            {assessing ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
            发起评估
          </Button>
        )}
      </div>

      {/* 风险趋势图 */}
      {trendData.length >= 2 && <RiskTrendChart data={trendData} />}

      {/* 风险变化对比 */}
      {comparison?.changes && <RiskComparisonCard comparison={comparison} />}

      {/* 最新评估结果 */}
      {latest ? (
        <div>
          <RiskCard assessment={latest} isLatest projectId={projectId} />
          {/* 历史记录 */}
          {history.length > 0 && (
            <div className="mt-6">
              <div className="text-foreground/80 mb-3 text-sm font-medium">历史记录</div>
              <div className="flex w-full flex-col gap-3">
                {history.map((a) => (
                  <RiskCard key={a.id} assessment={a} onDelete={isArchived ? undefined : () => handleDelete(a.id)} />
                ))}
              </div>
              {total > pageSize && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    第 {page} / {totalPages} 页
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => { const p = page - 1; setPage(p); loadPage(p); }}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => { const p = page + 1; setPage(p); loadPage(p); }}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="text-muted-foreground py-10 text-center text-sm">暂无评估记录，点击「发起评估」开始</div>
      )}

      {/* 风险项管理面板 */}
      {!snapshotData && (
        <RiskItemsPanel
          projectId={projectId}
          latestAssessment={latest}
          isArchived={isArchived}
        />
      )}

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除该评估记录吗？此操作不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/* ============ 风险变化对比卡片 ============ */

const RiskComparisonCard: React.FC<{ comparison: RiskComparison }> = ({ comparison }) => {
  if (!comparison.changes) return null;
  const { levelChange, newRisks, resolvedRisks } = comparison.changes;
  if (levelChange === 'UNCHANGED' && newRisks.length === 0 && resolvedRisks.length === 0) return null;

  return (
    <Card className="mb-4 px-4 py-3">
      <div className="text-foreground/80 mb-2 text-sm font-medium">
        风险变化
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {levelChange !== 'UNCHANGED' && (
          <Badge
            variant="outline"
            className={cn('text-[13px]', arcoBadgeClass(levelChange === 'IMPROVED' ? 'green' : 'red'))}
          >
            {levelChange === 'IMPROVED' ? '风险等级下降' : '风险等级上升'}
            {comparison.previous && comparison.current && (
              <span className="ml-1">
                {comparison.previous.riskLevel} → {comparison.current.riskLevel}
              </span>
            )}
          </Badge>
        )}
        {resolvedRisks.length > 0 && (
          <span className="text-xs text-green-600 dark:text-green-400">
            已改善：{resolvedRisks.join('、')}
          </span>
        )}
        {newRisks.length > 0 && (
          <span className="text-xs text-red-600 dark:text-red-400">
            新增风险：{newRisks.join('、')}
          </span>
        )}
      </div>
    </Card>
  );
};

/* ============ 风险趋势图 ============ */

const RiskTrendChart: React.FC<{ data: RiskAssessment[] }> = ({ data }) => {
  const option = useMemo(() => {
    // 按时间正序排列
    const sorted = [...data].sort(
      (a, b) => new Date(a.assessedAt).getTime() - new Date(b.assessedAt).getTime()
    );

    const xData = sorted.map((d) => dayjs(d.assessedAt).format('MM-DD HH:mm'));
    const yData = sorted.map((d) => RISK_LEVEL_VALUE[normalizeRiskLevel(d.riskLevel)] || 1);
    const sourceData = sorted.map((d) => d.source || 'rule_engine');
    const levelData = sorted.map((d) => d.riskLevel);

    return {
      grid: { top: 30, right: 20, bottom: 30, left: 45 },
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: ChartTooltipParam[]) => {
          const idx = params[0]?.dataIndex;
          if (idx == null) return '';
          const date = dayjs(sorted[idx].assessedAt).format('YYYY-MM-DD HH:mm');
          const level = RISK_LEVEL_MAP[normalizeRiskLevel(levelData[idx]) as keyof typeof RISK_LEVEL_MAP]?.label ?? levelData[idx];
          const src = SOURCE_LABEL[sourceData[idx]]?.text || sourceData[idx];
          return `${date}<br/>风险等级: <b>${level}</b><br/>来源: ${src}`;
        },
      },
      xAxis: {
        type: 'category' as const,
        data: xData,
        axisLabel: { fontSize: 11, color: '#86909c' },
        axisLine: { lineStyle: { color: '#e5e6eb' } },
      },
      yAxis: {
        type: 'value' as const,
        min: 0,
        max: 4.5,
        interval: 1,
        axisLabel: {
          fontSize: 11,
          color: '#86909c',
          formatter: (v: number) => {
            const map: Record<number, string> = { 1: '低', 2: '中', 3: '高', 4: '严重' };
            return map[v] || '';
          },
        },
        splitLine: { lineStyle: { type: 'dashed' as const, color: '#e5e6eb' } },
      },
      series: [
        {
          type: 'line' as const,
          data: yData,
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { width: 2, color: '#165DFF' },
          itemStyle: {
            color: (params: ChartColorParam) => {
              const val = params.value;
              if (val >= 3) return '#F53F3F';
              if (val >= 2) return '#FF7D00';
              return '#00B42A';
            },
          },
          markArea: {
            silent: true,
            data: [
              [
                { yAxis: 0, itemStyle: { color: 'rgba(0, 180, 42, 0.06)' } },
                { yAxis: 1.5 },
              ],
              [
                { yAxis: 1.5, itemStyle: { color: 'rgba(255, 125, 0, 0.06)' } },
                { yAxis: 2.5 },
              ],
              [
                { yAxis: 2.5, itemStyle: { color: 'rgba(245, 63, 63, 0.06)' } },
                { yAxis: 4.5 },
              ],
            ],
          },
        },
      ],
    };
  }, [data]);

  return (
    <Card className="mb-4 px-4 py-3">
      <div className="text-foreground/80 mb-2 text-sm font-medium">
        风险趋势
      </div>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: 220 }}
        notMerge
      />
    </Card>
  );
};

/* ============ 风险卡片 ============ */

const RiskCard: React.FC<{
  assessment: RiskAssessment;
  isLatest?: boolean;
  onDelete?: () => void;
  projectId?: string;
}> = ({
  assessment,
  isLatest,
  onDelete,
}) => {
  const [expandedFactors, setExpandedFactors] = useState<Record<number, boolean>>({});
  const [showAIDetail, setShowAIDetail] = useState(false);

  const toggleFactor = (index: number) => {
    setExpandedFactors((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const normalizedLevel = normalizeRiskLevel(assessment.riskLevel);
  const cfg = RISK_LEVEL_CONFIG[normalizedLevel] || { color: 'var(--color-text-3)', bgVar: 'var(--color-fill-1)' };
  const levelColorName = RISK_LEVEL_MAP[normalizedLevel as keyof typeof RISK_LEVEL_MAP]?.color;
  const sourceInfo = SOURCE_LABEL[assessment.source || 'rule_engine'] || SOURCE_LABEL.rule_engine;
  const hasAIEnhanced = (assessment.source === 'ai' || assessment.source === 'scheduled_ai') && assessment.aiEnhancedData;

  return (
    <Card
      className={cn('w-full', isLatest ? 'px-6 py-5' : 'px-5 py-4')}
      style={{ borderLeft: isLatest ? `4px solid ${cfg.color}` : undefined }}
    >
      {/* 头部：风险等级 + 来源 + 时间 */}
      <div className={cn('flex items-center justify-between', isLatest ? 'mb-4' : 'mb-3')}>
        <div className="flex items-center gap-3">
          {isLatest && (
            <span className="text-foreground text-[13px] font-semibold">最新评估</span>
          )}
          <Badge
            variant="outline"
            className={cn(
              'font-semibold',
              isLatest ? 'px-3 py-0.5 text-sm' : 'px-2 py-px text-xs',
              arcoBadgeClass(levelColorName)
            )}
          >
            {RISK_LEVEL_MAP[normalizedLevel as keyof typeof RISK_LEVEL_MAP]?.label ?? assessment.riskLevel}
          </Badge>
          <Badge variant="outline" className={cn('text-xs', arcoBadgeClass(sourceInfo.color))}>
            {sourceInfo.text}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {dayjs(assessment.assessedAt).format('YYYY-MM-DD HH:mm')}
          </span>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive size-7"
              aria-label="删除"
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* AI 洞察总结 */}
      {isLatest && assessment.aiInsights && (
        <div className="border-l-primary bg-primary/5 text-foreground mb-4 rounded-r-md border-l-4 px-4 py-3 text-[13px] leading-relaxed">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <Lightbulb className="text-primary size-4" />
            AI 洞察
          </div>
          {assessment.aiInsights}
        </div>
      )}

      {/* 风险因素 */}
      {assessment.riskFactors && assessment.riskFactors.length > 0 && (
        <div className={cn(isLatest ? 'mb-4' : 'mb-3')}>
          <div className="text-foreground/80 mb-2 text-[13px] font-medium">风险因素</div>
          <div className="flex w-full flex-col gap-1.5">
            {assessment.riskFactors.map((f, i) => (
              <div
                key={i}
                className="bg-muted/50 flex items-start gap-2 rounded-md px-3 py-2"
              >
                <Badge
                  variant="outline"
                  className={cn('shrink-0 text-xs', arcoBadgeClass(SEVERITY_COLOR[normalizeRiskLevel(f.severity)] || 'default'))}
                >
                  {RISK_LEVEL_MAP[normalizeRiskLevel(f.severity) as keyof typeof RISK_LEVEL_MAP]?.label?.replace('风险', '') ?? f.severity}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{f.factor}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">{f.description}</div>
                  {f.triggeredActivities && f.triggeredActivities.length > 0 && (
                    <>
                      <div
                        className="text-primary mt-1 cursor-pointer text-xs select-none"
                        onClick={() => toggleFactor(i)}
                      >
                        {expandedFactors[i]
                          ? `收起 ▾`
                          : `查看 ${f.triggeredActivities.length} 个任务 ▸`}
                      </div>
                      {expandedFactors[i] && (
                        <div className="mt-1.5 pl-1">
                          {f.triggeredActivities.map((ta) => (
                            <div
                              key={ta.id}
                              className="text-foreground/80 flex gap-2 text-xs leading-[1.8]"
                            >
                              <span className="text-foreground">·</span>
                              <span>{ta.name}</span>
                              {ta.detail && (
                                <span className="text-muted-foreground shrink-0">{ta.detail}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 改进建议 */}
      {assessment.suggestions && assessment.suggestions.length > 0 && (
        <div className={cn(hasAIEnhanced && isLatest ? 'mb-4' : '')}>
          <div className="text-foreground/80 mb-2 text-[13px] font-medium">改进建议</div>
          <ul className="m-0 list-disc pl-[18px]">
            {assessment.suggestions.map((s, i) => (
              <li key={i} className="text-foreground/80 text-[13px] leading-[1.8]">{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* AI 深度分析（可展开） */}
      {hasAIEnhanced && isLatest && (
        <div>
          <div
            className="text-primary mt-2 cursor-pointer text-[13px] select-none"
            onClick={() => setShowAIDetail(!showAIDetail)}
          >
            {showAIDetail ? 'AI 深度分析 ▾' : 'AI 深度分析 ▸'}
          </div>
          {showAIDetail && (
            <div className="mt-3">
              <AIEnhancedSection data={assessment.aiEnhancedData!} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

/* ============ AI 增强分析区 ============ */

const AIEnhancedSection: React.FC<{
  data: NonNullable<RiskAssessment['aiEnhancedData']>;
}> = ({ data }) => {
  const trendIcon = data.trendPrediction?.startsWith('IMPROVING')
    ? <TrendingDown className="size-4 text-green-600 dark:text-green-400" />
    : data.trendPrediction?.startsWith('WORSENING')
    ? <TrendingUp className="size-4 text-red-600 dark:text-red-400" />
    : <Minus className="text-muted-foreground size-4" />;

  const trendText = data.trendPrediction?.replace(/^(IMPROVING|STABLE|WORSENING)\s*-?\s*/, '') || '';
  const trendLabel = data.trendPrediction?.startsWith('IMPROVING')
    ? '趋势改善'
    : data.trendPrediction?.startsWith('WORSENING')
    ? '趋势恶化'
    : '趋势稳定';

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Trend prediction */}
      {data.trendPrediction && (
        <div className="bg-muted/50 flex items-center gap-2 rounded-md px-3 py-2">
          {trendIcon}
          <span className="text-[13px] font-medium">{trendLabel}</span>
          {trendText && <span className="text-muted-foreground text-xs">{trendText}</span>}
        </div>
      )}

      {/* Critical path analysis */}
      {data.criticalPathAnalysis && (
        <div className="bg-muted/50 rounded-md px-3 py-2">
          <div className="mb-1 text-[13px] font-medium">关键路径分析</div>
          <div className="text-foreground/80 text-xs leading-relaxed">{data.criticalPathAnalysis}</div>
        </div>
      )}

      {/* Action items */}
      {data.actionItems && data.actionItems.length > 0 && (
        <div>
          <div className="mb-2 flex items-center text-[13px] font-medium">
            <CircleAlert className="mr-1 size-4" />
            行动项
          </div>
          <div className="flex w-full flex-col gap-1">
            {data.actionItems.map((item, i) => (
              <div key={i} className="bg-muted/50 flex items-start gap-2 rounded-md px-3 py-1.5">
                <Badge
                  variant="outline"
                  className={cn('shrink-0 text-xs', arcoBadgeClass(item.priority === 'HIGH' ? 'red' : item.priority === 'MEDIUM' ? 'orange' : 'green'))}
                >
                  {item.priority}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px]">{item.action}</div>
                  {(item.assignee || item.deadline) && (
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {item.assignee && <span>负责人: {item.assignee}</span>}
                      {item.assignee && item.deadline && <span> · </span>}
                      {item.deadline && <span>期限: {item.deadline}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resource bottlenecks */}
      {data.resourceBottlenecks && data.resourceBottlenecks.length > 0 && (
        <div>
          <div className="mb-2 flex items-center text-[13px] font-medium">
            <User className="mr-1 size-4" />
            资源瓶颈
          </div>
          <div className="flex w-full flex-col gap-1">
            {data.resourceBottlenecks.map((rb, i) => (
              <div key={i} className="bg-muted/50 rounded-md px-3 py-1.5">
                <div className="text-[13px] font-medium">{rb.person}</div>
                <div className="text-muted-foreground mt-0.5 text-xs">{rb.issue}</div>
                <div className="mt-0.5 text-xs text-green-600 dark:text-green-400">建议: {rb.suggestion}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RiskAssessmentTab;
