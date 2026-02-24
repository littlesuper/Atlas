import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Input,
  Space,
  Tag,
  Progress,
  Drawer,
  Form,
  Select,
  DatePicker,
  Message,
  Modal,
  Tooltip,
} from '@arco-design/web-react';
import {
  IconSearch,
  IconPlus,
  IconEdit,
  IconDelete,
} from '@arco-design/web-react/icon';
import MainLayout from '../../../layouts/MainLayout';
import { projectsApi, usersApi } from '../../../api';
import { useAuthStore } from '../../../store/authStore';
import { Project, User } from '../../../types';
import {
  STATUS_MAP,
  PRIORITY_MAP,
  PRODUCT_LINE_MAP,
} from '../../../utils/constants';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

// 统计卡片组件
interface StatCardProps {
  title: string;
  count: number;
  color: string;
  selected: boolean;
  onClick: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ title, count, color, selected, onClick }) => {
  return (
    <Card
      hoverable
      onClick={onClick}
      style={{
        height: 88,
        cursor: 'pointer',
        border: selected ? `2px solid ${color}` : '1px solid #e4e6ef',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
        <div style={{ fontSize: 12, color: '#8c8ca1', marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 28, fontWeight: 600, color: color }}>{count}</div>
      </div>
    </Card>
  );
};

const ProjectList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission, isProjectManager } = useAuthStore();
  const [form] = Form.useForm();

  // 数据状态
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [stats, setStats] = useState({ all: 0, inProgress: 0, completed: 0, onHold: 0 });

  // 表单联动：追踪当前选中的项目经理
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');

  // 筛选状态 — 从 URL 初始化
  const [searchKeyword, setSearchKeyword] = useState(searchParams.get('keyword') || '');
  const [selectedStatus, setSelectedStatus] = useState<string>(searchParams.get('status') ?? 'IN_PROGRESS');
  const [selectedProductLine, setSelectedProductLine] = useState<string>(searchParams.get('productLine') || '');
  const [selectedPhase, setSelectedPhase] = useState<string>(searchParams.get('phase') || '');

  // 分页状态 — 从 URL 初始化
  const [pagination, setPagination] = useState({
    current: Number(searchParams.get('page')) || 1,
    pageSize: Number(searchParams.get('pageSize')) || 20,
    total: 0,
  });

  // 同步筛选/分页状态到 URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (pagination.current !== 1) params.set('page', String(pagination.current));
    if (pagination.pageSize !== 20) params.set('pageSize', String(pagination.pageSize));
    if (searchKeyword) params.set('keyword', searchKeyword);
    if (selectedStatus) params.set('status', selectedStatus);
    if (selectedProductLine) params.set('productLine', selectedProductLine);
    if (selectedPhase) params.set('phase', selectedPhase);
    setSearchParams(params, { replace: true });
  }, [pagination.current, pagination.pageSize, searchKeyword, selectedStatus, selectedProductLine, selectedPhase, setSearchParams]);

  // 加载项目列表
  const loadProjects = async (page = pagination.current, pageSize = pagination.pageSize) => {
    setLoading(true);
    try {
      const params: { status?: string; productLine?: string; keyword?: string; phase?: string; page?: number; pageSize?: number } = {
        page,
        pageSize,
      };
      if (selectedStatus) params.status = selectedStatus;
      if (selectedProductLine) params.productLine = selectedProductLine;
      if (selectedPhase) params.phase = selectedPhase;
      if (searchKeyword) params.keyword = searchKeyword;

      const response = await projectsApi.list(params);
      const { data: list, total, stats: serverStats } = response.data;
      setProjects(list || []);
      setStats(serverStats || { all: 0, inProgress: 0, completed: 0, onHold: 0 });
      setPagination((prev) => ({ ...prev, current: page, pageSize, total }));
    } catch (error) {
      Message.error('加载项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载用户列表
  const loadUsers = async () => {
    try {
      const response = await usersApi.list();
      setUsers(response.data.data || []);
    } catch (error) {
      console.error('加载用户列表失败', error);
    }
  };

  useEffect(() => {
    loadProjects(1, pagination.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStatus, selectedProductLine, selectedPhase, searchKeyword]);

  useEffect(() => {
    loadUsers();
  }, []);

  // 统计数据（来自服务端）
  const statistics = useMemo(() => ({
    total: stats.all,
    inProgress: stats.inProgress,
    completed: stats.completed,
    onHold: stats.onHold,
  }), [stats]);


  // 处理搜索（debounce 300ms）
  const handleSearch = useMemo(() => {
    let timer: NodeJS.Timeout;
    return (value: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setSearchKeyword(value);
        setPagination((prev) => ({ ...prev, current: 1 }));
      }, 300);
    };
  }, []);

  // 打开新建/编辑抽屉
  const handleOpenDrawer = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setSelectedManagerId(project.managerId);
      form.setFieldsValue({
        name: project.name,
        description: project.description,
        productLine: project.productLine,
        status: project.status,
        priority: project.priority,
        dateRange: [dayjs(project.startDate), project.endDate ? dayjs(project.endDate) : undefined],
        managerId: project.managerId,
        memberIds: project.members?.map((m) => m.user.id) || [],
      });
    } else {
      setEditingProject(null);
      setSelectedManagerId('');
      form.resetFields();
    }
    setDrawerVisible(true);
  };

  // 同步协作者：对比新旧列表，增删差异
  const syncMembers = async (projectId: string, newMemberIds: string[], oldMemberIds: string[]) => {
    const toAdd = newMemberIds.filter((id) => !oldMemberIds.includes(id));
    const toRemove = oldMemberIds.filter((id) => !newMemberIds.includes(id));
    await Promise.all([
      ...toAdd.map((userId) => projectsApi.addMember(projectId, userId)),
      ...toRemove.map((userId) => projectsApi.removeMember(projectId, userId)),
    ]);
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      const data = {
        name: values.name,
        description: values.description,
        productLine: values.productLine,
        status: values.status,
        priority: values.priority,
        startDate: dayjs(values.dateRange[0]).format('YYYY-MM-DD'),
        endDate: values.dateRange[1] ? dayjs(values.dateRange[1]).format('YYYY-MM-DD') : undefined,
        managerId: values.managerId,
      };
      const memberIds: string[] = values.memberIds || [];

      if (editingProject) {
        await projectsApi.update(editingProject.id, data);
        const oldMemberIds = editingProject.members?.map((m) => m.user.id) || [];
        await syncMembers(editingProject.id, memberIds, oldMemberIds);
        Message.success('项目更新成功');
      } else {
        const res = await projectsApi.create(data);
        if (memberIds.length > 0) {
          await syncMembers(res.data.id, memberIds, []);
        }
        Message.success('项目创建成功');
      }

      setDrawerVisible(false);
      loadProjects();
    } catch (error) {
      console.error('提交失败', error);
    }
  };

  // 删除项目
  const handleDelete = (project: Project) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除项目"${project.name}"吗？此操作不可恢复。`,
      onOk: async () => {
        try {
          await projectsApi.delete(project.id);
          Message.success('项目删除成功');
          loadProjects();
        } catch (error) {
          Message.error('项目删除失败');
        }
      },
    });
  };

  // 表格列配置
  const columns = [
    {
      title: '项目名称',
      dataIndex: 'name',
      width: 250,
      sorter: (a: Project, b: Project) => a.name.localeCompare(b.name),
      render: (name: string, record: Project) => {
        const PROGRESS_ICON: Record<string, string> = { ON_TRACK: '✓', MINOR_ISSUE: '⚠️', MAJOR_ISSUE: '✕' };
        const PROGRESS_COLOR: Record<string, string> = { ON_TRACK: '#00b42a', MINOR_ISSUE: '#ff7d00', MAJOR_ISSUE: '#f53f3f' };
        const PROGRESS_TOOLTIP: Record<string, string> = { ON_TRACK: '顺利进行', MINOR_ISSUE: '轻度阻碍', MAJOR_ISSUE: '严重阻碍' };
        const ps = record.latestProgressStatus;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {ps && PROGRESS_ICON[ps] && (
              <Tooltip content={PROGRESS_TOOLTIP[ps]}>
                <span style={{ color: PROGRESS_COLOR[ps], fontWeight: 700, fontSize: 14, cursor: 'default', flexShrink: 0 }}>
                  {PROGRESS_ICON[ps]}
                </span>
              </Tooltip>
            )}
            <a
              onClick={() => navigate(`/projects/${record.id}`)}
              style={{ color: '#4f7cff', fontWeight: 500, cursor: 'pointer' }}
            >
              {name}
            </a>
          </span>
        );
      },
    },
    {
      title: '阶段',
      dataIndex: 'currentPhase',
      width: 80,
      render: (phase: string | null) => {
        if (!phase) return <span style={{ color: '#c2c7d0' }}>-</span>;
        const PHASE_COLOR: Record<string, string> = { EVT: 'blue', DVT: 'cyan', PVT: 'purple', MP: 'orange' };
        return <Tag color={PHASE_COLOR[phase] || 'default'}>{phase}</Tag>;
      },
    },
    {
      title: '产品线',
      dataIndex: 'productLine',
      width: 120,
      render: (productLine: string) => {
        const config = PRODUCT_LINE_MAP[productLine as keyof typeof PRODUCT_LINE_MAP] ?? { label: productLine, color: 'default' };
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      sorter: (a: Project, b: Project) => a.status.localeCompare(b.status),
      render: (status: string) => {
        const config = STATUS_MAP[status as keyof typeof STATUS_MAP] ?? { label: status, color: 'default' };
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 100,
      sorter: (a: Project, b: Project) => a.priority.localeCompare(b.priority),
      render: (priority: string) => {
        const config = PRIORITY_MAP[priority as keyof typeof PRIORITY_MAP] ?? { label: priority, color: 'default' };
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      width: 150,
      sorter: (a: Project, b: Project) => (a.progress || 0) - (b.progress || 0),
      render: (progress: number = 0) => (
        <Progress percent={progress} size="small" />
      ),
    },
    {
      title: '负责人',
      dataIndex: 'manager',
      width: 120,
      render: (manager: { realName?: string; username: string } | undefined) =>
        manager?.realName || manager?.username || '-',
    },
    {
      title: '时间',
      width: 200,
      sorter: (a: Project, b: Project) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
      render: (_: unknown, record: Project) => (
        <span className="text-meta">
          {dayjs(record.startDate).format('YYYY-MM-DD')}
          {record.endDate && ` ~ ${dayjs(record.endDate).format('YYYY-MM-DD')}`}
        </span>
      ),
    },
    {
      title: '活动数',
      width: 80,
      render: (_: unknown, record: Project) => record._count?.activities ?? 0,
    },
    {
      title: '操作',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: Project) => (
        <Space>
          {hasPermission('project', 'update') && isProjectManager(record.managerId, record.id) && (
            <Tooltip content="编辑">
              <Button
                type="text"
                icon={<IconEdit />}
                size="small"
                onClick={() => handleOpenDrawer(record)}
              />
            </Tooltip>
          )}
          {hasPermission('project', 'delete') && isProjectManager(record.managerId, record.id) && (
            <Tooltip content="删除">
              <Button
                type="text"
                status="danger"
                icon={<IconDelete />}
                size="small"
                onClick={() => handleDelete(record)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <MainLayout>
      <div>
        {/* 统计卡片 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <StatCard
            title="全部项目"
            count={statistics.total}
            color="#4f7cff"
            selected={selectedStatus === ''}
            onClick={() => setSelectedStatus('')}
          />
          <StatCard
            title="进行中"
            count={statistics.inProgress}
            color="#00b42a"
            selected={selectedStatus === 'IN_PROGRESS'}
            onClick={() => setSelectedStatus('IN_PROGRESS')}
          />
          <StatCard
            title="已完成"
            count={statistics.completed}
            color="#86909c"
            selected={selectedStatus === 'COMPLETED'}
            onClick={() => setSelectedStatus('COMPLETED')}
          />
          <StatCard
            title="已暂停"
            count={statistics.onHold}
            color="#ff7d00"
            selected={selectedStatus === 'ON_HOLD'}
            onClick={() => setSelectedStatus('ON_HOLD')}
          />
        </div>

        {/* 表格卡片 */}
        <Card>
          {/* 工具栏 */}
          <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
            <Space>
              <Input
                style={{ width: 240 }}
                prefix={<IconSearch />}
                placeholder="搜索项目名称..."
                allowClear
                onChange={handleSearch}
              />
              <Select
                style={{ width: 140 }}
                placeholder="产品线"
                allowClear
                value={selectedProductLine || undefined}
                onChange={(value) => setSelectedProductLine(value || '')}
              >
                {Object.entries(PRODUCT_LINE_MAP).map(([key, value]) => (
                  <Select.Option key={key} value={key}>
                    {value.label}
                  </Select.Option>
                ))}
              </Select>
              <Select
                style={{ width: 110 }}
                placeholder="阶段"
                allowClear
                value={selectedPhase || undefined}
                onChange={(value) => setSelectedPhase(value || '')}
              >
                {['EVT', 'DVT', 'PVT', 'MP'].map((p) => (
                  <Select.Option key={p} value={p}>{p}</Select.Option>
                ))}
              </Select>
              {hasPermission('project', 'create') && (
                <Button
                  type="primary"
                  icon={<IconPlus />}
                  onClick={() => handleOpenDrawer()}
                >
                  新建项目
                </Button>
              )}
            </Space>
          </div>

          {/* 表格 */}
          <Table
            columns={columns}
            data={projects}
            loading={loading}
            rowKey="id"
            noDataElement={loading ? <div style={{ height: 300 }} /> : undefined}
            pagination={{
              ...pagination,
              showTotal: true,
              sizeCanChange: true,
              onChange: (current, pageSize) => {
                loadProjects(current, pageSize);
              },
            }}
            scroll={{ x: 1200 }}
          />
        </Card>

        {/* 新建/编辑抽屉 */}
        <Drawer
          width={600}
          title={editingProject ? '编辑项目' : '新建项目'}
          visible={drawerVisible}
          onCancel={() => setDrawerVisible(false)}
          footer={
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setDrawerVisible(false)}>取消</Button>
                <Button type="primary" onClick={handleSubmit}>
                  {editingProject ? '保存' : '创建'}
                </Button>
              </Space>
            </div>
          }
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              status: 'IN_PROGRESS',
              priority: 'MEDIUM',
              productLine: 'DANDELION',
            }}
          >
            {/* 项目名称 */}
            <Form.Item
              label="项目名称"
              field="name"
              rules={[{ required: true, message: '请输入项目名称' }]}
            >
              <Input placeholder="请输入项目名称" />
            </Form.Item>

            {/* 项目描述 */}
            <Form.Item label="项目描述" field="description">
              <Input.TextArea
                placeholder="请输入项目描述"
                rows={3}
                showWordLimit
                maxLength={500}
              />
            </Form.Item>

            {/* 产品线 / 状态 / 优先级 — 一行三列 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Form.Item
                label="产品线"
                field="productLine"
                rules={[{ required: true, message: '请选择产品线' }]}
              >
                <Select placeholder="产品线">
                  {Object.entries(PRODUCT_LINE_MAP).map(([key, value]) => (
                    <Select.Option key={key} value={key}>
                      <Tag color={value.color}>{value.label}</Tag>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                label="状态"
                field="status"
                rules={[{ required: true, message: '请选择状态' }]}
              >
                <Select placeholder="状态">
                  {Object.entries(STATUS_MAP).map(([key, value]) => (
                    <Select.Option key={key} value={key}>
                      <Tag color={value.color}>{value.label}</Tag>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                label="优先级"
                field="priority"
                rules={[{ required: true, message: '请选择优先级' }]}
              >
                <Select placeholder="优先级">
                  {Object.entries(PRIORITY_MAP).map(([key, value]) => (
                    <Select.Option key={key} value={key}>
                      <Tag color={value.color}>{value.label}</Tag>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </div>

            {/* 时间 */}
            <Form.Item
              label="时间"
              field="dateRange"
              rules={[
                { required: true, message: '请选择时间' },
                {
                  validator: (value, callback) => {
                    if (value && value[0] && value[1] && dayjs(value[1]).isBefore(dayjs(value[0]))) {
                      callback('结束日期不能早于开始日期');
                    } else {
                      callback();
                    }
                  },
                },
              ]}
            >
              <RangePicker style={{ width: '100%' }} />
            </Form.Item>

            {/* 项目经理 / 协作者 — 一行两列 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item
                label="项目经理"
                field="managerId"
                rules={[{ required: true, message: '请选择项目经理' }]}
              >
                <Select placeholder="项目经理" showSearch filterOption={(input, option) =>
                  (option?.props?.children as string)?.toLowerCase().includes(input.toLowerCase())
                } onChange={(v) => {
                  setSelectedManagerId(v || '');
                  // 如果新经理在协作者列表中，自动移除
                  const currentMembers: string[] = form.getFieldValue('memberIds') || [];
                  if (v && currentMembers.includes(v)) {
                    form.setFieldValue('memberIds', currentMembers.filter((id) => id !== v));
                  }
                }}>
                  {users.map((u) => (
                    <Select.Option key={u.id} value={u.id}>
                      {u.realName || u.username}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item label="协作者" field="memberIds">
                <Select
                  mode="multiple"
                  placeholder="协作者（可选）"
                  allowClear
                  showSearch
                  maxTagCount={2}
                  filterOption={(input, option) =>
                    (option?.props?.children as string)?.toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {users
                    .filter((u) => u.id !== selectedManagerId)
                    .map((u) => (
                      <Select.Option key={u.id} value={u.id}>
                        {u.realName || u.username}
                      </Select.Option>
                    ))
                  }
                </Select>
              </Form.Item>
            </div>
          </Form>
        </Drawer>
      </div>
    </MainLayout>
  );
};

export default ProjectList;
