import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Copy,
  Download,
  ArrowLeftRight,
  FileText,
  Loader2,
} from 'lucide-react';
import MainLayout from '../../layouts/MainLayout';
import { productsApi, projectsApi, uploadApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { Product, Project, ProductDocument, ProductChangeLog } from '../../types';
import {
  PRODUCT_STATUS_MAP,
  PRODUCT_CATEGORY_MAP,
  PRODUCT_STATUS_TRANSITIONS,
  STATUS_MAP,
} from '../../utils/constants';
import { getApiErrorMessage } from '../../utils/apiError';
import { arcoBadgeClass } from '../../utils/badgeColor';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ParamsEditor, { paramsToObject } from './ParamsEditor';

export { paramsToObject };

const ALL = '__all__';

const Tag = ({ color, label }: { color?: string; label: string }) => (
  <Badge variant="outline" className={arcoBadgeClass(color)}>
    {label}
  </Badge>
);

const catCfg = (c?: string) =>
  PRODUCT_CATEGORY_MAP[c as keyof typeof PRODUCT_CATEGORY_MAP] ?? { label: c || '-', color: 'default' };
const statusCfg = (s?: string) =>
  PRODUCT_STATUS_MAP[s as keyof typeof PRODUCT_STATUS_MAP] ?? { label: s || '-', color: 'default' };

function Field({
  label,
  required,
  error,
  children,
  className,
}: {
  label: React.ReactNode;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-sm">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

interface FormValues {
  name: string;
  model: string;
  revision: string;
  category: string;
  status: string;
  projectId?: string;
  description: string;
  specifications: Record<string, string>;
  performance: Record<string, string>;
}
const EMPTY_FORM: FormValues = {
  name: '',
  model: '',
  revision: '',
  category: 'ROUTER',
  status: 'DEVELOPING',
  projectId: undefined,
  description: '',
  specifications: {},
  performance: {},
};

const ProductPage: React.FC = () => {
  const { hasPermission } = useAuthStore();

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

  // 表单状态
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const setField = <K extends keyof FormValues>(k: K, v: FormValues[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setFormErrors((p) => (p[k as string] ? { ...p, [k as string]: '' } : p));
  };

  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedProjectStatus, setSelectedProjectStatus] = useState<string>('');
  const [specKeyword, setSpecKeyword] = useState('');

  // 分页状态
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const { current: currentPage, pageSize } = pagination;

  // 复制版本
  const [copyModalVisible, setCopyModalVisible] = useState(false);
  const [copyingProduct, setCopyingProduct] = useState<Product | null>(null);
  const [copyRevision, setCopyRevision] = useState('');

  // 对比功能
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [compareDrawerVisible, setCompareDrawerVisible] = useState(false);

  // 文档管理
  const [documents, setDocuments] = useState<ProductDocument[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 变更记录
  const [changeLogs, setChangeLogs] = useState<ProductChangeLog[]>([]);

  // 编辑时的 category（用于模板和一致性提示）
  const [editingCategory, setEditingCategory] = useState<string>('');
  const [editingProjectId, setEditingProjectId] = useState<string>('');

  // 加载产品列表
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: currentPage, pageSize };
      if (selectedStatus) params.status = selectedStatus;
      if (selectedCategory) params.category = selectedCategory;
      if (searchKeyword) params.keyword = searchKeyword;
      if (selectedProjectStatus) params.projectStatus = selectedProjectStatus;
      if (specKeyword) params.specKeyword = specKeyword;

      const response = await productsApi.list(params);
      setProducts(response.data.data || []);
      setPagination((prev) => ({ ...prev, total: response.data.total }));
      if (response.data.stats) {
        setStats(response.data.stats);
      }
    } catch {
      toast.error('加载产品列表失败');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, searchKeyword, selectedCategory, selectedProjectStatus, selectedStatus, specKeyword]);

  // 加载项目列表
  const loadProjects = useCallback(async () => {
    try {
      const response = await projectsApi.list();
      setProjects(response.data.data || []);
    } catch (error) {
      console.error('加载项目列表失败', error);
    }
  }, []);

  useEffect(() => {
    loadProducts();
    loadProjects();
  }, [loadProducts, loadProjects]);

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
    setFormErrors({});
    if (product) {
      setEditingProduct(product);
      setEditingCategory(product.category || '');
      setEditingProjectId(product.projectId || '');
      setDocuments((product.documents as ProductDocument[]) || []);
      setForm({
        name: product.name,
        model: product.model || '',
        revision: product.revision || '',
        category: product.category || '',
        status: product.status,
        projectId: product.projectId ?? undefined,
        description: product.description || '',
        specifications: (product.specifications as Record<string, string>) || {},
        performance: (product.performance as Record<string, string>) || {},
      });
    } else {
      setEditingProduct(null);
      setEditingCategory('ROUTER');
      setEditingProjectId('');
      setDocuments([]);
      setForm(EMPTY_FORM);
    }
    setDrawerVisible(true);
  };

  // 打开详情抽屉
  const handleOpenDetailDrawer = async (product: Product) => {
    try {
      const response = await productsApi.get(product.id);
      setViewingProduct(response.data);
      setDetailDrawerVisible(true);

      try {
        const logRes = await productsApi.getChangelog(product.id);
        setChangeLogs(logRes.data || []);
      } catch {
        setChangeLogs([]);
      }
    } catch {
      toast.error('加载产品详情失败');
    }
  };

  // 提交表单
  const handleSubmit = async () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = '请输入产品名称';
    if (!form.model.trim()) e.model = '请输入产品型号';
    if (!form.category) e.category = '请选择产品类别';
    if (!form.status) e.status = '请选择产品状态';
    if (!form.projectId) e.projectId = '请选择关联项目';
    setFormErrors(e);
    if (Object.keys(e).length) return;

    try {
      const data: Parameters<typeof productsApi.create>[0] = {
        name: form.name,
        model: form.model,
        revision: form.revision,
        category: form.category,
        status: form.status,
        projectId: form.projectId,
        description: form.description,
        specifications: form.specifications || {},
        performance: form.performance || {},
        documents,
      };

      if (editingProduct) {
        await productsApi.update(editingProduct.id, data);
        toast.success('产品更新成功');
      } else {
        await productsApi.create(data);
        toast.success('产品创建成功');
      }

      setDrawerVisible(false);
      loadProducts();
    } catch (error: unknown) {
      const message = getApiErrorMessage(error);
      if (message) toast.error(message);
    }
  };

  // 删除产品
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await productsApi.delete(deleteTarget.id);
      toast.success('产品删除成功');
      loadProducts();
    } catch {
      toast.error('产品删除失败');
    } finally {
      setDeleteTarget(null);
    }
  };

  // 复制版本
  const handleCopy = async () => {
    if (!copyingProduct || !copyRevision) return;
    try {
      await productsApi.copy(copyingProduct.id, copyRevision);
      toast.success('版本复制成功');
      setCopyModalVisible(false);
      setCopyRevision('');
      loadProducts();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error) || '复制失败');
    }
  };

  // 导出 CSV
  const handleExport = async () => {
    try {
      const params: Parameters<typeof productsApi.exportCsv>[0] = {};
      if (selectedStatus) params.status = selectedStatus;
      if (selectedCategory) params.category = selectedCategory;
      if (searchKeyword) params.keyword = searchKeyword;
      if (selectedProjectStatus) params.projectStatus = selectedProjectStatus;

      const response = await productsApi.exportCsv(params);
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `products_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('导出成功');
    } catch {
      toast.error('导出失败');
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
          toast.warning('最多选择 3 个产品进行对比');
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
      toast.error('文件上传失败');
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

  // 对比数据
  const compareData = useMemo(() => {
    if (selectedProducts.length < 2) return [];
    const rows: Array<{ field: string; values: string[] }> = [];

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
          const val = p[key as keyof Pick<Product, 'name' | 'model' | 'revision' | 'category' | 'status'>];
          if (key === 'category') return catCfg(val as string).label || String(val || '-');
          if (key === 'status') return statusCfg(val as string).label || String(val || '-');
          return String(val || '-');
        }),
      });
    });

    const allSpecKeys = new Set<string>();
    const allPerfKeys = new Set<string>();
    selectedProducts.forEach((p) => {
      Object.keys(p.specifications || {}).forEach((k) => allSpecKeys.add(k));
      Object.keys(p.performance || {}).forEach((k) => allPerfKeys.add(k));
    });

    if (allSpecKeys.size > 0) {
      rows.push({ field: '--- 规格参数 ---', values: selectedProducts.map(() => '') });
      allSpecKeys.forEach((key) => {
        rows.push({ field: key, values: selectedProducts.map((p) => String(p.specifications?.[key] || '-')) });
      });
    }
    if (allPerfKeys.size > 0) {
      rows.push({ field: '--- 性能指标 ---', values: selectedProducts.map(() => '') });
      allPerfKeys.forEach((key) => {
        rows.push({ field: key, values: selectedProducts.map((p) => String(p.performance?.[key] || '-')) });
      });
    }
    return rows;
  }, [selectedProducts]);

  const statCards = [
    { label: '全部', value: stats.all, status: '' },
    { label: '研发中', value: stats.developing, status: 'DEVELOPING' },
    { label: '量产', value: stats.production, status: 'PRODUCTION' },
    { label: '停产', value: stats.discontinued, status: 'DISCONTINUED' },
  ];

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));
  const totalPages = Math.max(1, Math.ceil(pagination.total / pageSize));

  return (
    <MainLayout>
      <TooltipProvider>
        <Card className="p-4">
          {/* 统计卡片 */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statCards.map((card) => (
              <Card
                key={card.label}
                onClick={() => handleStatClick(card.status)}
                className={cn(
                  'hover:border-primary/40 cursor-pointer p-3 shadow-none transition-colors',
                  selectedStatus === card.status && 'border-primary ring-primary/20 ring-1'
                )}
              >
                <div className="text-muted-foreground text-xs">{card.label}</div>
                <div className="mt-1 text-2xl font-semibold">{card.value}</div>
              </Card>
            ))}
          </div>

          {/* 工具栏 */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">共 {pagination.total} 个产品</span>
              {selectedProductIds.size >= 2 && (
                <Button variant="outline" size="sm" onClick={() => setCompareDrawerVisible(true)}>
                  <ArrowLeftRight className="size-4" />
                  对比 ({selectedProductIds.size})
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  className="w-48 pl-8"
                  placeholder="搜索产品名称..."
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  className="w-36 pl-8"
                  placeholder="规格搜索..."
                  onChange={(e) => handleSpecSearch(e.target.value)}
                />
              </div>
              <Select
                value={selectedStatus || ALL}
                onValueChange={(v) => {
                  setSelectedStatus(v === ALL ? '' : v);
                  setPagination((prev) => ({ ...prev, current: 1 }));
                }}
              >
                <SelectTrigger className="w-[120px]" size="sm">
                  <SelectValue placeholder="状态筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部状态</SelectItem>
                  {Object.entries(PRODUCT_STATUS_MAP).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {value.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedCategory || ALL}
                onValueChange={(v) => {
                  setSelectedCategory(v === ALL ? '' : v);
                  setPagination((prev) => ({ ...prev, current: 1 }));
                }}
              >
                <SelectTrigger className="w-[120px]" size="sm">
                  <SelectValue placeholder="类别筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部类别</SelectItem>
                  {Object.entries(PRODUCT_CATEGORY_MAP).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {value.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedProjectStatus || ALL}
                onValueChange={(v) => {
                  setSelectedProjectStatus(v === ALL ? '' : v);
                  setPagination((prev) => ({ ...prev, current: 1 }));
                }}
              >
                <SelectTrigger className="w-[120px]" size="sm">
                  <SelectValue placeholder="项目状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部项目状态</SelectItem>
                  {Object.entries(STATUS_MAP).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {value.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleExport}>
                <Download className="size-4" />
                导出
              </Button>
              {hasPermission('product', 'create') && (
                <Button onClick={() => handleOpenDrawer()}>
                  <Plus className="size-4" />
                  新建产品
                </Button>
              )}
            </div>
          </div>

          {/* 表格 */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" />
                  <TableHead>产品名称</TableHead>
                  <TableHead>型号 + 版本号</TableHead>
                  <TableHead className="w-24">类别</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead>关联项目</TableHead>
                  <TableHead className="w-20">规格数</TableHead>
                  <TableHead className="w-44 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground h-32 text-center">
                      暂无产品
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((record) => {
                    const cat = catCfg(record.category);
                    const st = statusCfg(record.status);
                    return (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedProductIds.has(record.id)}
                            onCheckedChange={() => handleToggleSelect(record.id)}
                            aria-label={`选择 ${record.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{record.name}</TableCell>
                        <TableCell>{[record.model, record.revision].filter(Boolean).join(' ') || '-'}</TableCell>
                        <TableCell>
                          <Tag color={cat.color} label={cat.label} />
                        </TableCell>
                        <TableCell>
                          <Tag color={st.color} label={st.label} />
                        </TableCell>
                        <TableCell>{record.project?.name || '-'}</TableCell>
                        <TableCell>{Object.keys(record.specifications || {}).length}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8" onClick={() => handleOpenDetailDrawer(record)} aria-label="查看">
                                  <Eye className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>查看</TooltipContent>
                            </Tooltip>
                            {hasPermission('product', 'update') && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-8" onClick={() => handleOpenDrawer(record)} aria-label="编辑">
                                    <Pencil className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>编辑</TooltipContent>
                              </Tooltip>
                            )}
                            {hasPermission('product', 'create') && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    aria-label="复制版本"
                                    onClick={() => {
                                      setCopyingProduct(record);
                                      setCopyRevision('');
                                      setCopyModalVisible(true);
                                    }}
                                  >
                                    <Copy className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>复制版本</TooltipContent>
                              </Tooltip>
                            )}
                            {hasPermission('product', 'delete') && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-destructive size-8"
                                    aria-label="删除"
                                    onClick={() => setDeleteTarget(record)}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>删除</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* 分页 */}
          <div className="flex items-center justify-end gap-2 pt-3 text-sm">
            <span className="text-muted-foreground">
              第 {currentPage} / {totalPages} 页
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPagination((p) => ({ ...p, current: p.current - 1 }))}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPagination((p) => ({ ...p, current: p.current + 1 }))}
            >
              下一页
            </Button>
          </div>
        </Card>

        {/* 新建/编辑抽屉 */}
        <Sheet open={drawerVisible} onOpenChange={(o) => !o && setDrawerVisible(false)}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[700px]">
            <SheetHeader className="border-b px-6 py-4">
              <SheetTitle>{editingProduct ? '编辑产品' : '新建产品'}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <Field label="产品名称" required error={formErrors.name}>
                <Input placeholder="请输入产品名称" value={form.name} onChange={(e) => setField('name', e.target.value)} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="型号" required error={formErrors.model}>
                  <Input placeholder="例如: RX-3000" value={form.model} onChange={(e) => setField('model', e.target.value)} />
                </Field>
                <Field label="版本号">
                  <Input placeholder="例如: V2.1" value={form.revision} onChange={(e) => setField('revision', e.target.value)} />
                </Field>
              </div>

              <Field label="类别" required error={formErrors.category}>
                <Select
                  value={form.category}
                  onValueChange={(v) => {
                    setField('category', v);
                    setEditingCategory(v);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="请选择产品类别" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRODUCT_CATEGORY_MAP).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        <Tag color={value.color} label={value.label} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="状态" required error={formErrors.status}>
                <Select value={form.status} onValueChange={(v) => setField('status', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="请选择产品状态" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedStatuses.map((key) => {
                      const value = PRODUCT_STATUS_MAP[key as keyof typeof PRODUCT_STATUS_MAP];
                      return value ? (
                        <SelectItem key={key} value={key}>
                          <Tag color={value.color} label={value.label} />
                        </SelectItem>
                      ) : null;
                    })}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="关联项目" required error={formErrors.projectId}>
                <Combobox
                  options={projectOptions}
                  value={form.projectId}
                  onChange={(v) => {
                    setField('projectId', v);
                    setEditingProjectId(v || '');
                  }}
                  placeholder="请选择关联项目"
                  searchPlaceholder="搜索项目…"
                />
              </Field>

              {categoryProjectMismatch && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  当前产品类别与关联项目的产品线可能不匹配，请确认是否正确。
                </div>
              )}

              <Field label="产品描述">
                <Textarea
                  placeholder="请输入产品描述"
                  rows={4}
                  maxLength={500}
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                />
              </Field>

              <Field label="规格参数">
                <ParamsEditor
                  key={`spec-${editingProduct?.id ?? 'new'}`}
                  category={editingCategory}
                  value={form.specifications}
                  onChange={(v) => setField('specifications', v as Record<string, string>)}
                />
              </Field>

              <Field label="性能指标">
                <ParamsEditor
                  key={`perf-${editingProduct?.id ?? 'new'}`}
                  value={form.performance}
                  onChange={(v) => setField('performance', v as Record<string, string>)}
                />
              </Field>

              {/* 产品文档 */}
              <div>
                <div className="mb-2 text-sm font-medium">产品文档</div>
                {documents.map((doc) => (
                  <div key={doc.id} className="mb-1 flex items-center gap-2">
                    <FileText className="text-muted-foreground size-4" />
                    <span className="flex-1 text-sm">{doc.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive size-7"
                      aria-label="删除文档"
                      onClick={() => handleDocRemove(doc.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleDocUpload(f);
                    e.target.value = '';
                  }}
                />
                <Button variant="outline" className="mt-1 border-dashed" onClick={() => fileInputRef.current?.click()}>
                  上传文档
                </Button>
              </div>
            </div>
            <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
              <Button variant="outline" onClick={() => setDrawerVisible(false)}>
                取消
              </Button>
              <Button onClick={handleSubmit}>{editingProduct ? '保存' : '创建'}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* 详情抽屉 */}
        <Sheet open={detailDrawerVisible} onOpenChange={(o) => !o && setDetailDrawerVisible(false)}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[700px]">
            <SheetHeader className="border-b px-6 py-4">
              <SheetTitle>产品详情</SheetTitle>
            </SheetHeader>
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4" aria-label="产品详情内容" tabIndex={0}>
              {viewingProduct && (
                <>
                  {/* 基本信息 */}
                  <div>
                    <div className="mb-2 text-sm font-semibold">基本信息</div>
                    <dl className="divide-y rounded-md border text-sm">
                      {[
                        { label: '产品名称', value: viewingProduct.name },
                        { label: '型号', value: viewingProduct.model || '-' },
                        { label: '版本号', value: viewingProduct.revision || '-' },
                        { label: '类别', value: <Tag color={catCfg(viewingProduct.category).color} label={catCfg(viewingProduct.category).label} /> },
                        { label: '状态', value: <Tag color={statusCfg(viewingProduct.status).color} label={statusCfg(viewingProduct.status).label} /> },
                        { label: '关联项目', value: viewingProduct.project?.name || '-' },
                        { label: '描述', value: viewingProduct.description || '-' },
                      ].map((r, i) => (
                        <div key={i} className="flex gap-3 px-3 py-2">
                          <dt className="text-muted-foreground w-20 shrink-0">{r.label}</dt>
                          <dd className="flex-1">{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  {/* 规格参数 */}
                  {viewingProduct.specifications && Object.keys(viewingProduct.specifications).length > 0 && (
                    <div>
                      <div className="mb-2 text-sm font-semibold">规格参数</div>
                      <dl className="divide-y rounded-md border text-sm">
                        {Object.entries(viewingProduct.specifications).map(([key, value]) => (
                          <div key={key} className="flex gap-3 px-3 py-2">
                            <dt className="text-muted-foreground w-32 shrink-0">{key}</dt>
                            <dd className="flex-1">{String(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

                  {/* 性能指标 */}
                  {viewingProduct.performance && Object.keys(viewingProduct.performance).length > 0 && (
                    <div>
                      <div className="mb-2 text-sm font-semibold">性能指标</div>
                      <dl className="divide-y rounded-md border text-sm">
                        {Object.entries(viewingProduct.performance).map(([key, value]) => (
                          <div key={key} className="flex gap-3 px-3 py-2">
                            <dt className="text-muted-foreground w-32 shrink-0">{key}</dt>
                            <dd className="flex-1">{String(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

                  {/* 文档 */}
                  {viewingProduct.documents && (viewingProduct.documents as ProductDocument[]).length > 0 && (
                    <div>
                      <div className="mb-2 text-sm font-semibold">产品文档</div>
                      {(viewingProduct.documents as ProductDocument[]).map((doc) => (
                        <div key={doc.id} className="mb-2 flex items-center gap-2 text-sm">
                          <FileText className="text-muted-foreground size-4" />
                          <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-primary flex-1 hover:underline">
                            {doc.name}
                          </a>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 变更记录 */}
                  <details className="rounded-md border">
                    <summary className="hover:bg-accent cursor-pointer px-3 py-2 text-sm font-medium">变更记录</summary>
                    <div className="border-t px-3 py-2">
                      {changeLogs.length > 0 ? (
                        <ol className="space-y-3">
                          {changeLogs.map((log) => {
                            const actionColor =
                              log.action === 'CREATE'
                                ? 'green'
                                : log.action === 'UPDATE'
                                  ? 'blue'
                                  : log.action === 'DELETE'
                                    ? 'red'
                                    : log.action === 'COPY'
                                      ? 'purple'
                                      : 'default';
                            const actionLabel =
                              log.action === 'CREATE'
                                ? '创建'
                                : log.action === 'UPDATE'
                                  ? '更新'
                                  : log.action === 'DELETE'
                                    ? '删除'
                                    : log.action === 'COPY'
                                      ? '复制'
                                      : log.action;
                            return (
                              <li key={log.id} className="border-muted relative border-l pl-4">
                                <span className="bg-primary absolute top-1.5 -left-[3px] size-1.5 rounded-full" />
                                <div className="text-[13px]">
                                  <strong>{log.userName}</strong>{' '}
                                  <Tag color={actionColor} label={actionLabel} />
                                  <span className="text-muted-foreground ml-2">
                                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                                  </span>
                                </div>
                                {log.changes && Object.keys(log.changes).length > 0 && (
                                  <div className="text-muted-foreground mt-1 text-xs">
                                    {Object.entries(log.changes).map(([field, change]) => (
                                      <div key={field}>
                                        {field}: {String(change.from || '-')} → {String(change.to || '-')}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ol>
                      ) : (
                        <div className="text-muted-foreground py-2 text-sm">暂无变更记录</div>
                      )}
                    </div>
                  </details>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* 复制版本 Dialog */}
        <Dialog open={copyModalVisible} onOpenChange={(o) => !o && setCopyModalVisible(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>复制版本</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <div className="text-sm">
                源产品：{copyingProduct?.name} ({copyingProduct?.model} {copyingProduct?.revision})
              </div>
              <Input
                placeholder="请输入新版本号，如 V3.0"
                value={copyRevision}
                onChange={(e) => setCopyRevision(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCopyModalVisible(false)}>
                取消
              </Button>
              <Button onClick={handleCopy} disabled={!copyRevision}>
                确定
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 对比抽屉 */}
        <Sheet open={compareDrawerVisible} onOpenChange={(o) => !o && setCompareDrawerVisible(false)}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[900px]">
            <SheetHeader className="border-b px-6 py-4">
              <SheetTitle>产品对比 ({selectedProducts.length})</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-auto p-4" aria-label="产品对比内容" tabIndex={0}>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">属性</TableHead>
                      {selectedProducts.map((p, i) => (
                        <TableHead key={i}>
                          {p.name} ({p.revision || '-'})
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compareData.map((row) => {
                      const isSection = row.field.startsWith('---');
                      const allSame = row.values.every((v) => v === row.values[0]);
                      return (
                        <TableRow key={row.field}>
                          <TableCell className={cn(isSection && 'text-primary font-semibold')}>
                            {row.field.replace(/---/g, '').trim() || row.field}
                          </TableCell>
                          {row.values.map((val, i) => (
                            <TableCell key={i}>
                              <span
                                className={cn(
                                  !allSame && !isSection && 'rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-500/20'
                                )}
                              >
                                {val}
                              </span>
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* 删除确认 */}
        <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
            </DialogHeader>
            <div className="text-sm">确定要删除产品“{deleteTarget?.name}”吗？此操作不可恢复。</div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                取消
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    </MainLayout>
  );
};

export default ProductPage;
