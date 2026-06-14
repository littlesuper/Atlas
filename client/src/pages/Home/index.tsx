import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, TriangleAlert } from 'lucide-react';
import MainLayout from '../../layouts/MainLayout';
import AssistantHeroInput from '../../components/AssistantHeroInput';
import { riskApi } from '../../api';
import { RiskDashboardData, RiskDashboardInsights } from '../../types';
import { RISK_LEVEL_MAP } from '../../utils/constants';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const DISTRIBUTION: Array<{ key: keyof RiskDashboardData['riskDistribution']; label: string; num: string }> = [
  { key: 'CRITICAL', label: '严重风险', num: 'text-red-700 dark:text-red-500' },
  { key: 'HIGH', label: '高风险', num: 'text-red-600 dark:text-red-400' },
  { key: 'MEDIUM', label: '中风险', num: 'text-amber-600 dark:text-amber-400' },
  { key: 'LOW', label: '低风险', num: 'text-green-600 dark:text-green-400' },
];

const riskBadgeClass: Record<string, string> = {
  LOW: 'border-transparent bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  MEDIUM: 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  HIGH: 'border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  CRITICAL: 'border-transparent bg-red-200 text-red-800 dark:bg-red-500/25 dark:text-red-300',
};
const PRIORITY_BADGE: Record<string, string> = {
  HIGH: 'border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  MEDIUM: 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  LOW: 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
};

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<RiskDashboardData | null>(null);
  const [insights, setInsights] = useState<RiskDashboardInsights | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRisk = useCallback(async () => {
    setLoading(true);
    try {
      const [d, i] = await Promise.all([
        riskApi.getDashboard(),
        riskApi.getInsights().catch(() => ({ data: null })),
      ]);
      setDashboard(d.data);
      setInsights(i.data);
    } catch {
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRisk();
  }, [loadRisk]);

  // 助手应用改动后，风险数据可能变化 → 刷新
  useEffect(() => {
    const onApplied = () => loadRisk();
    window.addEventListener('assistant:applied', onApplied);
    return () => window.removeEventListener('assistant:applied', onApplied);
  }, [loadRisk]);

  const highRiskProjects = (dashboard?.projects ?? []).filter(
    (p) => p.riskLevel === 'HIGH' || p.riskLevel === 'CRITICAL'
  );
  const topConcerns = insights?.topConcerns ?? [];
  const topActionItems = dashboard?.topActionItems ?? [];
  // 「有风险点」只看真实风险（高风险项目 / 重点行动项）；topConcerns 可能是
  // 「当前风险可控」之类的善意提示，不应触发风险区显示（否则首页几乎总会出现）
  const hasRiskPoints = highRiskProjects.length > 0 || topActionItems.length > 0;

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1080px]">
        {/* Hero：AI 自然语言入口 */}
        <Card className="mt-6 mb-6 p-6">
          <div className="mb-2 text-center">
            <div className="bg-primary text-primary-foreground mx-auto flex size-12 items-center justify-center rounded-xl">
              <Bot className="size-6" />
            </div>
            <h2 className="mt-3 text-xl font-semibold">用一句话使用系统</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              排期、项目字段、风险项——直接说，AI 帮你理解并预览，确认后才写入
            </p>
          </div>
          <div className="mx-auto mt-3 max-w-[720px]">
            <AssistantHeroInput />
          </div>
        </Card>

        {/* AI 分析出的项目风险点：默认不显示，仅当有风险点时才出现 */}
        {!loading && dashboard && hasRiskPoints && (
          <Card className="mb-8 p-6">
            <div className="mb-4 flex items-center gap-2">
              <TriangleAlert className="size-[18px] text-amber-500" />
              <h3 className="text-base font-semibold">项目风险点（AI 分析）</h3>
            </div>

            {/* 风险等级分布 */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {DISTRIBUTION.map((d) => (
                <Card key={d.key} className="p-3 text-center shadow-none">
                  <div className={cn('text-2xl font-bold', d.num)}>{dashboard.riskDistribution[d.key] ?? 0}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">{d.label}</div>
                </Card>
              ))}
            </div>

            {/* AI 关注点 */}
            {topConcerns.length > 0 && (
              <div className="mb-5">
                <div className="text-sm font-semibold">AI 重点关注</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {topConcerns.map((c, i) => (
                    <li key={i} className="text-muted-foreground text-sm">{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 高风险项目 */}
            {highRiskProjects.length > 0 && (
              <>
                <div className="text-sm font-semibold">高风险项目</div>
                <div className="mt-2 mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {highRiskProjects.slice(0, 6).map((p) => {
                    const meta = RISK_LEVEL_MAP[p.riskLevel as keyof typeof RISK_LEVEL_MAP];
                    return (
                      <Card
                        key={p.projectId}
                        className="hover:border-primary/40 cursor-pointer p-3 transition-colors hover:shadow-sm"
                        onClick={() => navigate(`/projects/${p.projectId}`)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold">{p.projectName}</span>
                          <Badge variant="outline" className={cn('shrink-0', riskBadgeClass[p.riskLevel])}>
                            {meta?.label || p.riskLevel}
                          </Badge>
                        </div>
                        {p.aiInsights && <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">{p.aiInsights}</p>}
                      </Card>
                    );
                  })}
                </div>
              </>
            )}

            {/* 重点行动项 */}
            {topActionItems.length > 0 && (
              <div>
                <div className="text-sm font-semibold">重点行动项</div>
                <div className="mt-2">
                  {topActionItems.slice(0, 8).map((item, i) => (
                    <div
                      key={i}
                      className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 border-b py-1.5 last:border-b-0"
                      onClick={() => navigate(`/projects/${item.projectId}`)}
                    >
                      <Badge variant="outline" className={cn('shrink-0', PRIORITY_BADGE[item.priority] || '')}>
                        {item.priority}
                      </Badge>
                      <span className="text-[13px]">{item.action}</span>
                      <span className="text-muted-foreground ml-auto text-xs">{item.projectName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </MainLayout>
  );
};

export default Home;
