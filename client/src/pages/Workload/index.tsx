import React, { useState, useEffect, useCallback } from 'react';
import { Card, Select, Message, Table, Tag, Empty, Tooltip, Spin } from '@arco-design/web-react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../layouts/MainLayout';
import { activitiesApi, projectsApi } from '../../api';
import { Project, WorkloadResponse, WorkloadMember, WorkloadIssue } from '../../types';

const OVERLOAD_THRESHOLD = 5;

const WorkloadPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<WorkloadResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | undefined>(undefined);

  useEffect(() => {
    projectsApi.list({ pageSize: 100 }).then((res) => {
      setProjects(res.data.data || []);
    }).catch(() => {});
  }, []);

  const loadWorkload = useCallback(async () => {
    setLoading(true);
    try {
      const params: { projectId?: string } = {};
      if (selectedProject) params.projectId = selectedProject;
      const res = await activitiesApi.getWorkload(params);
      setData(res.data || null);
    } catch {
      Message.error('加载资源负载失败');
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

  // Find max bar value for scaling
  const maxBar = Math.max(1, ...members.map(m => m.inProgress + m.notStarted + m.overdue));

  const issueColumns = [
    {
      title: '类型',
      dataIndex: 'type',
      width: 120,
      render: (type: string) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
            background: type === 'overdue' ? 'var(--status-danger)' : 'var(--status-warning)',
          }} />
          {type === 'overdue' ? '逾期' : '无人负责'}
        </span>
      ),
    },
    {
      title: '活动名称',
      dataIndex: 'activityName',
      render: (name: string, record: WorkloadIssue) => (
        <a
          style={{ color: 'var(--color-text-1)', cursor: 'pointer' }}
          onClick={() => navigate(`/projects/${record.projectId}`)}
        >
          {name}
        </a>
      ),
    },
    {
      title: '所属项目',
      dataIndex: 'projectName',
      width: 180,
      render: (name: string, record: WorkloadIssue) => (
        <a
          style={{ color: 'rgb(var(--primary-6))', cursor: 'pointer' }}
          onClick={() => navigate(`/projects/${record.projectId}`)}
        >
          {name}
        </a>
      ),
    },
    {
      title: '负责人',
      dataIndex: 'assigneeNames',
      width: 120,
      render: (names: string[]) => names.length > 0 ? names.join('、') : <span style={{ color: 'var(--color-text-4)' }}>-</span>,
    },
    {
      title: '详情',
      dataIndex: 'type',
      width: 190,
      render: (_: string, record: WorkloadIssue) => {
        if (record.type === 'overdue') {
          return <span style={{ color: 'var(--status-danger)', fontWeight: 500 }}>逾期 {record.overdueDays} 天</span>;
        }
        const start = record.planStartDate ? new Date(record.planStartDate).toLocaleDateString('zh-CN') : '-';
        const end = record.planEndDate ? new Date(record.planEndDate).toLocaleDateString('zh-CN') : '-';
        return <span style={{ color: 'var(--color-text-3)' }}>{start} ~ {end}</span>;
      },
    },
  ];

  return (
    <MainLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* A. Summary stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <Card style={{ height: 88 }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 8 }}>逾期任务</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--status-danger)' }}>{summary?.totalOverdue ?? '-'}</div>
            </div>
          </Card>
          <Card style={{ height: 88 }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 8 }}>无人负责</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--status-warning)' }}>{summary?.totalUnassigned ?? '-'}</div>
            </div>
          </Card>
          <Card style={{ height: 88 }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 8 }}>超载人员</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--status-danger-dark)' }}>{summary?.overloadedCount ?? '-'}</div>
            </div>
          </Card>
        </div>

        {/* B. Member workload bar chart */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>人员负载</h3>
            <Select
              style={{ width: 240 }}
              placeholder="筛选项目"
              allowClear
              value={selectedProject}
              onChange={(v) => setSelectedProject(v || undefined)}
              showSearch
              filterOption={(input, option) =>
                (option?.props?.children as string)?.toLowerCase().includes(input.toLowerCase())
              }
            >
              {projects.map((p) => (
                <Select.Option key={p.id} value={p.id}>
                  {p.name}
                </Select.Option>
              ))}
            </Select>
          </div>

          <Spin loading={loading} style={{ display: 'block' }}>
            {members.length === 0 ? (
              <Empty description="暂无数据" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {members.map((m: WorkloadMember) => {
                  const isOverloaded = m.inProgress >= OVERLOAD_THRESHOLD;
                  const total = m.inProgress + m.notStarted + m.overdue;
                  const barWidth = total > 0 ? (total / maxBar) * 100 : 0;

                  return (
                    <div
                      key={m.userId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 12px',
                        borderRadius: 6,
                        background: isOverloaded ? 'rgba(245, 63, 63, 0.06)' : undefined,
                      }}
                    >
                      {/* Name */}
                      <div style={{ width: 80, fontWeight: 600, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.realName}
                      </div>

                      {/* Stacked bar */}
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 20, background: 'var(--color-fill-2)', borderRadius: 4, overflow: 'hidden' }}>
                          {total > 0 && (
                            <div style={{ display: 'flex', height: '100%', width: `${barWidth}%`, transition: 'width 0.3s' }}>
                              {m.inProgress > 0 && (
                                <Tooltip content={`进行中: ${m.inProgress}`}>
                                  <div style={{
                                    flex: m.inProgress,
                                    background: 'var(--status-in-progress)',
                                    minWidth: 2,
                                  }} />
                                </Tooltip>
                              )}
                              {m.notStarted > 0 && (
                                <Tooltip content={`未开始: ${m.notStarted}`}>
                                  <div style={{
                                    flex: m.notStarted,
                                    background: 'var(--status-not-started)',
                                    minWidth: 2,
                                  }} />
                                </Tooltip>
                              )}
                              {m.overdue > 0 && (
                                <Tooltip content={`逾期: ${m.overdue}`}>
                                  <div style={{
                                    flex: m.overdue,
                                    background: 'var(--status-danger)',
                                    minWidth: 2,
                                  }} />
                                </Tooltip>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Labels */}
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>
                        <span>{m.inProgress}进行中</span>
                        {m.overdue > 0 && <span style={{ color: 'var(--status-danger)' }}>{m.overdue}逾期</span>}
                        {isOverloaded && <Tag size="small" color="red">超载</Tag>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Spin>
        </Card>

        {/* C. Issues table */}
        <Card>
          <h3 style={{ margin: '0 0 16px 0' }}>需关注</h3>
          {issues.length === 0 && !loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-3)' }}>
              <span style={{ color: 'rgb(var(--success-6))', fontSize: 16, marginRight: 6 }}>&#10003;</span>
              暂无需关注事项
            </div>
          ) : (
            <Table
              columns={issueColumns}
              data={issues}
              loading={loading}
              rowKey={(record) => `${record.type}-${record.activityId}`}
              pagination={false}
              scroll={{ x: 700 }}
            />
          )}
        </Card>
      </div>
    </MainLayout>
  );
};

export default WorkloadPage;
