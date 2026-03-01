import React, { useState, useCallback } from 'react';
import {
  Card,
  Button,
  Table,
  Space,
  Tag,
  Message,
  InputNumber,
  Select,
  Modal,
  Empty,
  Typography,
  Alert,
  Radio,
} from '@arco-design/web-react';
import { activitiesApi } from '../../../api';
import { Activity, ResourceConflict, WhatIfResult, AiScheduleSuggestion } from '../../../types';
import dayjs from 'dayjs';

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
      Message.error('加载资源冲突失败');
    } finally {
      setConflictsLoading(false);
    }
  }, [projectId, conflictScope]);

  // ---- What-if simulation ----
  const runWhatIf = async () => {
    if (!whatIfActivityId) {
      Message.warning('请选择要模拟的活动');
      return;
    }
    setWhatIfLoading(true);
    try {
      const days = whatIfDirection === 'advance' ? -whatIfDays : whatIfDays;
      const res = await activitiesApi.whatIf(projectId, whatIfActivityId, days);
      setWhatIfResult(res.data);
    } catch {
      Message.error('模拟失败');
    } finally {
      setWhatIfLoading(false);
    }
  };

  // ---- Apply what-if results ----
  const handleApplyWhatIf = () => {
    if (!whatIfResult || whatIfResult.affected.length === 0) return;
    Modal.confirm({
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
          Message.success('模拟结果已成功应用');
          setWhatIfResult(null);
          onRefresh();
        } catch {
          Message.error('应用模拟结果失败');
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
      Message.error('AI 排期建议获取失败');
    } finally {
      setAiLoading(false);
    }
  };

  // Conflict table columns
  const conflictColumns = [
    {
      title: '人员',
      dataIndex: 'realName',
      width: 120,
      render: (name: string) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    {
      title: '冲突活动',
      dataIndex: 'activities',
      render: (acts: ResourceConflict['activities']) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {acts.map((a) => {
            const isOtherProject = a.projectId !== projectId;
            return (
              <div key={a.id} style={{ fontSize: 12 }}>
                <Tag size="small" color={isOtherProject ? 'orange' : 'blue'}>{a.projectName}</Tag>
                <span>{a.name}</span>
                <span style={{ color: 'var(--color-text-3)', marginLeft: 8 }}>
                  {dayjs(a.planStartDate).format('MM-DD')} ~ {dayjs(a.planEndDate).format('MM-DD')}
                </span>
              </div>
            );
          })}
        </div>
      ),
    },
  ];

  // Determine color for new dates: green if earlier, orange if later
  const getDateColor = (original: string | null, newDate: string | null) => {
    if (!original || !newDate) return 'rgb(var(--warning-6))';
    return dayjs(newDate).isBefore(dayjs(original)) ? 'rgb(var(--success-6))' : 'rgb(var(--warning-6))';
  };

  // What-if affected table columns
  const whatIfColumns = [
    {
      title: '活动名称',
      dataIndex: 'name',
      width: 200,
    },
    {
      title: '原计划开始',
      dataIndex: 'originalStart',
      width: 120,
      render: (d: string | null) => d ? dayjs(d).format('YYYY-MM-DD') : '-',
    },
    {
      title: '原计划结束',
      dataIndex: 'originalEnd',
      width: 120,
      render: (d: string | null) => d ? dayjs(d).format('YYYY-MM-DD') : '-',
    },
    {
      title: '新开始日期',
      dataIndex: 'newStart',
      width: 120,
      render: (d: string | null, record: WhatIfResult['affected'][0]) => d ? (
        <span style={{ color: getDateColor(record.originalStart, d) }}>{dayjs(d).format('YYYY-MM-DD')}</span>
      ) : '-',
    },
    {
      title: '新结束日期',
      dataIndex: 'newEnd',
      width: 120,
      render: (d: string | null, record: WhatIfResult['affected'][0]) => d ? (
        <span style={{ color: getDateColor(record.originalEnd, d) }}>{dayjs(d).format('YYYY-MM-DD')}</span>
      ) : '-',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Resource conflict detection */}
      <Card title="资源冲突检测" size="small">
        <Typography.Paragraph style={{ color: 'var(--color-text-3)', marginBottom: 12 }}>
          检测同一人员在同一时间段被分配到多个活动的冲突情况，支持跨项目全局检测。
        </Typography.Paragraph>
        <Space>
          <Radio.Group
            type="button"
            size="default"
            value={conflictScope}
            onChange={(v) => { setConflictScope(v); setConflictsLoaded(false); setConflicts([]); }}
          >
            <Radio value="all">所有项目</Radio>
            <Radio value="project">仅当前项目</Radio>
          </Radio.Group>
          <Button type="primary" loading={conflictsLoading} onClick={loadConflicts}>
            {conflictsLoaded ? '刷新检测' : '开始检测'}
          </Button>
        </Space>

        {conflictsLoaded && (
          <div style={{ marginTop: 12 }}>
            {conflicts.length === 0 ? (
              <Alert type="success" content="未发现资源冲突" />
            ) : (
              <>
                <Alert
                  type="warning"
                  content={`发现 ${conflicts.length} 个人员存在时间冲突`}
                  style={{ marginBottom: 8 }}
                />
                <Table
                  columns={conflictColumns}
                  data={conflicts}
                  rowKey="userId"
                  pagination={false}
                  size="small"
                />
              </>
            )}
          </div>
        )}
      </Card>

      {/* What-if simulation */}
      <Card title="What-If 模拟" size="small">
        <Typography.Paragraph style={{ color: 'var(--color-text-3)', marginBottom: 12 }}>
          模拟某个活动延期或提前完成后对下游依赖活动和项目整体结束日期的影响（不会实际修改数据）。
        </Typography.Paragraph>
        <Space wrap>
          <Select
            style={{ width: 300 }}
            placeholder="选择要模拟的活动"
            showSearch
            value={whatIfActivityId || undefined}
            onChange={(v) => setWhatIfActivityId(v || '')}
            filterOption={(input, option) =>
              (option?.props?.children as string)?.toLowerCase().includes(input.toLowerCase())
            }
          >
            {activeActivities.map((a) => (
              <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>
            ))}
          </Select>
          <Radio.Group
            type="button"
            size="default"
            value={whatIfDirection}
            onChange={(v) => { setWhatIfDirection(v); setWhatIfResult(null); }}
          >
            <Radio value="delay">延期</Radio>
            <Radio value="advance">提前</Radio>
          </Radio.Group>
          <InputNumber
            style={{ width: 80 }}
            value={whatIfDays}
            min={1}
            max={365}
            onChange={(v) => setWhatIfDays(v || 5)}
          />
          <span>工作日</span>
          <Button type="primary" loading={whatIfLoading} onClick={runWhatIf}>
            模拟
          </Button>
        </Space>

        {whatIfResult && (
          <div style={{ marginTop: 12 }}>
            <Space style={{ marginBottom: 8 }}>
              <Tag color={whatIfDirection === 'advance' ? 'green' : 'orange'}>
                影响 {whatIfResult.affectedCount} 个下游活动
              </Tag>
              {whatIfResult.projectEndDateBefore && whatIfResult.projectEndDateAfter && (
                <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>
                  项目结束日期：{dayjs(whatIfResult.projectEndDateBefore).format('YYYY-MM-DD')}
                  {' → '}
                  <span style={{
                    color: dayjs(whatIfResult.projectEndDateAfter).isBefore(dayjs(whatIfResult.projectEndDateBefore))
                      ? 'rgb(var(--success-6))' : 'rgb(var(--warning-6))',
                    fontWeight: 500,
                  }}>
                    {dayjs(whatIfResult.projectEndDateAfter).format('YYYY-MM-DD')}
                  </span>
                </span>
              )}
            </Space>
            {whatIfResult.affected.length > 0 ? (
              <>
                <Table
                  columns={whatIfColumns}
                  data={whatIfResult.affected}
                  rowKey="id"
                  pagination={false}
                  size="small"
                />
                <div style={{ marginTop: 12 }}>
                  <Button
                    type="primary"
                    status="warning"
                    loading={applyLoading}
                    onClick={handleApplyWhatIf}
                    disabled={isArchived}
                  >
                    一键导入更新
                  </Button>
                </div>
              </>
            ) : (
              <Empty description="无下游受影响活动" />
            )}
          </div>
        )}
      </Card>

      {/* AI scheduling suggestions */}
      <Card title="AI 排期建议" size="small">
        <Typography.Paragraph style={{ color: 'var(--color-text-3)', marginBottom: 12 }}>
          基于历史项目数据和 AI 分析，为活动推荐合理工期并识别潜在风险。
        </Typography.Paragraph>
        <Button type="primary" loading={aiLoading} onClick={runAiSchedule}>
          获取 AI 建议
        </Button>

        {aiResult && (
          <div style={{ marginTop: 16 }}>
            {/* Summary */}
            {aiResult.summary && (
              <Alert
                type="info"
                content={aiResult.summary}
                style={{ marginBottom: 12 }}
              />
            )}

            {/* Duration suggestions */}
            {aiResult.suggestions.length > 0 && (
              <Card title="工期建议" size="small" style={{ marginBottom: 12 }}>
                <Table
                  columns={[
                    { title: '活动名称', dataIndex: 'name', width: 200 },
                    {
                      title: '建议工期(天)',
                      dataIndex: 'suggestedDuration',
                      width: 120,
                      render: (d: number) => (
                        <Tag color="blue">{d} 天</Tag>
                      ),
                    },
                    { title: '理由', dataIndex: 'reason' },
                  ]}
                  data={aiResult.suggestions}
                  rowKey="name"
                  pagination={false}
                  size="small"
                />
              </Card>
            )}

            {/* Risk warnings */}
            {aiResult.risks.length > 0 && (
              <Card title="风险提示" size="small">
                <Table
                  columns={[
                    { title: '活动', dataIndex: 'activity', width: 200 },
                    { title: '风险', dataIndex: 'risk' },
                    {
                      title: '严重程度',
                      dataIndex: 'severity',
                      width: 100,
                      render: (s: string) => {
                        const color = s === 'high' ? 'red' : s === 'medium' ? 'orange' : 'blue';
                        const label = s === 'high' ? '高' : s === 'medium' ? '中' : '低';
                        return <Tag color={color}>{label}</Tag>;
                      },
                    },
                  ]}
                  data={aiResult.risks}
                  rowKey="activity"
                  pagination={false}
                  size="small"
                />
              </Card>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default SchedulingTools;
