import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { toast } from 'sonner';
import { Search, Plus, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import MainLayout from '../../../layouts/MainLayout';
import ProjectFormDrawer from '../Edit/ProjectFormDrawer';
import { projectsApi, weeklyReportsApi } from '../../../api';
import { useAuthStore } from '../../../store/authStore';
import { Project } from '../../../types';
import { PRODUCT_LINE_MAP } from '../../../utils/constants';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { buildProjectColumns } from './columns';

export interface ProjectStats {
  all: number;
  planning: number;
  inProgress: number;
  completed: number;
  onHold: number;
  archived: number;
}

export function normalizeProjectStats(raw: Partial<ProjectStats>): ProjectStats {
  return {
    all: raw.all ?? 0,
    planning: raw.planning ?? 0,
    inProgress: raw.inProgress ?? 0,
    completed: raw.completed ?? 0,
    onHold: raw.onHold ?? 0,
    archived: raw.archived ?? 0,
  };
}

const ProjectList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission, isProjectManager } = useAuthStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ProjectStats>({ all: 0, planning: 0, inProgress: 0, completed: 0, onHold: 0, archived: 0 });
  const [latestStatus, setLatestStatus] = useState<Record<string, string>>({});
  const [sorting, setSorting] = useState<SortingState>([]);

  const [searchKeyword, setSearchKeyword] = useState(searchParams.get('keyword') || '');
  const [selectedStatus, setSelectedStatus] = useState<string>(searchParams.get('status') || '');
  const [selectedProductLines, setSelectedProductLines] = useState<string[]>(() => {
    const param = searchParams.get('productLine');
    if (param) return param.split(',').map((l) => l.trim());
    return Object.keys(PRODUCT_LINE_MAP);
  });

  const [pagination, setPagination] = useState({
    current: Number(searchParams.get('page')) || 1,
    pageSize: Number(searchParams.get('pageSize')) || 20,
    total: 0,
  });
  const { current: currentPage, pageSize, total } = pagination;

  useEffect(() => {
    const params = new URLSearchParams();
    if (currentPage !== 1) params.set('page', String(currentPage));
    if (pageSize !== 20) params.set('pageSize', String(pageSize));
    if (searchKeyword) params.set('keyword', searchKeyword);
    if (selectedStatus) params.set('status', selectedStatus);
    const allKeys = Object.keys(PRODUCT_LINE_MAP);
    if (selectedProductLines.length > 0 && selectedProductLines.length < allKeys.length) {
      params.set('productLine', selectedProductLines.join(','));
    }
    setSearchParams(params, { replace: true });
  }, [currentPage, pageSize, searchKeyword, selectedStatus, selectedProductLines, setSearchParams]);

  const loadProjects = async (page = currentPage, pageSizeValue = pageSize) => {
    setLoading(true);
    try {
      const params: { status?: string; productLine?: string; keyword?: string; page?: number; pageSize?: number } = {
        page,
        pageSize: pageSizeValue,
      };
      if (selectedStatus) params.status = selectedStatus;
      const allKeys = Object.keys(PRODUCT_LINE_MAP);
      if (selectedProductLines.length > 0 && selectedProductLines.length < allKeys.length) {
        params.productLine = selectedProductLines.join(',');
      }
      if (searchKeyword) params.keyword = searchKeyword;
      const response = await projectsApi.list(params);
      const { data: list, total: tot, stats: serverStats } = response.data;
      setProjects(list || []);
      setStats(normalizeProjectStats((serverStats || {}) as Partial<ProjectStats>));
      setPagination((prev) => ({ ...prev, current: page, pageSize: pageSizeValue, total: tot }));
    } catch {
      toast.error('加载项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects(1, pagination.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStatus, selectedProductLines, searchKeyword]);

  useEffect(() => {
    weeklyReportsApi.getLatestStatus().then((res) => setLatestStatus(res.data || {})).catch(() => {});
  }, []);

  const statistics = useMemo(
    () => ({
      total: stats.all,
      inProgress: stats.inProgress,
      completed: stats.completed,
      onHold: stats.onHold,
      archived: stats.archived,
    }),
    [stats]
  );

  const handleSearch = useMemo(() => {
    let timer: ReturnType<typeof setTimeout>;
    return (value: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setSearchKeyword(value);
        setPagination((prev) => ({ ...prev, current: 1 }));
      }, 300);
    };
  }, []);

  // 抽屉（创建/编辑）— 暂沿用 Arco ProjectFormDrawer（迁移期并存）
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
    if (searchParams.has('new') || searchParams.has('edit')) {
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      next.delete('edit');
      setSearchParams(next, { replace: true });
    }
  };
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

  // 删除 / 归档（受控 AlertDialog）
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Project | null>(null);
  const [archiveRemark, setArchiveRemark] = useState('');

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await projectsApi.delete(deleteTarget.id);
      toast.success('项目删除成功');
      loadProjects();
    } catch {
      toast.error('项目删除失败');
    } finally {
      setDeleteTarget(null);
    }
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    try {
      await projectsApi.archiveProject(archiveTarget.id, archiveRemark || undefined);
      toast.success('项目归档成功');
      loadProjects();
    } catch {
      toast.error('项目归档失败');
    } finally {
      setArchiveTarget(null);
      setArchiveRemark('');
    }
  };

  const handleUnarchive = async (project: Project) => {
    try {
      await projectsApi.unarchiveProject(project.id);
      toast.success('项目已取消归档');
      loadProjects();
    } catch {
      toast.error('取消归档失败');
    }
  };

  const columns = useMemo(
    () =>
      buildProjectColumns({
        latestStatus,
        navigate,
        canUpdate: (p) => hasPermission('project', 'update') && isProjectManager(p.managerId, p.id),
        canDelete: (p) => hasPermission('project', 'delete') && isProjectManager(p.managerId, p.id),
        onEdit: openEditDrawer,
        onDelete: setDeleteTarget,
        onArchive: (p) => {
          setArchiveTarget(p);
          setArchiveRemark('');
        },
        onUnarchive: handleUnarchive,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latestStatus]
  );

  const table = useReactTable({
    data: projects,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  const statCards: { key: string; label: string; value: number }[] = [
    { key: '', label: '全部项目', value: statistics.total },
    { key: 'IN_PROGRESS', label: '进行中', value: statistics.inProgress },
    { key: 'COMPLETED', label: '已完成', value: statistics.completed },
    { key: 'ON_HOLD', label: '已暂停', value: statistics.onHold },
    { key: 'ARCHIVED', label: '已归档', value: statistics.archived },
  ];

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {statCards.map((s) => (
            <Card
              key={s.key || 'all'}
              onClick={() => setSelectedStatus(s.key)}
              className={cn(
                'cursor-pointer p-4 transition-colors',
                selectedStatus === s.key ? 'border-primary ring-primary/20 ring-1' : 'hover:bg-accent/40'
              )}
            >
              <div className="text-muted-foreground text-xs">{s.label}</div>
              <div className="mt-1 text-2xl font-semibold">{s.value}</div>
            </Card>
          ))}
        </div>

        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              placeholder="搜索项目名称..."
              className="w-60 pl-8"
              defaultValue={searchKeyword}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          {Object.entries(PRODUCT_LINE_MAP).map(([key, value]) => {
            const isSelected = selectedProductLines.includes(key);
            return (
              <Badge
                key={key}
                variant={isSelected ? 'default' : 'outline'}
                className="cursor-pointer select-none px-3 py-1"
                onClick={() => {
                  if (isSelected) {
                    if (selectedProductLines.length > 1) setSelectedProductLines(selectedProductLines.filter((l) => l !== key));
                  } else {
                    setSelectedProductLines([...selectedProductLines, key]);
                  }
                  setPagination((prev) => ({ ...prev, current: 1 }));
                }}
              >
                {value.label}
              </Badge>
            );
          })}
          {hasPermission('project', 'create') && (
            <div className="ml-auto flex items-center gap-2">
              <Button onClick={openCreateDrawer}>
                <Plus className="size-4" />
                新建项目
              </Button>
              <Button variant="outline" size="icon" aria-label="项目模板管理" onClick={() => navigate('/templates')}>
                <FileText className="size-4" />
              </Button>
            </div>
          )}
        </div>

        {/* 表格 */}
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-muted-foreground h-24 text-center">
                    加载中…
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-muted-foreground h-24 text-center">
                    暂无数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        {/* 分页 */}
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          <span>共 {total} 条</span>
          <div className="flex items-center gap-2">
            <span>
              第 {currentPage} / {pageCount} 页
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage <= 1}
              aria-label="上一页"
              onClick={() => loadProjects(currentPage - 1, pageSize)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage >= pageCount}
              aria-label="下一页"
              onClick={() => loadProjects(currentPage + 1, pageSize)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <ProjectFormDrawer visible={drawerVisible} projectId={drawerProjectId} onClose={closeDrawer} onSuccess={() => loadProjects()} />

        {/* 删除确认 */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除</AlertDialogTitle>
              <AlertDialogDescription>确定要删除项目「{deleteTarget?.name}」吗？此操作不可恢复。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 归档确认 */}
        <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>归档项目</AlertDialogTitle>
              <AlertDialogDescription>
                确定要归档项目「{archiveTarget?.name}」吗？归档后项目将变为只读，可随时取消归档恢复。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea placeholder="归档备注（可选）" value={archiveRemark} onChange={(e) => setArchiveRemark(e.target.value)} rows={2} />
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={confirmArchive}>确认归档</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
};

export default ProjectList;
