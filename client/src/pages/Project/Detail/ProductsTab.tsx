import React, { useState, useEffect } from 'react';
import { Table, Tag, Message } from '@arco-design/web-react';
import { productsApi } from '../../../api';
import { Product } from '../../../types';
import {
  PRODUCT_CATEGORY_MAP,
  PRODUCT_STATUS_MAP,
} from '../../../utils/constants';

interface ProductsTabProps {
  projectId: string;
  isArchived?: boolean;
  snapshotData?: any[] | null;
}

const ProductsTab: React.FC<ProductsTabProps> = ({ projectId, snapshotData }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const response = await productsApi.list({ projectId });
      setProducts(response.data.data || []);
    } catch {
      Message.error('加载产品列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (snapshotData) {
      setProducts(snapshotData as Product[]);
    } else {
      loadProducts();
    }
  }, [projectId, snapshotData]);

  const columns = [
    {
      title: '产品名称',
      dataIndex: 'name',
      width: 200,
      render: (name: string) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    {
      title: '型号 + 版本号',
      width: 180,
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
      title: '规格数',
      dataIndex: 'specifications',
      width: 80,
      render: (specs?: Record<string, unknown>) => Object.keys(specs || {}).length,
    },
  ];

  return (
    <Table
      columns={columns}
      data={products}
      loading={loading}
      rowKey="id"
      pagination={false}
      scroll={{ x: 700 }}
    />
  );
};

export default ProductsTab;
