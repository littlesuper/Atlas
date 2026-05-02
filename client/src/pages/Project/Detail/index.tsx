import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card,
  Button,
  Space,
  Tag,
  Tabs,
  Table,
  Message,
  Modal,
  Tooltip,
  Empty,
  Progress,
  Select,
  Spin,
  Dropdown,
  Menu,
  Alert,
} from '@arco-design/web-react';
import {
  IconLeft,
  IconPlus,
  IconUndo,
  IconUpload,
  IconDownload,
  IconNav,
  IconSafe,
} from '@arco-design/web-react/icon';
import MainLayout from '../../../layouts/MainLayout';
import { projectsApi, activitiesApi } from '../../../api';
import ColumnSettings, { ColumnDef } from './ColumnSettings';
import { useAuthStore } from '../../../store/authStore';
import ProjectWeeklyTab from '../../WeeklyReports/ProjectWeeklyTab';
import GanttChart from './GanttChart';
import RiskAssessmentTab from './RiskAssessmentTab';
import ProductsTab from './ProductsTab';
import SchedulingTools from './SchedulingTools';
import SnapshotsTab from './SnapshotsTab';
import ActivityDrawer from './ActivityDrawer';
import MembersModal from './MembersModal';
import { FEATURE_FLAGS } from '../../../featureFlags/flags';
import { useFeatureFlag } from '../../../featureFlags/FeatureFlagProvider';
import { Activity } from '../../../types';
import {
  STATUS_MAP,
  PRIORITY_MAP,
  PRODUCT_LINE_MAP,
  ACTIVITY_STATUS_MAP,
  PHASE_OPTIONS,
} from '../../../utils/constants';
import dayjs from 'dayjs';

// Extracted hooks
import { useUndoStack } from '../../../hooks/useUndoStack';
import { useProjectData } from '../../../hooks/useProjectData';
import { useColumnPrefs } from '../../../hooks/useColumnPrefs';
import { useInlineEdit } from '../../../hooks/useInlineEdit';
import { useDragReorder } from '../../../hooks/useDragReorder';
import { useActivityColumns, COLUMN_WIDTH_MAP, PHASE_COLOR } from '../../../hooks/useActivityColumns';
import { useDebouncedCallback } from '../../../hooks/useDebouncedCallback';
import ResizableHeaderCell from '../../../components/ResizableHeaderCell';

// 活动列配置定义
const ACTIVITY_COLUMN_DEFS: ColumnDef[] = [
  { key: 'id', label: 'ID', removable: true },
  { key: 'predecessor', label: '前置', removable: true },
  { key: 'phase', label: '阶段', removable: true },
  { key: 'name', label: '活动名称', removable: false },
  { key: 'type', label: '类型', removable: true },
  { key: 'status', label: '状态', removable: true },
  { key: 'assignee', label: '负责人', removable: true },
  { key: 'planDuration', label: '计划工期', removable: true },
  { key: 'planDates', label: '计划时间', removable: true },
  { key: 'actualDates', label: '实际时间', removable: true },
  { key: 'checkItems', label: '检查项', removable: true },
  { key: 'notes', label: '备注', removable: true },
];

const DEFAULT_COLUMN_ORDER = ACTIVITY_COLUMN_DEFS.map((d) => d.key);
const DEFAULT_COLUMN_VISIBLE = ACTIVITY_COLUMN_DEFS.map((d) => d.key);

const ProjectDetail: React.FC = () => {
  const { id, snapshotId } = useParams<{ id: string; snapshotId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const aiAssistanceEnabled = useFeatureFlag(FEATURE_FLAGS.AI_ASSISTANCE);
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
  const insertAtIndexRef = useRef<number | null>(null);

  // 活动列表表头吸顶
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const [theadFixed, setTheadFixed] = useState(false);
  const [theadFixedPos, setTheadFixedPos] = useState({ left: 0, width: 0, height: 0 });

  // === Extracted hooks ===
  const { undoStack, pushUndo, handleUndo, lastDescription } = useUndoStack();

  const {
    project, activities, setActivities, users,
    loading, activitiesLoading, criticalActivityIds,
    isSnapshot, snapshotMeta,
    snapshotWeeklyReports, snapshotProducts, snapshotRiskAssessments,
    loadProject, loadActivities, loadUsers, loadCriticalPath, loadSnapshotData,
  } = useProjectData({ projectId: id, snapshotId });

  const { columnPrefs, loadColumnPrefs, saveColumnPrefs, defaultPrefs, updateWidthsLocal, persistWidths } = useColumnPrefs({
    columnDefs: ACTIVITY_COLUMN_DEFS,
    defaultVisible: DEFAULT_COLUMN_VISIBLE,
    defaultOrder: DEFAULT_COLUMN_ORDER,
  });

  const isArchived = project?.status === 'ARCHIVED' || isSnapshot;
  const canManage = hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) && !isArchived;
  const canCreate = hasPermission('activity', 'create') && isProjectManager(project?.managerId ?? '', project?.id) && !isArchived;

  const {
    inlineEditing, setInlineEditing, inlineValue, setInlineValue,
    startInlineEdit, showUndoMessage, commitInlineEdit, commitSelectEdit,
  } = useInlineEdit({
    isArchived: !!isArchived,
    canManage,
    pushUndo,
    loadActivities,
    loadProject,
    setActivities,
  });

  const {
    saving, dragFromRef, dragOverRef,
    handleMouseDown, handleMouseMove, handleMouseUp,
  } = useDragReorder({
    projectId: id,
    activities,
    setActivities,
    pushUndo,
    loadActivities,
  });

  // === Activity actions ===
  const handleOpenDrawer = useCallback((activity?: Activity) => {
    if (activity) {
      setEditingActivity(activity);
    } else {
      setEditingActivity(null);
    }
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
    executorIds: (s.executors || []).map((e: any) => e.userId),
    notes: s.notes || undefined,
    sortOrder: s.sortOrder,
    dependencies: Array.isArray(s.dependencies)
      ? s.dependencies.map(d => ({ id: d.id, type: d.type, lag: d.lag ?? 0 }))
      : undefined,
  }), []);

  const handleDeleteActivity = useCallback((activity: Activity) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除活动"${activity.name}"吗？`,
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
          Message.success(`已删除活动「${snapshot.name}」`);
          loadActivities();
          loadProject();
        } catch {
          Message.error('活动删除失败');
        }
      },
    });
  }, [pushUndo, activityToCreatePayload, loadActivities, loadProject]);

  const handleInsertActivity = useCallback(async (atIndex: number) => {
    if (!id) return;
    const prev = atIndex > 0 ? activities[atIndex - 1].sortOrder : 0;
    const next = atIndex < activities.length ? activities[atIndex].sortOrder : prev + 20;
    const sortOrder = Math.floor((prev + next) / 2);
    try {
      const resp = await activitiesApi.create({
        projectId: id,
        name: '新活动',
        type: 'TASK',
        status: 'NOT_STARTED',
        sortOrder,
      });
      const newId = (resp as { data?: { id?: string } }).data?.id ?? (resp as unknown as Activity).id;
      await loadActivities();
      if (newId) {
        setInlineEditing({ id: newId, field: 'name' });
        setInlineValue('新活动');
      }
    } catch {
      Message.error('创建活动失败');
    }
  }, [id, activities, loadActivities, setInlineEditing, setInlineValue]);

  // Drawer submit handler
  const handleDrawerSubmit = useCallback(async (
    values: any,
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
          ? (() => {
            const idx = insertAtIndexRef.current!;
            const prev = idx > 0 ? activities[idx - 1].sortOrder : 0;
            const next = idx < activities.length ? activities[idx].sortOrder : prev + 20;
            return Math.floor((prev + next) / 2);
          })()
          : (activities.length + 1) * 10,
      dependencies: formDeps.filter((d) => d.id).map((d) => ({
        id: d.id,
        type: d.type,
        lag: d.lag || 0,
      })),
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
            executorIds: snapshot.executors?.map((e: any) => e.userId) ?? [],
            notes: snapshot.notes,
            dependencies: Array.isArray(snapshot.dependencies)
              ? snapshot.dependencies.map((d) => ({ id: d.id, type: d.type, lag: d.lag ?? 0 }))
              : undefined,
          });
          loadActivities();
          loadProject();
        },
      });
      Message.success('活动更新成功');
    } else {
      await activitiesApi.create(data);
      Message.success('活动创建成功');
    }
    insertAtIndexRef.current = null;
    setDrawerVisible(false);
    loadActivities();
    loadProject();
  }, [id, editingActivity, activities, pushUndo, loadActivities, loadProject]);

  // Import file handler
  const doImportFile = useCallback(async (file: File) => {
    if (!id) return;
    setImportUploading(true);
    try {
      const { data } = await activitiesApi.importExcel(id, file);
      const importedIds = (data.activities || []).map((a: any) => a.id);
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
      Message.success(msg);
      if (data.createdUsers && data.createdUsers.length > 0) {
        Message.info(`已自动创建 ${data.createdUsers.length} 个联系人账号：${data.createdUsers.join('、')}`);
      }
      setImportModalVisible(false);
      setDrawerVisible(false);
      loadActivities();
      loadProject();
    } catch (err: any) {
      Message.error(err?.response?.data?.error || '导入失败');
    } finally {
      setImportUploading(false);
    }
  }, [id, pushUndo, loadActivities, loadProject]);

  // Export CSV
  const handleExportExcel = useCallback(() => {
    if (!activities.length) { Message.warning('暂无活动数据'); return; }
    const statusMap: Record<string, string> = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', COMPLETED: '已完成', CANCELLED: '已取消' };
    const typeMap: Record<string, string> = { TASK: '任务', MILESTONE: '里程碑', PHASE: '阶段' };
    const depTypeMap: Record<string, string> = { '0': 'FS', '1': 'SS', '2': 'FF', '3': 'SF' };
    const fmtDate = (d?: string | null) => d ? dayjs(d).format('YYYY-MM-DD') : '';

    const activitySeqMapLocal = new Map<string, number>();
    activities.forEach((a, i) => activitySeqMapLocal.set(a.id, i + 1));

    const formatDeps = (act: Activity): string => {
      if (!act.dependencies) return '';
      const deps = Array.isArray(act.dependencies) ? act.dependencies
        : (() => { try { return JSON.parse(act.dependencies as unknown as string); } catch { return []; } })();
      return deps.map((dep: { id: string; type: string; lag?: number }) => {
        const seq = activitySeqMapLocal.get(dep.id);
        const seqStr = seq ? String(seq).padStart(3, '0') : '?';
        const typeLabel = depTypeMap[dep.type] || 'FS';
        const lag = dep.lag ?? 0;
        const lagStr = lag > 0 ? `+${lag}` : lag < 0 ? String(lag) : '';
        return `${seqStr}${typeLabel}${lagStr}`;
      }).join(', ');
    };

    const headers = ['ID', '前置依赖', '阶段', '活动名称', '类型', '状态', '负责人', '计划工期', '计划开始', '计划结束', '实际开始', '实际结束', '备注'];
    const rows = activities.map((a, i) => [
      String(i + 1).padStart(3, '0'),
      formatDeps(a),
      a.phase || '',
      a.name,
      typeMap[a.type] || a.type,
      statusMap[a.status] || a.status,
      (a.executors || []).map((e: any) => e.user?.realName).filter(Boolean).join(', ') || '-',
      a.planDuration != null ? String(a.planDuration) : '',
      fmtDate(a.planStartDate),
      fmtDate(a.planEndDate),
      fmtDate(a.startDate),
      fmtDate(a.endDate),
      a.notes || '',
    ]);

    const escapeCsv = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
    const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
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
  const handleArchiveProject = useCallback(async () => {
    if (!id) return;
    Modal.confirm({
      title: '归档项目',
      content: '归档后项目将变为只读状态，所有数据不可编辑。确定要归档吗？',
      okButtonProps: { status: 'warning' },
      okText: '确认归档',
      onOk: async () => {
        try {
          await projectsApi.archiveProject(id);
          Message.success('项目归档成功');
          loadProject();
        } catch {
          Message.error('归档失败');
        }
      },
    });
  }, [id, loadProject]);

  const handleUnarchiveProject = useCallback(async () => {
    if (!id) return;
    try {
      await projectsApi.unarchiveProject(id);
      Message.success('已取消归档');
      loadProject();
    } catch {
      Message.error('取消归档失败');
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
      Message.success(`协作者已更新（添加 ${toAdd.length}，移除 ${toRemove.length}）`);
      await loadProject();
    } catch {
      Message.error('更新协作者失败');
    } finally {
      setMembersLoading(false);
      setMembersModalVisible(false);
    }
  }, [id, project, loadProject]);

  // Batch operations
  const handleBatchStatusUpdate = useCallback(async (status: string) => {
    if (selectedIds.size === 0) return;
    try {
      const ids = Array.from(selectedIds);
      const oldStatuses = ids.map(sid => ({ id: sid, status: activities.find(a => a.id === sid)?.status }));
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
      Message.success(`已更新 ${selectedIds.size} 个活动状态`);
      setSelectedIds(new Set());
      loadActivities();
      loadProject();
    } catch { Message.error('批量更新失败'); }
  }, [selectedIds, activities, pushUndo, loadActivities, loadProject]);

  const handleBatchPhaseUpdate = useCallback(async (phase: string) => {
    if (selectedIds.size === 0) return;
    try {
      const ids = Array.from(selectedIds);
      const oldPhases = ids.map(sid => ({ id: sid, phase: activities.find(a => a.id === sid)?.phase }));
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
      Message.success(`已更新 ${selectedIds.size} 个活动阶段`);
      setSelectedIds(new Set());
      loadActivities();
    } catch { Message.error('批量更新失败'); }
  }, [selectedIds, activities, pushUndo, loadActivities]);

  const handleBatchAssigneeUpdate = useCallback(async (assigneeIds: string[]) => {
    if (selectedIds.size === 0) return;
    try {
      const ids = Array.from(selectedIds);
      const oldAssignees = ids.map(sid => ({ id: sid, executorIds: (activities.find(a => a.id === sid)?.executors || []).map((e: any) => e.userId) }));
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
      Message.success(`已更新 ${selectedIds.size} 个活动负责人`);
      setSelectedIds(new Set());
      loadActivities();
    } catch { Message.error('批量更新失败'); }
  }, [selectedIds, activities, pushUndo, loadActivities]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedIds.size} 个活动吗？`,
      onOk: async () => {
        try {
          const snapshots = activities.filter(a => selectedIds.has(a.id)).map(a => ({ ...a }));
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
          Message.success(`已删除 ${count} 个活动`);
        } catch { Message.error('批量删除失败'); }
      },
    });
  }, [selectedIds, activities, pushUndo, activityToCreatePayload, loadActivities, loadProject]);

  // Column widths: merge defaults with user preferences
  const columnWidths = useMemo(() => ({
    ...COLUMN_WIDTH_MAP,
    ...(columnPrefs.widths || {}),
  }), [columnPrefs.widths]);

  // Debounced width persistence
  const { debouncedFn: debouncedPersistWidths } = useDebouncedCallback(
    ((...args: unknown[]) => { persistWidths(args[0] as Record<string, number>); }) as (...args: unknown[]) => unknown,
    500,
  );

  // Column resize handler
  // 稳定的 Table 组件覆写：避免每次 render 重建 row 组件导致整张表重新挂载、
  // 进而把正在编辑的输入框光标重置到末端
  const tableComponents = useMemo(() => ({
    header: {
      th: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
        <ResizableHeaderCell
          {...props}
          onResize={(key: string, width: number) => handleColumnResizeRef.current?.(key, width)}
          fixedKeys={fixedColumnKeysRef.current}
        />
      ),
    },
    body: {
      row: ({ children, record: _record, index, ...rest }: { children: React.ReactNode; record: Activity; index: number; [key: string]: unknown }) => {
        const isSource = dragFromRef.current === index;
        const isTarget = dragOverRef.current === index && dragOverRef.current !== dragFromRef.current;
        const insertAbove = isTarget && dragFromRef.current > index;
        const insertBelow = isTarget && dragFromRef.current < index;
        const cls = [
          typeof rest.className === 'string' ? rest.className : '',
          isSource ? 'drag-source' : '',
          insertAbove ? 'drag-insert-above' : '',
          insertBelow ? 'drag-insert-below' : '',
        ].filter(Boolean).join(' ');
        return (
          <tr
            {...rest}
            className={cls}
            onMouseMove={(e) => handleMouseMoveRef.current?.(e, index)}
            onMouseUp={(e) => handleMouseUpRef.current?.(e, index)}
          >
            {children}
          </tr>
        );
      },
    },
  }), []);

  // 把变动函数收纳到 ref，给 tableComponents 提供稳定引用同时保持最新闭包
  const handleColumnResizeRef = useRef<((key: string, width: number) => void) | null>(null);
  const fixedColumnKeysRef = useRef<Set<string>>(new Set<string>());
  const handleMouseMoveRef = useRef<((e: React.MouseEvent, index: number) => void) | null>(null);
  const handleMouseUpRef = useRef<((e: React.MouseEvent, index: number) => void) | null>(null);

  const handleColumnResize = useCallback((key: string, width: number) => {
    const newWidths = { ...columnPrefs.widths, [key]: Math.round(width) };
    updateWidthsLocal(newWidths);
    debouncedPersistWidths(newWidths);
  }, [columnPrefs.widths, updateWidthsLocal, debouncedPersistWidths]);

  // Fixed column keys that should not be resizable
  const fixedColumnKeys = useMemo(() => new Set<string>(), []);

  handleColumnResizeRef.current = handleColumnResize;
  fixedColumnKeysRef.current = fixedColumnKeys;
  handleMouseMoveRef.current = handleMouseMove;
  handleMouseUpRef.current = handleMouseUp;

  // Activity columns hook
  const {
    activityColumns, scrollX, activitySeqMap,
  } = useActivityColumns({
    activities, users, project, isArchived: !!isArchived,
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
      loadColumnPrefs();
      loadCriticalPath();
    }
  }, [id, snapshotId]);

  // === 活动列表表头吸顶：滚动检测 ===
  useEffect(() => {
    const onScroll = () => {
      const wrap = tableWrapRef.current;
      if (!wrap) return;
      const { top, left, width } = wrap.getBoundingClientRect();
      if (width === 0) { setTheadFixed(false); return; }
      const thead = wrap.querySelector('thead') as HTMLElement | null;
      const h = thead ? thead.getBoundingClientRect().height : 40;
      if (top < 0) {
        setTheadFixed(true);
        setTheadFixedPos({ left, width, height: h });
      } else {
        setTheadFixed(false);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // === 活动列表表头吸顶：克隆 thead + 横向滚动同步 ===
  useEffect(() => {
    const wrap = tableWrapRef.current;
    const stickyDiv = stickyHeaderRef.current;
    if (!wrap || !stickyDiv) return;

    if (!theadFixed) {
      stickyDiv.innerHTML = '';
      return;
    }

    const originalTable = wrap.querySelector('table') as HTMLElement | null;
    if (!originalTable) return;
    const cloned = originalTable.cloneNode(true) as HTMLElement;
    const clonedTbody = cloned.querySelector('tbody');
    if (clonedTbody) clonedTbody.remove();

    const origThs = originalTable.querySelectorAll('thead th');
    const clonedCols = cloned.querySelectorAll('colgroup col');
    const clonedThs = cloned.querySelectorAll('thead th');
    origThs.forEach((th, i) => {
      const w = (th as HTMLElement).getBoundingClientRect().width;
      if (clonedCols[i]) {
        (clonedCols[i] as HTMLElement).style.width = w + 'px';
        (clonedCols[i] as HTMLElement).style.minWidth = w + 'px';
      }
      if (clonedThs[i]) {
        (clonedThs[i] as HTMLElement).style.width = w + 'px';
        (clonedThs[i] as HTMLElement).style.minWidth = w + 'px';
        (clonedThs[i] as HTMLElement).style.maxWidth = w + 'px';
        (clonedThs[i] as HTMLElement).style.boxSizing = 'border-box';
      }
    });
    cloned.style.tableLayout = 'fixed';
    cloned.style.width = originalTable.scrollWidth + 'px';
    stickyDiv.innerHTML = '';
    stickyDiv.appendChild(cloned);

    const scrollEl = wrap.querySelector('.arco-table-container') as HTMLElement | null;
    if (!scrollEl) return;
    cloned.style.transform = `translateX(-${scrollEl.scrollLeft}px)`;
    const onHScroll = () => {
      cloned.style.transform = `translateX(-${scrollEl.scrollLeft}px)`;
    };
    scrollEl.addEventListener('scroll', onHScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', onHScroll);
  }, [theadFixed, theadFixedPos, columnPrefs]);

  if (loading || !project) {
    return <MainLayout>加载中...</MainLayout>;
  }

  const statusConfig = STATUS_MAP[project.status as keyof typeof STATUS_MAP] ?? { label: project.status, color: 'default' };
  const priorityConfig = PRIORITY_MAP[project.priority as keyof typeof PRIORITY_MAP] ?? { label: project.priority, color: 'default' };
  const productLineConfig = PRODUCT_LINE_MAP[project.productLine as keyof typeof PRODUCT_LINE_MAP] ?? { label: project.productLine, color: 'default' };

  return (
    <MainLayout>
      {/* 活动列表吸顶表头 */}
      {theadFixed && createPortal(
        <div
          ref={stickyHeaderRef}
          style={{
            position: 'fixed',
            top: 0,
            left: theadFixedPos.left,
            width: theadFixedPos.width,
            overflow: 'hidden',
            zIndex: 1000,
            background: 'var(--color-bg-1)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          }}
        />,
        document.body,
      )}
      <div>
        {/* 快照模式横幅 */}
        {isSnapshot && snapshotMeta && (
          <Alert
            type="info"
            banner
            closable={false}
            showIcon={false}
            style={{ marginBottom: 16 }}
            content={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Button type="text" icon={<IconLeft />} size="small" onClick={() => navigate(`/projects/${id}?tab=snapshots`)}>
                  返回项目
                </Button>
                <span>
                  您正在查看 <b>{dayjs(snapshotMeta.archivedAt).format('YYYY-MM-DD HH:mm')}</b> 的项目快照
                  {snapshotMeta.remark && <span>（{snapshotMeta.remark}）</span>}
                  ，所有内容为只读。
                </span>
              </div>
            }
          />
        )}
        {/* 顶部卡片 */}
        <Card style={{ marginBottom: 16 }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {/* 第一行 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {!isSnapshot && (
                <Button icon={<IconLeft />} onClick={() => navigate('/projects')}>返回</Button>
              )}
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{project.name}</h2>
              <Tag color={statusConfig.color}>{statusConfig.label}</Tag>
              <Tag color={productLineConfig.color}>{productLineConfig.label}</Tag>
              <Tag color={priorityConfig.color}>{priorityConfig.label}</Tag>
              <div style={{ flex: 1 }} />
            </div>
            {project.description && (
              <div style={{ color: 'var(--color-text-2)' }}>{project.description}</div>
            )}
            {/* 统计卡片 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
              {[
                {
                  label: '时间',
                  value: `${dayjs(project.startDate).format('YYYY-MM-DD')}${project.endDate ? ' ~ ' + dayjs(project.endDate).format('YYYY-MM-DD') : ''}`,
                },
                { label: '整体进度', value: <Progress percent={project.progress || 0} size="small" style={{ width: 100 }} /> },
                { label: '活动数量', value: `${activities.length} 个` },
                { label: '项目经理', value: project.manager?.realName || project.manager?.username || '-' },
                {
                  label: '协作者',
                  value: (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {project.members && project.members.length > 0
                        ? (
                          <>
                            {project.members.slice(0, 3).map((m) => (
                              <Tag key={m.user.id} size="small">{m.user.realName}</Tag>
                            ))}
                            {project.members.length > 3 && (
                              <Tag size="small" color="gray">+{project.members.length - 3}</Tag>
                            )}
                          </>
                        )
                        : <span style={{ color: 'var(--color-text-4)' }}>暂无</span>
                      }
                      {(useAuthStore.getState().user?.permissions?.includes('*:*') || useAuthStore.getState().user?.id === project.managerId) && (
                        <Button type="text" size="mini" onClick={() => setMembersModalVisible(true)} style={{ padding: '0 4px' }}>管理</Button>
                      )}
                    </div>
                  ),
                },
              ].map((item, i) => (
                <Card key={i} style={{ height: 88 }} bodyStyle={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{item.value}</div>
                </Card>
              ))}
            </div>
          </Space>
        </Card>

        {/* 归档只读提示 */}
        {isArchived && !isSnapshot && (
          <Alert
            type="warning"
            content={
              <span>
                该项目已归档，所有内容为只读状态。
                {hasPermission('project', 'update') && isProjectManager(project.managerId, project.id) && (
                  <Button type="text" size="small" onClick={handleUnarchiveProject} style={{ marginLeft: 8 }}>取消归档</Button>
                )}
              </span>
            }
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Tab 区域 */}
        <Card>
          <Tabs
            activeTab={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                if (tab === 'activities') {
                  next.delete('tab');
                } else {
                  next.set('tab', tab);
                }
                return next;
              }, { replace: true });
            }}
            style={{ '--tab-bar-style': 'sticky' } as React.CSSProperties}
            {...{ tabBarStyle: { position: 'sticky', top: 0, zIndex: 15, background: 'var(--color-bg-1)', marginBottom: 0 } } as any}
          >
            {/* 活动列表 */}
            <Tabs.TabPane key="activities" title="活动列表">
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                  {saving ? '保存排序中...' : ''}
                </span>
                <Space>
                  <span style={{ fontSize: 12 }}>
                    {(['EVT', 'DVT', 'PVT', 'MP'] as const).map(phase => {
                      const total = activities.filter(a => a.phase === phase).reduce((sum, a) => sum + (a.planDuration || 0), 0);
                      if (total === 0) return null;
                      const isActive = phaseFilter === phase;
                      return (
                        <Tag
                          key={phase}
                          size="small"
                          color={isActive ? PHASE_COLOR[phase] : 'gray'}
                          style={{ marginRight: 4, cursor: 'pointer', opacity: isActive ? 1 : 0.65 }}
                          onClick={() => setPhaseFilter(prev => prev === phase ? null : phase)}
                        >
                          {phase} {total}天
                        </Tag>
                      );
                    })}
                  </span>
                  <span style={{ fontSize: 12 }}>
                    <span
                      style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 4, background: statusFilter === 'NOT_STARTED' ? 'var(--color-fill-2)' : undefined, color: statusFilter === 'NOT_STARTED' ? 'var(--color-text-1)' : 'var(--color-text-3)' }}
                      onClick={() => setStatusFilter(prev => prev === 'NOT_STARTED' ? null : 'NOT_STARTED')}
                    >
                      未开始 <span style={{ fontWeight: 500 }}>{activities.filter(a => a.status === 'NOT_STARTED').length}</span>
                    </span>
                    <span style={{ margin: '0 2px', color: 'var(--color-border)' }}>|</span>
                    <span
                      style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 4, background: statusFilter === 'IN_PROGRESS' ? 'var(--color-primary-light-1)' : undefined, color: statusFilter === 'IN_PROGRESS' ? 'rgb(var(--primary-6))' : 'var(--color-text-3)' }}
                      onClick={() => setStatusFilter(prev => prev === 'IN_PROGRESS' ? null : 'IN_PROGRESS')}
                    >
                      进行中 <span style={{ fontWeight: 500 }}>{activities.filter(a => a.status === 'IN_PROGRESS').length}</span>
                    </span>
                  </span>
                  <Dropdown
                    droplist={
                      <Menu>
                        {canCreate && (
                          <Menu.Item key="1" onClick={() => handleOpenDrawer()}>
                            <IconPlus style={{ marginRight: 8 }} />
                            新建活动
                          </Menu.Item>
                        )}
                        {canCreate && (
                          <Menu.Item key="2" onClick={() => setImportModalVisible(true)}>
                            <IconUpload style={{ marginRight: 8 }} />
                            批量导入
                          </Menu.Item>
                        )}
                        <Menu.Item key="3" onClick={handleExportExcel}>
                          <IconDownload style={{ marginRight: 8 }} />
                          导出活动
                        </Menu.Item>
                      </Menu>
                    }
                    position="br"
                  >
                    <Button type="primary">
                      <IconNav /> 活动 <IconLeft style={{ transform: 'rotate(-90deg)', marginLeft: 4, fontSize: 12 }} />
                    </Button>
                  </Dropdown>
                  <Tooltip content={lastDescription || '没有可撤回的操作'}>
                    <Button
                      icon={<IconUndo />}
                      disabled={undoStack.length === 0}
                      onClick={handleUndo}
                    />
                  </Tooltip>
                  <ColumnSettings
                    columnDefs={ACTIVITY_COLUMN_DEFS}
                    prefs={columnPrefs}
                    onChange={saveColumnPrefs}
                    defaultPrefs={defaultPrefs}
                    extraActions={
                      !isSnapshot && hasPermission('project', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? (
                        isArchived ? (
                          <Button size="small" type="text" icon={<IconUndo />} onClick={handleUnarchiveProject} style={{ width: '100%' }}>
                            取消归档
                          </Button>
                        ) : (
                          <Button size="small" type="text" icon={<IconSafe />} onClick={handleArchiveProject} style={{ width: '100%' }}>
                            项目归档
                          </Button>
                        )
                      ) : undefined
                    }
                  />
                </Space>
              </div>

              {/* 批量操作工具栏 */}
              {selectedIds.size > 0 && (
                <div style={{
                  padding: '8px 12px', marginBottom: 8, borderRadius: 6,
                  background: 'var(--color-primary-light-1)', border: '1px solid var(--info-border)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'rgb(var(--primary-6))' }}>
                    已选 {selectedIds.size} 项
                  </span>
                  <Select
                    size="small"
                    placeholder="批量修改状态"
                    style={{ width: 140 }}
                    onChange={(v) => { if (v) handleBatchStatusUpdate(v); }}
                    value={undefined}
                  >
                    {Object.entries(ACTIVITY_STATUS_MAP).map(([k, v]) => (
                      <Select.Option key={k} value={k}>{v.label}</Select.Option>
                    ))}
                  </Select>
                  <Select
                    size="small"
                    placeholder="批量修改阶段"
                    style={{ width: 120 }}
                    onChange={(v) => { if (v) handleBatchPhaseUpdate(v); }}
                    value={undefined}
                  >
                    {PHASE_OPTIONS.map((p) => (
                      <Select.Option key={p} value={p}>{p}</Select.Option>
                    ))}
                  </Select>
                  <Select
                    size="small"
                    mode="multiple"
                    placeholder="批量修改负责人"
                    style={{ width: 180 }}
                    onChange={(v: string[]) => { if (v && v.length > 0) handleBatchAssigneeUpdate(v); }}
                    value={undefined}
                    showSearch
                    filterOption={(input, option) =>
                      (option?.props?.children as string)?.toLowerCase().includes(input.toLowerCase())
                    }
                  >
                    {users.map((u) => (
                      <Select.Option key={u.id} value={u.id}>{u.realName}</Select.Option>
                    ))}
                  </Select>
                  <Button size="small" status="danger" onClick={handleBatchDelete}>批量删除</Button>
                  <Button size="small" type="text" onClick={() => setSelectedIds(new Set())}>取消选择</Button>
                </div>
              )}

              <div ref={tableWrapRef} className="compact-table" style={{ paddingTop: theadFixed ? theadFixedPos.height : 0 }}>
                <Table
                  columns={activityColumns}
                  data={(() => {
                    let list = [...activities];
                    if (phaseFilter) list = list.filter(a => a.phase === phaseFilter);
                    if (statusFilter) list = list.filter(a => a.status === statusFilter);
                    return list;
                  })()}
                  loading={activitiesLoading}
                  rowKey="id"
                  pagination={false}
                  scroll={{ x: scrollX, y: 'calc(100vh - 280px)' }}
                  components={tableComponents}
                />
              </div>
            </Tabs.TabPane>

            {/* 里程碑 */}
            <Tabs.TabPane key="milestones" title="里程碑">
              <MilestoneTimeline
                activities={activities}
                handleOpenDrawer={handleOpenDrawer}
              />
            </Tabs.TabPane>

            {/* 甘特图 */}
            <Tabs.TabPane key="gantt" title="甘特图">
              <GanttChart activities={activities} criticalActivityIds={criticalActivityIds} />
            </Tabs.TabPane>

            {/* 风险评估 */}
            <Tabs.TabPane key="risk" title={aiAssistanceEnabled ? 'AI风险评估' : '风险评估'}>
              {id && <RiskAssessmentTab projectId={id} isArchived={!!isArchived} snapshotData={snapshotRiskAssessments} />}
            </Tabs.TabPane>

            {/* 产品列表 */}
            <Tabs.TabPane key="products" title="产品列表">
              {id && <ProductsTab projectId={id} isArchived={!!isArchived} snapshotData={snapshotProducts} />}
            </Tabs.TabPane>

            {/* 项目周报 */}
            <Tabs.TabPane key="weekly" title="项目周报">
              {id && <ProjectWeeklyTab projectId={id} managerId={project?.managerId} isArchived={!!isArchived} snapshotData={snapshotWeeklyReports} />}
            </Tabs.TabPane>

            {/* 排期工具 */}
            {!isSnapshot && (
              <Tabs.TabPane key="scheduling" title="排期工具">
                {id && (
                  <SchedulingTools
                    projectId={id}
                    activities={activities}
                    onRefresh={loadActivities}
                    isArchived={!!isArchived}
                  />
                )}
              </Tabs.TabPane>
            )}

            {/* 项目快照 */}
            {!isSnapshot && (
              <Tabs.TabPane key="snapshots" title="项目快照">
                {id && <SnapshotsTab projectId={id} managerId={project?.managerId} isArchived={!!isArchived} />}
              </Tabs.TabPane>
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

        {/* 批量导入 Modal */}
        <Modal
          title="批量导入活动"
          visible={importModalVisible}
          onCancel={() => setImportModalVisible(false)}
          footer={null}
          style={{ width: 640 }}
          unmountOnExit
        >
          <div
            style={{
              border: '2px dashed var(--color-border-3)',
              borderRadius: 8,
              background: 'var(--color-fill-1)',
              padding: '50px 20px',
              margin: '0 32px',
              textAlign: 'center',
              cursor: importUploading ? 'default' : 'pointer',
              transition: 'border-color 0.2s',
            }}
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
              <Spin tip="正在导入..." />
            ) : (
              <>
                <IconUpload style={{ fontSize: 36, color: 'var(--color-text-3)' }} />
                <p style={{ marginTop: 12, fontSize: 15, color: 'var(--color-text-2)' }}>
                  拖拽 Excel 文件到此处
                </p>
                <p style={{ marginTop: 4, fontSize: 13, color: 'var(--color-text-3)' }}>
                  或点击选择文件（.xlsx，最大 5MB）
                </p>
              </>
            )}
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--color-text-3)', lineHeight: 1.8 }}>
            <div>Excel 表头自动识别以下列名：</div>
            <div>活动名称/任务描述、阶段、负责人、工期、计划开始/结束、状态、备注</div>
            <div>重复活动（名称+阶段+日期相同）将自动跳过</div>
          </div>
        </Modal>
      </div>
    </MainLayout>
  );
};

// === Milestone Timeline (inline component — kept in same file since it's render-only) ===
const MilestoneTimeline: React.FC<{ activities: Activity[]; handleOpenDrawer: (a: Activity) => void }> = ({ activities, handleOpenDrawer }) => {
  const milestones = activities.filter(a => a.type === 'MILESTONE');
  if (milestones.length === 0) {
    return <Empty description="暂无里程碑" />;
  }

  const statusColor: Record<string, string> = {
    COMPLETED: 'var(--gantt-milestone-completed)', IN_PROGRESS: 'var(--gantt-milestone-in-progress)',
    NOT_STARTED: 'var(--gantt-milestone-pending)', CANCELLED: 'var(--gantt-milestone-overdue)',
  };

  const getMsDate = (m: Activity) => {
    const d = m.planEndDate || m.planStartDate;
    return d ? dayjs(d) : null;
  };

  const dated = milestones.filter(m => getMsDate(m)).sort((a, b) => getMsDate(a)!.valueOf() - getMsDate(b)!.valueOf());
  const undated = milestones.filter(m => !getMsDate(m));

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
    positions = dated.map(m => {
      const t = getMsDate(m)!.valueOf();
      return padX + ((t - tMin) / span) * naturalW;
    });
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] - positions[i - 1] < nodeSpacing) {
        positions[i] = positions[i - 1] + nodeSpacing;
      }
    }
  }

  const totalW = (positions.length > 0 ? positions[positions.length - 1] + padX : 400);
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
      monthTicks.push({
        label: cur.format('YYYY-MM'),
        x: positions[0] + ratio * naturalW,
      });
      cur = cur.add(1, 'month');
    }
  }

  return (
    <div style={{ overflowX: 'auto', padding: '8px 0' }}>
      <div style={{ position: 'relative', width: totalW, height: totalH, minWidth: '100%' }}>
        {monthTicks.map((tick, i) => (
          <React.Fragment key={i}>
            <div style={{
              position: 'absolute', left: tick.x, top: 24, bottom: 20,
              width: 1, background: 'var(--color-fill-2)', zIndex: 0,
            }} />
            <div style={{
              position: 'absolute', left: tick.x, top: axisY + 10,
              transform: 'translateX(-50%)', fontSize: 10, color: 'var(--timeline-dot-active)',
              whiteSpace: 'nowrap', zIndex: 0,
            }}>
              {tick.label}
            </div>
          </React.Fragment>
        ))}

        {positions.length > 0 && (
          <div style={{
            position: 'absolute',
            left: positions[0] - 16,
            width: positions[positions.length - 1] - positions[0] + 32,
            top: axisY, height: 3, background: 'var(--timeline-dot)', borderRadius: 2,
          }} />
        )}

        {dated.map((m, idx) => {
          const x = positions[idx];
          const above = idx % 2 === 0;
          const color = statusColor[m.status] || 'var(--gantt-milestone-pending)';
          const stInfo = ACTIVITY_STATUS_MAP[m.status as keyof typeof ACTIVITY_STATUS_MAP];
          const names = (m.executors || []).map((e: any) => e.user?.realName).filter(Boolean).join('、') || '-';
          const dateStr = getMsDate(m)!.format('YYYY-MM-DD');
          const cardTop = above ? axisY - stemLen - cardH : axisY + stemLen;

          return (
            <React.Fragment key={m.id}>
              <div style={{
                position: 'absolute', left: x, width: 2,
                top: above ? cardTop + cardH : axisY + 6,
                height: above ? axisY - cardTop - cardH - 6 : cardTop - axisY - 6,
                background: color, transform: 'translateX(-1px)', zIndex: 1,
              }} />
              <div style={{
                position: 'absolute', left: x - 7, top: axisY - 5,
                width: 13, height: 13, background: color,
                transform: 'rotate(45deg)',
                border: '2px solid var(--color-bg-1)', boxShadow: `0 0 0 1px ${color}`,
                zIndex: 3,
              }} />
              <div style={{
                position: 'absolute', left: x, top: above ? axisY + 10 : axisY - 18,
                transform: 'translateX(-50%)', fontSize: 10, color: 'var(--color-text-3)',
                whiteSpace: 'nowrap', zIndex: 2,
              }}>
                {dateStr}
              </div>
              <div
                style={{
                  position: 'absolute', left: x - cardW / 2, top: cardTop,
                  width: cardW, background: 'var(--color-bg-1)',
                  border: '1px solid var(--gantt-grid-line)', borderLeft: `3px solid ${color}`,
                  borderRadius: 8, padding: '8px 12px',
                  cursor: 'pointer', transition: 'box-shadow .2s, transform .15s',
                  zIndex: 1,
                }}
                onClick={() => handleOpenDrawer(m)}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.12)';
                  e.currentTarget.style.transform = 'translateY(' + (above ? '-2px' : '2px') + ')';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'none';
                }}
              >
                <div style={{
                  fontWeight: 600, fontSize: 13, marginBottom: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {m.name}
                </div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
                  {m.phase && <Tag size="small" color={PHASE_COLOR[m.phase] || 'default'}>{m.phase}</Tag>}
                  {stInfo && <Tag size="small" color={stInfo.color}>{stInfo.label}</Tag>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  负责人: {names}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {undated.length > 0 && (
        <div style={{ marginTop: 16, padding: '0 8px' }}>
          <div style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 8 }}>未设定日期</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {undated.map(m => {
              const stInfo = ACTIVITY_STATUS_MAP[m.status as keyof typeof ACTIVITY_STATUS_MAP];
              const color = statusColor[m.status] || 'var(--gantt-milestone-pending)';
              return (
                <div
                  key={m.id}
                  style={{
                    background: 'var(--color-bg-1)', border: '1px solid var(--color-border)', borderLeft: `3px solid ${color}`,
                    borderRadius: 8, padding: '8px 12px', width: 190, cursor: 'pointer',
                    transition: 'box-shadow .2s',
                  }}
                  onClick={() => handleOpenDrawer(m)}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {m.phase && <Tag size="small" color={PHASE_COLOR[m.phase] || 'default'}>{m.phase}</Tag>}
                    {stInfo && <Tag size="small" color={stInfo.color}>{stInfo.label}</Tag>}
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
