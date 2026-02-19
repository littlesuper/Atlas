import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Space,
  Tag,
  Drawer,
  Form,
  Select,
  Message,
  Modal,
  Tooltip,
  Descriptions,
  Divider,
  Upload,
  Alert,
  Timeline,
  Collapse,
  Checkbox,
} from '@arco-design/web-react';
import {
  IconSearch,
  IconPlus,
  IconEdit,
  IconDelete,
  IconEye,
  IconCopy,
  IconDownload,
  IconSwap,
  IconFile,
} from '@arco-design/web-react/icon';
import MainLayout from '../../layouts/MainLayout';
import { productsApi, projectsApi, uploadApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { Product, Project, ProductDocument, ProductChangeLog } from '../../types';
import {
  PRODUCT_STATUS_MAP,
  PRODUCT_CATEGORY_MAP,
  PRODUCT_STATUS_TRANSITIONS,
  PRODUCT_SPEC_TEMPLATES,
  STATUS_MAP,
} from '../../utils/constants';

// 规格/性能参数编辑器组件
interface ParamsEditorProps {
  value?: Record<string, unknown>;
  onChange?: (value: Record<string, unknown>) => void;
  category?: string;
}

const ParamsEditor: React.FC<ParamsEditorProps> = ({ value = {}, onChange, category }) => {
  const [params, setParams] = useState<Array<{ key: string; value: string }>>(
    Object.entries(value).map(([key, val]) => ({ key, value: String(val) }))
  );

  const handleAdd = () => {
    const newParams = [...params, { key: '', value: '' }];
    setParams(newParams);
  };

  const handleChange = (index: number, field: 'key' | 'value', val: string) => {
    const newParams = [...params];
    newParams[index][field] = val;
    setParams(newParams);

    const obj: Record<string, string> = {};
    newParams.forEach((p) => {
      if (p.key) obj[p.key] = p.value;
    });
    onChange?.(obj);
  };

  const handleRemove = (index: number) => {
    const newParams = params.filter((_, i) => i !== index);
    setParams(newParams);

    const obj: Record<string, string> = {};
    newParams.forEach((p) => {
      if (p.key) obj[p.key] = p.value;
    });
    onChange?.(obj);
  };

  const handleLoadTemplate = () => {
    if (!category) return;
    const templateKeys = PRODUCT_SPEC_TEMPLATES[category] || [];
    if (templateKeys.length === 0) {
      Message.info('当前类别没有规格模板');
      return;
    }
    const existingKeys = new Set(params.map((p) => p.key));
    const newKeys = templateKeys.filter((k) => !existingKeys.has(k));
    if (newKeys.length === 0) {
      Message.info('模板参数已全部存在');
      return;
    }
    const newParams = [...params, ...newKeys.map((k) => ({ key: k, value: '' }))];
    setParams(newParams);
    const obj: Record<string, string> = {};
    newParams.forEach((p) => {
      if (p.key) obj[p.key] = p.value;
    });
    onChange?.(obj);
    Message.success(`已加载 ${newKeys.length} 个模板参数`);
  };

  return (
    <div>
      {params.map((param, index) => (
        <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Input
            placeholder="参数名"
            value={param.key}
            onChange={(val) => handleChange(index, 'key', val)}
            style={{ flex: 1 }}
          />
          <Input
            placeholder="参数值"
            value={param.value}
            onChange={(val) => handleChange(index, 'value', val)}
            style={{ flex: 1 }}
          />
          <Button
            status="danger"
            onClick={() => handleRemove(index)}
          >
            删除
          </Button>
        </div>
      ))}
      <Space>
        <Button type="dashed" onClick={handleAdd}>
          添加参数
        </Button>
        {category && PRODUCT_SPEC_TEMPLATES[category]?.length > 0 && (
          <Button type="outline" onClick={handleLoadTemplate}>
            加载模板
          </Button>
        )}
      </Space>
    </div>
  );
};

const ProductPage: React.FC = () => {
  const { hasPermission } = useAuthStore();
  const [form] = Form.useForm();

  // 数据状态
  const [products, setProducts] = useState<Product[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ all: 0, developing: 0, production: 0, discontinued: 0 });

  // UI状态
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);

  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedProjectStatus, setSelectedProjectStatus] = useState<string>('');
  const [specKeyword, setSpecKeyword] = useState('');

  // 分页状态
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });

  // 复制版本
  const [copyModalVisible, setCopyModalVisible] = useState(false);
  const [copyingProduct, setCopyingProduct] = useState<Product | null>(null);
  const [copyRevision, setCopyRevision] = useState('');

  // 对比功能
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [compareDrawerVisible, setCompareDrawerVisible] = useState(false);

  // 文档管理
  const [documents, setDocuments] = useState<ProductDocument[]>([]);

  // 变更记录
  const [changeLogs, setChangeLogs] = useState<ProductChangeLog[]>([]);

  // 编辑时的 category（用于模板和一致性提示）
  const [editingCategory, setEditingCategory] = useState<string>('');
  const [editingProjectId, setEditingProjectId] = useState<string>('');

  // 加载产品列表
  const loadProducts = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: pagination.current,
        pageSize: pagination.pageSize,
      };
      if (selectedStatus) params.status = selectedStatus;
      if (selectedCategory) params.category = selectedCategory;
      if (searchKeyword) params.keyword = searchKeyword;
      if (selectedProjectStatus) params.projectStatus = selectedProjectStatus;
      if (specKeyword) params.specKeyword = specKeyword;

      const response = await productsApi.list(params as any);
      setProducts(response.data.data || []);
      setPagination((prev) => ({ ...prev, total: response.data.total }));
      if (response.data.stats) {
        setStats(response.data.stats);
      }
    } catch {
      Message.error('加载产品列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载项目列表
  const loadProjects = async () => {
    try {
      const response = await projectsApi.list();
      setProjects(response.data.data || []);
    } catch (error) {
      console.error('加载项目列表失败', error);
    }
  };

  useEffect(() => {
    loadProducts();
    loadProjects();
  }, [selectedStatus, selectedCategory, searchKeyword, selectedProjectStatus, specKeyword, pagination.current, pagination.pageSize]);

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

  // 处理规格搜索（debounce 300ms）
  const handleSpecSearch = useMemo(() => {
    let timer: NodeJS.Timeout;
    return (value: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setSpecKeyword(value);
        setPagination((prev) => ({ ...prev, current: 1 }));
      }, 300);
    };
  }, []);

  // 点击统计卡片筛选
  const handleStatClick = (status: string) => {
    setSelectedStatus(status === selectedStatus ? '' : status);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  // 打开新建/编辑抽屉
  const handleOpenDrawer = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setEditingCategory(product.category || '');
      setEditingProjectId(product.projectId || '');
      setDocuments((product.documents as ProductDocument[]) || []);
      form.setFieldsValue({
        name: product.name,
        model: product.model,
        revision: product.revision,
        category: product.category,
        status: product.status,
        projectId: product.projectId,
        description: product.description,
        specifications: product.specifications || {},
        performance: product.performance || {},
      });
    } else {
      setEditingProduct(null);
      setEditingCategory('ROUTER');
      setEditingProjectId('');
      setDocuments([]);
      form.resetFields();
    }
    setDrawerVisible(true);
  };

  // 打开详情抽屉
  const handleOpenDetailDrawer = async (product: Product) => {
    try {
      const response = await productsApi.get(product.id);
      setViewingProduct(response.data);
      setDetailDrawerVisible(true);

      // 加载变更记录
      try {
        const logRes = await productsApi.getChangelog(product.id);
        setChangeLogs(logRes.data || []);
      } catch {
        setChangeLogs([]);
      }
    } catch {
      Message.error('加载产品详情失败');
    }
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      const data: any = {
        name: values.name,
        model: values.model,
        revision: values.revision,
        category: values.category,
        status: values.status,
        projectId: values.projectId,
        description: values.description,
        specifications: values.specifications || {},
        performance: values.performance || {},
        documents,
      };

      if (editingProduct) {
        await productsApi.update(editingProduct.id, data);
        Message.success('产品更新成功');
      } else {
        await productsApi.create(data);
        Message.success('产品创建成功');
      }

      setDrawerVisible(false);
      loadProducts();
    } catch (error: any) {
      if (error?.response?.data?.error) {
        Message.error(error.response.data.error);
      }
    }
  };

  // 删除产品
  const handleDelete = (product: Product) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除产品"${product.name}"吗？此操作不可恢复。`,
      onOk: async () => {
        try {
          await productsApi.delete(product.id);
          Message.success('产品删除成功');
          loadProducts();
        } catch {
          Message.error('产品删除失败');
        }
      },
    });
  };

  // 复制版本
  const handleCopy = async () => {
    if (!copyingProduct || !copyRevision) return;
    try {
      await productsApi.copy(copyingProduct.id, copyRevision);
      Message.success('版本复制成功');
      setCopyModalVisible(false);
      setCopyRevision('');
      loadProducts();
    } catch (error: any) {
      Message.error(error?.response?.data?.error || '复制失败');
    }
  };

  // 导出 CSV
  const handleExport = async () => {
    try {
      const params: any = {};
      if (selectedStatus) params.status = selectedStatus;
      if (selectedCategory) params.category = selectedCategory;
      if (searchKeyword) params.keyword = searchKeyword;
      if (selectedProjectStatus) params.projectStatus = selectedProjectStatus;

      const response = await productsApi.exportCsv(params);
      const blob = new Blob([response.data as any], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `products_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      Message.success('导出成功');
    } catch {
      Message.error('导出失败');
    }
  };

  // 对比功能
  const handleToggleSelect = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 3) {
          Message.warning('最多选择 3 个产品进行对比');
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const selectedProducts = useMemo(
    () => products.filter((p) => selectedProductIds.has(p.id)),
    [products, selectedProductIds]
  );

  // 文档上传
  const handleDocUpload = async (file: File) => {
    try {
      const res = await uploadApi.upload(file);
      const newDoc: ProductDocument = {
        id: Date.now().toString(),
        name: file.name,
        url: res.data.url,
        uploadedAt: new Date().toISOString(),
      };
      setDocuments((prev) => [...prev, newDoc]);
    } catch {
      Message.error('文件上传失败');
    }
  };

  const handleDocRemove = (docId: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  // 产品线一致性检查
  const categoryProjectMismatch = useMemo(() => {
    if (!editingCategory || !editingProjectId) return false;
    const proj = projects.find((p) => p.id === editingProjectId);
    if (!proj?.productLine) return false;
    // 简单的一致性检查
    const categoryLineMap: Record<string, string[]> = {
      DANDELION: ['ROUTER', 'GATEWAY'],
      SUNFLOWER: ['REMOTE_CONTROL'],
    };
    const expectedCategories = categoryLineMap[proj.productLine];
    if (!expectedCategories) return false;
    return !expectedCategories.includes(editingCategory);
  }, [editingCategory, editingProjectId, projects]);

  // 获取当前状态允许的目标状态
  const allowedStatuses = useMemo(() => {
    if (!editingProduct) return ['DEVELOPING'];
    const currentStatus = editingProduct.status;
    return PRODUCT_STATUS_TRANSITIONS[currentStatus] || [currentStatus];
  }, [editingProduct]);

  // 表格列配置
  const columns = [
    {
      title: '',
      width: 50,
      render: (_: unknown, record: Product) => (
        <Checkbox
          checked={selectedProductIds.has(record.id)}
          onChange={() => handleToggleSelect(record.id)}
        />
      ),
    },
    {
      title: '产品名称',
      dataIndex: 'name',
      width: 200,
      render: (name: string) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    {
      title: '型号 + 版本号',
      width: 150,
      render: (_: unknown, record: Product) => {
        const parts = [record.model, record.revision].filter(Boolean);
        return parts.join(' ') || '-';
      },
    },
    {
      title: '类别',
      dataIndex: 'category',
      width: 100,
      render: (category: string) => {
        const config = PRODUCT_CATEGORY_MAP[category as keyof typeof PRODUCT_CATEGORY_MAP] ?? { label: category, color: 'default' };
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => {
        const config = PRODUCT_STATUS_MAP[status as keyof typeof PRODUCT_STATUS_MAP] ?? { label: status, color: 'default' };
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    {
      title: '关联项目',
      dataIndex: 'project',
      width: 200,
      render: (project?: { id: string; name: string }) => project?.name || '-',
    },
    {
      title: '规格数',
      dataIndex: 'specifications',
      width: 100,
      render: (specs?: Record<string, unknown>) => Object.keys(specs || {}).length,
    },
    {
      title: '操作',
      width: 200,
      fixed: 'right' as const,
      render: (_: unknown, record: Product) => (
        <Space>
          <Tooltip content="查看">
            <Button
              type="text"
              icon={<IconEye />}
              size="small"
              onClick={() => handleOpenDetailDrawer(record)}
            />
          </Tooltip>
          {hasPermission('product', 'update') && (
            <Tooltip content="编辑">
              <Button
                type="text"
                icon={<IconEdit />}
                size="small"
                onClick={() => handleOpenDrawer(record)}
              />
            </Tooltip>
          )}
          {hasPermission('product', 'create') && (
            <Tooltip content="复制版本">
              <Button
                type="text"
                icon={<IconCopy />}
                size="small"
                onClick={() => {
                  setCopyingProduct(record);
                  setCopyRevision('');
                  setCopyModalVisible(true);
                }}
              />
            </Tooltip>
          )}
          {hasPermission('product', 'delete') && (
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

  // 对比数据
  const compareData = useMemo(() => {
    if (selectedProducts.length < 2) return [];
    const rows: Array<{ field: string; values: string[] }> = [];

    // 基础字段
    const basicFields = [
      { key: 'name', label: '产品名称' },
      { key: 'model', label: '型号' },
      { key: 'revision', label: '版本号' },
      { key: 'category', label: '类别' },
      { key: 'status', label: '状态' },
    ];
    basicFields.forEach(({ key, label }) => {
      rows.push({
        field: label,
        values: selectedProducts.map((p) => {
          const val = (p as any)[key];
          if (key === 'category') {
            const cfg = PRODUCT_CATEGORY_MAP[val as keyof typeof PRODUCT_CATEGORY_MAP];
            return cfg?.label || String(val || '-');
          }
          if (key === 'status') {
            const cfg = PRODUCT_STATUS_MAP[val as keyof typeof PRODUCT_STATUS_MAP];
            return cfg?.label || String(val || '-');
          }
          return String(val || '-');
        }),
      });
    });

    // 收集所有 spec/performance keys
    const allSpecKeys = new Set<string>();
    const allPerfKeys = new Set<string>();
    selectedProducts.forEach((p) => {
      Object.keys(p.specifications || {}).forEach((k) => allSpecKeys.add(k));
      Object.keys(p.performance || {}).forEach((k) => allPerfKeys.add(k));
    });

    if (allSpecKeys.size > 0) {
      rows.push({ field: '--- 规格参数 ---', values: selectedProducts.map(() => '') });
      allSpecKeys.forEach((key) => {
        rows.push({
          field: key,
          values: selectedProducts.map((p) => String((p.specifications as any)?.[key] || '-')),
        });
      });
    }

    if (allPerfKeys.size > 0) {
      rows.push({ field: '--- 性能指标 ---', values: selectedProducts.map(() => '') });
      allPerfKeys.forEach((key) => {
        rows.push({
          field: key,
          values: selectedProducts.map((p) => String((p.performance as any)?.[key] || '-')),
        });
      });
    }

    return rows;
  }, [selectedProducts]);

  // 统计卡片
  const statCards = [
    { label: '全部', value: stats.all, status: '' },
    { label: '研发中', value: stats.developing, status: 'DEVELOPING' },
    { label: '量产', value: stats.production, status: 'PRODUCTION' },
    { label: '停产', value: stats.discontinued, status: 'DISCONTINUED' },
  ];

  return (
    <MainLayout>
      <Card>
        {/* 统计卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {statCards.map((card) => (
            <Card
              key={card.label}
              hoverable
              style={{
                cursor: 'pointer',
                border: selectedStatus === card.status ? '2px solid #165DFF' : '1px solid #e5e6eb',
              }}
              bodyStyle={{ padding: '12px 16px' }}
              onClick={() => handleStatClick(card.status)}
            >
              <div style={{ fontSize: 12, color: '#86909c', marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{card.value}</div>
            </Card>
          ))}
        </div>

        {/* 工具栏 */}
        <div className="toolbar">
          <div className="toolbar-left">
            <Space>
              <span>共 {pagination.total} 个产品</span>
              {selectedProductIds.size >= 2 && (
                <Button
                  type="outline"
                  icon={<IconSwap />}
                  size="small"
                  onClick={() => setCompareDrawerVisible(true)}
                >
                  对比 ({selectedProductIds.size})
                </Button>
              )}
            </Space>
          </div>
          <Space>
            <Input
              style={{ width: 200 }}
              prefix={<IconSearch />}
              placeholder="搜索产品名称..."
              allowClear
              onChange={handleSearch}
            />
            <Input
              style={{ width: 140 }}
              prefix={<IconSearch />}
              placeholder="规格搜索..."
              allowClear
              onChange={handleSpecSearch}
            />
            <Select
              style={{ width: 120 }}
              placeholder="状态筛选"
              allowClear
              value={selectedStatus || undefined}
              onChange={(value) => {
                setSelectedStatus(value || '');
                setPagination((prev) => ({ ...prev, current: 1 }));
              }}
            >
              {Object.entries(PRODUCT_STATUS_MAP).map(([key, value]) => (
                <Select.Option key={key} value={key}>
                  {value.label}
                </Select.Option>
              ))}
            </Select>
            <Select
              style={{ width: 120 }}
              placeholder="类别筛选"
              allowClear
              value={selectedCategory || undefined}
              onChange={(value) => {
                setSelectedCategory(value || '');
                setPagination((prev) => ({ ...prev, current: 1 }));
              }}
            >
              {Object.entries(PRODUCT_CATEGORY_MAP).map(([key, value]) => (
                <Select.Option key={key} value={key}>
                  {value.label}
                </Select.Option>
              ))}
            </Select>
            <Select
              style={{ width: 120 }}
              placeholder="项目状态"
              allowClear
              value={selectedProjectStatus || undefined}
              onChange={(value) => {
                setSelectedProjectStatus(value || '');
                setPagination((prev) => ({ ...prev, current: 1 }));
              }}
            >
              {Object.entries(STATUS_MAP).map(([key, value]) => (
                <Select.Option key={key} value={key}>
                  {value.label}
                </Select.Option>
              ))}
            </Select>
            <Button icon={<IconDownload />} onClick={handleExport}>
              导出
            </Button>
            {hasPermission('product', 'create') && (
              <Button
                type="primary"
                icon={<IconPlus />}
                onClick={() => handleOpenDrawer()}
              >
                新建产品
              </Button>
            )}
          </Space>
        </div>

        {/* 表格 */}
        <Table
          columns={columns}
          data={products}
          loading={loading}
          rowKey="id"
          pagination={{
            ...pagination,
            showTotal: true,
            sizeCanChange: true,
            onChange: (current, pageSize) => {
              setPagination({ ...pagination, current, pageSize });
            },
          }}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* 新建/编辑抽屉 */}
      <Drawer
        width={700}
        title={editingProduct ? '编辑产品' : '新建产品'}
        visible={drawerVisible}
        onCancel={() => setDrawerVisible(false)}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setDrawerVisible(false)}>取消</Button>
              <Button type="primary" onClick={handleSubmit}>
                {editingProduct ? '保存' : '创建'}
              </Button>
            </Space>
          </div>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            status: 'DEVELOPING',
            category: 'ROUTER',
          }}
        >
          <Form.Item
            label="产品名称"
            field="name"
            rules={[{ required: true, message: '请输入产品名称' }]}
          >
            <Input placeholder="请输入产品名称" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item
              label="型号"
              field="model"
              rules={[{ required: true, message: '请输入产品型号' }]}
            >
              <Input placeholder="例如: RX-3000" />
            </Form.Item>

            <Form.Item
              label="版本号"
              field="revision"
            >
              <Input placeholder="例如: V2.1" />
            </Form.Item>
          </div>

          <Form.Item
            label="类别"
            field="category"
            rules={[{ required: true, message: '请选择产品类别' }]}
          >
            <Select
              placeholder="请选择产品类别"
              onChange={(val) => setEditingCategory(val || '')}
            >
              {Object.entries(PRODUCT_CATEGORY_MAP).map(([key, value]) => (
                <Select.Option key={key} value={key}>
                  <Tag color={value.color}>{value.label}</Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="状态"
            field="status"
            rules={[{ required: true, message: '请选择产品状态' }]}
          >
            <Select placeholder="请选择产品状态">
              {allowedStatuses.map((key) => {
                const value = PRODUCT_STATUS_MAP[key as keyof typeof PRODUCT_STATUS_MAP];
                return value ? (
                  <Select.Option key={key} value={key}>
                    <Tag color={value.color}>{value.label}</Tag>
                  </Select.Option>
                ) : null;
              })}
            </Select>
          </Form.Item>

          <Form.Item
            label="关联项目"
            field="projectId"
            rules={[{ required: true, message: '请选择关联项目' }]}
          >
            <Select
              placeholder="请选择关联项目"
              onChange={(val) => setEditingProjectId(val || '')}
            >
              {projects.map((project) => (
                <Select.Option key={project.id} value={project.id}>
                  {project.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {categoryProjectMismatch && (
            <Alert
              type="warning"
              content="当前产品类别与关联项目的产品线可能不匹配，请确认是否正确。"
              style={{ marginBottom: 16 }}
            />
          )}

          <Form.Item label="产品描述" field="description">
            <Input.TextArea
              placeholder="请输入产品描述"
              rows={4}
              showWordLimit
              maxLength={500}
            />
          </Form.Item>

          <Form.Item label="规格参数" field="specifications">
            <ParamsEditor category={editingCategory} />
          </Form.Item>

          <Form.Item label="性能指标" field="performance">
            <ParamsEditor />
          </Form.Item>

          {/* 产品文档 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>产品文档</div>
            {documents.map((doc) => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <IconFile />
                <span style={{ flex: 1 }}>{doc.name}</span>
                <Button
                  type="text"
                  status="danger"
                  size="mini"
                  onClick={() => handleDocRemove(doc.id)}
                >
                  删除
                </Button>
              </div>
            ))}
            <Upload
              accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
              showUploadList={false}
              customRequest={({ file }) => {
                handleDocUpload(file as File);
              }}
            >
              <Button type="dashed" style={{ marginTop: 4 }}>
                上传文档
              </Button>
            </Upload>
          </div>
        </Form>
      </Drawer>

      {/* 详情抽屉 */}
      <Drawer
        width={700}
        title="产品详情"
        visible={detailDrawerVisible}
        onCancel={() => setDetailDrawerVisible(false)}
        footer={null}
      >
        {viewingProduct && (
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            {/* 基本信息 */}
            <div>
              <div className="section-title">基本信息</div>
              <Descriptions
                column={1}
                data={[
                  { label: '产品名称', value: viewingProduct.name },
                  { label: '型号', value: viewingProduct.model || '-' },
                  { label: '版本号', value: viewingProduct.revision || '-' },
                  {
                    label: '类别',
                    value: (() => {
                      const c = PRODUCT_CATEGORY_MAP[viewingProduct.category as keyof typeof PRODUCT_CATEGORY_MAP] ?? { label: viewingProduct.category, color: 'default' };
                      return <Tag color={c.color}>{c.label}</Tag>;
                    })(),
                  },
                  {
                    label: '状态',
                    value: (() => {
                      const c = PRODUCT_STATUS_MAP[viewingProduct.status as keyof typeof PRODUCT_STATUS_MAP] ?? { label: viewingProduct.status, color: 'default' };
                      return <Tag color={c.color}>{c.label}</Tag>;
                    })(),
                  },
                  { label: '关联项目', value: viewingProduct.project?.name || '-' },
                  { label: '描述', value: viewingProduct.description || '-' },
                ]}
              />
            </div>

            <Divider />

            {/* 规格参数 */}
            {viewingProduct.specifications && Object.keys(viewingProduct.specifications).length > 0 && (
              <Card title="规格参数" bordered={false}>
                <Descriptions
                  column={1}
                  data={Object.entries(viewingProduct.specifications).map(([key, value]) => ({
                    label: key,
                    value: String(value),
                  }))}
                />
              </Card>
            )}

            {/* 性能指标 */}
            {viewingProduct.performance && Object.keys(viewingProduct.performance).length > 0 && (
              <Card title="性能指标" bordered={false}>
                <Descriptions
                  column={1}
                  data={Object.entries(viewingProduct.performance).map(([key, value]) => ({
                    label: key,
                    value: String(value),
                  }))}
                />
              </Card>
            )}

            {/* 文档 */}
            {viewingProduct.documents && (viewingProduct.documents as ProductDocument[]).length > 0 && (
              <Card title="产品文档" bordered={false}>
                {(viewingProduct.documents as ProductDocument[]).map((doc) => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <IconFile />
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1 }}>
                      {doc.name}
                    </a>
                  </div>
                ))}
              </Card>
            )}

            {/* 变更记录 */}
            <Collapse defaultActiveKey={[]}>
              <Collapse.Item name="changelog" header="变更记录">
                {changeLogs.length > 0 ? (
                  <Timeline>
                    {changeLogs.map((log) => (
                      <Timeline.Item key={log.id}>
                        <div style={{ fontSize: 13 }}>
                          <strong>{log.userName}</strong> {' '}
                          <Tag size="small" color={
                            log.action === 'CREATE' ? 'green' :
                            log.action === 'UPDATE' ? 'blue' :
                            log.action === 'DELETE' ? 'red' :
                            log.action === 'COPY' ? 'purple' : 'default'
                          }>
                            {log.action === 'CREATE' ? '创建' :
                             log.action === 'UPDATE' ? '更新' :
                             log.action === 'DELETE' ? '删除' :
                             log.action === 'COPY' ? '复制' : log.action}
                          </Tag>
                          <span style={{ color: '#86909c', marginLeft: 8 }}>
                            {new Date(log.createdAt).toLocaleString('zh-CN')}
                          </span>
                        </div>
                        {log.changes && Object.keys(log.changes).length > 0 && (
                          <div style={{ fontSize: 12, color: '#4e5969', marginTop: 4 }}>
                            {Object.entries(log.changes).map(([field, change]) => (
                              <div key={field}>
                                {field}: {String(change.from || '-')} → {String(change.to || '-')}
                              </div>
                            ))}
                          </div>
                        )}
                      </Timeline.Item>
                    ))}
                  </Timeline>
                ) : (
                  <div style={{ color: '#86909c', padding: '8px 0' }}>暂无变更记录</div>
                )}
              </Collapse.Item>
            </Collapse>
          </Space>
        )}
      </Drawer>

      {/* 复制版本 Modal */}
      <Modal
        title="复制版本"
        visible={copyModalVisible}
        onCancel={() => setCopyModalVisible(false)}
        onOk={handleCopy}
        okButtonProps={{ disabled: !copyRevision }}
      >
        <div style={{ marginBottom: 8 }}>
          源产品：{copyingProduct?.name} ({copyingProduct?.model} {copyingProduct?.revision})
        </div>
        <Input
          placeholder="请输入新版本号，如 V3.0"
          value={copyRevision}
          onChange={setCopyRevision}
        />
      </Modal>

      {/* 对比抽屉 */}
      <Drawer
        width={900}
        title={`产品对比 (${selectedProducts.length})`}
        visible={compareDrawerVisible}
        onCancel={() => setCompareDrawerVisible(false)}
        footer={null}
      >
        <Table
          columns={[
            {
              title: '属性',
              dataIndex: 'field',
              width: 150,
              fixed: 'left',
              render: (field: string) => (
                <span style={{
                  fontWeight: field.startsWith('---') ? 600 : 400,
                  color: field.startsWith('---') ? '#165DFF' : undefined,
                }}>
                  {field.replace(/---/g, '').trim() || field}
                </span>
              ),
            },
            ...selectedProducts.map((p, i) => ({
              title: `${p.name} (${p.revision || '-'})`,
              dataIndex: `val_${i}`,
              width: 200,
              render: (_: unknown, record: { field: string; values: string[] }) => {
                const val = record.values[i];
                // 高亮差异值
                const allSame = record.values.every((v) => v === record.values[0]);
                return (
                  <span style={{
                    background: !allSame && !record.field.startsWith('---') ? '#fff7e6' : undefined,
                    padding: !allSame ? '2px 4px' : undefined,
                    borderRadius: 2,
                  }}>
                    {val}
                  </span>
                );
              },
            })),
          ]}
          data={compareData}
          rowKey="field"
          pagination={false}
          scroll={{ x: 150 + selectedProducts.length * 200 }}
        />
      </Drawer>
    </MainLayout>
  );
};

export default ProductPage;
