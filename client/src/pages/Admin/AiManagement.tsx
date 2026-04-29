import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Message,
  Table,
  Statistic,
  Grid,
  Tag,
  Modal,
  Drawer,
  Space,
  Select,
} from '@arco-design/web-react';
import { IconPlus, IconEdit, IconDelete } from '@arco-design/web-react/icon';
import { aiConfigApi } from '../../api';
import { AiConfig, AiUsageStats } from '../../types';
import { useAuthStore } from '../../store/authStore';
import dayjs from 'dayjs';

const { Row, Col } = Grid;

const FEATURE_LABEL: Record<string, string> = {
  risk: '风险评估',
  weekly_report: '周报建议',
};

const FEATURE_OPTIONS = [
  { value: 'risk', label: '风险评估' },
  { value: 'weekly_report', label: '周报建议' },
];

// 主流 AI API 网关预设配置
const AI_PROVIDERS = [
  {
    key: 'openai',
    label: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    modelName: 'gpt-4o-mini',
  },
  {
    key: 'claude',
    label: 'Anthropic Claude',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    modelName: 'claude-sonnet-4-5-20250929',
  },
  {
    key: 'deepseek',
    label: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    modelName: 'deepseek-chat',
  },
  {
    key: 'zhipu',
    label: '智谱 GLM',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    modelName: 'glm-4-flash',
  },
  {
    key: 'qwen',
    label: '通义千问',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    modelName: 'qwen-plus',
  },
  {
    key: 'doubao',
    label: '豆包 (火山引擎)',
    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    modelName: 'doubao-1.5-pro-32k',
  },
  {
    key: 'moonshot',
    label: 'Moonshot (月之暗面)',
    apiUrl: 'https://api.moonshot.cn/v1/chat/completions',
    modelName: 'moonshot-v1-8k',
  },
  {
    key: 'minimax',
    label: 'MiniMax',
    apiUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    modelName: 'MiniMax-Text-01',
  },
  {
    key: 'yi',
    label: '零一万物 (Yi)',
    apiUrl: 'https://api.lingyiwanwu.com/v1/chat/completions',
    modelName: 'yi-large',
  },
  {
    key: 'baichuan',
    label: '百川智能',
    apiUrl: 'https://api.baichuan-ai.com/v1/chat/completions',
    modelName: 'Baichuan4',
  },
  {
    key: 'siliconflow',
    label: '硅基流动 (SiliconFlow)',
    apiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    modelName: 'Qwen/Qwen2.5-7B-Instruct',
  },
  {
    key: 'custom',
    label: '自定义',
    apiUrl: '',
    modelName: '',
  },
];

const AiManagement: React.FC = () => {
  const { hasPermission } = useAuthStore();
  const [configForm] = Form.useForm();

  // 配置列表
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AiConfig | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('custom');
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // 使用统计
  const [stats, setStats] = useState<AiUsageStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    loadConfigs();
    loadStats();
  }, []);

  const loadConfigs = async () => {
    setConfigsLoading(true);
    try {
      const response = await aiConfigApi.list();
      setConfigs(response.data);
    } catch {
      Message.error('加载AI配置列表失败');
    } finally {
      setConfigsLoading(false);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const response = await aiConfigApi.getUsageStats();
      setStats(response.data);
    } catch {
      Message.error('加载使用统计失败');
    } finally {
      setStatsLoading(false);
    }
  };

  // 根据 apiUrl 推断 provider
  const detectProvider = (apiUrl: string): string => {
    if (!apiUrl) return 'custom';
    const match = AI_PROVIDERS.find(
      (p) => p.key !== 'custom' && apiUrl.startsWith(p.apiUrl.replace(/\/chat\/completions$|\/messages$|\/chatcompletion_v2$/, ''))
    );
    return match?.key || 'custom';
  };

  const handleProviderChange = (providerKey: string) => {
    setSelectedProvider(providerKey);
    setModelOptions([]);
    const provider = AI_PROVIDERS.find((p) => p.key === providerKey);
    if (provider && providerKey !== 'custom') {
      configForm.setFieldsValue({
        apiUrl: provider.apiUrl,
        modelName: provider.modelName,
      });
      // 如果名称为空，自动填充 provider 名称
      const currentName = configForm.getFieldValue('name');
      if (!currentName) {
        configForm.setFieldsValue({ name: provider.label });
      }
    }
  };

  const handleCreate = () => {
    setEditingConfig(null);
    setSelectedProvider('custom');
    setModelOptions([]);
    configForm.resetFields();
    setDrawerVisible(true);
  };

  const handleEdit = (record: AiConfig) => {
    setEditingConfig(record);
    setSelectedProvider(detectProvider(record.apiUrl));
    setModelOptions([]);
    configForm.setFieldsValue({
      ...record,
      features: record.features ? record.features.split(',').filter(Boolean) : [],
    });
    setDrawerVisible(true);
  };

  const handleSave = async () => {
    setSaveLoading(true);
    try {
      const values = await configForm.validate();
      const data = {
        ...values,
        features: values.features?.join(',') || '',
      };
      if (editingConfig) {
        await aiConfigApi.update(editingConfig.id, data);
        Message.success('配置更新成功');
      } else {
        await aiConfigApi.create(data);
        Message.success('配置创建成功');
      }
      setDrawerVisible(false);
      loadConfigs();
    } catch {
      // validation or api error
    } finally {
      setSaveLoading(false);
    }
  };

  const handleTestConnection = async () => {
    // 用 getFields() 获取全部字段值，比逐个 getFieldValue 更可靠
    const fields = configForm.getFields();
    const apiUrl = fields.apiUrl as string | undefined;
    const apiKey = fields.apiKey as string | undefined;
    const modelName = fields.modelName as string | undefined;
    const isMasked = apiKey?.startsWith('****');

    if (!apiUrl || (!apiKey && !editingConfig)) {
      Message.warning('请填写 API URL 和 API Key');
      return;
    }

    setTestLoading(true);
    try {
      const response = await aiConfigApi.testConnection({
        apiUrl,
        apiKey: apiKey || '',
        modelName,
        // 编辑模式下 key 被掩码，传 configId 让服务端从数据库读取真实 key
        ...(isMasked && editingConfig ? { configId: editingConfig.id } : {}),
      });
      if (response.data.success) {
        Message.success(response.data.message);
      } else {
        Message.error(response.data.message);
      }
    } catch {
      Message.error('验证请求失败');
    } finally {
      setTestLoading(false);
    }
  };

  const handleFetchModels = async () => {
    const fields = configForm.getFields();
    const apiUrl = fields.apiUrl as string | undefined;
    const apiKey = fields.apiKey as string | undefined;
    const isMasked = apiKey?.startsWith('****');

    if (!apiUrl || (!apiKey && !editingConfig)) {
      Message.warning('请先填写 API URL 和 API Key');
      return;
    }

    setModelsLoading(true);
    try {
      const response = await aiConfigApi.fetchModels({
        apiUrl,
        apiKey: apiKey || '',
        ...(isMasked && editingConfig ? { configId: editingConfig.id } : {}),
      });
      if (response.data.success && response.data.models.length > 0) {
        setModelOptions(response.data.models);
        Message.success(response.data.message);
      } else {
        Message.warning(response.data.message || '未获取到模型列表，可手动输入模型名称');
      }
    } catch {
      Message.warning('获取模型列表失败，可手动输入模型名称');
    } finally {
      setModelsLoading(false);
    }
  };

  const handleDelete = (record: AiConfig) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除配置"${record.name}"吗？关联功能将回退到其他可用配置或环境变量。`,
      onOk: async () => {
        try {
          await aiConfigApi.delete(record.id);
          Message.success('配置删除成功');
          loadConfigs();
        } catch {
          Message.error('删除失败');
        }
      },
    });
  };

  const configColumns = [
    {
      title: '配置名称',
      dataIndex: 'name',
      width: 160,
    },
    {
      title: 'API URL',
      dataIndex: 'apiUrl',
      width: 260,
      render: (url: string) =>
        url || <span style={{ color: 'var(--color-text-3)' }}>未配置</span>,
    },
    {
      title: 'API Key',
      dataIndex: 'apiKey',
      width: 140,
      render: (key: string) =>
        key || <span style={{ color: 'var(--color-text-3)' }}>未配置</span>,
    },
    {
      title: '模型',
      dataIndex: 'modelName',
      width: 140,
    },
    {
      title: '关联功能',
      dataIndex: 'features',
      width: 200,
      render: (features: string) => {
        if (!features) return <span style={{ color: 'var(--color-text-3)' }}>无</span>;
        return (
          <Space wrap>
            {features
              .split(',')
              .filter(Boolean)
              .map((f) => (
                <Tag key={f} color={f === 'risk' ? 'orange' : 'blue'}>
                  {FEATURE_LABEL[f] || f}
                </Tag>
              ))}
          </Space>
        );
      },
    },
    ...(hasPermission('user', 'update')
      ? [
          {
            title: '操作',
            width: 100,
            render: (_: unknown, record: AiConfig) => (
              <Space>
                <Button
                  type="text"
                  icon={<IconEdit />}
                  size="small"
                  onClick={() => handleEdit(record)}
                />
                <Button
                  type="text"
                  status="danger"
                  icon={<IconDelete />}
                  size="small"
                  onClick={() => handleDelete(record)}
                />
              </Space>
            ),
          },
        ]
      : []),
  ];

  const usageColumns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (d: string) => dayjs(d).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '功能',
      dataIndex: 'feature',
      width: 110,
      render: (f: string) => (
        <Tag color={f === 'risk' ? 'orange' : 'blue'}>
          {FEATURE_LABEL[f] || f}
        </Tag>
      ),
    },
    {
      title: '项目',
      dataIndex: 'project',
      width: 180,
      render: (p?: { id: string; name: string }) => p?.name || '-',
    },
    {
      title: '模型',
      dataIndex: 'modelName',
      width: 140,
    },
    {
      title: 'Prompt',
      dataIndex: 'promptTokens',
      width: 100,
    },
    {
      title: 'Completion',
      dataIndex: 'completionTokens',
      width: 110,
    },
    {
      title: 'Total',
      dataIndex: 'totalTokens',
      width: 100,
    },
  ];

  return (
    <div>
      {/* AI 配置列表 */}
      <Card
        title="API 配置"
        style={{ marginBottom: 16 }}
        extra={
          hasPermission('user', 'update') && (
            <Button type="primary" icon={<IconPlus />} size="small" onClick={handleCreate}>
              新建配置
            </Button>
          )
        }
      >
        <Table
          columns={configColumns}
          data={configs}
          loading={configsLoading}
          rowKey="id"
          pagination={false}
          scroll={{ x: 1200 }}
          noDataElement={
            <div style={{ padding: 40, color: 'var(--color-text-3)', textAlign: 'center' }}>
              暂无AI配置，点击"新建配置"添加
            </div>
          }
        />
      </Card>

      {/* Token 使用统计 */}
      <Card title="Token 使用统计">
        <Row gutter={24} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Statistic title="总调用次数" value={stats?.totals.callCount || 0} />
          </Col>
          <Col span={6}>
            <Statistic title="Prompt Tokens" value={stats?.totals.promptTokens || 0} groupSeparator />
          </Col>
          <Col span={6}>
            <Statistic title="Completion Tokens" value={stats?.totals.completionTokens || 0} groupSeparator />
          </Col>
          <Col span={6}>
            <Statistic title="Total Tokens" value={stats?.totals.totalTokens || 0} groupSeparator />
          </Col>
        </Row>

        <Table
          columns={usageColumns}
          data={stats?.recentLogs || []}
          loading={statsLoading}
          rowKey="id"
          pagination={{ pageSize: 10, showTotal: true }}
          scroll={{ x: 900 }}
          noDataElement={
            <div style={{ padding: 40, color: 'var(--color-text-3)', textAlign: 'center' }}>暂无调用记录</div>
          }
        />
      </Card>

      {/* 新建/编辑配置 Drawer */}
      <Drawer
        title={editingConfig ? '编辑配置' : '新建配置'}
        visible={drawerVisible}
        width={480}
        onCancel={() => setDrawerVisible(false)}
        onOk={handleSave}
        confirmLoading={saveLoading}
      >
        <Form form={configForm} layout="vertical">
          <Form.Item label="服务商">
            <Select
              value={selectedProvider}
              onChange={handleProviderChange}
              placeholder="选择预设服务商，自动填充 API 地址和模型"
            >
              {AI_PROVIDERS.map((p) => (
                <Select.Option key={p.key} value={p.key}>
                  {p.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label="配置名称"
            field="name"
            rules={[{ required: true, message: '请输入配置名称' }]}
          >
            <Input placeholder="如：GPT-4o 风险评估" />
          </Form.Item>
          <Form.Item label="API URL" field="apiUrl">
            <Input placeholder="https://api.openai.com/v1/chat/completions" />
          </Form.Item>
          <Form.Item
            label="API Key"
            field="apiKey"
            rules={[{ required: !editingConfig, message: '请输入 API Key' }]}
          >
            <Input.Password placeholder="sk-..." />
          </Form.Item>
          <Form.Item label="模型名称" field="modelName">
            <Select
              showSearch
              allowCreate
              placeholder="选择或输入模型名称"
              loading={modelsLoading}
            >
              {modelOptions.map((m) => (
                <Select.Option key={m} value={m}>
                  {m}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label=" " colon={false}>
            <Space>
              <Button loading={modelsLoading} onClick={handleFetchModels}>
                获取模型列表
              </Button>
              <Button loading={testLoading} onClick={handleTestConnection}>
                验证连接
              </Button>
            </Space>
          </Form.Item>
          <Form.Item label="关联功能" field="features">
            <Select mode="multiple" placeholder="选择此配置服务的功能" allowClear>
              {FEATURE_OPTIONS.map((opt) => (
                <Select.Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

export default AiManagement;
