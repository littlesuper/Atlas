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
  Message,
  Modal,
  Tooltip,
} from '@arco-design/web-react';
import {
  IconSearch,
  IconPlus,
  IconEdit,
  IconDelete,
  IconFile,
  IconUndo,
  IconApps,
  IconThunderbolt,
  IconCheckCircle,
  IconPause,
  IconStorage,
  IconCheckCircleFill,
  IconExclamationCircleFill,
  IconCloseCircleFill,
} from '@arco-design/web-react/icon';
import MainLayout from '../../../layouts/MainLayout';
import ProjectFormDrawer from '../Edit/ProjectFormDrawer';
import { projectsApi, weeklyReportsApi } from '../../../api';
import { useAuthStore } from '../../../store/authStore';
import { FEATURE_FLAGS } from '../../../featureFlags/flags';
import { useFeatureFlag } from '../../../featureFlags/FeatureFlagProvider';
import { Project } from '../../../types';
import {
  STATUS_MAP,
  PRIORITY_MAP,
  PRODUCT_LINE_MAP,
  PROGRESS_STATUS_MAP,
} from '../../../utils/constants';
import dayjs from 'dayjs';


// 统计卡片组件
interface StatCardDecor {
  icon: React.ReactNode;
  style: React.CSSProperties;
}

interface StatCardProps {
  title: string;
  count: number;
  color: string;
  textColor?: string;
  decors: StatCardDecor[];
  glowStyle?: React.CSSProperties;
  selected: boolean;
  onClick: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ title, count, color, textColor, decors, glowStyle, selected, onClick }) => (
  <Card
    hoverable
    onClick={onClick}
    style={{
      height: 88,
      cursor: 'pointer',
      border: selected ? `2px solid ${color}` : '1px solid var(--color-border-2)',
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      overflow: 'hidden',
    }}
  >
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
      <div style={{
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: '50%',
        backgroundColor: color,
        opacity: 0.07,
        filter: 'blur(20px)',
        pointerEvents: 'none',
        ...glowStyle,
      }} />
      {decors.map((d, i) => (
        <span key={i} style={{
          position: 'absolute',
          color,
          lineHeight: 1,
          pointerEvents: 'none',
          ...d.style,
        }}>
          {d.icon}
        </span>
      ))}
      <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginBottom: 8, position: 'relative' }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: textColor || color, position: 'relative' }}>{count}</div>
    </div>
  </Card>
);

const ProjectList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission, isProjectManager } = useAuthStore();
  const projectTemplatesEnabled = useFeatureFlag(FEATURE_FLAGS.PROJECT_TEMPLATES);

  // 数据状态
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ all: 0, planning: 0, inProgress: 0, completed: 0, onHold: 0, archived: 0 });

  // 最新周报进展状态
  const [latestStatus, setLatestStatus] = useState<Record<string, string>>({});

  // 筛选状态 — 从 URL 初始化
  const [searchKeyword, setSearchKeyword] = useState(searchParams.get('keyword') || '');
  const [selectedStatus, setSelectedStatus] = useState<string>(searchParams.get('status') || '');
  const [selectedProductLines, setSelectedProductLines] = useState<string[]>(() => {
    const param = searchParams.get('productLine');
    if (param) return param.split(',').map(l => l.trim());
    return Object.keys(PRODUCT_LINE_MAP); // 默认全部选中
  });

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
    const allKeys = Object.keys(PRODUCT_LINE_MAP);
    if (selectedProductLines.length > 0 && selectedProductLines.length < allKeys.length) {
      params.set('productLine', selectedProductLines.join(','));
    }
    setSearchParams(params, { replace: true });
  }, [pagination.current, pagination.pageSize, searchKeyword, selectedStatus, selectedProductLines, setSearchParams]);

  // 加载项目列表
  const loadProjects = async (page = pagination.current, pageSize = pagination.pageSize) => {
    setLoading(true);
    try {
      const params: { status?: string; productLine?: string; keyword?: string; page?: number; pageSize?: number } = {
        page,
        pageSize,
      };
      if (selectedStatus) params.status = selectedStatus;
      const allKeys = Object.keys(PRODUCT_LINE_MAP);
      if (selectedProductLines.length > 0 && selectedProductLines.length < allKeys.length) {
        params.productLine = selectedProductLines.join(',');
      }
      if (searchKeyword) params.keyword = searchKeyword;

      const response = await projectsApi.list(params);
      const { data: list, total, stats: serverStats } = response.data;
      setProjects(list || []);
      const s = (serverStats || {}) as any;
      setStats({
        all: s.all ?? 0,
        planning: s.planning ?? 0,
        inProgress: s.inProgress ?? 0,
        completed: s.completed ?? 0,
        onHold: s.onHold ?? 0,
        archived: s.archived ?? 0,
      });
      setPagination((prev) => ({ ...prev, current: page, pageSize, total }));
    } catch {
      Message.error('加载项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects(1, pagination.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStatus, selectedProductLines, searchKeyword]);

  useEffect(() => {
    weeklyReportsApi.getLatestStatus().then(res => setLatestStatus(res.data || {})).catch(() => { });
  }, []);

  // 统计数据（来自服务端）
  const statistics = useMemo(() => ({
    total: stats.all,
    planning: stats.planning,
    inProgress: stats.inProgress,
    completed: stats.completed,
    onHold: stats.onHold,
    archived: stats.archived,
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
        } catch {
          Message.error('项目删除失败');
        }
      },
    });
  };

  // 项目编辑抽屉
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerProjectId, setDrawerProjectId] = useState<string | undefined>(undefined);

  const openCreateDrawer = () => {
    setDrawerProjectId(undefined);
    setDrawerVisible(true);
  };

  const openEditDrawer = (id: string) => {
    setDrawerProjectId(id);
    setDrawerVisible(true);
  };

  const closeDrawer = () => {
    setDrawerVisible(false);
    setDrawerProjectId(undefined);
    // 清掉 URL 上的 new/edit 参数
    if (searchParams.has('new') || searchParams.has('edit')) {
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      next.delete('edit');
      setSearchParams(next, { replace: true });
    }
  };

  // 通过 URL ?new=1 或 ?edit=<id> 触发抽屉打开
  useEffect(() => {
    const newFlag = searchParams.get('new');
    const editId = searchParams.get('edit');
    if (newFlag) {
      setDrawerProjectId(undefined);
      setDrawerVisible(true);
    } else if (editId) {
      setDrawerProjectId(editId);
      setDrawerVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('new'), searchParams.get('edit')]);

  // 归档项目
  const [archiveModalVisible, setArchiveModalVisible] = useState(false);
  const [archivingProject, setArchivingProject] = useState<Project | null>(null);
  const [archiveRemark, setArchiveRemark] = useState('');

  const handleArchive = (project: Project) => {
    setArchivingProject(project);
    setArchiveRemark('');
    setArchiveModalVisible(true);
  };

  const handleConfirmArchive = async () => {
    if (!archivingProject) return;
    try {
      await projectsApi.archiveProject(archivingProject.id, archiveRemark || undefined);
      Message.success('项目归档成功');
      setArchiveModalVisible(false);
      setArchivingProject(null);
      loadProjects();
    } catch {
      Message.error('项目归档失败');
    }
  };

  const handleUnarchive = async (project: Project) => {
    try {
      await projectsApi.unarchiveProject(project.id);
      Message.success('项目已取消归档');
      loadProjects();
    } catch {
      Message.error('取消归档失败');
    }
  };

  // 表格列配置
  const columns = [
    {
      title: '',
      width: 32,
      align: 'center' as const,
      render: (_: unknown, record: Project) => {
        const ps = latestStatus[record.id] as keyof typeof PROGRESS_STATUS_MAP | undefined;
        if (!ps) return null;
        const cfg = PROGRESS_STATUS_MAP[ps];
        const ICON: Record<string, React.ReactNode> = { ON_TRACK: <IconCheckCircleFill />, MINOR_ISSUE: <IconExclamationCircleFill />, MAJOR_ISSUE: <IconCloseCircleFill /> };
        const COLOR: Record<string, string> = { ON_TRACK: 'var(--status-success)', MINOR_ISSUE: 'var(--status-warning)', MAJOR_ISSUE: 'var(--status-danger)' };
        return (
          <Tooltip content={`周报状态：${cfg.label}`}>
            <span style={{ color: COLOR[ps], fontSize: 16, cursor: 'default', display: 'inline-flex', verticalAlign: 'middle' }}>{ICON[ps]}</span>
          </Tooltip>
        );
      },
    },
    {
      title: '项目名称',
      dataIndex: 'name',
      width: 250,
      render: (name: string, record: Project) => (
        <a
          onClick={() => navigate(`/projects/${record.id}`)}
          style={{ color: 'rgb(var(--primary-6))', fontWeight: 500, cursor: 'pointer' }}
        >
          {name}
        </a>
      ),
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
      width: 220,
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
      width: 150,
      fixed: 'right' as const,
      render: (_: unknown, record: Project) => {
        const isArchived = record.status === 'ARCHIVED';
        return (
          <Space>
            {isArchived ? (
              <>
                {hasPermission('project', 'update') && isProjectManager(record.managerId, record.id) && (
                  <Tooltip content="取消归档">
                    <Button
                      type="text"
                      icon={<IconUndo />}
                      size="small"
                      aria-label="取消归档"
                      onClick={() => handleUnarchive(record)}
                    />
                  </Tooltip>
                )}
              </>
            ) : (
              <>
                {hasPermission('project', 'update') && isProjectManager(record.managerId, record.id) && (
                  <Tooltip content="编辑">
                    <Button
                      type="text"
                      icon={<IconEdit />}
                      size="small"
                      aria-label="编辑"
                      onClick={() => openEditDrawer(record.id)}
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
                      aria-label="删除"
                      onClick={() => handleDelete(record)}
                    />
                  </Tooltip>
                )}
                {hasPermission('project', 'update') && isProjectManager(record.managerId, record.id) && (
                  <Tooltip content="归档">
                    <Button
                      type="text"
                      icon={<IconStorage />}
                      size="small"
                      aria-label="归档"
                      onClick={() => handleArchive(record)}
                    />
                  </Tooltip>
                )}
              </>
            )}
          </Space>
        );
      },
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
            color="var(--status-info)"
            textColor="#3055c9"
            glowStyle={{ right: -30, bottom: -40 }}
            decors={[
              { icon: <IconApps />, style: { right: -20, bottom: -28, fontSize: 120, transform: 'rotate(15deg)', opacity: 0.07 } },
            ]}
            selected={selectedStatus === ''}
            onClick={() => setSelectedStatus('')}
          />
          <StatCard
            title="进行中"
            count={statistics.inProgress}
            color="var(--status-success)"
            textColor="#00801d"
            glowStyle={{ right: -20, top: -50 }}
            decors={[
              { icon: <IconThunderbolt />, style: { right: -12, top: -30, fontSize: 130, transform: 'rotate(-22deg)', opacity: 0.08 } },
            ]}
            selected={selectedStatus === 'IN_PROGRESS'}
            onClick={() => setSelectedStatus('IN_PROGRESS')}
          />
          <StatCard
            title="已完成"
            count={statistics.completed}
            color="var(--status-not-started)"
            textColor="#555e66"
            glowStyle={{ right: -35, bottom: -45 }}
            decors={[
              { icon: <IconCheckCircle />, style: { right: -28, bottom: -34, fontSize: 115, transform: 'rotate(10deg)', opacity: 0.07 } },
            ]}
            selected={selectedStatus === 'COMPLETED'}
            onClick={() => setSelectedStatus('COMPLETED')}
          />
          <StatCard
            title="已暂停"
            count={statistics.onHold}
            color="var(--status-warning)"
            textColor="#b85c00"
            glowStyle={{ right: -25, top: -45 }}
            decors={[
              { icon: <IconPause />, style: { right: -16, top: -34, fontSize: 125, transform: 'rotate(-12deg)', opacity: 0.07 } },
            ]}
            selected={selectedStatus === 'ON_HOLD'}
            onClick={() => setSelectedStatus('ON_HOLD')}
          />
          <StatCard
            title="已归档"
            count={statistics.archived}
            color="var(--color-purple-6, #722ed1)"
            glowStyle={{ right: -30, bottom: -35 }}
            decors={[
              { icon: <IconStorage />, style: { right: -22, bottom: -26, fontSize: 110, transform: 'rotate(22deg)', opacity: 0.08 } },
            ]}
            selected={selectedStatus === 'ARCHIVED'}
            onClick={() => setSelectedStatus('ARCHIVED')}
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
              {Object.entries(PRODUCT_LINE_MAP).map(([key, value]) => {
                const isSelected = selectedProductLines.includes(key);
                return (
                  <Tag
                    key={key}
                    checkable
                    checked={isSelected}
                    size="medium"
                    color={isSelected ? value.color : undefined}
                    style={{ cursor: 'pointer', userSelect: 'none', fontSize: 14, padding: '3px 12px' }}
                    onCheck={() => {
                      if (isSelected) {
                        // 至少保留一个
                        if (selectedProductLines.length > 1) {
                          setSelectedProductLines(selectedProductLines.filter(l => l !== key));
                        }
                      } else {
                        setSelectedProductLines([...selectedProductLines, key]);
                      }
                      setPagination((prev) => ({ ...prev, current: 1 }));
                    }}
                  >
                    {value.label}
                  </Tag>
                );
              })}
              {hasPermission('project', 'create') && (
                <>
                  <Button
                    type="primary"
                    icon={<IconPlus />}
                    onClick={openCreateDrawer}
                  >
                    新建项目
                  </Button>
                  {projectTemplatesEnabled && (
                    <Tooltip content="项目模板管理">
                      <Button
                        icon={<IconFile />}
                        aria-label="项目模板管理"
                        onClick={() => navigate('/templates')}
                      />
                    </Tooltip>
                  )}
                </>
              )}
            </Space>
          </div>

          {/* 表格 */}
          <Table
            columns={columns}
            data={projects}
            loading={loading}
            rowKey="id"
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

        {/* 新建/编辑项目抽屉 */}
        <ProjectFormDrawer
          visible={drawerVisible}
          projectId={drawerProjectId}
          onClose={closeDrawer}
          onSuccess={() => loadProjects()}
        />

        {/* 归档确认弹窗 */}
        <Modal
          title="归档项目"
          visible={archiveModalVisible}
          onOk={handleConfirmArchive}
          onCancel={() => { setArchiveModalVisible(false); setArchivingProject(null); }}
          okText="确认归档"
          okButtonProps={{ status: 'warning' }}
        >
          <p>确定要归档项目「{archivingProject?.name}」吗？</p>
          <p style={{ color: 'var(--color-text-3)', fontSize: 13 }}>
            归档后项目将变为只读状态，所有活动、产品、周报等数据不可编辑。可随时取消归档恢复。
          </p>
          <Input.TextArea
            placeholder="归档备注（可选）"
            value={archiveRemark}
            onChange={setArchiveRemark}
            rows={2}
            style={{ marginTop: 8 }}
          />
        </Modal>
      </div>
    </MainLayout>
  );
};

export default ProjectList;
