import React, { useState, useEffect, useMemo } from 'react';
import {
  Button,
  Card,
  Tag,
  Space,
  Empty,
  Message,
  Spin,
  Pagination,
  Modal,
} from '@arco-design/web-react';
import { IconThunderbolt, IconDelete } from '@arco-design/web-react/icon';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  MarkAreaComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { riskApi } from '../../../api';
import { RiskAssessment } from '../../../types';
import { RISK_LEVEL_MAP } from '../../../utils/constants';
import dayjs from 'dayjs';

echarts.use([LineChart, GridComponent, TooltipComponent, MarkAreaComponent, CanvasRenderer]);

interface Props {
  projectId: string;
}

const RISK_LEVEL_CONFIG: Record<string, { color: string; bgVar: string }> = {
  LOW:      { color: 'var(--status-success)', bgVar: 'var(--risk-low-bg)' },
  MEDIUM:   { color: 'var(--status-warning)', bgVar: 'var(--risk-medium-bg)' },
  HIGH:     { color: 'var(--status-danger)', bgVar: 'var(--risk-high-bg)' },
  CRITICAL: { color: 'var(--status-danger-dark)', bgVar: 'var(--risk-high-bg)' },
};

const SEVERITY_COLOR: Record<string, string> = {
  LOW: 'green',
  MEDIUM: 'orange',
  HIGH: 'red',
};

const RISK_LEVEL_VALUE: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const SOURCE_LABEL: Record<string, { text: string; color: string }> = {
  ai: { text: 'AI 评估', color: 'arcoblue' },
  rule_engine: { text: '规则引擎', color: 'gray' },
};

const RiskAssessmentTab: React.FC<Props> = ({ projectId }) => {
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [trendData, setTrendData] = useState<RiskAssessment[]>([]);

  const load = async (p = page) => {
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
      Message.error('加载风险评估历史失败');
    } finally {
      setLoading(false);
    }
  };

  const loadTrend = async () => {
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
  };

  useEffect(() => {
    load(1);
    loadTrend();
    setPage(1);
  }, [projectId]);

  const handleDelete = (assessmentId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该评估记录吗？此操作不可恢复。',
      onOk: async () => {
        try {
          await riskApi.delete(assessmentId);
          Message.success('已删除');
          load();
          loadTrend();
        } catch {
          Message.error('删除失败');
        }
      },
    });
  };

  const handleAssess = async () => {
    setAssessing(true);
    try {
      await riskApi.assess(projectId);
      Message.success('风险评估完成');
      await Promise.all([load(), loadTrend()]);
    } catch {
      // axios 拦截器已显示后端错误信息
    } finally {
      setAssessing(false);
    }
  };

  const latest = assessments[0];
  const history = assessments.slice(1);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>;
  }

  return (
    <div>
      {/* 操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-3)' }}>
          {assessments.length > 0 ? `共 ${total} 次评估记录` : ''}
        </span>
        <Button
          type="primary"
          icon={<IconThunderbolt />}
          loading={assessing}
          onClick={handleAssess}
        >
          发起评估
        </Button>
      </div>

      {/* 风险趋势图 */}
      {trendData.length >= 2 && <RiskTrendChart data={trendData} />}

      {/* 最新评估结果 */}
      {latest ? (
        <div>
          <RiskCard assessment={latest} isLatest />
          {/* 历史记录 */}
          {history.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12, color: 'var(--color-text-2)' }}>历史记录</div>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {history.map((a) => (
                  <RiskCard key={a.id} assessment={a} onDelete={() => handleDelete(a.id)} />
                ))}
              </Space>
              {total > pageSize && (
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <Pagination
                    current={page}
                    pageSize={pageSize}
                    total={total}
                    onChange={(p) => { setPage(p); load(p); }}
                    showTotal
                    size="small"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <Empty description="暂无评估记录，点击「发起评估」开始" />
      )}
    </div>
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
    const yData = sorted.map((d) => RISK_LEVEL_VALUE[d.riskLevel] || 1);
    const sourceData = sorted.map((d) => d.source || 'rule_engine');
    const levelData = sorted.map((d) => d.riskLevel);

    return {
      grid: { top: 30, right: 20, bottom: 30, left: 45 },
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: any) => {
          const idx = params[0]?.dataIndex;
          if (idx == null) return '';
          const date = dayjs(sorted[idx].assessedAt).format('YYYY-MM-DD HH:mm');
          const level = RISK_LEVEL_MAP[levelData[idx] as keyof typeof RISK_LEVEL_MAP]?.label ?? levelData[idx];
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
            color: (params: any) => {
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
    <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: 'var(--color-text-2)' }}>
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

const RiskCard: React.FC<{ assessment: RiskAssessment; isLatest?: boolean; onDelete?: () => void }> = ({
  assessment,
  isLatest,
  onDelete,
}) => {
  const [expandedFactors, setExpandedFactors] = useState<Record<number, boolean>>({});

  const toggleFactor = (index: number) => {
    setExpandedFactors((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const cfg = RISK_LEVEL_CONFIG[assessment.riskLevel] || { color: 'var(--color-text-3)', bgVar: 'var(--color-fill-1)' };
  const sourceInfo = SOURCE_LABEL[assessment.source || 'rule_engine'] || SOURCE_LABEL.rule_engine;

  return (
    <Card
      style={{
        width: '100%',
        borderLeft: isLatest ? `4px solid ${cfg.color}` : undefined,
      }}
      bodyStyle={{ padding: isLatest ? '20px 24px' : '16px 20px' }}
    >
      {/* 头部：风险等级 + 来源 + 时间 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isLatest ? 16 : 12 }}>
        <Space size={12}>
          {isLatest && (
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-1)' }}>最新评估</span>
          )}
          <Tag
            style={{
              background: cfg.bgVar,
              color: cfg.color,
              border: `1px solid ${cfg.color}`,
              fontWeight: 600,
              fontSize: isLatest ? 14 : 12,
              padding: isLatest ? '2px 12px' : '1px 8px',
            }}
          >
            {RISK_LEVEL_MAP[assessment.riskLevel as keyof typeof RISK_LEVEL_MAP]?.label ?? assessment.riskLevel}
          </Tag>
          <Tag color={sourceInfo.color} size="small">
            {sourceInfo.text}
          </Tag>
        </Space>
        <Space size={8}>
          <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
            {dayjs(assessment.assessedAt).format('YYYY-MM-DD HH:mm')}
          </span>
          {onDelete && (
            <Button type="text" size="mini" status="danger" icon={<IconDelete />} onClick={onDelete} />
          )}
        </Space>
      </div>

      {/* 风险因素 */}
      {assessment.riskFactors && assessment.riskFactors.length > 0 && (
        <div style={{ marginBottom: isLatest ? 16 : 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'var(--color-text-2)' }}>风险因素</div>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {assessment.riskFactors.map((f, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '8px 12px',
                  background: 'var(--color-fill-1)',
                  borderRadius: 6,
                }}
              >
                <Tag size="small" color={SEVERITY_COLOR[f.severity] || 'default'} style={{ flexShrink: 0 }}>
                  {RISK_LEVEL_MAP[f.severity as keyof typeof RISK_LEVEL_MAP]?.label?.replace('风险', '') ?? f.severity}
                </Tag>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{f.factor}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>{f.description}</div>
                  {f.triggeredActivities && f.triggeredActivities.length > 0 && (
                    <>
                      <div
                        style={{ fontSize: 12, color: 'var(--color-primary-6)', cursor: 'pointer', marginTop: 4, userSelect: 'none' }}
                        onClick={() => toggleFactor(i)}
                      >
                        {expandedFactors[i]
                          ? `收起 ▾`
                          : `查看 ${f.triggeredActivities.length} 个任务 ▸`}
                      </div>
                      {expandedFactors[i] && (
                        <div style={{ marginTop: 6, paddingLeft: 4 }}>
                          {f.triggeredActivities.map((ta) => (
                            <div
                              key={ta.id}
                              style={{
                                fontSize: 12,
                                color: 'var(--color-text-2)',
                                lineHeight: 1.8,
                                display: 'flex',
                                gap: 8,
                              }}
                            >
                              <span style={{ color: 'var(--color-text-1)' }}>·</span>
                              <span>{ta.name}</span>
                              {ta.detail && (
                                <span style={{ color: 'var(--color-text-3)', flexShrink: 0 }}>{ta.detail}</span>
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
          </Space>
        </div>
      )}

      {/* 改进建议 */}
      {assessment.suggestions && assessment.suggestions.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'var(--color-text-2)' }}>改进建议</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {assessment.suggestions.map((s, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.8 }}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
};

export default RiskAssessmentTab;
