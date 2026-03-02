import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Empty,
  Spin,
  Message,
} from '@arco-design/web-react';
import {
  IconArrowRise,
  IconArrowFall,
  IconMinus,
  IconBulb,
  IconExclamationCircle,
  IconCheckCircle,
} from '@arco-design/web-react/icon';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../layouts/MainLayout';
import { riskApi } from '../../api';
import { RiskDashboardData, RiskDashboardInsights } from '../../types';
import { RISK_LEVEL_MAP } from '../../utils/constants';
import dayjs from 'dayjs';

const RISK_COLORS: Record<string, string> = {
  LOW: '#00B42A',
  MEDIUM: '#FF7D00',
  HIGH: '#F53F3F',
  CRITICAL: '#8B0000',
};

const RISK_BG: Record<string, string> = {
  LOW: '#E8FFEA',
  MEDIUM: '#FFF7E8',
  HIGH: '#FFECE8',
  CRITICAL: '#FFECE8',
};

const RiskDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<RiskDashboardData | null>(null);
  const [insights, setInsights] = useState<RiskDashboardInsights | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dashRes, insRes] = await Promise.all([
        riskApi.getDashboard(),
        riskApi.getInsights().catch(() => ({ data: null })),
      ]);
      setDashboard(dashRes.data);
      setInsights(insRes.data);
    } catch {
      Message.error('加载风险仪表盘失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div style={{ padding: 40, textAlign: 'center' }}><Spin size={40} /></div>
      </MainLayout>
    );
  }

  if (!dashboard) {
    return (
      <MainLayout>
        <Empty description="暂无风险数据" />
      </MainLayout>
    );
  }

  const { riskDistribution, projects, topActionItems } = dashboard;

  const statCards = [
    { label: '低风险', count: riskDistribution.LOW, color: RISK_COLORS.LOW, bg: RISK_BG.LOW },
    { label: '中风险', count: riskDistribution.MEDIUM, color: RISK_COLORS.MEDIUM, bg: RISK_BG.MEDIUM },
    { label: '高风险', count: riskDistribution.HIGH, color: RISK_COLORS.HIGH, bg: RISK_BG.HIGH },
    { label: '严重风险', count: riskDistribution.CRITICAL, color: RISK_COLORS.CRITICAL, bg: RISK_BG.CRITICAL },
  ];

  const columns = [
    {
      title: '项目',
      dataIndex: 'projectName',
      render: (name: string, record: any) => (
        <a
          style={{ cursor: 'pointer', color: 'var(--color-primary-6)' }}
          onClick={() => navigate(`/projects/${record.projectId}?tab=risk`)}
        >
          {name}
        </a>
      ),
    },
    {
      title: '产品线',
      dataIndex: 'productLine',
      width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '风险等级',
      dataIndex: 'riskLevel',
      width: 110,
      render: (level: string) => {
        const info = RISK_LEVEL_MAP[level as keyof typeof RISK_LEVEL_MAP];
        return (
          <Tag
            style={{
              background: RISK_BG[level],
              color: RISK_COLORS[level],
              border: `1px solid ${RISK_COLORS[level]}`,
              fontWeight: 600,
            }}
          >
            {info?.label || level}
          </Tag>
        );
      },
    },
    {
      title: '趋势',
      dataIndex: 'trendDirection',
      width: 80,
      render: (trend: string) => {
        if (trend === 'IMPROVING') return <IconArrowFall style={{ color: '#00B42A', fontSize: 18 }} />;
        if (trend === 'WORSENING') return <IconArrowRise style={{ color: '#F53F3F', fontSize: 18 }} />;
        return <IconMinus style={{ color: '#86909c', fontSize: 18 }} />;
      },
    },
    {
      title: '评估时间',
      dataIndex: 'assessedAt',
      width: 140,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: 'AI 摘要',
      dataIndex: 'aiInsights',
      ellipsis: true,
      render: (v: string | null) => v ? (
        <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{v.slice(0, 60)}{v.length > 60 ? '...' : ''}</span>
      ) : '-',
    },
  ];

  return (
    <MainLayout>
      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>风险总览</h2>
          <div style={{ fontSize: 13, color: 'var(--color-text-3)', marginTop: 4 }}>
            跨项目风险全景视图
          </div>
        </div>

        {/* AI 洞察卡片 */}
        {insights && insights.topConcerns.length > 0 && (
          <Card
            style={{ marginBottom: 20 }}
            bodyStyle={{
              padding: '16px 20px',
              borderLeft: '4px solid var(--color-primary-6)',
              borderRadius: '0 8px 8px 0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <IconBulb style={{ color: 'var(--color-primary-6)', fontSize: 18 }} />
              <span style={{ fontWeight: 600, fontSize: 15 }}>本周最需关注</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {insights.topConcerns.map((concern, i) => (
                <li key={i} style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--color-text-1)' }}>{concern}</li>
              ))}
            </ul>
            {(insights.improvements.length > 0 || insights.deteriorations.length > 0) && (
              <div style={{ marginTop: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {insights.improvements.length > 0 && (
                  <div>
                    <span style={{ fontSize: 12, color: '#00B42A', fontWeight: 500 }}>改善 ↓</span>
                    {insights.improvements.map((item, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>{item}</div>
                    ))}
                  </div>
                )}
                {insights.deteriorations.length > 0 && (
                  <div>
                    <span style={{ fontSize: 12, color: '#F53F3F', fontWeight: 500 }}>恶化 ↑</span>
                    {insights.deteriorations.map((item, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>{item}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* 风险分布统计 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
          {statCards.map((card) => (
            <Card
              key={card.label}
              bodyStyle={{
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: 'var(--color-text-3)' }}>{card.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: card.color, marginTop: 4 }}>{card.count}</div>
              </div>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: card.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {card.label === '低风险' && <IconCheckCircle style={{ fontSize: 20, color: card.color }} />}
                {card.label === '中风险' && <IconExclamationCircle style={{ fontSize: 20, color: card.color }} />}
                {card.label === '高风险' && <IconExclamationCircle style={{ fontSize: 20, color: card.color }} />}
                {card.label === '严重风险' && <IconExclamationCircle style={{ fontSize: 20, color: card.color }} />}
              </div>
            </Card>
          ))}
        </div>

        {/* 项目风险矩阵表 */}
        <Card
          style={{ marginBottom: 20 }}
          bodyStyle={{ padding: '16px' }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>项目风险矩阵</div>
          {projects.length > 0 ? (
            <Table
              columns={columns}
              data={projects}
              rowKey="projectId"
              pagination={false}
              border={false}
              size="small"
              onRow={(record) => ({
                style: { cursor: 'pointer' },
                onClick: () => navigate(`/projects/${record.projectId}?tab=risk`),
              })}
            />
          ) : (
            <Empty description="暂无进行中项目的风险评估数据" />
          )}
        </Card>

        {/* 行动项面板 */}
        {topActionItems.length > 0 && (
          <Card bodyStyle={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <IconExclamationCircle style={{ color: 'var(--color-warning-6)' }} />
              <span style={{ fontWeight: 500, fontSize: 14 }}>待办行动项</span>
            </div>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {topActionItems.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    background: 'var(--color-fill-1)',
                    borderRadius: 6,
                  }}
                >
                  <Tag
                    size="small"
                    color={item.priority === 'HIGH' ? 'red' : item.priority === 'MEDIUM' ? 'orange' : 'green'}
                    style={{ flexShrink: 0 }}
                  >
                    {item.priority}
                  </Tag>
                  <span style={{ fontSize: 13, flex: 1 }}>{item.action}</span>
                  <a
                    style={{ fontSize: 12, color: 'var(--color-primary-6)', cursor: 'pointer', flexShrink: 0 }}
                    onClick={(e) => { e.stopPropagation(); navigate(`/projects/${item.projectId}?tab=risk`); }}
                  >
                    {item.projectName}
                  </a>
                </div>
              ))}
            </Space>
          </Card>
        )}
      </div>
    </MainLayout>
  );
};

export default RiskDashboard;
