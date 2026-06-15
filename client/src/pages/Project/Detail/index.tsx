import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronLeft, Plus, Undo2, Upload, Download, ChevronDown, Archive, ArchiveRestore, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import MainLayout from '../../../layouts/MainLayout';
import { projectsApi, activitiesApi, featureFlagsApi } from '../../../api';
import ColumnSettings from './ColumnSettings';
import { useAuthStore } from '../../../store/authStore';
import ProjectWeeklyTab from '../../WeeklyReports/ProjectWeeklyTab';
import GanttChart from './GanttChart';
import RiskAssessmentTab from './RiskAssessmentTab';
import ProductsTab from './ProductsTab';
import SchedulingTools from './SchedulingTools';
import SnapshotsTab from './SnapshotsTab';
import ActivityDrawer, { type ActivityDrawerValues } from './ActivityDrawer';
import MembersModal from './MembersModal';
import { Activity } from '../../../types';
import { STATUS_MAP, PRIORITY_MAP, PRODUCT_LINE_MAP, ACTIVITY_STATUS_MAP, PHASE_OPTIONS } from '../../../utils/constants';
import { isFeatureEnabled, normalizeFeatureFlags } from '../../../utils/featureFlags';
import { arcoBadgeClass } from '../../../utils/badgeColor';

import { useUndoStack } from '../../../hooks/useUndoStack';
import { useProjectData } from '../../../hooks/useProjectData';
import { useColumnPrefs } from '../../../hooks/useColumnPrefs';
import { useInlineEdit } from '../../../hooks/useInlineEdit';
import { useDragReorder } from '../../../hooks/useDragReorder';
import { useActivityColumns, COLUMN_WIDTH_MAP, PHASE_COLOR } from '../../../hooks/useActivityColumns';
import { useDebouncedCallback } from '../../../hooks/useDebouncedCallback';
import ResizableHeaderCell from '../../../components/ResizableHeaderCell';
import {
  getApiErrorMessage,
  escapeCsvHelper,
  getMsDateHelper,
  ACTIVITY_COLUMN_DEFS,
  DEFAULT_COLUMN_ORDER,
  DEFAULT_COLUMN_VISIBLE,
  formatDeps,
  computeSortOrder,
} from './helpers';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

export { getApiErrorMessage, escapeCsvHelper, getMsDateHelper, formatDeps, computeSortOrder };

const ProjectDetail: React.FC = () => {
  const { id, snapshotId } = useParams<{ id: string; snapshotId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission, isProjectManager } = useAuthStore();

  // UI 状态
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'activities');
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importUploading, setImportUploading] = useState(false);
  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const insertAtIndexRef = useRef<number | null>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const [confirm, setConfirm] = useState<{ title: string; content: string; danger?: boolean; onOk: () => void | Promise<void> } | null>(null);

  // === Extracted hooks ===
  const { undoStack, pushUndo, handleUndo, lastDescription } = useUndoStack();

  const {
    project, activities, setActivities, users, roles,
    loading, activitiesLoading, criticalActivityIds,
    isSnapshot, snapshotMeta,
    snapshotWeeklyReports, snapshotProducts, snapshotRiskAssessments,
    loadProject, loadActivities, loadUsers, loadRoles, loadCriticalPath, loadSnapshotData,
  } = useProjectData({ projectId: id, snapshotId });

  const { columnPrefs, loadColumnPrefs, saveColumnPrefs, defaultPrefs, updateWidthsLocal, persistWidths } = useColumnPrefs({
    columnDefs: ACTIVITY_COLUMN_DEFS,
    defaultVisible: DEFAULT_COLUMN_VISIBLE,
    defaultOrder: DEFAULT_COLUMN_ORDER,
  });

  const isArchived = project?.status === 'ARCHIVED' || isSnapshot;
  const canManage = hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) && !isArchived;
  const canCreate = hasPermission('activity', 'create') && isProjectManager(project?.managerId ?? '', project?.id) && !isArchived;
  const activityImportEnabled = useMemo(() => isFeatureEnabled(featureFlags, 'activity.import', true), [featureFlags]);
  const activityBulkMutationEnabled = useMemo(() => isFeatureEnabled(featureFlags, 'activity.bulk-mutation', true), [featureFlags]);

  const {
    inlineEditing, setInlineEditing, inlineValue, setInlineValue,
    startInlineEdit, showUndoMessage, commitInlineEdit, commitSelectEdit,
  } = useInlineEdit({ isArchived: !!isArchived, canManage, pushUndo, loadActivities, loadProject, setActivities });

  const { saving, dragFromRef, dragOverRef, handleMouseDown, handleMouseMove, handleMouseUp } = useDragReorder({
    projectId: id, activities, setActivities, pushUndo, loadActivities,
  });

  // === Activity actions ===
  const handleOpenDrawer = useCallback((activity?: Activity) => {
    setEditingActivity(activity || null);
    setDrawerVisible(true);
  }, []);

  const activityToCreatePayload = useCallback((s: Activity) => ({
    projectId: s.projectId,
    name: s.name,
    description: s.description,
    type: s.type,
    phase: s.phase,
    status: s.status,
    planStartDate: s.planStartDate || undefined,
    planEndDate: s.planEndDate || undefined,
    planDuration: s.planDuration ?? undefined,
    startDate: s.startDate || undefined,
    endDate: s.endDate || undefined,
    duration: s.duration ?? undefined,
    executorIds: (s.executors || []).map((e) => e.userId),
    notes: s.notes || undefined,
    sortOrder: s.sortOrder,
    dependencies: Array.isArray(s.dependencies)
      ? s.dependencies.map((d) => ({ id: d.id, type: d.type, lag: d.lag ?? 0 }))
      : undefined,
  }), []);

  const handleDeleteActivity = useCallback((activity: Activity) => {
    setConfirm({
      title: '确认删除',
      content: `确定要删除活动"${activity.name}"吗？`,
      danger: true,
      onOk: async () => {
        try {
          const snapshot = { ...activity };
          await activitiesApi.delete(activity.id);
          pushUndo({
            description: `撤回删除活动「${snapshot.name}」`,
            execute: async () => {
              await activitiesApi.create(activityToCreatePayload(snapshot));
              loadActivities();
              loadProject();
            },
          });
          toast.success(`已删除活动「${snapshot.name}」`);
          loadActivities();
          loadProject();
        } catch {
          toast.error('活动删除失败');
        }
      },
    });
  }, [pushUndo, activityToCreatePayload, loadActivities, loadProject]);

  const handleInsertActivity = useCallback(async (atIndex: number) => {
    if (!id) return;
    const sortOrder = computeSortOrder(activities, atIndex);
    try {
      const resp = await activitiesApi.create({ projectId: id, name: '新活动', type: 'TASK', status: 'NOT_STARTED', sortOrder });
      const newId = (resp as { data?: { id?: string } }).data?.id ?? (resp as unknown as Activity).id;
      await loadActivities();
      if (newId) {
        setInlineEditing({ id: newId, field: 'name' });
        setInlineValue('新活动');
      }
    } catch {
      toast.error('创建活动失败');
    }
  }, [id, activities, loadActivities, setInlineEditing, setInlineValue]);

  // Drawer submit handler
  const handleDrawerSubmit = useCallback(async (
    values: ActivityDrawerValues,
    planDuration: number | null,
    actualDuration: number | null,
    formDeps: { id: string; type: string; lag: number }[]
  ) => {
    if (!id) return;
    const data: Parameters<typeof activitiesApi.create>[0] = {
      projectId: id,
      name: values.name,
      description: values.description,
      type: values.type,
      phase: values.phase,
      status: values.status,
      planStartDate: values.planStart ? dayjs(values.planStart).format('YYYY-MM-DD') : undefined,
      planEndDate: values.planEnd ? dayjs(values.planEnd).format('YYYY-MM-DD') : undefined,
      planDuration: planDuration ?? undefined,
      startDate: values.actualStart ? dayjs(values.actualStart).format('YYYY-MM-DD') : undefined,
      endDate: values.actualEnd ? dayjs(values.actualEnd).format('YYYY-MM-DD') : undefined,
      duration: actualDuration ?? undefined,
      roleId: values.roleId ?? null,
      executorIds: values.executorIds || [],
      notes: values.notes,
      sortOrder: editingActivity
        ? editingActivity.sortOrder
        : insertAtIndexRef.current !== null
          ? computeSortOrder(activities, insertAtIndexRef.current!)
          : (activities.length + 1) * 10,
      dependencies: formDeps.filter((d) => d.id).map((d) => ({ id: d.id, type: d.type, lag: d.lag || 0 })),
    };

    if (editingActivity) {
      const snapshot = { ...editingActivity };
      await activitiesApi.update(editingActivity.id, data);
      pushUndo({
        description: `撤回对活动「${snapshot.name}」的编辑`,
        execute: async () => {
          await activitiesApi.update(snapshot.id, {
            name: snapshot.name,
            description: snapshot.description,
            type: snapshot.type,
            phase: snapshot.phase,
            status: snapshot.status,
            planStartDate: snapshot.planStartDate ? dayjs(snapshot.planStartDate).format('YYYY-MM-DD') : undefined,
            planEndDate: snapshot.planEndDate ? dayjs(snapshot.planEndDate).format('YYYY-MM-DD') : undefined,
            planDuration: snapshot.planDuration ?? undefined,
            startDate: snapshot.startDate ? dayjs(snapshot.startDate).format('YYYY-MM-DD') : undefined,
            endDate: snapshot.endDate ? dayjs(snapshot.endDate).format('YYYY-MM-DD') : undefined,
            duration: snapshot.duration ?? undefined,
            roleId: snapshot.roleId ?? null,
            executorIds: snapshot.executors?.map((e) => e.userId) ?? [],
            notes: snapshot.notes,
            dependencies: Array.isArray(snapshot.dependencies)
              ? snapshot.dependencies.map((d) => ({ id: d.id, type: d.type, lag: d.lag ?? 0 }))
              : undefined,
          });
          loadActivities();
          loadProject();
        },
      });
      toast.success('活动更新成功');
    } else {
      await activitiesApi.create(data);
      toast.success('活动创建成功');
    }
    insertAtIndexRef.current = null;
    setDrawerVisible(false);
    loadActivities();
    loadProject();
  }, [id, editingActivity, activities, pushUndo, loadActivities, loadProject]);

  // Import file handler
  const doImportFile = useCallback(async (file: File) => {
    if (!id) return;
    if (!activityImportEnabled) {
      toast.warning('活动导入功能已临时关闭');
      return;
    }
    setImportUploading(true);
    try {
      const { data } = await activitiesApi.importExcel(id, file);
      const importedIds = (data.activities || []).map((a) => a.id);
      const msg = `导入成功，共 ${data.count} 条活动${data.skipped ? `，跳过 ${data.skipped} 条重复` : ''}`;
      if (importedIds.length > 0) {
        pushUndo({
          description: `撤回批量导入的 ${importedIds.length} 条活动`,
          execute: async () => {
            await activitiesApi.undoImport(id!, importedIds);
            loadActivities();
            loadProject();
          },
        });
      }
      toast.success(msg);
      if (data.createdUsers && data.createdUsers.length > 0) {
        toast.info(`已自动创建 ${data.createdUsers.length} 个联系人账号：${data.createdUsers.join('、')}`);
      }
      setImportModalVisible(false);
      setDrawerVisible(false);
      loadActivities();
      loadProject();
    } catch (err) {
      toast.error(getApiErrorMessage(err, '导入失败'));
    } finally {
      setImportUploading(false);
    }
  }, [id, activityImportEnabled, pushUndo, loadActivities, loadProject]);

  // Export CSV
  const handleExportExcel = useCallback(() => {
    if (!activities.length) {
      toast.warning('暂无活动数据');
      return;
    }
    const statusMap: Record<string, string> = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', COMPLETED: '已完成', CANCELLED: '已取消' };
    const typeMap: Record<string, string> = { TASK: '任务', MILESTONE: '里程碑', PHASE: '阶段' };
    const fmtDate = (d?: string | null) => (d ? dayjs(d).format('YYYY-MM-DD') : '');

    const activitySeqMapLocal = new Map<string, number>();
    activities.forEach((a, i) => activitySeqMapLocal.set(a.id, i + 1));

    const headers = ['ID', '前置依赖', '阶段', '活动名称', '类型', '状态', '负责人', '计划工期', '计划开始', '计划结束', '实际开始', '实际结束', '备注'];
    const rows = activities.map((a, i) => [
      String(i + 1).padStart(3, '0'),
      formatDeps(a, activitySeqMapLocal),
      a.phase || '',
      a.name,
      typeMap[a.type] || a.type,
      statusMap[a.status] || a.status,
      (a.executors || []).map((e) => e.user?.realName).filter(Boolean).join(', ') || '-',
      a.planDuration != null ? String(a.planDuration) : '',
      fmtDate(a.planStartDate),
      fmtDate(a.planEndDate),
      fmtDate(a.startDate),
      fmtDate(a.endDate),
      a.notes || '',
    ]);

    const csv = [headers, ...rows].map((row) => row.map(escapeCsvHelper).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || '项目'}_活动列表_${dayjs().format('YYYY-MM-DD')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activities, project]);

  // Archive/Unarchive
  const handleArchiveProject = useCallback(() => {
    if (!id) return;
    setConfirm({
      title: '归档项目',
      content: '归档后项目将变为只读状态，所有数据不可编辑。确定要归档吗？',
      danger: true,
      onOk: async () => {
        try {
          await projectsApi.archiveProject(id);
          toast.success('项目归档成功');
          loadProject();
        } catch {
          toast.error('归档失败');
        }
      },
    });
  }, [id, loadProject]);

  const handleUnarchiveProject = useCallback(async () => {
    if (!id) return;
    try {
      await projectsApi.unarchiveProject(id);
      toast.success('已取消归档');
      loadProject();
    } catch {
      toast.error('取消归档失败');
    }
  }, [id, loadProject]);

  // Members modal
  const handleMembersConfirm = useCallback(async (pendingMemberIds: string[]) => {
    if (!id || !project) return;
    const currentIds = new Set(project.members?.map((m) => m.user.id) || []);
    const pendingSet = new Set(pendingMemberIds);
    const toAdd = pendingMemberIds.filter((uid) => !currentIds.has(uid));
    const toRemove = [...currentIds].filter((uid) => !pendingSet.has(uid));
    if (toAdd.length === 0 && toRemove.length === 0) {
      setMembersModalVisible(false);
      return;
    }
    setMembersLoading(true);
    try {
      await Promise.all([
        ...toAdd.map((uid) => projectsApi.addMember(id, uid)),
        ...toRemove.map((uid) => projectsApi.removeMember(id, uid)),
      ]);
      toast.success(`协作者已更新（添加 ${toAdd.length}，移除 ${toRemove.length}）`);
      await loadProject();
    } catch {
      toast.error('更新协作者失败');
    } finally {
      setMembersLoading(false);
      setMembersModalVisible(false);
    }
  }, [id, project, loadProject]);

  // Batch operations
  const handleBatchStatusUpdate = useCallback(async (status: string) => {
    if (selectedIds.size === 0) return;
    if (!activityBulkMutationEnabled) {
      toast.warning('活动批量变更功能已临时关闭');
      return;
    }
    try {
      const ids = Array.from(selectedIds);
      const oldStatuses = ids.map((sid) => ({ id: sid, status: activities.find((a) => a.id === sid)?.status }));
      await activitiesApi.batchUpdate(ids, { status });
      pushUndo({
        description: `撤回批量修改 ${ids.length} 个活动的状态`,
        execute: async () => {
          for (const item of oldStatuses) {
            if (item.status) await activitiesApi.update(item.id, { status: item.status });
          }
          loadActivities();
          loadProject();
        },
      });
      toast.success(`已更新 ${selectedIds.size} 个活动状态`);
      setSelectedIds(new Set());
      loadActivities();
      loadProject();
    } catch {
      toast.error('批量更新失败');
    }
  }, [selectedIds, activityBulkMutationEnabled, activities, pushUndo, loadActivities, loadProject]);

  const handleBatchPhaseUpdate = useCallback(async (phase: string) => {
    if (selectedIds.size === 0) return;
    if (!activityBulkMutationEnabled) {
      toast.warning('活动批量变更功能已临时关闭');
      return;
    }
    try {
      const ids = Array.from(selectedIds);
      const oldPhases = ids.map((sid) => ({ id: sid, phase: activities.find((a) => a.id === sid)?.phase }));
      await activitiesApi.batchUpdate(ids, { phase });
      pushUndo({
        description: `撤回批量修改 ${ids.length} 个活动的阶段`,
        execute: async () => {
          for (const item of oldPhases) {
            if (item.phase) await activitiesApi.update(item.id, { phase: item.phase });
          }
          loadActivities();
        },
      });
      toast.success(`已更新 ${selectedIds.size} 个活动阶段`);
      setSelectedIds(new Set());
      loadActivities();
    } catch {
      toast.error('批量更新失败');
    }
  }, [selectedIds, activityBulkMutationEnabled, activities, pushUndo, loadActivities]);

  const handleBatchAssigneeUpdate = useCallback(async (assigneeIds: string[]) => {
    if (selectedIds.size === 0) return;
    if (!activityBulkMutationEnabled) {
      toast.warning('活动批量变更功能已临时关闭');
      return;
    }
    try {
      const ids = Array.from(selectedIds);
      const oldAssignees = ids.map((sid) => ({ id: sid, executorIds: (activities.find((a) => a.id === sid)?.executors || []).map((e) => e.userId) }));
      await activitiesApi.batchUpdate(ids, { executorIds: assigneeIds });
      pushUndo({
        description: `撤回批量修改 ${ids.length} 个活动的负责人`,
        execute: async () => {
          for (const item of oldAssignees) {
            await activitiesApi.update(item.id, { executorIds: item.executorIds });
          }
          loadActivities();
        },
      });
      toast.success(`已更新 ${selectedIds.size} 个活动负责人`);
      setSelectedIds(new Set());
      loadActivities();
    } catch {
      toast.error('批量更新失败');
    }
  }, [selectedIds, activityBulkMutationEnabled, activities, pushUndo, loadActivities]);

  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    if (!activityBulkMutationEnabled) {
      toast.warning('活动批量变更功能已临时关闭');
      return;
    }
    setConfirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedIds.size} 个活动吗？`,
      danger: true,
      onOk: async () => {
        try {
          const snapshots = activities.filter((a) => selectedIds.has(a.id)).map((a) => ({ ...a }));
          const count = selectedIds.size;
          await activitiesApi.batchDelete(Array.from(selectedIds));
          setSelectedIds(new Set());
          loadActivities();
          loadProject();
          pushUndo({
            description: `撤回批量删除的 ${count} 个活动`,
            execute: async () => {
              await activitiesApi.batchCreate(snapshots.map(activityToCreatePayload));
              loadActivities();
              loadProject();
            },
          });
          toast.success(`已删除 ${count} 个活动`);
        } catch {
          toast.error('批量删除失败');
        }
      },
    });
  }, [selectedIds, activityBulkMutationEnabled, activities, pushUndo, activityToCreatePayload, loadActivities, loadProject]);

  // Column widths
  const columnWidths = useMemo(() => ({ ...COLUMN_WIDTH_MAP, ...(columnPrefs.widths || {}) }), [columnPrefs.widths]);
  const { debouncedFn: debouncedPersistWidths } = useDebouncedCallback(
    ((...args: unknown[]) => { persistWidths(args[0] as Record<string, number>); }) as (...args: unknown[]) => unknown,
    500,
  );
  const handleColumnResize = useCallback((key: string, width: number) => {
    const newWidths = { ...columnPrefs.widths, [key]: Math.round(width) };
    updateWidthsLocal(newWidths);
    debouncedPersistWidths(newWidths);
  }, [columnPrefs.widths, updateWidthsLocal, debouncedPersistWidths]);
  const fixedColumnKeys = useMemo(() => new Set<string>(), []);

  // Activity columns hook
  const { activityColumns, scrollX, activitySeqMap } = useActivityColumns({
    activities, users, roles, project, isArchived: !!isArchived,
    canManage, canCreate, criticalActivityIds,
    inlineEditing, setInlineEditing, inlineValue, setInlineValue,
    startInlineEdit, showUndoMessage, commitInlineEdit, commitSelectEdit,
    handleOpenDrawer, handleDeleteActivity, handleInsertActivity,
    handleMouseDown, loadActivities,
    columnPrefsVisible: columnPrefs.visible,
    columnPrefsOrder: columnPrefs.order,
    columnWidths,
    selectedIds, setSelectedIds,
  });

  // === Data loading ===
  useEffect(() => {
    let mounted = true;
    featureFlagsApi.snapshot()
      .then(({ data }) => { if (mounted) setFeatureFlags(normalizeFeatureFlags(data.flags)); })
      .catch(() => { if (mounted) setFeatureFlags({}); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (isSnapshot) {
      setActiveTab('activities');
      loadSnapshotData();
      loadColumnPrefs();
    } else {
      const tabFromUrl = searchParams.get('tab');
      if (tabFromUrl) setActiveTab(tabFromUrl);
      loadProject();
      loadActivities();
      loadUsers();
      loadRoles();
      loadColumnPrefs();
      loadCriticalPath();
    }
  }, [id, isSnapshot, loadActivities, loadColumnPrefs, loadCriticalPath, loadProject, loadRoles, loadSnapshotData, loadUsers, searchParams, snapshotId]);

  // 全局 AI 助手应用后刷新本页
  useEffect(() => {
    if (isSnapshot) return;
    const onApplied = () => { loadActivities(); loadProject(); };
    window.addEventListener('assistant:applied', onApplied);
    return () => window.removeEventListener('assistant:applied', onApplied);
  }, [isSnapshot, loadActivities, loadProject]);

  if (loading || !project) {
    return (
      <MainLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="text-muted-foreground size-9 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  const statusConfig = STATUS_MAP[project.status as keyof typeof STATUS_MAP] ?? { label: project.status, color: 'default' };
  const priorityConfig = PRIORITY_MAP[project.priority as keyof typeof PRIORITY_MAP] ?? { label: project.priority, color: 'default' };
  const productLineConfig = PRODUCT_LINE_MAP[project.productLine as keyof typeof PRODUCT_LINE_MAP] ?? { label: project.productLine, color: 'default' };

  const filteredActivities = (() => {
    let list = [...activities];
    if (phaseFilter) list = list.filter((a) => a.phase === phaseFilter);
    if (statusFilter) list = list.filter((a) => a.status === statusFilter);
    return list;
  })();

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'activities') next.delete('tab');
      else next.set('tab', tab);
      return next;
    }, { replace: true });
  };

  const statCards: Array<{ label: string; value: React.ReactNode }> = [
    { label: '时间', value: `${dayjs(project.startDate).format('YYYY-MM-DD')}${project.endDate ? ' ~ ' + dayjs(project.endDate).format('YYYY-MM-DD') : ''}` },
    {
      label: '整体进度',
      value: (
        <div
          role="progressbar"
          aria-label="项目整体进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={project.progress || 0}
          title={`项目整体进度 ${project.progress || 0}%`}
          style={{ width: 100, height: 8, borderRadius: 999, background: 'var(--muted)', overflow: 'hidden' }}
        >
          <div style={{ width: `${Math.max(0, Math.min(100, project.progress || 0))}%`, height: '100%', borderRadius: 999, background: 'var(--primary)' }} />
        </div>
      ),
    },
    { label: '活动数量', value: `${activities.length} 个` },
    { label: '项目经理', value: project.manager?.realName || project.manager?.username || '-' },
    {
      label: '协作者',
      value: (
        <div className="flex flex-wrap items-center gap-1.5">
          {project.members && project.members.length > 0 ? (
            <>
              {project.members.slice(0, 3).map((m) => (
                <Badge key={m.user.id} variant="outline" className={arcoBadgeClass('default')}>{m.user.realName}</Badge>
              ))}
              {project.members.length > 3 && <Badge variant="outline" className={arcoBadgeClass('gray')}>+{project.members.length - 3}</Badge>}
            </>
          ) : (
            <span className="text-muted-foreground">暂无</span>
          )}
          {(useAuthStore.getState().user?.permissions?.includes('*:*') || useAuthStore.getState().user?.id === project.managerId) && (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setMembersModalVisible(true)}>管理</Button>
          )}
        </div>
      ),
    },
  ];

  const canArchiveManage = !isSnapshot && hasPermission('project', 'update') && isProjectManager(project?.managerId ?? '', project?.id);

  return (
    <MainLayout>
      <TooltipProvider>
        <div>
          {/* 快照模式横幅 */}
          {isSnapshot && snapshotMeta && (
            <div className="mb-4 flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
              <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${id}?tab=snapshots`)}>
                <ChevronLeft className="size-4" />
                返回项目
              </Button>
              <span>
                您正在查看 <b>{dayjs(snapshotMeta.archivedAt).format('YYYY-MM-DD HH:mm')}</b> 的项目快照
                {snapshotMeta.remark && <span>（{snapshotMeta.remark}）</span>}，所有内容为只读。
              </span>
            </div>
          )}

          {/* 顶部信息（平铺，不再套外层卡） */}
          <div className="mb-4 space-y-3">
            <div className="flex items-center gap-3">
              {!isSnapshot && (
                <Button variant="outline" onClick={() => navigate('/projects')}>
                  <ChevronLeft className="size-4" />
                  返回
                </Button>
              )}
              <h2 className="text-lg font-semibold">{project.name}</h2>
              <Badge variant="outline" className={arcoBadgeClass(statusConfig.color)}>{statusConfig.label}</Badge>
              <Badge variant="outline" className={arcoBadgeClass(productLineConfig.color)}>{productLineConfig.label}</Badge>
              <Badge variant="outline" className={arcoBadgeClass(priorityConfig.color)}>{priorityConfig.label}</Badge>
            </div>
            {project.description && <div className="text-muted-foreground text-sm">{project.description}</div>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {statCards.map((item, i) => (
                <Card key={i} className="p-3 shadow-none">
                  <div className="text-muted-foreground mb-1.5 text-xs">{item.label}</div>
                  <div className="text-sm font-medium">{item.value}</div>
                </Card>
              ))}
            </div>
          </div>

          {/* 归档只读提示 */}
          {isArchived && !isSnapshot && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              该项目已归档，所有内容为只读状态。
              {hasPermission('project', 'update') && isProjectManager(project.managerId, project.id) && (
                <Button variant="link" size="sm" className="ml-1 h-auto p-0 text-xs" onClick={handleUnarchiveProject}>取消归档</Button>
              )}
            </div>
          )}

          {/* Tab 区域 */}
          <Card className="p-4">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="flex-wrap">
                <TabsTrigger value="activities">活动列表</TabsTrigger>
                <TabsTrigger value="milestones">里程碑</TabsTrigger>
                <TabsTrigger value="gantt">甘特图</TabsTrigger>
                <TabsTrigger value="risk">AI风险评估</TabsTrigger>
                <TabsTrigger value="products">产品列表</TabsTrigger>
                <TabsTrigger value="weekly">项目周报</TabsTrigger>
                {!isSnapshot && <TabsTrigger value="scheduling">排期工具</TabsTrigger>}
                {!isSnapshot && <TabsTrigger value="snapshots">项目快照</TabsTrigger>}
              </TabsList>

              {/* 活动列表 */}
              <TabsContent value="activities" className="mt-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {saving && <span className="text-muted-foreground text-xs">保存排序中...</span>}
                    {/* 阶段工时 */}
                    <div className="flex items-center gap-1 text-xs">
                      {(['EVT', 'DVT', 'PVT', 'MP'] as const).map((phase) => {
                        const total = activities.filter((a) => a.phase === phase).reduce((sum, a) => sum + (a.planDuration || 0), 0);
                        if (total === 0) return null;
                        const isActive = phaseFilter === phase;
                        return (
                          <button key={phase} onClick={() => setPhaseFilter((prev) => (prev === phase ? null : phase))}>
                            <Badge variant="outline" className={cn('cursor-pointer', arcoBadgeClass(isActive ? PHASE_COLOR[phase] : 'gray'), !isActive && 'opacity-65')}>
                              {phase} {total}天
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                    {/* 状态过滤 */}
                    <div className="flex items-center gap-1 text-xs">
                      <button
                        className={cn('cursor-pointer rounded px-1.5 py-0.5', statusFilter === 'NOT_STARTED' ? 'bg-accent text-foreground' : 'text-muted-foreground')}
                        onClick={() => setStatusFilter((prev) => (prev === 'NOT_STARTED' ? null : 'NOT_STARTED'))}
                      >
                        未开始 <span className="font-medium">{activities.filter((a) => a.status === 'NOT_STARTED').length}</span>
                      </button>
                      <span className="text-border">|</span>
                      <button
                        className={cn('cursor-pointer rounded px-1.5 py-0.5', statusFilter === 'IN_PROGRESS' ? 'bg-accent text-primary' : 'text-muted-foreground')}
                        onClick={() => setStatusFilter((prev) => (prev === 'IN_PROGRESS' ? null : 'IN_PROGRESS'))}
                      >
                        进行中 <span className="font-medium">{activities.filter((a) => a.status === 'IN_PROGRESS').length}</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm">
                          活动
                          <ChevronDown className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canCreate && (
                          <DropdownMenuItem onClick={() => handleOpenDrawer()}>
                            <Plus className="size-4" />
                            新建活动
                          </DropdownMenuItem>
                        )}
                        {canCreate && (
                          <DropdownMenuItem
                            disabled={!activityImportEnabled}
                            onClick={() => {
                              if (!activityImportEnabled) { toast.warning('活动导入功能已临时关闭'); return; }
                              setImportModalVisible(true);
                            }}
                          >
                            <Upload className="size-4" />
                            批量导入
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={handleExportExcel}>
                          <Download className="size-4" />
                          导出活动
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-8"
                          disabled={undoStack.length === 0}
                          onClick={() => setConfirm({ title: '确认撤回', content: lastDescription, onOk: handleUndo })}
                          aria-label="撤回"
                        >
                          <Undo2 className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{lastDescription || '没有可撤回的操作'}</TooltipContent>
                    </Tooltip>

                    <ColumnSettings
                      columnDefs={ACTIVITY_COLUMN_DEFS}
                      prefs={columnPrefs}
                      onChange={saveColumnPrefs}
                      defaultPrefs={defaultPrefs}
                      extraActions={
                        canArchiveManage ? (
                          isArchived ? (
                            <Button size="sm" variant="ghost" className="w-full" onClick={handleUnarchiveProject}>
                              <ArchiveRestore className="size-4" />
                              取消归档
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" className="w-full" onClick={handleArchiveProject}>
                              <Archive className="size-4" />
                              项目归档
                            </Button>
                          )
                        ) : undefined
                      }
                    />
                  </div>
                </div>

                {/* 批量操作工具栏 */}
                {selectedIds.size > 0 && (
                  <div className="mb-2 flex flex-wrap items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-500/30 dark:bg-blue-500/10">
                    <span className="text-primary text-[13px] font-medium">已选 {selectedIds.size} 项</span>
                    <Select disabled={!activityBulkMutationEnabled} onValueChange={(v) => v && handleBatchStatusUpdate(v)}>
                      <SelectTrigger className="w-36" size="sm"><SelectValue placeholder="批量修改状态" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ACTIVITY_STATUS_MAP).map(([k, v]) => (<SelectItem key={k} value={k}>{v.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <Select disabled={!activityBulkMutationEnabled} onValueChange={(v) => v && handleBatchPhaseUpdate(v)}>
                      <SelectTrigger className="w-28" size="sm"><SelectValue placeholder="批量修改阶段" /></SelectTrigger>
                      <SelectContent>
                        {PHASE_OPTIONS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <MultiSelect
                      className="w-48"
                      options={users.map((u) => ({ value: u.id, label: u.realName }))}
                      value={[]}
                      onChange={(v) => { if (v && v.length > 0) handleBatchAssigneeUpdate(v); }}
                      placeholder="批量修改负责人"
                      disabled={!activityBulkMutationEnabled}
                    />
                    <Button size="sm" variant="destructive" disabled={!activityBulkMutationEnabled} onClick={handleBatchDelete}>批量删除</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>取消选择</Button>
                  </div>
                )}

                {/* 活动表格 */}
                <div ref={tableWrapRef} className="activity-table-scroll overflow-auto rounded-md border" style={{ maxHeight: 'calc(100vh - 280px)' }}>
                  <table className="border-collapse text-sm" style={{ width: scrollX || '100%', tableLayout: 'fixed' }}>
                    <colgroup>
                      {activityColumns.map((col, i) => (
                        <col key={col.key ?? i} style={{ width: col.width }} />
                      ))}
                    </colgroup>
                    <thead className="bg-muted sticky top-0 z-10">
                      <tr>
                        {activityColumns.map((col, i) => (
                          <ResizableHeaderCell
                            key={col.key ?? i}
                            data-column-key={col.key}
                            onResize={handleColumnResize}
                            fixedKeys={fixedColumnKeys}
                            className="text-muted-foreground border-b px-2 py-2 text-left text-xs font-medium"
                            style={{ textAlign: col.align as React.CSSProperties['textAlign'] }}
                          >
                            {col.title}
                          </ResizableHeaderCell>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activitiesLoading ? (
                        <tr>
                          <td colSpan={activityColumns.length} className="h-32 text-center">
                            <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
                          </td>
                        </tr>
                      ) : filteredActivities.length === 0 ? (
                        <tr>
                          <td colSpan={activityColumns.length} className="text-muted-foreground h-32 text-center text-sm">暂无活动</td>
                        </tr>
                      ) : (
                        filteredActivities.map((record, index) => {
                          const isSource = dragFromRef.current === index;
                          const isTarget = dragOverRef.current === index && dragOverRef.current !== dragFromRef.current;
                          const insertAbove = isTarget && dragFromRef.current > index;
                          const insertBelow = isTarget && dragFromRef.current < index;
                          return (
                            <tr
                              key={record.id}
                              className={cn('hover:bg-accent/40 border-b', isSource && 'drag-source', insertAbove && 'drag-insert-above', insertBelow && 'drag-insert-below')}
                              onMouseMove={(e) => handleMouseMove(e, index)}
                              onMouseUp={(e) => handleMouseUp(e, index)}
                            >
                              {activityColumns.map((col, ci) => {
                                const value = col.dataIndex ? (record as unknown as Record<string, unknown>)[col.dataIndex] : undefined;
                                return (
                                  <td key={col.key ?? ci} className="px-2 py-1.5 align-middle" style={{ textAlign: col.align as React.CSSProperties['textAlign'] }}>
                                    {col.render ? col.render(value, record, index) : (value as React.ReactNode)}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="milestones" className="mt-4">
                <MilestoneTimeline activities={activities} handleOpenDrawer={handleOpenDrawer} />
              </TabsContent>

              <TabsContent value="gantt" className="mt-4">
                <GanttChart activities={activities} criticalActivityIds={criticalActivityIds} />
              </TabsContent>

              <TabsContent value="risk" className="mt-4">
                {id && <RiskAssessmentTab projectId={id} isArchived={!!isArchived} snapshotData={snapshotRiskAssessments} />}
              </TabsContent>

              <TabsContent value="products" className="mt-4">
                {id && <ProductsTab projectId={id} isArchived={!!isArchived} snapshotData={snapshotProducts} />}
              </TabsContent>

              <TabsContent value="weekly" className="mt-4">
                {id && <ProjectWeeklyTab projectId={id} managerId={project?.managerId} isArchived={!!isArchived} snapshotData={snapshotWeeklyReports} />}
              </TabsContent>

              {!isSnapshot && (
                <TabsContent value="scheduling" className="mt-4">
                  {id && <SchedulingTools projectId={id} activities={activities} onRefresh={loadActivities} isArchived={!!isArchived} />}
                </TabsContent>
              )}

              {!isSnapshot && (
                <TabsContent value="snapshots" className="mt-4">
                  {id && <SnapshotsTab projectId={id} managerId={project?.managerId} isArchived={!!isArchived} />}
                </TabsContent>
              )}
            </Tabs>
          </Card>

          {/* 新建/编辑活动抽屉 */}
          <ActivityDrawer
            visible={drawerVisible}
            onClose={() => { insertAtIndexRef.current = null; setDrawerVisible(false); }}
            editingActivity={editingActivity}
            activities={activities}
            users={users}
            activitySeqMap={activitySeqMap}
            defaultAssigneeId={project?.managerId}
            onSubmit={handleDrawerSubmit}
            onImportFile={doImportFile}
          />

          {/* 协作者管理 Modal */}
          <MembersModal
            visible={membersModalVisible}
            onCancel={() => setMembersModalVisible(false)}
            onOk={handleMembersConfirm}
            loading={membersLoading}
            users={users}
            initialMemberIds={project?.members?.map((m) => m.user.id) || []}
            managerId={project?.managerId}
          />

          {/* 批量导入 Dialog */}
          <Dialog open={importModalVisible} onOpenChange={(o) => !o && setImportModalVisible(false)}>
            <DialogContent className="sm:max-w-[640px]">
              <DialogHeader>
                <DialogTitle>批量导入活动</DialogTitle>
              </DialogHeader>
              <div
                className={cn('rounded-lg border-2 border-dashed px-5 py-12 text-center transition-colors', importUploading ? 'cursor-default' : 'hover:border-primary/50 cursor-pointer', 'bg-muted/40')}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer?.files?.[0];
                  if (file && !importUploading) doImportFile(file);
                }}
                onClick={() => {
                  if (importUploading) return;
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.xlsx';
                  input.onchange = () => {
                    const file = input.files?.[0];
                    if (file) doImportFile(file);
                  };
                  input.click();
                }}
              >
                {importUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="text-muted-foreground size-6 animate-spin" />
                    <span className="text-muted-foreground text-sm">正在导入...</span>
                  </div>
                ) : (
                  <>
                    <Upload className="text-muted-foreground mx-auto size-9" />
                    <p className="text-foreground/80 mt-3 text-[15px]">拖拽 Excel 文件到此处</p>
                    <p className="text-muted-foreground mt-1 text-[13px]">或点击选择文件（.xlsx，最大 5MB）</p>
                  </>
                )}
              </div>
              <div className="text-muted-foreground text-[13px] leading-relaxed">
                <div>Excel 表头自动识别以下列名：</div>
                <div>活动名称/任务描述、阶段、负责人、工期、计划开始/结束、状态、备注</div>
                <div>重复活动（名称+阶段+日期相同）将自动跳过</div>
              </div>
            </DialogContent>
          </Dialog>

          {/* 确认对话框 */}
          <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
                <AlertDialogDescription>{confirm?.content}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  className={confirm?.danger ? 'bg-destructive text-white hover:bg-destructive/90' : undefined}
                  onClick={() => {
                    confirm?.onOk();
                    setConfirm(null);
                  }}
                >
                  确定
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TooltipProvider>
    </MainLayout>
  );
};

// === Milestone Timeline (inline component) ===
const MilestoneTimeline: React.FC<{ activities: Activity[]; handleOpenDrawer: (a: Activity) => void }> = ({ activities, handleOpenDrawer }) => {
  const milestones = activities.filter((a) => a.type === 'MILESTONE');
  if (milestones.length === 0) {
    return <div className="text-muted-foreground py-10 text-center text-sm">暂无里程碑</div>;
  }

  const statusColor: Record<string, string> = {
    COMPLETED: 'var(--gantt-milestone-completed)', IN_PROGRESS: 'var(--gantt-milestone-in-progress)',
    NOT_STARTED: 'var(--gantt-milestone-pending)', CANCELLED: 'var(--gantt-milestone-overdue)',
  };

  const getMsDate = getMsDateHelper;
  const dated = milestones.filter((m) => getMsDate(m)).sort((a, b) => getMsDate(a)!.valueOf() - getMsDate(b)!.valueOf());
  const undated = milestones.filter((m) => !getMsDate(m));

  const cardW = 190;
  const minGap = 30;
  const nodeSpacing = cardW + minGap;
  const padX = cardW / 2 + 20;
  const axisY = 190;
  const cardH = 100;
  const stemLen = 28;

  let positions: number[] = [];
  if (dated.length === 1) {
    positions = [padX];
  } else if (dated.length > 1) {
    const tMin = getMsDate(dated[0])!.valueOf();
    const tMax = getMsDate(dated[dated.length - 1])!.valueOf();
    const span = tMax - tMin || 1;
    const naturalW = Math.max((dated.length - 1) * nodeSpacing, 600);
    positions = dated.map((m) => {
      const t = getMsDate(m)!.valueOf();
      return padX + ((t - tMin) / span) * naturalW;
    });
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] - positions[i - 1] < nodeSpacing) positions[i] = positions[i - 1] + nodeSpacing;
    }
  }

  const totalW = positions.length > 0 ? positions[positions.length - 1] + padX : 400;
  const totalH = axisY + stemLen + cardH + 40;

  const monthTicks: { label: string; x: number }[] = [];
  if (dated.length >= 2) {
    const dMin = getMsDate(dated[0])!.startOf('month');
    const dMax = getMsDate(dated[dated.length - 1])!.endOf('month');
    const tMin = getMsDate(dated[0])!.valueOf();
    const tMax = getMsDate(dated[dated.length - 1])!.valueOf();
    const span = tMax - tMin || 1;
    const naturalW = positions[positions.length - 1] - positions[0];
    let cur = dMin.clone();
    while (cur.isBefore(dMax) || cur.isSame(dMax, 'month')) {
      const ratio = (cur.valueOf() - tMin) / span;
      monthTicks.push({ label: cur.format('YYYY-MM'), x: positions[0] + ratio * naturalW });
      cur = cur.add(1, 'month');
    }
  }

  return (
    <div className="overflow-x-auto py-2">
      <div style={{ position: 'relative', width: totalW, height: totalH, minWidth: '100%' }}>
        {monthTicks.map((tick, i) => (
          <React.Fragment key={i}>
            <div style={{ position: 'absolute', left: tick.x, top: 24, bottom: 20, width: 1, background: 'var(--border)', zIndex: 0 }} />
            <div style={{ position: 'absolute', left: tick.x, top: axisY + 10, transform: 'translateX(-50%)', fontSize: 10, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', zIndex: 0 }}>
              {tick.label}
            </div>
          </React.Fragment>
        ))}

        {positions.length > 0 && (
          <div style={{ position: 'absolute', left: positions[0] - 16, width: positions[positions.length - 1] - positions[0] + 32, top: axisY, height: 3, background: 'var(--timeline-dot)', borderRadius: 2 }} />
        )}

        {dated.map((m, idx) => {
          const x = positions[idx];
          const above = idx % 2 === 0;
          const color = statusColor[m.status] || 'var(--gantt-milestone-pending)';
          const stInfo = ACTIVITY_STATUS_MAP[m.status as keyof typeof ACTIVITY_STATUS_MAP];
          const names = (m.executors || []).map((e) => e.user?.realName).filter(Boolean).join('、') || '-';
          const dateStr = getMsDate(m)!.format('YYYY-MM-DD');
          const cardTop = above ? axisY - stemLen - cardH : axisY + stemLen;

          return (
            <React.Fragment key={m.id}>
              <div style={{ position: 'absolute', left: x, width: 2, top: above ? cardTop + cardH : axisY + 6, height: above ? axisY - cardTop - cardH - 6 : cardTop - axisY - 6, background: color, transform: 'translateX(-1px)', zIndex: 1 }} />
              <div style={{ position: 'absolute', left: x - 7, top: axisY - 5, width: 13, height: 13, background: color, transform: 'rotate(45deg)', border: '2px solid var(--background)', boxShadow: `0 0 0 1px ${color}`, zIndex: 3 }} />
              <div style={{ position: 'absolute', left: x, top: above ? axisY + 10 : axisY - 18, transform: 'translateX(-50%)', fontSize: 10, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', zIndex: 2 }}>
                {dateStr}
              </div>
              <div
                className="hover:shadow-md"
                style={{ position: 'absolute', left: x - cardW / 2, top: cardTop, width: cardW, background: 'var(--background)', border: '1px solid var(--border)', borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', transition: 'box-shadow .2s', zIndex: 1 }}
                onClick={() => handleOpenDrawer(m)}
              >
                <div className="mb-1 truncate text-[13px] font-semibold">{m.name}</div>
                <div className="mb-1 flex flex-wrap gap-1">
                  {m.phase && <Badge variant="outline" className={arcoBadgeClass(PHASE_COLOR[m.phase] || 'default')}>{m.phase}</Badge>}
                  {stInfo && <Badge variant="outline" className={arcoBadgeClass(stInfo.color)}>{stInfo.label}</Badge>}
                </div>
                <div className="text-muted-foreground truncate text-[11px]">负责人: {names}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {undated.length > 0 && (
        <div className="mt-4 px-2">
          <div className="text-muted-foreground mb-2 text-[13px]">未设定日期</div>
          <div className="flex flex-wrap gap-3">
            {undated.map((m) => {
              const stInfo = ACTIVITY_STATUS_MAP[m.status as keyof typeof ACTIVITY_STATUS_MAP];
              const color = statusColor[m.status] || 'var(--gantt-milestone-pending)';
              return (
                <div
                  key={m.id}
                  className="hover:shadow-md"
                  style={{ background: 'var(--background)', border: '1px solid var(--border)', borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '8px 12px', width: 190, cursor: 'pointer', transition: 'box-shadow .2s' }}
                  onClick={() => handleOpenDrawer(m)}
                >
                  <div className="mb-1 truncate text-[13px] font-semibold">{m.name}</div>
                  <div className="flex flex-wrap gap-1">
                    {m.phase && <Badge variant="outline" className={arcoBadgeClass(PHASE_COLOR[m.phase] || 'default')}>{m.phase}</Badge>}
                    {stInfo && <Badge variant="outline" className={arcoBadgeClass(stInfo.color)}>{stInfo.label}</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDetail;
