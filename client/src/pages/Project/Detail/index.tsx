import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card,
  Button,
  Space,
  Tag,
  Tabs,
  Table,
  Drawer,
  Form,
  Input,
  Select,
  DatePicker,
  Message,
  Modal,
  Tooltip,
  Empty,
  Progress,
  InputNumber,
  Spin,
} from '@arco-design/web-react';
import {
  IconLeft,
  IconPlus,
  IconEdit,
  IconDelete,
  IconDragDotVertical,
  IconStorage,
} from '@arco-design/web-react/icon';
import MainLayout from '../../../layouts/MainLayout';
import { projectsApi, activitiesApi, usersApi, authApi } from '../../../api';
import ColumnSettings, { ColumnDef, ColumnPrefs } from './ColumnSettings';
import { useAuthStore } from '../../../store/authStore';
import ProjectWeeklyTab from '../../WeeklyReports/ProjectWeeklyTab';
import GanttChart from './GanttChart';
import RiskAssessmentTab from './RiskAssessmentTab';
import ProductsTab from './ProductsTab';
import ActivityComments from './ActivityComments';
import { Project, Activity, ActivityArchive, User } from '../../../types';
import {
  STATUS_MAP,
  PRIORITY_MAP,
  PRODUCT_LINE_MAP,
  ACTIVITY_STATUS_MAP,
  ACTIVITY_TYPE_MAP,
  DEPENDENCY_TYPE_MAP,
} from '../../../utils/constants';
import dayjs from 'dayjs';

// 三方联动辅助：根据已有值自动计算第三个值
// start + end → duration; start + duration → end; end + duration → start
type DateTriple = { start: dayjs.Dayjs | null; end: dayjs.Dayjs | null; dur: number | null };
function resolveTriple(t: DateTriple, changed: 'start' | 'end' | 'dur'): DateTriple {
  const { start, end, dur } = t;
  if (changed === 'start') {
    if (start && end) return { start, end, dur: calcWorkdays(start, end) };
    if (start && dur && dur > 0) return { start, end: addWorkdays(start, dur), dur };
  } else if (changed === 'end') {
    if (start && end) return { start, end, dur: calcWorkdays(start, end) };
    if (end && dur && dur > 0) return { start: subtractWorkdays(end, dur), end, dur };
  } else {
    // changed === 'dur'
    if (start && dur && dur > 0) return { start, end: addWorkdays(start, dur), dur };
    if (end && dur && dur > 0) return { start: subtractWorkdays(end, dur), end, dur };
  }
  return t;
}

// 阶段配置
const PHASE_OPTIONS = ['EVT', 'DVT', 'PVT', 'MP'];
const PHASE_COLOR: Record<string, string> = { EVT: 'blue', DVT: 'cyan', PVT: 'purple', MP: 'orange' };

import { calcWorkdays, addWorkdays, subtractWorkdays } from '../../../utils/workday';

// 活动列配置定义
const ACTIVITY_COLUMN_DEFS: ColumnDef[] = [
  // drag handle 不出现在设置面板中，始终存在
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
  { key: 'notes', label: '备注', removable: true },
  // actions 列不出现在设置面板中，始终存在
];

const DEFAULT_COLUMN_ORDER = ACTIVITY_COLUMN_DEFS.map((d) => d.key);
const DEFAULT_COLUMN_VISIBLE = ACTIVITY_COLUMN_DEFS.map((d) => d.key);
const DEFAULT_COLUMN_PREFS: ColumnPrefs = {
  visible: DEFAULT_COLUMN_VISIBLE,
  order: DEFAULT_COLUMN_ORDER,
};

// 列宽映射（必须与 columnMap 中的 width 保持一致）
const COLUMN_WIDTH_MAP: Record<string, number> = {
  id: 60,
  predecessor: 100,
  phase: 70,
  name: 200,
  type: 80,
  status: 100,
  assignee: 120,
  planDuration: 90,
  planDates: 200,
  actualDates: 200,
  notes: 140,
};

// 格式化3位序号
function formatSeq(n: number): string {
  return String(n).padStart(3, '0');
}

// 自动展开的 Select 包装：mount 后自动 click 触发下拉展开
const AutoOpenSelect: React.FC<React.ComponentProps<typeof Select> & { onDismiss: () => void }> = ({ onDismiss, children, ...props }) => {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    // 延迟一帧后模拟点击 Select 输入框，触发 popup 弹出
    const timer = setTimeout(() => {
      const input = wrapRef.current?.querySelector('.arco-select-view') as HTMLElement;
      input?.click();
    }, 50);
    return () => clearTimeout(timer);
  }, []);
  React.useEffect(() => {
    // 点击外部关闭
    const handler = (e: MouseEvent) => {
      // 忽略弹出层内的点击（Select popup 渲染到 body）
      const popup = document.querySelector('.arco-select-popup');
      if (wrapRef.current?.contains(e.target as Node)) return;
      if (popup?.contains(e.target as Node)) return;
      onDismiss();
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onDismiss]);
  return (
    <div ref={wrapRef} style={{ display: 'inline-block' }}>
      <Select {...props}>{children}</Select>
    </div>
  );
};

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasPermission, isProjectManager } = useAuthStore();
  const [form] = Form.useForm();

  // 数据状态
  const [project, setProject] = useState<Project | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  // UI 状态：从 URL query 读取初始 tab（如 ?tab=weekly）
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'activities');
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);

  // 拖拽排序状态
  const dragIndexRef = useRef<number>(-1);
  const [saving, setSaving] = useState(false);

  // 行间快速插入
  const insertAtIndexRef = useRef<number | null>(null);

  // 活动列表表头吸顶
  const tableWrapRef    = useRef<HTMLDivElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const [theadFixed, setTheadFixed]       = useState(false);
  const [theadFixedPos, setTheadFixedPos] = useState({ left: 0, width: 0, height: 0 });

  // 协作者管理
  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);

  // 双击内联编辑
  const [inlineEditing, setInlineEditing] = useState<{ id: string; field: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [archiveDrawerVisible, setArchiveDrawerVisible] = useState(false);
  const [archiveList, setArchiveList] = useState<Array<{ id: string; createdAt: string; count: number; label?: string }>>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [expandedArchiveId, setExpandedArchiveId] = useState<string | null>(null);
  const [archiveDetail, setArchiveDetail] = useState<ActivityArchive | null>(null);
  const [archiveDetailLoading, setArchiveDetailLoading] = useState(false);
  const [inlineValue, setInlineValue] = useState<string>('');

  // 列偏好设置
  const [columnPrefs, setColumnPrefs] = useState<ColumnPrefs>(DEFAULT_COLUMN_PREFS);

  // 批量操作
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 关键路径
  const [criticalActivityIds, setCriticalActivityIds] = useState<string[]>([]);
  // 归档标签 & 对比
  const [archiveLabelInput, setArchiveLabelInput] = useState('');
  const [archiveLabelModalVisible, setArchiveLabelModalVisible] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelections, setCompareSelections] = useState<[string | null, string | null]>([null, null]);
  const [compareDiffs, setCompareDiffs] = useState<any[] | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // 表单中计划/实际工期
  const [planDuration, setPlanDuration] = useState<number | null>(null);
  const [actualDuration, setActualDuration] = useState<number | null>(null);
  const [formDeps, setFormDeps] = useState<Array<{ id: string; type: string; lag: number }>>([]);

  const loadProject = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await projectsApi.get(id);
      setProject(res.data);
    } catch {
      Message.error('加载项目详情失败');
    } finally {
      setLoading(false);
    }
  };

  const loadActivities = async () => {
    if (!id) return;
    setActivitiesLoading(true);
    try {
      const res = await activitiesApi.list(id);
      // 扁平化树形结构（按 sortOrder 排序）
      const flatten = (arr: Activity[]): Activity[] =>
        arr.flatMap((a) => [a, ...flatten(a.children || [])]);
      const flat = flatten(res.data || []).sort((a, b) => a.sortOrder - b.sortOrder);
      setActivities(flat);
    } catch {
      Message.error('加载活动列表失败');
    } finally {
      setActivitiesLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await usersApi.list();
      setUsers(res.data.data || []);
    } catch {
      console.error('加载用户失败');
    }
  };

  // 加载列偏好设置
  const loadColumnPrefs = async () => {
    try {
      const res = await authApi.getPreferences();
      const prefs = res.data as Record<string, unknown>;
      if (prefs?.activityColumns) {
        const saved = prefs.activityColumns as { visible?: string[]; order?: string[] };
        const validKeys = new Set(ACTIVITY_COLUMN_DEFS.map((d) => d.key));
        const nonRemovableKeys = ACTIVITY_COLUMN_DEFS.filter((d) => !d.removable).map((d) => d.key);

        // Filter out keys that no longer exist
        let visible = (saved.visible || DEFAULT_COLUMN_VISIBLE).filter((k) => validKeys.has(k));
        let order = (saved.order || DEFAULT_COLUMN_ORDER).filter((k) => validKeys.has(k));

        // Ensure non-removable columns are always visible
        for (const key of nonRemovableKeys) {
          if (!visible.includes(key)) visible.push(key);
        }

        // Append any new keys not yet in saved prefs (default visible & in order)
        const savedOrderSet = new Set(saved.order || []);
        for (const key of DEFAULT_COLUMN_ORDER) {
          const isNew = !savedOrderSet.has(key);
          if (!order.includes(key)) order.push(key);
          // New column unknown to user's saved prefs → auto-visible
          if (isNew && !visible.includes(key)) visible.push(key);
        }

        setColumnPrefs({ visible, order });
      }
    } catch {
      // Silently use default config on failure
    }
  };

  // 保存列偏好设置
  const saveColumnPrefs = useCallback(async (prefs: ColumnPrefs) => {
    setColumnPrefs(prefs);
    try {
      await authApi.updatePreferences({ activityColumns: prefs });
    } catch {
      Message.error('保存列设置失败');
    }
  }, []);

  const handleAddMember = async (userId: string) => {
    if (!id) return;
    setMembersLoading(true);
    try {
      await projectsApi.addMember(id, userId);
      Message.success('协作者添加成功');
      await loadProject();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || '添加失败';
      Message.error(msg);
    } finally {
      setMembersLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!id) return;
    setMembersLoading(true);
    try {
      await projectsApi.removeMember(id, userId);
      Message.success('协作者已移除');
      await loadProject();
    } catch {
      Message.error('移除失败');
    } finally {
      setMembersLoading(false);
    }
  };

  const loadCriticalPath = async () => {
    if (!id) return;
    try {
      const res = await activitiesApi.getCriticalPath(id);
      setCriticalActivityIds(res.data.criticalActivityIds || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadProject();
    loadActivities();
    loadUsers();
    loadColumnPrefs();
    loadCriticalPath();
  }, [id]);

  // ===== 活动列表表头吸顶：滚动检测 =====
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

  // ===== 活动列表表头吸顶：克隆 thead + 横向滚动同步 =====
  useEffect(() => {
    const wrap = tableWrapRef.current;
    const stickyDiv = stickyHeaderRef.current;
    if (!wrap || !stickyDiv) return;

    if (!theadFixed) {
      stickyDiv.innerHTML = '';
      return;
    }

    // 克隆整张 table，移除 tbody（保留 colgroup + thead 以保证列宽一致）
    const originalTable = wrap.querySelector('table') as HTMLElement | null;
    if (!originalTable) return;
    const cloned = originalTable.cloneNode(true) as HTMLElement;
    const clonedTbody = cloned.querySelector('tbody');
    if (clonedTbody) clonedTbody.remove();

    // 从原始 th 读取实际渲染宽度，锁定克隆表头每列的精确宽度
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

    // 横向滚动同步
    const scrollEl = wrap.querySelector('.arco-table-container') as HTMLElement | null;
    if (!scrollEl) return;
    cloned.style.transform = `translateX(-${scrollEl.scrollLeft}px)`;
    const onHScroll = () => {
      cloned.style.transform = `translateX(-${scrollEl.scrollLeft}px)`;
    };
    scrollEl.addEventListener('scroll', onHScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', onHScroll);
  }, [theadFixed, theadFixedPos, columnPrefs]);

  // 打开创建/编辑抽屉
  const handleOpenDrawer = (activity?: Activity) => {
    if (activity) {
      setEditingActivity(activity);
      const pd = activity.planStartDate && activity.planEndDate
        ? calcWorkdays(dayjs(activity.planStartDate), dayjs(activity.planEndDate))
        : activity.planDuration ?? null;
      const ad = activity.startDate && activity.endDate
        ? calcWorkdays(dayjs(activity.startDate), dayjs(activity.endDate))
        : activity.duration ?? null;
      setPlanDuration(pd);
      setActualDuration(ad);
      form.setFieldsValue({
        phase: activity.phase,
        name: activity.name,
        description: activity.description,
        parentId: activity.parentId,
        type: activity.type,
        status: activity.status,
        priority: activity.priority,
        planStart: activity.planStartDate ? dayjs(activity.planStartDate) : undefined,
        planEnd: activity.planEndDate ? dayjs(activity.planEndDate) : undefined,
        actualStart: activity.startDate ? dayjs(activity.startDate) : undefined,
        actualEnd: activity.endDate ? dayjs(activity.endDate) : undefined,
        assigneeIds: activity.assignees?.map((a) => a.id) ?? [],
        notes: activity.notes,
      });
      // Load dependencies
      const rawDeps = activity.dependencies;
      const deps = Array.isArray(rawDeps)
        ? rawDeps
        : (() => { try { return JSON.parse(rawDeps as unknown as string) as typeof rawDeps; } catch { return []; } })();
      setFormDeps((deps || []).map((d) => ({ id: d.id, type: d.type, lag: d.lag ?? 0 })));
    } else {
      setEditingActivity(null);
      setPlanDuration(null);
      setActualDuration(null);
      setFormDeps([]);
      form.resetFields();
    }
    setDrawerVisible(true);
  };

  // 三方联动：计划时间
  const handlePlanChange = (changed: 'start' | 'end' | 'dur', value: dayjs.Dayjs | number | null) => {
    // When dependencies are set, only allow duration changes (server computes dates)
    if (formDeps.some((d) => d.id)) {
      if (changed === 'dur') setPlanDuration(value as number | null);
      return;
    }

    let start = form.getFieldValue('planStart') as dayjs.Dayjs | null ?? null;
    let end = form.getFieldValue('planEnd') as dayjs.Dayjs | null ?? null;
    let dur = planDuration;
    if (changed === 'start') start = value as dayjs.Dayjs | null;
    else if (changed === 'end') end = value as dayjs.Dayjs | null;
    else dur = value as number | null;

    const result = resolveTriple({ start, end, dur }, changed);
    form.setFieldsValue({ planStart: result.start ?? undefined, planEnd: result.end ?? undefined });
    setPlanDuration(result.dur);
  };

  // 三方联动：实际时间
  const handleActualChange = (changed: 'start' | 'end' | 'dur', value: dayjs.Dayjs | number | null) => {
    let start = form.getFieldValue('actualStart') as dayjs.Dayjs | null ?? null;
    let end = form.getFieldValue('actualEnd') as dayjs.Dayjs | null ?? null;
    let dur = actualDuration;
    if (changed === 'start') start = value as dayjs.Dayjs | null;
    else if (changed === 'end') end = value as dayjs.Dayjs | null;
    else dur = value as number | null;

    const result = resolveTriple({ start, end, dur }, changed);
    form.setFieldsValue({ actualStart: result.start ?? undefined, actualEnd: result.end ?? undefined });
    setActualDuration(result.dur);
  };

  // 提交活动表单
  const handleSubmitActivity = async () => {
    if (!id) return;
    try {
      const values = await form.validate();
      const data: Parameters<typeof activitiesApi.create>[0] = {
        projectId: id,
        name: values.name,
        description: values.description,
        type: values.type,
        phase: values.phase,
        status: values.status,
        priority: values.priority,
        planStartDate: values.planStart ? dayjs(values.planStart).format('YYYY-MM-DD') : undefined,
        planEndDate: values.planEnd ? dayjs(values.planEnd).format('YYYY-MM-DD') : undefined,
        planDuration: planDuration ?? undefined,
        startDate: values.actualStart ? dayjs(values.actualStart).format('YYYY-MM-DD') : undefined,
        endDate: values.actualEnd ? dayjs(values.actualEnd).format('YYYY-MM-DD') : undefined,
        duration: actualDuration ?? undefined,
        assigneeIds: values.assigneeIds || [],
        parentId: values.parentId,
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
        await activitiesApi.update(editingActivity.id, data);
        Message.success('活动更新成功');
      } else {
        await activitiesApi.create(data);
        Message.success('活动创建成功');
      }
      insertAtIndexRef.current = null;
      setDrawerVisible(false);
      loadActivities();
      loadProject(); // 刷新进度
    } catch (e) {
      console.error('提交失败', e);
    }
  };

  // 删除活动
  const handleDeleteActivity = (activity: Activity) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除活动"${activity.name}"吗？此操作不可恢复。`,
      onOk: async () => {
        try {
          await activitiesApi.delete(activity.id);
          Message.success('活动删除成功');
          loadActivities();
          loadProject();
        } catch {
          Message.error('活动删除失败');
        }
      },
    });
  };

  // ========== 归档快照操作 ==========
  const loadArchives = async () => {
    if (!id) return;
    setArchiveLoading(true);
    try {
      const res = await activitiesApi.listArchives(id);
      setArchiveList(res.data);
    } catch { /* ignore */ }
    setArchiveLoading(false);
  };

  const handleCreateArchive = async (label?: string) => {
    if (!id) return;
    try {
      await activitiesApi.createArchive(id, label || undefined);
      Message.success('归档创建成功');
      loadArchives();
    } catch {
      Message.error('创建归档失败');
    }
  };

  const handleDeleteArchive = async (archiveId: string) => {
    try {
      await activitiesApi.deleteArchive(archiveId);
      Message.success('已删除归档');
      if (expandedArchiveId === archiveId) {
        setExpandedArchiveId(null);
        setArchiveDetail(null);
      }
      loadArchives();
    } catch {
      Message.error('删除归档失败');
    }
  };

  const handleExpandArchive = async (archiveId: string) => {
    if (expandedArchiveId === archiveId) {
      setExpandedArchiveId(null);
      setArchiveDetail(null);
      return;
    }
    setExpandedArchiveId(archiveId);
    setArchiveDetailLoading(true);
    try {
      const res = await activitiesApi.getArchive(archiveId);
      setArchiveDetail(res.data);
    } catch {
      Message.error('获取归档详情失败');
    }
    setArchiveDetailLoading(false);
  };

  // ========== 拖拽排序 ==========
  // 自定义拖拽（用 mouse 事件实现，以便控制光标为 grabbing）
  const isDraggingRef = useRef(false);
  const dragFromRef = useRef(-1);
  const dragOverRef = useRef(-1);
  const [, forceRender] = useState(0);

  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    dragIndexRef.current = index;
  };

  const handleMouseMove = (e: React.MouseEvent, index: number) => {
    if (dragIndexRef.current === -1) return;
    e.preventDefault();
    let needRender = false;
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      dragFromRef.current = dragIndexRef.current;
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      needRender = true;
    }
    if (dragOverRef.current !== index) {
      dragOverRef.current = index;
      needRender = true;
    }
    if (needRender) forceRender((n) => n + 1);
  };

  const resetDragState = () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    isDraggingRef.current = false;
    dragFromRef.current = -1;
    dragOverRef.current = -1;
    dragIndexRef.current = -1;
    forceRender((n) => n + 1);
  };

  const handleMouseUp = async (e: React.MouseEvent, targetIndex: number) => {
    e.preventDefault();
    if (!isDraggingRef.current) {
      dragIndexRef.current = -1;
      return;
    }
    const fromIndex = dragIndexRef.current;
    resetDragState();

    if (fromIndex === -1 || fromIndex === targetIndex) return;

    const newList = [...activities];
    const [removed] = newList.splice(fromIndex, 1);
    newList.splice(targetIndex, 0, removed);
    const reordered = newList.map((a, i) => ({ ...a, sortOrder: (i + 1) * 10 }));
    setActivities(reordered);

    if (!id) return;
    setSaving(true);
    try {
      await activitiesApi.reorder(id, reordered.map((a, i) => ({ id: a.id, sortOrder: (i + 1) * 10, parentId: a.parentId })));
    } catch {
      Message.error('保存排序失败');
      loadActivities(); // 回滚
    } finally {
      setSaving(false);
    }
  };

  // 全局 mouseup 兜底（鼠标在表格外释放时清理状态）
  useEffect(() => {
    const cleanup = () => {
      if (isDraggingRef.current) resetDragState();
    };
    window.addEventListener('mouseup', cleanup);
    return () => window.removeEventListener('mouseup', cleanup);
  }, []);

  // ========== 行间快速插入（内联创建） ==========
  const handleInsertActivity = async (atIndex: number) => {
    if (!id) return;
    // 计算插入位置的 sortOrder
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
      // 重新加载活动列表
      await loadActivities();
      // 进入新行的名称内联编辑
      if (newId) {
        setInlineEditing({ id: newId, field: 'name' });
        setInlineValue('新活动');
      }
    } catch {
      Message.error('创建活动失败');
    }
  };


  // ========== 双击内联编辑 ==========
  const startInlineEdit = (activityId: string, field: string, currentValue: string) => {
    if (!(hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id))) return;
    setInlineEditing({ id: activityId, field });
    setInlineValue(currentValue);
  };

  const commitInlineEdit = async (activity: Activity, field: string) => {
    setInlineEditing(null);
    const original = (activity as unknown as Record<string, unknown>)[field] as string;
    if (inlineValue === original || inlineValue === (original ?? '')) return;
    try {
      await activitiesApi.update(activity.id, { [field]: inlineValue || undefined });
      setActivities((prev) => prev.map((a) => a.id === activity.id ? { ...a, [field]: inlineValue } : a));
      Message.success('更新成功');
    } catch {
      Message.error('更新失败');
    }
  };

  const commitSelectEdit = async (activity: Activity, field: string, value: string) => {
    setInlineEditing(null);
    try {
      await activitiesApi.update(activity.id, { [field]: value });
      setActivities((prev) => prev.map((a) => a.id === activity.id ? { ...a, [field]: value } : a));
      Message.success('更新成功');
    } catch {
      Message.error('更新失败');
    }
  };

  // ========== 批量操作 ==========
  const handleBatchStatusUpdate = async (status: string) => {
    if (selectedIds.size === 0) return;
    try {
      await activitiesApi.batchUpdate(Array.from(selectedIds), { status });
      Message.success(`已更新 ${selectedIds.size} 个活动状态`);
      setSelectedIds(new Set());
      loadActivities();
      loadProject();
    } catch { Message.error('批量更新失败'); }
  };

  const handleBatchPhaseUpdate = async (phase: string) => {
    if (selectedIds.size === 0) return;
    try {
      await activitiesApi.batchUpdate(Array.from(selectedIds), { phase });
      Message.success(`已更新 ${selectedIds.size} 个活动阶段`);
      setSelectedIds(new Set());
      loadActivities();
    } catch { Message.error('批量更新失败'); }
  };

  const handleBatchAssigneeUpdate = async (assigneeIds: string[]) => {
    if (selectedIds.size === 0) return;
    try {
      await activitiesApi.batchUpdate(Array.from(selectedIds), { assigneeIds });
      Message.success(`已更新 ${selectedIds.size} 个活动负责人`);
      setSelectedIds(new Set());
      loadActivities();
    } catch { Message.error('批量更新失败'); }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedIds.size} 个活动吗？此操作不可恢复。`,
      onOk: async () => {
        try {
          await activitiesApi.batchDelete(Array.from(selectedIds));
          Message.success(`已删除 ${selectedIds.size} 个活动`);
          setSelectedIds(new Set());
          loadActivities();
          loadProject();
        } catch { Message.error('批量删除失败'); }
      },
    });
  };

  // 归档对比
  const handleCompare = async () => {
    if (!id || !compareSelections[0] || !compareSelections[1]) return;
    setCompareLoading(true);
    try {
      const res = await activitiesApi.compareArchives(compareSelections[0], compareSelections[1], id);
      setCompareDiffs(res.data.diffs || []);
    } catch { Message.error('对比失败'); }
    setCompareLoading(false);
  };

  // 活动 ID → 序号映射（O(1) 查找替代 O(n) findIndex）
  const activitySeqMap = React.useMemo(() => {
    const map = new Map<string, number>();
    activities.forEach((a, i) => map.set(a.id, i + 1));
    return map;
  }, [activities]);

  // 获取活动序号（1-indexed, padded）
  const getSeq = (activity: Activity): string => {
    return formatSeq(activitySeqMap.get(activity.id) || 0);
  };

  // 获取前置任务序号显示 — MS Project 格式: {seq}{type}±{lag}
  const getPredecessorSeq = (activity: Activity): string => {
    if (!activity.dependencies) return '';
    const rawDeps = activity.dependencies;
    const deps = Array.isArray(rawDeps)
      ? rawDeps
      : (() => { try { return JSON.parse(rawDeps as unknown as string) as typeof rawDeps; } catch { return []; } })();
    if (!deps || deps.length === 0) return '';
    return deps.map((dep) => {
      const idx = activitySeqMap.get(dep.id);
      const seq = idx ? String(idx) : '?';
      const typeLabel = DEPENDENCY_TYPE_MAP[dep.type as keyof typeof DEPENDENCY_TYPE_MAP]?.label || 'FS';
      const lag = dep.lag ?? 0;
      const lagStr = lag > 0 ? `+${lag}` : lag < 0 ? String(lag) : '';
      return `${seq}${typeLabel}${lagStr}`;
    }).join(', ');
  };

  // 将 "3FS+2, 5" 文本解析为 ActivityDependency[]
  const TYPE_LABEL_TO_CODE: Record<string, string> = { FS: '0', SS: '1', FF: '2', SF: '3' };
  const parsePredecessorText = (text: string, selfId: string): { id: string; type: string; lag: number }[] | null => {
    const trimmed = text.trim();
    if (!trimmed) return [];
    const seqToId = new Map<number, string>();
    activities.forEach((a, i) => seqToId.set(i + 1, a.id));
    const parts = trimmed.split(/[,，;；\s]+/).filter(Boolean);
    const result: { id: string; type: string; lag: number }[] = [];
    for (const part of parts) {
      const m = part.match(/^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\d+)?$/i);
      if (!m) return null; // 解析失败
      const seq = parseInt(m[1], 10);
      const typeLabel = (m[2] || 'FS').toUpperCase();
      const lag = m[3] ? parseInt(m[3], 10) : 0;
      const targetId = seqToId.get(seq);
      if (!targetId || targetId === selfId) return null; // 无效序号或自引用
      result.push({ id: targetId, type: TYPE_LABEL_TO_CODE[typeLabel] || '0', lag });
    }
    return result;
  };

  // 提交日期范围内联编辑
  const commitDateRangeEdit = async (
    activity: Activity,
    startField: string,
    endField: string,
    dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null,
  ) => {
    setInlineEditing(null);
    const startVal = dates?.[0]?.format('YYYY-MM-DD') || null;
    const endVal = dates?.[1]?.format('YYYY-MM-DD') || null;
    const payload: Record<string, unknown> = { [startField]: startVal, [endField]: endVal };
    // 计划时间自动算工期
    if (startField === 'planStartDate' && startVal && endVal) {
      payload.planDuration = calcWorkdays(dayjs(startVal), dayjs(endVal));
    }
    try {
      await activitiesApi.update(activity.id, payload);
      loadActivities();
      Message.success('更新成功');
    } catch {
      Message.error('更新失败');
    }
  };

  // 提交计划工期内联编辑
  const commitPlanDurationEdit = async (activity: Activity) => {
    setInlineEditing(null);
    const newDur = parseInt(inlineValue, 10);
    if (!newDur || newDur <= 0) return;
    const oldDur = activity.planStartDate && activity.planEndDate
      ? calcWorkdays(dayjs(activity.planStartDate), dayjs(activity.planEndDate))
      : activity.planDuration;
    if (newDur === oldDur) return;
    const payload: Record<string, unknown> = { planDuration: newDur };
    // 有计划开始日期时，用 开始日期 + 工期 推算结束日期
    if (activity.planStartDate) {
      const endDate = addWorkdays(dayjs(activity.planStartDate), newDur);
      payload.planEndDate = endDate.format('YYYY-MM-DD');
    }
    try {
      await activitiesApi.update(activity.id, payload);
      loadActivities();
      Message.success('更新成功');
    } catch {
      Message.error('更新失败');
    }
  };

  // 提交前置依赖内联编辑
  const commitPredecessorEdit = async (activity: Activity) => {
    setInlineEditing(null);
    const oldText = getPredecessorSeq(activity);
    if (inlineValue.trim() === oldText.trim()) return;
    const deps = parsePredecessorText(inlineValue, activity.id);
    if (deps === null) {
      Message.error('格式错误，示例: 3FS+2, 5');
      return;
    }
    try {
      await activitiesApi.update(activity.id, { dependencies: deps.length > 0 ? deps : null });
      Message.success('更新成功');
      loadActivities(); // 依赖变更会触发日期级联，需重新加载
    } catch {
      Message.error('更新失败');
    }
  };

  // 计划日期显示（含工作日数）
  const renderPlanDates = (activity: Activity) => {
    if (!activity.planStartDate) return '-';
    const start = dayjs(activity.planStartDate).format('MM-DD');
    const end = activity.planEndDate ? dayjs(activity.planEndDate).format('MM-DD') : '';
    return <span>{start}{end ? ' ~ ' + end : ''}</span>;
  };

  // 实际日期显示（含工作日数，超期显示红色）
  const renderActualDates = (activity: Activity) => {
    if (!activity.startDate) return '-';
    const startD = dayjs(activity.startDate);
    const start = startD.format('MM-DD');
    const endD = activity.endDate ? dayjs(activity.endDate) : null;
    const end = endD ? endD.format('MM-DD') : '进行中';
    // 实际结束晚于计划结束，或未完成且已超过计划结束日期
    const isOverdue = activity.planEndDate && (
      (endD && endD.isAfter(dayjs(activity.planEndDate), 'day')) ||
      (!endD && dayjs(activity.planEndDate).isBefore(dayjs(), 'day') && activity.status !== 'COMPLETED')
    );
    const days = endD
      ? calcWorkdays(startD, endD)
      : calcWorkdays(startD, dayjs());
    return (
      <span style={{ color: isOverdue ? 'var(--status-danger)' : undefined }}>
        {start} ~ {end}
        <span style={{ color: isOverdue ? 'var(--status-danger)' : 'var(--color-text-3)', fontSize: 12, marginLeft: 4 }}>({days}天)</span>
      </span>
    );
  };

  // 表格列配置（keyed map）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columnMap = useMemo<Record<string, { title: string; width?: number; dataIndex?: string; fixed?: 'right'; render?: (...args: any[]) => React.ReactNode }>>(() => ({
    id: {
      title: 'ID',
      width: 60,
      render: (_: unknown, record: Activity) => (
        <span style={{ fontFamily: 'monospace', color: 'var(--color-text-3)' }}>{getSeq(record)}</span>
      ),
    },
    predecessor: {
      title: '前置',
      width: 100,
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'predecessor') {
          return (
            <Input
              autoFocus
              size="small"
              value={inlineValue}
              placeholder="如: 3FS+2, 5"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              onChange={setInlineValue}
              onBlur={() => commitPredecessorEdit(record)}
              onPressEnter={() => commitPredecessorEdit(record)}
            />
          );
        }
        const text = getPredecessorSeq(record);
        return (
          <span
            style={{ fontFamily: 'monospace', color: 'var(--color-text-3)', cursor: 'pointer', display: 'inline-block', minWidth: 20, minHeight: 18 }}
            onDoubleClick={() => startInlineEdit(record.id, 'predecessor', text)}
          >
            {text || '-'}
          </span>
        );
      },
    },
    phase: {
      title: '阶段',
      width: 70,
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'phase') {
          return (
            <AutoOpenSelect
              size="small"
              style={{ width: 80 }}
              value={record.phase || undefined}
              allowClear
              placeholder="阶段"
              onDismiss={() => setInlineEditing(null)}
              onChange={(v) => commitSelectEdit(record, 'phase', v || '')}
            >
              {PHASE_OPTIONS.map((p) => (
                <Select.Option key={p} value={p}><Tag color={PHASE_COLOR[p]}>{p}</Tag></Select.Option>
              ))}
            </AutoOpenSelect>
          );
        }
        return (
          <span
            style={{ cursor: hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onDoubleClick={() => hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) && setInlineEditing({ id: record.id, field: 'phase' })}
          >
            {record.phase ? <Tag color={PHASE_COLOR[record.phase] || 'default'}>{record.phase}</Tag> : <span style={{ color: 'var(--color-text-4)' }}>-</span>}
          </span>
        );
      },
    },
    name: {
      title: '活动名称',
      dataIndex: 'name',
      width: 200,
      render: (name: string, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'name') {
          return (
            <Input
              autoFocus
              size="small"
              value={inlineValue}
              onChange={setInlineValue}
              onBlur={() => commitInlineEdit(record, 'name')}
              onPressEnter={() => commitInlineEdit(record, 'name')}
            />
          );
        }
        return (
          <span
            style={{ fontWeight: 500, cursor: hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 4 }}
            onDoubleClick={() => startInlineEdit(record.id, 'name', name)}
          >
            {name}
            {criticalActivityIds.includes(record.id) && (
              <Tag size="small" color="red" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>CP</Tag>
            )}
          </span>
        );
      },
    },
    type: {
      title: '类型',
      width: 80,
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'type') {
          return (
            <AutoOpenSelect
              size="small"
              style={{ width: 90 }}
              value={record.type}
              onDismiss={() => setInlineEditing(null)}
              onChange={(v) => commitSelectEdit(record, 'type', v)}
            >
              {Object.entries(ACTIVITY_TYPE_MAP).map(([k, v]) => (
                <Select.Option key={k} value={k}><Tag color={v.color}>{v.label}</Tag></Select.Option>
              ))}
            </AutoOpenSelect>
          );
        }
        const cfg = ACTIVITY_TYPE_MAP[record.type as keyof typeof ACTIVITY_TYPE_MAP] ?? { label: record.type, color: 'default' };
        return (
          <Tag
            color={cfg.color}
            style={{ cursor: hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onDoubleClick={() => hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) && setInlineEditing({ id: record.id, field: 'type' })}
          >
            {cfg.label}
          </Tag>
        );
      },
    },
    status: {
      title: '状态',
      width: 100,
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'status') {
          return (
            <AutoOpenSelect
              size="small"
              style={{ width: 100 }}
              value={record.status}
              onDismiss={() => setInlineEditing(null)}
              onChange={(v) => commitSelectEdit(record, 'status', v)}
            >
              {Object.entries(ACTIVITY_STATUS_MAP).map(([k, v]) => (
                <Select.Option key={k} value={k}>{v.label}</Select.Option>
              ))}
            </AutoOpenSelect>
          );
        }
        const cfg = ACTIVITY_STATUS_MAP[record.status as keyof typeof ACTIVITY_STATUS_MAP] ?? { label: record.status, color: 'default' };
        return (
          <Tag
            color={cfg.color}
            style={{ cursor: hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onDoubleClick={() => hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) && setInlineEditing({ id: record.id, field: 'status' })}
          >
            {cfg.label}
          </Tag>
        );
      },
    },
    assignee: {
      title: '负责人',
      width: 120,
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'assigneeIds') {
          return (
            <AutoOpenSelect
              mode="multiple"
              size="small"
              allowClear
              style={{ width: 160 }}
              value={record.assignees?.map((a) => a.id) ?? []}
              onDismiss={() => {
                setInlineEditing(null);
              }}
              onChange={(v: string[]) => {
                setInlineEditing(null);
                activitiesApi.update(record.id, { assigneeIds: v }).then(() => {
                  loadActivities();
                  Message.success('更新成功');
                }).catch(() => Message.error('更新失败'));
              }}
            >
              {users.map((u) => (
                <Select.Option key={u.id} value={u.id}>{u.realName}</Select.Option>
              ))}
            </AutoOpenSelect>
          );
        }
        const names = record.assignees?.map((a) => a.realName).join(', ') || '-';
        return (
          <span
            style={{ cursor: hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onDoubleClick={() => hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) && setInlineEditing({ id: record.id, field: 'assigneeIds' })}
          >
            {names}
          </span>
        );
      },
    },
    planDuration: {
      title: '计划工期',
      width: 90,
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'planDuration') {
          return (
            <InputNumber
              autoFocus
              size="small"
              style={{ width: 60 }}
              min={1}
              precision={0}
              suffix="天"
              value={inlineValue ? parseInt(inlineValue, 10) : undefined}
              onChange={(v) => setInlineValue(v != null ? String(v) : '')}
              onBlur={() => commitPlanDurationEdit(record)}
              onKeyDown={(e) => { if ((e as unknown as React.KeyboardEvent).key === 'Enter') commitPlanDurationEdit(record); }}
            />
          );
        }
        const days = record.planStartDate && record.planEndDate
          ? calcWorkdays(dayjs(record.planStartDate), dayjs(record.planEndDate))
          : record.planDuration;
        return (
          <span
            style={{ cursor: hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onDoubleClick={() => startInlineEdit(record.id, 'planDuration', days != null ? String(days) : '')}
          >
            {days != null ? `${days}天` : <span style={{ color: 'var(--color-text-4)' }}>-</span>}
          </span>
        );
      },
    },
    planDates: {
      title: '计划时间',
      width: 200,
      render: (_: unknown, record: Activity) => {
        const hasDeps = record.dependencies && (Array.isArray(record.dependencies) ? record.dependencies.length > 0 : (() => { try { const d = JSON.parse(record.dependencies as unknown as string); return Array.isArray(d) && d.length > 0; } catch { return false; } })());
        if (inlineEditing?.id === record.id && inlineEditing.field === 'planDates') {
          return (
            <DatePicker.RangePicker
              size="small"
              style={{ width: 220 }}
              format="YYYY-MM-DD"
              {...{ defaultPopupVisible: true } as any}
              value={record.planStartDate && record.planEndDate ? [dayjs(record.planStartDate), dayjs(record.planEndDate)] as [dayjs.Dayjs, dayjs.Dayjs] : undefined}
              onChange={(_, dates) => {
                const parsed: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null = dates && dates[0] && dates[1] ? [dayjs(dates[0]), dayjs(dates[1])] : null;
                commitDateRangeEdit(record, 'planStartDate', 'planEndDate', parsed);
              }}
              onVisibleChange={(visible) => { if (!visible) setInlineEditing(null); }}
            />
          );
        }
        return (
          <span
            style={{ cursor: !hasDeps && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onDoubleClick={() => {
              if (hasDeps) { Message.info('已设置前置依赖，计划时间由系统自动计算'); return; }
              if (hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id)) {
                setInlineEditing({ id: record.id, field: 'planDates' });
              }
            }}
          >
            {renderPlanDates(record)}
          </span>
        );
      },
    },
    actualDates: {
      title: '实际时间',
      width: 200,
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'actualDates') {
          return (
            <DatePicker.RangePicker
              size="small"
              style={{ width: 220 }}
              format="YYYY-MM-DD"
              {...{ defaultPopupVisible: true } as any}
              value={record.startDate && record.endDate ? [dayjs(record.startDate), dayjs(record.endDate)] as [dayjs.Dayjs, dayjs.Dayjs] : record.startDate ? [dayjs(record.startDate), dayjs(record.startDate)] as [dayjs.Dayjs, dayjs.Dayjs] : undefined}
              onChange={(_, dates) => {
                const parsed: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null = dates && dates[0] && dates[1] ? [dayjs(dates[0]), dayjs(dates[1])] : dates && dates[0] ? [dayjs(dates[0]), null] : null;
                commitDateRangeEdit(record, 'startDate', 'endDate', parsed);
              }}
              onVisibleChange={(visible) => { if (!visible) setInlineEditing(null); }}
            />
          );
        }
        return (
          <span
            style={{ cursor: hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onDoubleClick={() => hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) && setInlineEditing({ id: record.id, field: 'actualDates' })}
          >
            {renderActualDates(record)}
          </span>
        );
      },
    },
    notes: {
      title: '备注',
      dataIndex: 'notes',
      width: 140,
      render: (notes: string | null, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'notes') {
          return (
            <Input
              autoFocus
              size="small"
              value={inlineValue}
              onChange={setInlineValue}
              onBlur={() => commitInlineEdit(record, 'notes')}
              onPressEnter={() => commitInlineEdit(record, 'notes')}
            />
          );
        }
        return (
          <Tooltip content={notes || ''}>
            <span
              style={{
                cursor: hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default',
                maxWidth: 120,
                display: 'inline-block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: notes ? undefined : 'var(--color-text-4)',
              }}
              onDoubleClick={() => startInlineEdit(record.id, 'notes', notes || '')}
            >
              {notes || '-'}
            </span>
          </Tooltip>
        );
      },
    },
  }), [inlineEditing, inlineValue, users, project, activities, activitySeqMap]);

  // 根据偏好生成最终列数组
  const activityColumns = useMemo(() => {
    // 始终存在的拖拽手柄列
    const canManage = hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id);
    const canCreate = hasPermission('activity', 'create') && isProjectManager(project?.managerId ?? '', project?.id);

    // 批量选择列（有管理权限时显示）
    const checkCol = canManage ? {
      title: (
        <input
          type="checkbox"
          checked={activities.length > 0 && selectedIds.size === activities.length}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedIds(new Set(activities.map(a => a.id)));
            } else {
              setSelectedIds(new Set());
            }
          }}
          style={{ cursor: 'pointer' }}
        />
      ),
      width: 36,
      render: (_: unknown, record: Activity) => (
        <input
          type="checkbox"
          checked={selectedIds.has(record.id)}
          onChange={(e) => {
            const next = new Set(selectedIds);
            if (e.target.checked) next.add(record.id);
            else next.delete(record.id);
            setSelectedIds(next);
          }}
          style={{ cursor: 'pointer' }}
        />
      ),
    } : null;

    const dragCol = {
      title: '',
      dataIndex: 'id',
      width: 50,
      render: (_: unknown, _record: Activity, index: number) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
          {canManage && (
            <div
              className="drag-handle"
              onMouseDown={(e: React.MouseEvent) => handleMouseDown(e, index)}
            >
              <IconDragDotVertical />
            </div>
          )}
          {canCreate && (
            <div
              className="row-insert-trigger"
              onClick={() => handleInsertActivity(index + 1)}
              title="在下方插入活动"
            >
              <IconPlus />
            </div>
          )}
        </div>
      ),
    };

    // 始终存在的操作列
    const actionsCol = {
      title: '操作',
      width: 100,
      fixed: 'right' as const,
      render: (_: unknown, record: Activity) => (
        <Space>
          {hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) && (
            <Tooltip content="编辑">
              <Button type="text" icon={<IconEdit />} size="small" onClick={() => handleOpenDrawer(record)} />
            </Tooltip>
          )}
          {hasPermission('activity', 'delete') && isProjectManager(project?.managerId ?? '', project?.id) && (
            <Tooltip content="删除">
              <Button type="text" status="danger" icon={<IconDelete />} size="small" onClick={() => handleDeleteActivity(record)} />
            </Tooltip>
          )}
        </Space>
      ),
    };

    // 按 order 排序，按 visible 过滤
    const visibleSet = new Set(columnPrefs.visible);
    const middleCols = columnPrefs.order
      .filter((key) => visibleSet.has(key) && columnMap[key])
      .map((key) => columnMap[key]);

    return [...(checkCol ? [checkCol] : []), dragCol, ...middleCols, actionsCol];
  }, [columnMap, columnPrefs, project, activities, selectedIds]);

  // 动态计算 scroll.x
  const scrollX = useMemo(() => {
    const visibleSet = new Set(columnPrefs.visible);
    const dynamicWidth = columnPrefs.order
      .filter((key) => visibleSet.has(key))
      .reduce((sum, key) => sum + (COLUMN_WIDTH_MAP[key] || 100), 0);
    return dynamicWidth + 50 + 100; // drag(50) + actions(100)
  }, [columnPrefs]);

  if (loading || !project) {
    return <MainLayout>加载中...</MainLayout>;
  }

  const statusConfig = STATUS_MAP[project.status as keyof typeof STATUS_MAP] ?? { label: project.status, color: 'default' };
  const priorityConfig = PRIORITY_MAP[project.priority as keyof typeof PRIORITY_MAP] ?? { label: project.priority, color: 'default' };
  const productLineConfig = PRODUCT_LINE_MAP[project.productLine as keyof typeof PRODUCT_LINE_MAP] ?? { label: project.productLine, color: 'default' };

  // 可选的前置任务（排除自身）
  const predecessorOptions = activities.filter((a) => editingActivity ? a.id !== editingActivity.id : true);

  return (
    <MainLayout>
      {/* 活动列表吸顶表头：通过 Portal 渲染到 body，避开 Tabs 的 transform 上下文 */}
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
        {/* 顶部卡片 */}
        <Card style={{ marginBottom: 16 }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {/* 第一行：返回 + 项目名称 + 状态 + 产品线 + 优先级 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Button icon={<IconLeft />} onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/projects')}>返回</Button>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{project.name}</h2>
              <Tag color={statusConfig.color}>{statusConfig.label}</Tag>
              <Tag color={productLineConfig.color}>{productLineConfig.label}</Tag>
              <Tag color={priorityConfig.color}>{priorityConfig.label}</Tag>
            </div>

            {/* 第二行：项目描述 */}
            {project.description && (
              <div style={{ color: 'var(--color-text-2)' }}>{project.description}</div>
            )}

            {/* 第三行：统计卡片 */}
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
                        ? project.members.map((m) => (
                            <Tag key={m.user.id} size="small">{m.user.realName}</Tag>
                          ))
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

        {/* Tab 区域 */}
        <Card>
          <Tabs
          activeTab={activeTab}
          onChange={setActiveTab}
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
                  {hasPermission('activity', 'create') && isProjectManager(project?.managerId ?? '', project?.id) && (
                    <Button type="primary" icon={<IconPlus />} onClick={() => handleOpenDrawer()}>新建活动</Button>
                  )}
                  <ColumnSettings
                    columnDefs={ACTIVITY_COLUMN_DEFS}
                    prefs={columnPrefs}
                    onChange={saveColumnPrefs}
                    defaultPrefs={DEFAULT_COLUMN_PREFS}
                    extraActions={
                      hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? (
                        <Button
                          size="small"
                          type="text"
                          icon={<IconStorage />}
                          onClick={() => { setArchiveDrawerVisible(true); loadArchives(); }}
                          style={{ width: '100%' }}
                        >
                          归档管理
                        </Button>
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

              <div ref={tableWrapRef} style={{ paddingTop: theadFixed ? theadFixedPos.height : 0 }}>
                {/* 自定义表格行（支持拖拽） */}
                <Table
                  columns={activityColumns}
                  data={(() => {
                    let list = [...activities];
                    if (statusFilter) list = list.filter(a => a.status === statusFilter);
                    return list;
                  })()}
                  loading={activitiesLoading}
                  rowKey="id"
                  pagination={false}
                  scroll={{ x: scrollX }}
                  components={{
                    body: {
                      row: ({ children, record, index, ...rest }: { children: React.ReactNode; record: Activity; index: number; [key: string]: unknown }) => {
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
                            onMouseMove={(e) => handleMouseMove(e, index)}
                            onMouseUp={(e) => handleMouseUp(e, index)}
                          >
                            {children}
                          </tr>
                        );
                      },
                    },
                  }}
                />
              </div>{/* tableWrapRef */}
            </Tabs.TabPane>

            {/* 里程碑 */}
            <Tabs.TabPane key="milestones" title="里程碑">
              {(() => {
                const milestones = activities.filter(a => a.type === 'MILESTONE');
                if (milestones.length === 0) {
                  return <Empty description="暂无里程碑" />;
                }

                const statusColor: Record<string, string> = {
                  COMPLETED: 'var(--gantt-milestone-completed)', IN_PROGRESS: 'var(--gantt-milestone-in-progress)',
                  NOT_STARTED: 'var(--gantt-milestone-pending)', CANCELLED: 'var(--gantt-milestone-overdue)',
                };

                // 取里程碑日期（优先 planEndDate）
                const getMsDate = (m: Activity) => {
                  const d = m.planEndDate || m.planStartDate;
                  return d ? dayjs(d) : null;
                };

                // 分为有日期和无日期
                const dated = milestones.filter(m => getMsDate(m)).sort((a, b) => getMsDate(a)!.valueOf() - getMsDate(b)!.valueOf());
                const undated = milestones.filter(m => !getMsDate(m));

                // 时间轴尺寸常量
                const cardW = 190;
                const minGap = 30;
                const nodeSpacing = cardW + minGap; // 每节点最小间距
                const padX = cardW / 2 + 20; // 左右留白
                const axisY = 190; // 时间轴纵向位置
                const cardH = 100;
                const stemLen = 28; // 连线长度

                // — 计算每个节点 x 坐标（按日期比例，但保证最小间距）—
                let positions: number[] = [];
                if (dated.length === 1) {
                  positions = [padX];
                } else if (dated.length > 1) {
                  const tMin = getMsDate(dated[0])!.valueOf();
                  const tMax = getMsDate(dated[dated.length - 1])!.valueOf();
                  const span = tMax - tMin || 1;
                  const naturalW = Math.max((dated.length - 1) * nodeSpacing, 600);
                  // 按比例分配
                  positions = dated.map(m => {
                    const t = getMsDate(m)!.valueOf();
                    return padX + ((t - tMin) / span) * naturalW;
                  });
                  // 保证最小间距：从左到右推挤
                  for (let i = 1; i < positions.length; i++) {
                    if (positions[i] - positions[i - 1] < nodeSpacing) {
                      positions[i] = positions[i - 1] + nodeSpacing;
                    }
                  }
                }

                const totalW = (positions.length > 0 ? positions[positions.length - 1] + padX : 400);
                const totalH = axisY + stemLen + cardH + 40;

                // — 月份刻度 —
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

                      {/* 月份刻度线和标签 */}
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

                      {/* 主时间轴横线 */}
                      {positions.length > 0 && (
                        <div style={{
                          position: 'absolute',
                          left: positions[0] - 16,
                          width: positions[positions.length - 1] - positions[0] + 32,
                          top: axisY, height: 3, background: 'var(--timeline-dot)', borderRadius: 2,
                        }} />
                      )}

                      {/* 里程碑节点 */}
                      {dated.map((m, idx) => {
                        const x = positions[idx];
                        const above = idx % 2 === 0;
                        const color = statusColor[m.status] || 'var(--gantt-milestone-pending)';
                        const stInfo = ACTIVITY_STATUS_MAP[m.status as keyof typeof ACTIVITY_STATUS_MAP];
                        const names = m.assignees?.map(a => a.realName).join('、') || '-';
                        const dateStr = getMsDate(m)!.format('YYYY-MM-DD');
                        const cardTop = above ? axisY - stemLen - cardH : axisY + stemLen;

                        return (
                          <React.Fragment key={m.id}>
                            {/* 连接竖线 */}
                            <div style={{
                              position: 'absolute', left: x, width: 2,
                              top: above ? cardTop + cardH : axisY + 6,
                              height: above ? axisY - cardTop - cardH - 6 : cardTop - axisY - 6,
                              background: color, transform: 'translateX(-1px)', zIndex: 1,
                            }} />

                            {/* 菱形标记 */}
                            <div style={{
                              position: 'absolute', left: x - 7, top: axisY - 5,
                              width: 13, height: 13, background: color,
                              transform: 'rotate(45deg)',
                              border: '2px solid var(--color-bg-1)', boxShadow: `0 0 0 1px ${color}`,
                              zIndex: 3,
                            }} />

                            {/* 日期标签（菱形下/上方） */}
                            <div style={{
                              position: 'absolute', left: x, top: above ? axisY + 10 : axisY - 18,
                              transform: 'translateX(-50%)', fontSize: 10, color: 'var(--color-text-3)',
                              whiteSpace: 'nowrap', zIndex: 2,
                            }}>
                              {dateStr}
                            </div>

                            {/* 卡片 */}
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

                    {/* 无日期的里程碑 */}
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
              })()}
            </Tabs.TabPane>

            {/* 甘特图 */}
            <Tabs.TabPane key="gantt" title="甘特图">
              <GanttChart activities={activities} criticalActivityIds={criticalActivityIds} />
            </Tabs.TabPane>

            {/* AI 风险评估 */}
            <Tabs.TabPane key="risk" title="AI风险评估">
              {id && <RiskAssessmentTab projectId={id} />}
            </Tabs.TabPane>

            {/* 产品列表 */}
            <Tabs.TabPane key="products" title="产品列表">
              {id && <ProductsTab projectId={id} />}
            </Tabs.TabPane>

            {/* 项目周报 */}
            <Tabs.TabPane key="weekly" title="项目周报">
              {id && <ProjectWeeklyTab projectId={id} managerId={project?.managerId} />}
            </Tabs.TabPane>
          </Tabs>
        </Card>

        {/* 新建/编辑活动抽屉 */}
        <Drawer
          width={700}
          title={editingActivity ? '编辑活动' : '新建活动'}
          visible={drawerVisible}
          onCancel={() => { insertAtIndexRef.current = null; setDrawerVisible(false); }}
          footer={
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setDrawerVisible(false)}>取消</Button>
                <Button type="primary" onClick={handleSubmitActivity}>
                  {editingActivity ? '保存' : '创建'}
                </Button>
              </Space>
            </div>
          }
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{ type: 'TASK', status: 'NOT_STARTED', priority: 'MEDIUM' }}
          >
            {/* 第一行：阶段 + 活动名称 */}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
              <Form.Item label="阶段" field="phase" rules={[{ required: true, message: '请选择阶段' }]}>
                <Select placeholder="请选择">
                  {PHASE_OPTIONS.map((p) => (
                    <Select.Option key={p} value={p}>
                      <Tag color={PHASE_COLOR[p]}>{p}</Tag>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item label="活动名称" field="name" rules={[{ required: true, message: '请输入活动名称' }]}>
                <Input placeholder="请输入活动名称" />
              </Form.Item>
            </div>

            {/* 描述 */}
            <Form.Item label="描述" field="description">
              <Input.TextArea placeholder="请输入描述" rows={3} maxLength={500} showWordLimit />
            </Form.Item>

            {/* 类型 / 状态 / 优先级 / 负责人 */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 100px 100px 1fr', gap: 12 }}>
              <Form.Item label="类型" field="type" rules={[{ required: true }]}>
                <Select placeholder="类型">
                  {Object.entries(ACTIVITY_TYPE_MAP).map(([k, v]) => (
                    <Select.Option key={k} value={k}>
                      <Tag color={v.color}>{v.label}</Tag>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item label="状态" field="status">
                <Select placeholder="状态">
                  {Object.entries(ACTIVITY_STATUS_MAP).map(([k, v]) => (
                    <Select.Option key={k} value={k}>
                      <Tag color={v.color}>{v.label}</Tag>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item label="优先级" field="priority" rules={[{ required: true }]}>
                <Select placeholder="优先级">
                  {Object.entries(PRIORITY_MAP).map(([k, v]) => (
                    <Select.Option key={k} value={k}>
                      <Tag color={v.color}>{v.label}</Tag>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item label="负责人" field="assigneeIds">
                <Select mode="multiple" placeholder="请选择负责人" allowClear showSearch filterOption={(input, option) =>
                  (option?.props?.children as string)?.toLowerCase().includes(input.toLowerCase())
                }>
                  {users.map((u) => (
                    <Select.Option key={u.id} value={u.id}>
                      {u.realName} ({u.username})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </div>

            {/* 分隔线 */}
            <div style={{ borderTop: '1px solid var(--color-border-2)', margin: '4px 0 16px' }} />

            {/* 父活动 */}
            <Form.Item label="父活动" field="parentId">
              <Select placeholder="请选择父活动（可选）" allowClear>
                {predecessorOptions.map((a) => (
                  <Select.Option key={a.id} value={a.id}>
                    {formatSeq(activities.findIndex((x) => x.id === a.id) + 1)} - {a.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            {/* 前置依赖 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-2)' }}>前置依赖</span>
                <Button
                  type="text"
                  size="small"
                  icon={<IconPlus />}
                  onClick={() => setFormDeps([...formDeps, { id: '', type: '0', lag: 0 }])}
                >
                  添加
                </Button>
              </div>
              {formDeps.length === 0 ? (
                <div style={{ color: 'var(--color-text-4)', fontSize: 13, padding: '4px 0' }}>无前置依赖</div>
              ) : (
                formDeps.map((dep, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <Select
                      placeholder="选择活动"
                      showSearch
                      allowClear
                      value={dep.id || undefined}
                      onChange={(v) => {
                        const next = [...formDeps];
                        next[idx] = { ...next[idx], id: v || '' };
                        setFormDeps(next);
                      }}
                      filterOption={(input, option) =>
                        (option?.props?.children as string)?.toLowerCase().includes(input.toLowerCase())
                      }
                    >
                      {activities
                        .filter((a) =>
                          (editingActivity ? a.id !== editingActivity.id : true) &&
                          !formDeps.some((d, di) => di !== idx && d.id === a.id)
                        )
                        .map((a) => (
                          <Select.Option key={a.id} value={a.id}>
                            {String(activitySeqMap.get(a.id) || 0)} - {a.name}
                          </Select.Option>
                        ))}
                    </Select>
                    <Select
                      value={dep.type}
                      onChange={(v) => {
                        const next = [...formDeps];
                        next[idx] = { ...next[idx], type: v };
                        setFormDeps(next);
                      }}
                    >
                      {Object.entries(DEPENDENCY_TYPE_MAP).map(([k, v]) => (
                        <Select.Option key={k} value={k}>{v.fullLabel}</Select.Option>
                      ))}
                    </Select>
                    <InputNumber
                      value={dep.lag}
                      onChange={(v) => {
                        const next = [...formDeps];
                        next[idx] = { ...next[idx], lag: v ?? 0 };
                        setFormDeps(next);
                      }}
                      suffix="天"
                      placeholder="延迟"
                      style={{ width: '100%' }}
                    />
                    <Button
                      type="text"
                      status="danger"
                      icon={<IconDelete />}
                      size="small"
                      onClick={() => setFormDeps(formDeps.filter((_, i) => i !== idx))}
                    />
                  </div>
                ))
              )}
            </div>

            {formDeps.some((d) => d.id) && (
              <div style={{ background: 'var(--color-primary-light-1)', border: '1px solid var(--info-border)', borderRadius: 4, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--info-color)' }}>
                已设置前置依赖，计划开始/结束日期将由系统根据依赖关系自动计算。可设置工期辅助推算。
              </div>
            )}

            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-2)', marginBottom: 8, display: 'block' }}>时间</span>
            {/* 计划时间：开始 + 结束 + 工期 三方联动 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12 }}>
              <Form.Item label="计划开始" field="planStart">
                <DatePicker
                  style={{ width: '100%' }}
                  placeholder="开始日期"
                  disabled={formDeps.some((d) => d.id)}
                  onChange={(_s, d) => handlePlanChange('start', d ? dayjs(d as unknown as string) : null)}
                />
              </Form.Item>
              <Form.Item label="计划结束" field="planEnd">
                <DatePicker
                  style={{ width: '100%' }}
                  placeholder="结束日期"
                  disabled={formDeps.some((d) => d.id)}
                  onChange={(_s, d) => handlePlanChange('end', d ? dayjs(d as unknown as string) : null)}
                />
              </Form.Item>
              <Form.Item label="工期(天)">
                <InputNumber
                  min={1}
                  value={planDuration ?? undefined}
                  onChange={(v) => handlePlanChange('dur', v ?? null)}
                  placeholder="工期"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </div>

            {/* 实际时间：开始 + 结束 + 工期 三方联动 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12 }}>
              <Form.Item label="实际开始" field="actualStart">
                <DatePicker
                  style={{ width: '100%' }}
                  placeholder="开始日期"
                  onChange={(_s, d) => handleActualChange('start', d ? dayjs(d as unknown as string) : null)}
                />
              </Form.Item>
              <Form.Item label="实际结束" field="actualEnd">
                <DatePicker
                  style={{ width: '100%' }}
                  placeholder="结束日期"
                  onChange={(_s, d) => handleActualChange('end', d ? dayjs(d as unknown as string) : null)}
                />
              </Form.Item>
              <Form.Item label="工期(天)">
                <InputNumber
                  min={1}
                  value={actualDuration ?? undefined}
                  onChange={(v) => handleActualChange('dur', v ?? null)}
                  placeholder="工期"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </div>

            {/* 备注 */}
            <Form.Item label="备注" field="notes">
              <Input.TextArea placeholder="请输入备注" rows={3} maxLength={500} showWordLimit />
            </Form.Item>
          </Form>

          {/* 评论 & 变更历史 */}
          {editingActivity && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--color-border-2)', paddingTop: 16 }}>
              <ActivityComments activityId={editingActivity.id} />
            </div>
          )}
        </Drawer>

        {/* 协作者管理 Modal */}
        <Modal
          title="管理协作者"
          visible={membersModalVisible}
          onCancel={() => setMembersModalVisible(false)}
          footer={<Button onClick={() => setMembersModalVisible(false)}>关闭</Button>}
          style={{ maxWidth: 480 }}
        >
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 8 }}>添加协作者</div>
            <Select
              placeholder="搜索并选择用户"
              showSearch
              allowClear
              loading={membersLoading}
              filterOption={(input, option) =>
                (option?.props?.children as string)?.toLowerCase().includes(input.toLowerCase())
              }
              onChange={(userId) => {
                if (userId) handleAddMember(userId);
              }}
              value={undefined}
              style={{ width: '100%' }}
            >
              {users
                .filter((u) =>
                  u.id !== project?.managerId &&
                  !project?.members?.some((m) => m.user.id === u.id)
                )
                .map((u) => (
                  <Select.Option key={u.id} value={u.id}>
                    {u.realName} ({u.username})
                  </Select.Option>
                ))
              }
            </Select>
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 8 }}>当前协作者</div>
            {project?.members && project.members.length > 0 ? (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {project.members.map((m) => (
                  <div key={m.user.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-fill-2)' }}>
                    <span>{m.user.realName} ({m.user.username})</span>
                    <Button
                      type="text"
                      status="danger"
                      size="small"
                      loading={membersLoading}
                      onClick={() => handleRemoveMember(m.user.id)}
                    >
                      移除
                    </Button>
                  </div>
                ))}
              </Space>
            ) : (
              <Empty description="暂无协作者" style={{ padding: '12px 0' }} />
            )}
          </div>
        </Modal>

        {/* 归档标签输入 Modal */}
        <Modal
          title="创建归档"
          visible={archiveLabelModalVisible}
          onCancel={() => setArchiveLabelModalVisible(false)}
          onOk={() => {
            setArchiveLabelModalVisible(false);
            handleCreateArchive(archiveLabelInput || undefined);
          }}
          okText="创建"
          style={{ maxWidth: 420 }}
        >
          <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--color-text-3)' }}>
            为归档添加一个可选标签，方便后续识别
          </div>
          <Input
            placeholder="归档标签（可选）"
            value={archiveLabelInput}
            onChange={setArchiveLabelInput}
            maxLength={50}
          />
        </Modal>

        {/* 归档管理抽屉 */}
        <Drawer
          width="85vw"
          title="归档管理"
          visible={archiveDrawerVisible}
          onCancel={() => { setArchiveDrawerVisible(false); setExpandedArchiveId(null); setArchiveDetail(null); }}
          footer={null}
          headerStyle={{ borderBottom: '1px solid var(--color-border)' }}
          bodyStyle={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '16px 20px' }}
        >
          {/* 顶部操作栏 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-3)' }}>
              共 {archiveList.length} 个归档
            </span>
            <Space>
              {hasPermission('activity', 'create') && isProjectManager(project?.managerId ?? '', project?.id) && (
                <Button
                  size="small"
                  type="primary"
                  onClick={() => { setArchiveLabelInput(''); setArchiveLabelModalVisible(true); }}
                  disabled={activities.length === 0}
                >
                  创建归档
                </Button>
              )}
              <Button
                size="small"
                type={compareMode ? 'primary' : 'secondary'}
                onClick={() => { setCompareMode(!compareMode); setCompareSelections([null, null]); setCompareDiffs(null); }}
              >
                {compareMode ? '退出对比' : '对比模式'}
              </Button>
            </Space>
          </div>

          {/* 左右分栏：左侧归档列表 + 右侧详情表格 */}
          {archiveLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>
          ) : archiveList.length === 0 ? (
            <Empty description="暂无归档记录" style={{ padding: '40px 0' }} />
          ) : (
            <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
              {/* 左侧归档列表 */}
              <div style={{ width: 220, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--color-border)', paddingRight: 12 }}>
                {archiveList.map(arc => {
                  const isSelected = expandedArchiveId === arc.id;
                  const canManageArc = hasPermission('activity', 'delete') && isProjectManager(project?.managerId ?? '', project?.id);
                  const isCompareSelected = compareSelections.includes(arc.id);
                  return (
                    <div
                      key={arc.id}
                      style={{
                        padding: '10px 12px', marginBottom: 4, borderRadius: 6, cursor: 'pointer',
                        background: isSelected ? 'var(--color-primary-light-1)' : isCompareSelected ? 'var(--color-warning-light-1)' : undefined,
                        border: isSelected ? '1px solid var(--info-border)' : isCompareSelected ? '1px solid var(--color-warning-light-3)' : '1px solid transparent',
                      }}
                      onClick={() => {
                        if (compareMode) {
                          setCompareSelections(prev => {
                            if (prev[0] === arc.id) return [null, prev[1]];
                            if (prev[1] === arc.id) return [prev[0], null];
                            if (!prev[0]) return [arc.id, prev[1]];
                            if (!prev[1]) return [prev[0], arc.id];
                            return [arc.id, prev[1]];
                          });
                        } else {
                          handleExpandArchive(arc.id);
                        }
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: isSelected ? 500 : 400, color: isSelected ? 'rgb(var(--primary-6))' : 'var(--color-text-1)' }}>
                        {arc.label || dayjs(arc.createdAt).format('YYYY-MM-DD')}
                      </div>
                      {arc.label && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-4)', marginTop: 1 }}>
                          {dayjs(arc.createdAt).format('YYYY-MM-DD')}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>
                        {dayjs(arc.createdAt).format('HH:mm')}
                        <span style={{ marginLeft: 6 }}>{arc.count} 个活动</span>
                        {compareMode && isCompareSelected && (
                          <Tag size="small" color="orangered" style={{ marginLeft: 6 }}>
                            {compareSelections[0] === arc.id ? 'A' : 'B'}
                          </Tag>
                        )}
                      </div>
                      {canManageArc && !compareMode && (
                        <Button
                          type="text" size="mini" status="danger"
                          style={{ marginTop: 4, padding: '0 4px', height: 20, fontSize: 12 }}
                          onClick={(e) => { e.stopPropagation(); handleDeleteArchive(arc.id); }}
                        >
                          删除
                        </Button>
                      )}
                    </div>
                  );
                })}
                {/* 对比模式：当前版本选项 */}
                {compareMode && (
                  <div
                    style={{
                      padding: '10px 12px', marginTop: 8, borderRadius: 6, cursor: 'pointer',
                      background: compareSelections.includes('current') ? 'var(--color-warning-light-1)' : 'var(--color-fill-1)',
                      border: compareSelections.includes('current') ? '1px solid var(--color-warning-light-3)' : '1px dashed var(--color-border)',
                    }}
                    onClick={() => {
                      setCompareSelections(prev => {
                        if (prev[0] === 'current') return [null, prev[1]];
                        if (prev[1] === 'current') return [prev[0], null];
                        if (!prev[0]) return ['current', prev[1]];
                        if (!prev[1]) return [prev[0], 'current'];
                        return ['current', prev[1]];
                      });
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500 }}>当前版本</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>
                      {activities.length} 个活动
                      {compareSelections.includes('current') && (
                        <Tag size="small" color="orangered" style={{ marginLeft: 6 }}>
                          {compareSelections[0] === 'current' ? 'A' : 'B'}
                        </Tag>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 右侧详情区域 */}
              <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
                {/* 对比模式 */}
                {compareMode ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-3)' }}>
                        {compareSelections[0] && compareSelections[1]
                          ? '选择了两个版本进行对比'
                          : `请在左侧选择${compareSelections[0] ? '第二个' : '两个'}版本`}
                      </span>
                      {compareSelections[0] && compareSelections[1] && (
                        <Button size="small" type="primary" loading={compareLoading} onClick={handleCompare}>
                          开始对比
                        </Button>
                      )}
                    </div>
                    {compareDiffs && (
                      <Table
                        columns={[
                          { title: '活动名称', dataIndex: 'name', width: 200 },
                          {
                            title: '变更类型', dataIndex: 'changeType', width: 100,
                            render: (v: string) => {
                              const cfg: Record<string, { label: string; color: string }> = {
                                added: { label: '新增', color: 'green' },
                                deleted: { label: '删除', color: 'red' },
                                changed: { label: '变更', color: 'orangered' },
                                unchanged: { label: '无变化', color: 'default' },
                              };
                              const c = cfg[v] || { label: v, color: 'default' };
                              return <Tag color={c.color}>{c.label}</Tag>;
                            },
                          },
                          {
                            title: '差异详情', dataIndex: 'changes',
                            render: (changes: Array<{ field: string; from: unknown; to: unknown }>) => {
                              if (!changes || changes.length === 0) return '-';
                              return changes.map((c, i) => (
                                <div key={i} style={{ fontSize: 12, marginBottom: 2 }}>
                                  <span style={{ color: 'var(--color-text-3)' }}>{c.field}:</span>{' '}
                                  <span style={{ textDecoration: 'line-through', color: 'var(--status-danger)' }}>{String(c.from ?? '-')}</span>
                                  {' → '}
                                  <span style={{ color: 'var(--status-success)' }}>{String(c.to ?? '-')}</span>
                                </div>
                              ));
                            },
                          },
                        ]}
                        data={compareDiffs}
                        rowKey="name"
                        pagination={false}
                        size="small"
                        scroll={{ x: 600 }}
                        rowClassName={(record: any) => {
                          if (record.changeType === 'added') return 'row-diff-added';
                          if (record.changeType === 'deleted') return 'row-diff-deleted';
                          if (record.changeType === 'changed') return 'row-diff-changed';
                          return '';
                        }}
                      />
                    )}
                  </div>
                ) : !expandedArchiveId ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-4)' }}>
                    <span style={{ fontSize: 14 }}>点击左侧归档查看详情</span>
                  </div>
                ) : archiveDetailLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Spin /></div>
                ) : archiveDetail?.snapshot?.length ? (
                  <Table
                    columns={[
                      { title: 'ID', width: 56, render: (_: unknown, __: unknown, idx: number) => <span style={{ color: 'var(--color-text-3)', fontSize: 12 }}>{String(idx + 1).padStart(3, '0')}</span> },
                      { title: '阶段', width: 70, dataIndex: 'phase', render: (v: string) => v ? <Tag size="small" color={PHASE_COLOR[v] || 'default'}>{v}</Tag> : '-' },
                      { title: '活动名称', width: 180, dataIndex: 'name', render: (v: string) => (
                        <Tooltip content={v} position="tl"><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span></Tooltip>
                      )},
                      { title: '类型', width: 80, dataIndex: 'type', render: (v: string) => { const cfg = ACTIVITY_TYPE_MAP[v as keyof typeof ACTIVITY_TYPE_MAP]; return cfg ? <Tag size="small" color={cfg.color}>{cfg.label}</Tag> : v; } },
                      { title: '状态', width: 90, dataIndex: 'status', render: (v: string) => { const cfg = ACTIVITY_STATUS_MAP[v as keyof typeof ACTIVITY_STATUS_MAP]; return cfg ? <Tag size="small" color={cfg.color}>{cfg.label}</Tag> : v; } },
                      { title: '负责人', width: 110, dataIndex: 'assignees', render: (v: Array<{realName: string}>) => {
                        const text = v?.length ? v.map(u => u.realName).join(', ') : '-';
                        return <Tooltip content={text}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span></Tooltip>;
                      }},
                      { title: '计划工期', width: 90, dataIndex: 'planDuration', render: (v: number | null) => v != null ? `${v}d` : '-' },
                      { title: '计划时间', width: 170, render: (_: unknown, r: Activity) => r.planStartDate ? `${dayjs(r.planStartDate).format('YYYY-MM-DD')}${r.planEndDate ? ' ~ ' + dayjs(r.planEndDate).format('MM-DD') : ''}` : '-' },
                      { title: '实际时间', width: 170, render: (_: unknown, r: Activity) => {
                        if (!r.startDate) return '-';
                        const text = `${dayjs(r.startDate).format('YYYY-MM-DD')}${r.endDate ? ' ~ ' + dayjs(r.endDate).format('MM-DD') : ''}`;
                        const overdue = r.planEndDate && r.endDate && dayjs(r.endDate).isAfter(dayjs(r.planEndDate));
                        return <span style={overdue ? { color: 'var(--status-danger)' } : undefined}>{text}</span>;
                      }},
                      { title: '备注', width: 200, dataIndex: 'notes', render: (v: string | null) => {
                        if (!v) return '-';
                        return <Tooltip content={<div style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>{v}</div>} position="tl">
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                        </Tooltip>;
                      }},
                    ]}
                    data={archiveDetail.snapshot}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    scroll={{ x: 1216 }}
                    border={{ bodyCell: true }}
                  />
                ) : (
                  <Empty description="该归档无活动数据" style={{ padding: '40px 0' }} />
                )}
              </div>
            </div>
          )}
        </Drawer>
      </div>
    </MainLayout>
  );
};

export default ProjectDetail;
