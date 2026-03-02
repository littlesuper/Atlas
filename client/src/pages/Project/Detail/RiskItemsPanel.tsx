import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Tag,
  Space,
  Select,
  Modal,
  Form,
  Input,
  DatePicker,
  Message,
  Drawer,
  Timeline,
  Empty,
} from '@arco-design/web-react';
import { IconPlus, IconImport, IconEdit, IconDelete } from '@arco-design/web-react/icon';
import { riskItemsApi } from '../../../api';
import { RiskItem, RiskItemLog, RiskAssessment } from '../../../types';
import { RISK_LEVEL_MAP, RISK_ITEM_STATUS_MAP } from '../../../utils/constants';
import dayjs from 'dayjs';

interface Props {
  projectId: string;
  latestAssessment?: RiskAssessment;
  isArchived?: boolean;
  projectMembers?: Array<{ id: string; realName: string }>;
}

const FormItem = Form.Item;

const RiskItemsPanel: React.FC<Props> = ({ projectId, latestAssessment, isArchived, projectMembers = [] }) => {
  const [items, setItems] = useState<RiskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [createVisible, setCreateVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RiskItem | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { projectId, pageSize: 50 };
      if (statusFilter) params.status = statusFilter;
      const res = await riskItemsApi.list(params);
      setItems(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch {
      Message.error('加载风险项失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId, statusFilter]);

  const handleCreate = async () => {
    try {
      const values = await form.validate();
      await riskItemsApi.create({
        projectId,
        ...values,
        dueDate: values.dueDate ? dayjs(values.dueDate).format('YYYY-MM-DD') : undefined,
      });
      Message.success('创建成功');
      setCreateVisible(false);
      form.resetFields();
      load();
    } catch (e: any) {
      if (e?.response?.data?.error) Message.error(e.response.data.error);
    }
  };

  const handleImportFromAssessment = async () => {
    if (!latestAssessment) return;
    try {
      const res = await riskItemsApi.fromAssessment(latestAssessment.id);
      Message.success(`已导入 ${res.data.created} 个风险项`);
      load();
    } catch {
      Message.error('导入失败');
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await riskItemsApi.update(id, { status: newStatus });
      Message.success('状态已更新');
      load();
      if (selectedItem?.id === id) {
        loadDetail(id);
      }
    } catch {
      Message.error('更新失败');
    }
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该风险项吗？',
      onOk: async () => {
        try {
          await riskItemsApi.delete(id);
          Message.success('已删除');
          load();
          if (selectedItem?.id === id) setDetailVisible(false);
        } catch {
          Message.error('删除失败');
        }
      },
    });
  };

  const loadDetail = async (id: string) => {
    try {
      const res = await riskItemsApi.get(id);
      setSelectedItem(res.data);
      setDetailVisible(true);
    } catch {
      Message.error('加载详情失败');
    }
  };

  const handleComment = async () => {
    if (!selectedItem || !commentInput.trim()) return;
    try {
      await riskItemsApi.comment(selectedItem.id, commentInput.trim());
      setCommentInput('');
      loadDetail(selectedItem.id);
    } catch {
      Message.error('评论失败');
    }
  };

  const severityColor: Record<string, string> = {
    LOW: 'green',
    MEDIUM: 'orange',
    HIGH: 'red',
    CRITICAL: 'red',
  };

  const columns = [
    {
      title: '严重度',
      dataIndex: 'severity',
      width: 80,
      render: (v: string) => (
        <Tag size="small" color={severityColor[v] || 'default'}>
          {RISK_LEVEL_MAP[v as keyof typeof RISK_LEVEL_MAP]?.label?.replace('风险', '') || v}
        </Tag>
      ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      render: (v: string, record: RiskItem) => (
        <a style={{ cursor: 'pointer', color: 'var(--color-primary-6)' }} onClick={() => loadDetail(record.id)}>
          {v}
        </a>
      ),
    },
    {
      title: '负责人',
      dataIndex: 'owner',
      width: 90,
      render: (owner: any) => owner?.realName || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => {
        const info = RISK_ITEM_STATUS_MAP[v as keyof typeof RISK_ITEM_STATUS_MAP];
        return <Tag size="small" color={info?.color || 'default'}>{info?.label || v}</Tag>;
      },
    },
    {
      title: '到期日',
      dataIndex: 'dueDate',
      width: 100,
      render: (v: string) => v ? dayjs(v).format('MM-DD') : '-',
    },
    {
      title: '操作',
      width: 80,
      render: (_: any, record: RiskItem) => !isArchived && (
        <Space size={4}>
          <IconEdit
            style={{ cursor: 'pointer', color: 'var(--color-text-3)' }}
            onClick={() => loadDetail(record.id)}
          />
          <IconDelete
            style={{ cursor: 'pointer', color: 'var(--color-danger-6)' }}
            onClick={() => handleDelete(record.id)}
          />
        </Space>
      ),
    },
  ];

  const hasActionItems = latestAssessment?.aiEnhancedData?.actionItems &&
    latestAssessment.aiEnhancedData.actionItems.length > 0;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-2)' }}>
          风险项管理
          {total > 0 && <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--color-text-3)', marginLeft: 8 }}>({total})</span>}
        </div>
        <Space size={8}>
          <Select
            placeholder="状态筛选"
            allowClear
            value={statusFilter || undefined}
            onChange={(v) => setStatusFilter(v || '')}
            style={{ width: 120 }}
            size="small"
          >
            {Object.entries(RISK_ITEM_STATUS_MAP).map(([key, info]) => (
              <Select.Option key={key} value={key}>{info.label}</Select.Option>
            ))}
          </Select>
          {!isArchived && hasActionItems && (
            <Button size="small" icon={<IconImport />} onClick={handleImportFromAssessment}>
              从评估导入
            </Button>
          )}
          {!isArchived && (
            <Button size="small" type="primary" icon={<IconPlus />} onClick={() => setCreateVisible(true)}>
              新建
            </Button>
          )}
        </Space>
      </div>

      <Table
        columns={columns}
        data={items}
        rowKey="id"
        loading={loading}
        pagination={false}
        border={false}
        size="small"
        noDataElement={<Empty description="暂无风险项" />}
      />

      {/* 新建 Modal */}
      <Modal
        title="新建风险项"
        visible={createVisible}
        onOk={handleCreate}
        onCancel={() => { setCreateVisible(false); form.resetFields(); }}
        style={{ width: 480 }}
      >
        <Form form={form} layout="vertical">
          <FormItem label="标题" field="title" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="风险项标题" />
          </FormItem>
          <FormItem label="描述" field="description">
            <Input.TextArea placeholder="详细描述" rows={3} />
          </FormItem>
          <div style={{ display: 'flex', gap: 16 }}>
            <FormItem label="严重度" field="severity" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select placeholder="选择严重度">
                {Object.entries(RISK_LEVEL_MAP).map(([key, info]) => (
                  <Select.Option key={key} value={key}>{info.label}</Select.Option>
                ))}
              </Select>
            </FormItem>
            <FormItem label="负责人" field="ownerId" style={{ flex: 1 }}>
              <Select placeholder="选择负责人" allowClear showSearch>
                {projectMembers.map(m => (
                  <Select.Option key={m.id} value={m.id}>{m.realName}</Select.Option>
                ))}
              </Select>
            </FormItem>
          </div>
          <FormItem label="到期日" field="dueDate">
            <DatePicker style={{ width: '100%' }} />
          </FormItem>
        </Form>
      </Modal>

      {/* 详情抽屉 */}
      <Drawer
        title={selectedItem?.title || '风险项详情'}
        visible={detailVisible}
        onCancel={() => setDetailVisible(false)}
        width={480}
        footer={null}
      >
        {selectedItem && (
          <div>
            {/* Status + Severity */}
            <Space style={{ marginBottom: 16 }}>
              <Tag color={severityColor[selectedItem.severity] || 'default'}>
                {RISK_LEVEL_MAP[selectedItem.severity as keyof typeof RISK_LEVEL_MAP]?.label || selectedItem.severity}
              </Tag>
              <Select
                value={selectedItem.status}
                onChange={(v) => handleStatusChange(selectedItem.id, v)}
                size="small"
                style={{ width: 120 }}
                disabled={isArchived}
              >
                {Object.entries(RISK_ITEM_STATUS_MAP).map(([key, info]) => (
                  <Select.Option key={key} value={key}>{info.label}</Select.Option>
                ))}
              </Select>
            </Space>

            {/* Description */}
            {selectedItem.description && (
              <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.7 }}>
                {selectedItem.description}
              </div>
            )}

            {/* Meta info */}
            <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 16 }}>
              <div>负责人: {selectedItem.owner?.realName || '未分配'}</div>
              <div>来源: {selectedItem.source}</div>
              <div>创建时间: {dayjs(selectedItem.createdAt).format('YYYY-MM-DD HH:mm')}</div>
              {selectedItem.dueDate && <div>到期日: {dayjs(selectedItem.dueDate).format('YYYY-MM-DD')}</div>}
              {selectedItem.resolvedAt && <div>解决时间: {dayjs(selectedItem.resolvedAt).format('YYYY-MM-DD HH:mm')}</div>}
            </div>

            {/* Timeline */}
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>活动记录</div>
            {selectedItem.logs && selectedItem.logs.length > 0 ? (
              <Timeline>
                {selectedItem.logs.map((log: RiskItemLog) => (
                  <Timeline.Item key={log.id}>
                    <div style={{ fontSize: 12 }}>
                      <span style={{ fontWeight: 500 }}>{log.user?.realName || '系统'}</span>
                      <span style={{ color: 'var(--color-text-3)', marginLeft: 8 }}>
                        {dayjs(log.createdAt).format('MM-DD HH:mm')}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginTop: 2 }}>
                      {log.content}
                    </div>
                  </Timeline.Item>
                ))}
              </Timeline>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>暂无记录</div>
            )}

            {/* Comment input */}
            {!isArchived && (
              <div style={{ marginTop: 16 }}>
                <Input.TextArea
                  placeholder="添加评论..."
                  value={commentInput}
                  onChange={setCommentInput}
                  rows={2}
                />
                <Button
                  size="small"
                  type="primary"
                  style={{ marginTop: 8 }}
                  onClick={handleComment}
                  disabled={!commentInput.trim()}
                >
                  发送
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default RiskItemsPanel;
