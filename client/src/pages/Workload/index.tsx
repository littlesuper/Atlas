import React, { useState, useEffect } from 'react';
import { Table, Card, Select, Message, Tag } from '@arco-design/web-react';
import MainLayout from '../../layouts/MainLayout';
import { activitiesApi, projectsApi } from '../../api';
import { Project } from '../../types';

interface WorkloadEntry {
  userId: string;
  realName: string;
  username: string;
  totalActivities: number;
  inProgress: number;
  overdue: number;
  totalDuration: number;
}

const OVERDUE_THRESHOLD = 0;
const DURATION_THRESHOLD = 60; // days

const WorkloadPage: React.FC = () => {
  const [data, setData] = useState<WorkloadEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | undefined>(undefined);

  useEffect(() => {
    projectsApi.list({ pageSize: 100 }).then((res) => {
      setProjects(res.data.data || []);
    }).catch(() => {});
  }, []);

  const loadWorkload = async () => {
    setLoading(true);
    try {
      const params: { projectId?: string } = {};
      if (selectedProject) params.projectId = selectedProject;
      const res = await activitiesApi.getWorkload(params);
      setData(res.data || []);
    } catch {
      Message.error('加载资源负载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkload();
  }, [selectedProject]);

  const columns = [
    {
      title: '姓名',
      dataIndex: 'realName',
      width: 120,
      render: (name: string, record: WorkloadEntry) => (
        <span style={{ fontWeight: 500 }}>{name || record.username}</span>
      ),
    },
    {
      title: '活动总数',
      dataIndex: 'totalActivities',
      width: 100,
      sorter: (a: WorkloadEntry, b: WorkloadEntry) => a.totalActivities - b.totalActivities,
    },
    {
      title: '进行中',
      dataIndex: 'inProgress',
      width: 100,
      sorter: (a: WorkloadEntry, b: WorkloadEntry) => a.inProgress - b.inProgress,
      render: (val: number) => (
        <Tag color={val > 0 ? 'arcoblue' : 'default'}>{val}</Tag>
      ),
    },
    {
      title: '逾期',
      dataIndex: 'overdue',
      width: 100,
      sorter: (a: WorkloadEntry, b: WorkloadEntry) => a.overdue - b.overdue,
      render: (val: number) => (
        <Tag color={val > OVERDUE_THRESHOLD ? 'red' : 'default'}>{val}</Tag>
      ),
    },
    {
      title: '总工期 (天)',
      dataIndex: 'totalDuration',
      width: 120,
      sorter: (a: WorkloadEntry, b: WorkloadEntry) => a.totalDuration - b.totalDuration,
      render: (val: number) => (
        <span style={{ color: val > DURATION_THRESHOLD ? 'var(--status-warning)' : undefined, fontWeight: val > DURATION_THRESHOLD ? 600 : undefined }}>
          {val}
        </span>
      ),
    },
  ];

  return (
    <MainLayout>
      <div>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>资源负载</h3>
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

          <Table
            columns={columns}
            data={data}
            loading={loading}
            rowKey="userId"
            pagination={false}
            scroll={{ x: 600 }}
          />
        </Card>
      </div>
    </MainLayout>
  );
};

export default WorkloadPage;
