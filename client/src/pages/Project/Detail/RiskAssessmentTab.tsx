import React, { useState, useEffect } from 'react';
import {
  Button,
  Card,
  Tag,
  Space,
  Empty,
  Message,
  Spin,
} from '@arco-design/web-react';
import { IconThunderbolt } from '@arco-design/web-react/icon';
import { riskApi } from '../../../api';
import { RiskAssessment } from '../../../types';
import { RISK_LEVEL_MAP } from '../../../utils/constants';
import dayjs from 'dayjs';

interface Props {
  projectId: string;
}

const RISK_LEVEL_CONFIG: Record<string, { color: string; bgVar: string }> = {
  LOW:      { color: '#00b42a', bgVar: 'var(--risk-low-bg)' },
  MEDIUM:   { color: '#ff7d00', bgVar: 'var(--risk-medium-bg)' },
  HIGH:     { color: '#f53f3f', bgVar: 'var(--risk-high-bg)' },
  CRITICAL: { color: '#cb2634', bgVar: 'var(--risk-high-bg)' },
};

const SEVERITY_COLOR: Record<string, string> = {
  LOW: 'green',
  MEDIUM: 'orange',
  HIGH: 'red',
};

const RiskAssessmentTab: React.FC<Props> = ({ projectId }) => {
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await riskApi.getHistory(projectId);
      setAssessments(res.data || []);
    } catch {
      Message.error('加载风险评估历史失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const handleAssess = async () => {
    setAssessing(true);
    try {
      await riskApi.assess(projectId);
      Message.success('风险评估完成');
      await load();
    } catch {
      Message.error('风险评估失败');
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
          {assessments.length > 0
            ? `共 ${assessments.length} 次评估记录`
            : '暂无评估记录'}
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
                  <RiskCard key={a.id} assessment={a} />
                ))}
              </Space>
            </div>
          )}
        </div>
      ) : (
        <Empty description="暂无评估记录，点击「发起评估」开始" />
      )}
    </div>
  );
};

const RiskCard: React.FC<{ assessment: RiskAssessment; isLatest?: boolean }> = ({
  assessment,
  isLatest,
}) => {
  const cfg = RISK_LEVEL_CONFIG[assessment.riskLevel] || { color: 'var(--color-text-3)', bgVar: 'var(--color-fill-1)' };

  return (
    <Card
      style={{
        width: '100%',
        borderLeft: isLatest ? `4px solid ${cfg.color}` : undefined,
      }}
      bodyStyle={{ padding: isLatest ? '20px 24px' : '16px 20px' }}
    >
      {/* 头部：风险等级 + 时间 */}
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
        </Space>
        <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
          {dayjs(assessment.assessedAt).format('YYYY-MM-DD HH:mm')}
        </span>
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
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{f.factor}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>{f.description}</div>
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
