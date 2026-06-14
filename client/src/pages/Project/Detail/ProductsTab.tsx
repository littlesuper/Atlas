import React, { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { productsApi } from '../../../api';
import { Product } from '../../../types';
import {
  PRODUCT_CATEGORY_MAP,
  PRODUCT_STATUS_MAP,
} from '../../../utils/constants';
import { arcoBadgeClass } from '../../../utils/badgeColor';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ProductsTabProps {
  projectId: string;
  isArchived?: boolean;
  snapshotData?: Product[] | null;
}

export function formatModelRevision(model?: string, revision?: string): string {
  const parts = [model, revision].filter(Boolean);
  return parts.join(' ') || '-';
}

const ProductsTab: React.FC<ProductsTabProps> = ({ projectId, snapshotData }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await productsApi.list({ projectId });
      setProducts(response.data.data || []);
    } catch {
      toast.error('加载产品列表失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (snapshotData) {
      setProducts(snapshotData);
    } else {
      loadProducts();
    }
  }, [snapshotData, loadProducts]);

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">产品名称</TableHead>
            <TableHead className="w-[180px]">型号 + 版本号</TableHead>
            <TableHead className="w-24">类别</TableHead>
            <TableHead className="w-24">状态</TableHead>
            <TableHead className="w-20">规格数</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="h-32 text-center">
                <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
              </TableCell>
            </TableRow>
          ) : products.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground h-32 text-center">
                暂无数据
              </TableCell>
            </TableRow>
          ) : (
            products.map((record) => {
              const catConfig =
                PRODUCT_CATEGORY_MAP[record.category as keyof typeof PRODUCT_CATEGORY_MAP] ?? {
                  label: record.category,
                  color: 'default',
                };
              const statusConfig =
                PRODUCT_STATUS_MAP[record.status as keyof typeof PRODUCT_STATUS_MAP] ?? {
                  label: record.status,
                  color: 'default',
                };
              return (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{record.name}</TableCell>
                  <TableCell>{formatModelRevision(record.model, record.revision)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={arcoBadgeClass(catConfig.color)}>
                      {catConfig.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={arcoBadgeClass(statusConfig.color)}>
                      {statusConfig.label}
                    </Badge>
                  </TableCell>
                  <TableCell>{Object.keys(record.specifications || {}).length}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default ProductsTab;
