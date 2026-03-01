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
  Dropdown,
  Menu,
  Alert,
} from '@arco-design/web-react';
import {
  IconLeft,
  IconPlus,
  IconEdit,
  IconDelete,
  IconDragDotVertical,
  IconUndo,
  IconUpload,
  IconDownload,
  IconNav,
  IconSafe,
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
import SchedulingTools from './SchedulingTools';
import SnapshotsTab from './SnapshotsTab';
import { Project, Activity, User } from '../../../types';
import {
  STATUS_MAP,
  PRIORITY_MAP,
  PRODUCT_LINE_MAP,
  ACTIVITY_STATUS_MAP,
  ACTIVITY_TYPE_MAP,
  DEPENDENCY_TYPE_MAP,
  PHASE_OPTIONS,
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

// 阶段颜色配置
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
  { key: 'planStartDate', label: '计划开始', removable: true },
  { key: 'planEndDate', label: '计划结束', removable: true },
  { key: 'actualStartDate', label: '实际开始', removable: true },
  { key: 'actualEndDate', label: '实际结束', removable: true },
  { key: 'actualDuration', label: '实际工期', removable: true },
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
  phase: 80,
  name: 240,
  type: 80,
  status: 100,
  assignee: 120,
  planDuration: 70,
  planStartDate: 140,
  planEndDate: 140,
  actualStartDate: 140,
  actualEndDate: 140,
  actualDuration: 80,
  notes: 300,
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

// 自动展开的 DatePicker 包装：mount 后自动 click 触发日历面板弹出
const AutoOpenDatePicker: React.FC<React.ComponentProps<typeof DatePicker> & { onDismiss: () => void }> = ({ onDismiss, ...props }) => {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const input = wrapRef.current?.querySelector('input') as HTMLElement;
      if (input) { input.focus(); input.click(); }
    }, 50);
    return () => clearTimeout(timer);
  }, []);
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!document.contains(target)) return;
      if (wrapRef.current?.contains(target)) return;
      if (target.closest('.arco-picker-dropdown, .arco-picker-panel, .arco-picker-container')) return;
      onDismiss();
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onDismiss]);
  return (
    <div ref={wrapRef} style={{ display: 'inline-block' }}>
      <DatePicker {...props} />
    </div>
  );
};

const ProjectDetail: React.FC = () => {
  const { id, snapshotId } = useParams<{ id: string; snapshotId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSnapshot = !!snapshotId;
  const [snapshotMeta, setSnapshotMeta] = useState<{ archivedAt: string; remark?: string } | null>(null);
  // 快照模式下子 tab 的数据
  const [snapshotWeeklyReports, setSnapshotWeeklyReports] = useState<any[] | null>(null);
  const [snapshotProducts, setSnapshotProducts] = useState<any[] | null>(null);
  const [snapshotRiskAssessments, setSnapshotRiskAssessments] = useState<any[] | null>(null);
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

  // Excel 导入
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 活动列表表头吸顶
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const [theadFixed, setTheadFixed] = useState(false);
  const [theadFixedPos, setTheadFixedPos] = useState({ left: 0, width: 0, height: 0 });

  // 协作者管理
  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [pendingMemberIds, setPendingMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');

  // 单击内联编辑
  const [inlineEditing, setInlineEditing] = useState<{ id: string; field: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);
  const [inlineValue, setInlineValue] = useState<string>('');

  // 列偏好设置
  const [columnPrefs, setColumnPrefs] = useState<ColumnPrefs>(DEFAULT_COLUMN_PREFS);

  // 批量操作
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 关键路径
  const [criticalActivityIds, setCriticalActivityIds] = useState<string[]>([]);
  // 归档标签 & 对比
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importUploading, setImportUploading] = useState(false);

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

  const isArchived = project?.status === 'ARCHIVED' || isSnapshot;

  const handleArchiveProject = async () => {
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
  };

  const handleUnarchiveProject = async () => {
    if (!id) return;
    try {
      await projectsApi.unarchiveProject(id);
      Message.success('已取消归档');
      loadProject();
    } catch {
      Message.error('取消归档失败');
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
          if (!order.includes(key)) {
            // If the key is not 'notes', and 'notes' is currently the last element of the order array,
            // we should insert it BEFORE 'notes' to keep 'notes' at the end.
            if (key !== 'notes' && order[order.length - 1] === 'notes') {
              order.splice(order.length - 1, 0, key);
            } else {
              order.push(key);
            }
          }
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

  const openMembersModal = () => {
    setPendingMemberIds(project?.members?.map((m) => m.user.id) || []);
    setMemberSearch('');
    setMembersModalVisible(true);
  };

  const handleMembersConfirm = async () => {
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
  };

  const loadCriticalPath = async () => {
    if (!id) return;
    try {
      const res = await activitiesApi.getCriticalPath(id);
      setCriticalActivityIds(res.data.criticalActivityIds || []);
    } catch { /* ignore */ }
  };

  // 快照模式：从快照 API 加载全量数据
  const loadSnapshotData = async () => {
    if (!snapshotId) return;
    setLoading(true);
    try {
      const res = await projectsApi.getProjectArchive(snapshotId);
      const data = res.data;
      setSnapshotMeta({ archivedAt: data.archivedAt, remark: data.remark });
      const snap = data.snapshot;
      // 填充项目信息（映射为 Project 类型的关键字段）
      if (snap.project) {
        setProject({
          ...snap.project,
          id: id || '',
          members: snap.project.members?.map((m: any) => ({ user: { id: m.userId, realName: m.realName, username: '' } })) || [],
          manager: { id: snap.project.managerId, realName: snap.project.managerName || '', username: '' },
        } as any);
      }
      // 填充活动列表
      if (snap.activities) {
        const flat = [...snap.activities].sort((a: any, b: any) => a.sortOrder - b.sortOrder);
        setActivities(flat);
      }
      // 存储子 tab 快照数据
      setSnapshotProducts(snap.products || []);
      setSnapshotWeeklyReports(snap.weeklyReports || []);
      setSnapshotRiskAssessments(snap.riskAssessments || []);
    } catch {
      Message.error('加载快照数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSnapshot) {
      // 快照模式下强制切到活动列表（排期工具/项目快照 tab 在快照模式下隐藏）
      setActiveTab('activities');
      loadSnapshotData();
      loadColumnPrefs();
    } else {
      // 从快照返回时，根据 URL 参数恢复 tab（React 组件复用时 useState 初始值不重新执行）
      const tabFromUrl = searchParams.get('tab');
      if (tabFromUrl) setActiveTab(tabFromUrl);
      loadProject();
      loadActivities();
      loadUsers();
      loadColumnPrefs();
      loadCriticalPath();
    }
  }, [id, snapshotId]);

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

  // 用活动数据填充表单
  const populateFormFromActivity = (activity: Activity) => {
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
    const rawDeps = activity.dependencies;
    const deps = Array.isArray(rawDeps)
      ? rawDeps
      : (() => { try { return JSON.parse(rawDeps as unknown as string) as typeof rawDeps; } catch { return []; } })();
    setFormDeps((deps || []).map((d) => ({ id: d.id, type: d.type, lag: d.lag ?? 0 })));
  };

  // 导出活动列表为 CSV（客户端生成，Chrome 不会阻止 .csv 下载）
  const handleExportExcel = () => {
    if (!activities.length) { Message.warning('暂无活动数据'); return; }

    const statusMap: Record<string, string> = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', COMPLETED: '已完成', CANCELLED: '已取消' };
    const typeMap: Record<string, string> = { TASK: '任务', MILESTONE: '里程碑', PHASE: '阶段' };
    const depTypeMap: Record<string, string> = { '0': 'FS', '1': 'SS', '2': 'FF', '3': 'SF' };
    const fmtDate = (d?: string | null) => d ? dayjs(d).format('YYYY-MM-DD') : '';

    const formatDeps = (act: Activity): string => {
      if (!act.dependencies) return '';
      const deps = Array.isArray(act.dependencies) ? act.dependencies
        : (() => { try { return JSON.parse(act.dependencies as unknown as string); } catch { return []; } })();
      return deps.map((dep: { id: string; type: string; lag?: number }) => {
        const seq = activitySeqMap.get(dep.id);
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
      (a.assignees || []).map((u: any) => u.realName).join(', '),
      a.planDuration != null ? String(a.planDuration) : '',
      fmtDate(a.planStartDate),
      fmtDate(a.planEndDate),
      fmtDate(a.startDate),
      fmtDate(a.endDate),
      a.notes || '',
    ]);

    const escapeCsv = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
    const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
    // BOM 头确保 WPS/Excel 正确识别 UTF-8 中文
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || '项目'}_活动列表_${dayjs().format('YYYY-MM-DD')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 导入 Excel 核心逻辑
  const doImportFile = async (file: File) => {
    if (!id) return;
    setImportUploading(true);
    try {
      const { data } = await activitiesApi.importExcel(id, file);
      const importedIds = (data.activities || []).map((a: any) => a.id);
      const msg = `导入成功，共 ${data.count} 条活动${data.skipped ? `，跳过 ${data.skipped} 条重复` : ''}`;
      Message.success({
        id: 'import-excel-undo',
        content: (
          <span>
            {msg}
            {importedIds.length > 0 && (
              <a
                style={{ marginLeft: 8, cursor: 'pointer' }}
                onClick={async () => {
                  Message.clear();
                  Message.loading('正在撤销...');
                  try {
                    await activitiesApi.undoImport(id!, importedIds);
                    Message.clear();
                    Message.success('已撤销导入');
                    loadActivities();
                    loadProject();
                  } catch {
                    Message.clear();
                  }
                }}
              >
                <IconUndo style={{ marginRight: 2, fontSize: 12 }} />撤销
              </a>
            )}
          </span>
        ),
        duration: 8000,
      });
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
  };

  // 从 <input type="file"> 触发导入（新建抽屉中使用）
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    doImportFile(file);
  };

  const handleOpenDrawer = (activity?: Activity) => {
    if (activity) {
      setEditingActivity(activity);
      populateFormFromActivity(activity);
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
        // 保存更新前的原始数据，用于撤回
        const snapshot = { ...editingActivity };
        await activitiesApi.update(editingActivity.id, data);
        Message.success({
          id: 'activity-update-undo',
          content: (
            <span>
              活动更新成功{' '}
              <a
                style={{ marginLeft: 8 }}
                onClick={async () => {
                  try {
                    await activitiesApi.update(snapshot.id, {
                      name: snapshot.name,
                      description: snapshot.description,
                      type: snapshot.type,
                      phase: snapshot.phase,
                      status: snapshot.status,
                      priority: snapshot.priority,
                      planStartDate: snapshot.planStartDate ? dayjs(snapshot.planStartDate).format('YYYY-MM-DD') : undefined,
                      planEndDate: snapshot.planEndDate ? dayjs(snapshot.planEndDate).format('YYYY-MM-DD') : undefined,
                      planDuration: snapshot.planDuration ?? undefined,
                      startDate: snapshot.startDate ? dayjs(snapshot.startDate).format('YYYY-MM-DD') : undefined,
                      endDate: snapshot.endDate ? dayjs(snapshot.endDate).format('YYYY-MM-DD') : undefined,
                      duration: snapshot.duration ?? undefined,
                      assigneeIds: snapshot.assignees?.map((a) => a.id) ?? [],
                      notes: snapshot.notes,
                      dependencies: Array.isArray(snapshot.dependencies)
                        ? snapshot.dependencies.map((d) => ({ id: d.id, type: d.type, lag: d.lag ?? 0 }))
                        : undefined,
                    });
                    Message.success('已撤回修改');
                    loadActivities();
                    loadProject();
                  } catch {
                    Message.error('撤回失败');
                  }
                }}
              >
                <IconUndo style={{ marginRight: 2, fontSize: 12 }} />撤回修改
              </a>
            </span>
          ),
          duration: 5000,
        });
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

  // 活动快照 → 创建参数
  const activityToCreatePayload = (s: Activity) => ({
    projectId: s.projectId,
    name: s.name,
    description: s.description,
    type: s.type,
    phase: s.phase,
    status: s.status,
    priority: s.priority,
    planStartDate: s.planStartDate || undefined,
    planEndDate: s.planEndDate || undefined,
    planDuration: s.planDuration ?? undefined,
    startDate: s.startDate || undefined,
    endDate: s.endDate || undefined,
    duration: s.duration ?? undefined,
    assigneeIds: s.assignees?.map(a => a.id) || [],
    notes: s.notes || undefined,
    sortOrder: s.sortOrder,
    dependencies: Array.isArray(s.dependencies)
      ? s.dependencies.map(d => ({ id: d.id, type: d.type, lag: d.lag ?? 0 }))
      : undefined,
  });

  // 删除活动（支持撤销）
  const handleDeleteActivity = (activity: Activity) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除活动"${activity.name}"吗？`,
      onOk: async () => {
        try {
          const snapshot = { ...activity };
          await activitiesApi.delete(activity.id);
          loadActivities();
          loadProject();
          Message.success({
            id: 'delete-undo',
            content: (
              <span>
                已删除活动「{snapshot.name}」{' '}
                <a
                  style={{ marginLeft: 8, cursor: 'pointer' }}
                  onClick={async () => {
                    Message.clear();
                    Message.loading('正在撤销...');
                    try {
                      await activitiesApi.create(activityToCreatePayload(snapshot));
                      Message.clear();
                      Message.success('已撤销删除');
                      loadActivities();
                      loadProject();
                    } catch {
                      Message.clear();
                      Message.error('撤销失败');
                    }
                  }}
                >
                  <IconUndo style={{ marginRight: 2, fontSize: 12 }} />撤销
                </a>
              </span>
            ),
            duration: 5000,
          });
        } catch {
          Message.error('活动删除失败');
        }
      },
    });
  };

  // ========== 归档快照操作 ==========
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
      await activitiesApi.reorder(id, reordered.map((a, i) => ({ id: a.id, sortOrder: (i + 1) * 10 })));
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


  // ========== 单击内联编辑 ==========
  // 全局点击外部关闭内联编辑（解决 DatePicker 等组件点击空白不取消的问题）
  useEffect(() => {
    if (!inlineEditing) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 忽略已经被从 DOM 中移除的元素（如点击 DatePicker 的某一天后该天可能会被重新渲染而脱离 DOM）
      if (!document.contains(target)) return;
      // 忽略弹出层内的点击（DatePicker / Select popup 渲染到 body）
      if (target.closest('.arco-picker-dropdown, .arco-picker-range-wrapper, .arco-picker-panel, .arco-select-popup, .arco-picker, .arco-select, .arco-input-wrapper, .arco-input-number, .arco-picker-container')) return;
      // 对于原生 Input / InputNumber，让它们自己的 onBlur 去处理保存，防止组件被提前卸载导致 blur 丢失
      if (['name', 'notes', 'planDuration'].includes(inlineEditing.field)) return;

      setInlineEditing(null);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInlineEditing(null);
      }
    };
    // 延迟注册，避免触发编辑的那次点击立刻关闭
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler, true);
    }, 0);
    document.addEventListener('keydown', keyHandler, true);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler, true); document.removeEventListener('keydown', keyHandler, true); };
  }, [inlineEditing]);

  const startInlineEdit = (activityId: string, field: string, currentValue: string) => {
    if (isArchived || !(hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id))) return;
    setInlineEditing({ id: activityId, field });
    setInlineValue(currentValue);
  };

  // 统一的"更新成功 + 撤回"提示
  const showUndoMessage = (activityId: string, rollbackPayload: Record<string, unknown>) => {
    Message.success({
      id: 'activity-update-undo',
      content: (
        <span>
          更新成功{' '}
          <a
            onClick={async () => {
              try {
                await activitiesApi.update(activityId, rollbackPayload);
                Message.clear();
                Message.success('已撤回');
                loadActivities();
                loadProject();
              } catch {
                Message.error('撤回失败');
              }
            }}
            style={{ marginLeft: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
          >
            <IconUndo style={{ marginRight: 2, fontSize: 12 }} />撤回修改
          </a>
        </span>
      ),
      duration: 5000,
    });
  };

  const commitInlineEdit = async (activity: Activity, field: string) => {
    setInlineEditing(null);
    const original = (activity as unknown as Record<string, unknown>)[field] as string;
    if (inlineValue === original || inlineValue === (original ?? '')) return;
    try {
      await activitiesApi.update(activity.id, { [field]: inlineValue || undefined });
      setActivities((prev) => prev.map((a) => a.id === activity.id ? { ...a, [field]: inlineValue } : a));
      showUndoMessage(activity.id, { [field]: original ?? undefined });
    } catch {
      Message.error('更新失败');
    }
  };

  const commitSelectEdit = async (activity: Activity, field: string, value: string) => {
    setInlineEditing(null);
    const oldValue = (activity as unknown as Record<string, unknown>)[field] as string;
    try {
      await activitiesApi.update(activity.id, { [field]: value });
      setActivities((prev) => prev.map((a) => a.id === activity.id ? { ...a, [field]: value } : a));
      showUndoMessage(activity.id, { [field]: oldValue });
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
      content: `确定要删除选中的 ${selectedIds.size} 个活动吗？`,
      onOk: async () => {
        try {
          const snapshots = activities.filter(a => selectedIds.has(a.id)).map(a => ({ ...a }));
          const count = selectedIds.size;
          await activitiesApi.batchDelete(Array.from(selectedIds));
          setSelectedIds(new Set());
          loadActivities();
          loadProject();
          Message.success({
            id: 'batch-delete-undo',
            content: (
              <span>
                已删除 {count} 个活动{' '}
                <a
                  style={{ marginLeft: 8, cursor: 'pointer' }}
                  onClick={async () => {
                    Message.clear();
                    Message.loading('正在撤销...');
                    try {
                      await activitiesApi.batchCreate(snapshots.map(activityToCreatePayload));
                      Message.clear();
                      Message.success(`已撤销删除 ${count} 个活动`);
                      loadActivities();
                      loadProject();
                    } catch {
                      Message.clear();
                      Message.error('撤销失败');
                    }
                  }}
                >
                  <IconUndo style={{ marginRight: 2, fontSize: 12 }} />撤销
                </a>
              </span>
            ),
            duration: 8000,
          });
        } catch { Message.error('批量删除失败'); }
      },
    });
  };

  // 归档对比
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
    if (activity.planStartDate) {
      const endDate = addWorkdays(dayjs(activity.planStartDate), newDur);
      payload.planEndDate = endDate.format('YYYY-MM-DD');
    }
    const rollback: Record<string, unknown> = { planDuration: oldDur };
    if (activity.planEndDate) {
      rollback.planEndDate = dayjs(activity.planEndDate).format('YYYY-MM-DD');
    }
    try {
      await activitiesApi.update(activity.id, payload);
      loadActivities();
      showUndoMessage(activity.id, rollback);
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
    const oldDeps = Array.isArray(activity.dependencies)
      ? activity.dependencies.map((d) => ({ id: d.id, type: d.type, lag: d.lag ?? 0 }))
      : null;
    try {
      await activitiesApi.update(activity.id, { dependencies: deps.length > 0 ? deps : null });
      loadActivities();
      showUndoMessage(activity.id, { dependencies: oldDeps });
    } catch {
      Message.error('更新失败');
    }
  };

  const dateFmt = (d?: string | null) => d ? dayjs(d).format('YY年MM月DD日') : '-';

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
            onClick={() => startInlineEdit(record.id, 'predecessor', text)}
          >
            {text || '-'}
          </span>
        );
      },
    },
    phase: {
      title: '阶段',
      width: 80,
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
            style={{ cursor: !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onClick={() => !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) && setInlineEditing({ id: record.id, field: 'phase' })}
          >
            {record.phase ? <Tag color={PHASE_COLOR[record.phase] || 'default'}>{record.phase}</Tag> : <span style={{ color: 'var(--color-text-4)' }}>-</span>}
          </span>
        );
      },
    },
    name: {
      title: '活动名称',
      width: 200,
      dataIndex: 'name',
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
            style={{ fontWeight: 500, cursor: !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => startInlineEdit(record.id, 'name', name)}
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
            style={{ cursor: !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onClick={() => !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) && setInlineEditing({ id: record.id, field: 'type' })}
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
            style={{ cursor: !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onClick={() => !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) && setInlineEditing({ id: record.id, field: 'status' })}
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
              showSearch
              filterOption={(input, option) =>
                (option?.props?.children as string)?.toLowerCase().includes(input.toLowerCase())
              }
              style={{ width: 160 }}
              value={record.assignees?.map((a) => a.id) ?? []}
              onDismiss={() => {
                setInlineEditing(null);
              }}
              onChange={(v: string[]) => {
                setInlineEditing(null);
                const oldIds = record.assignees?.map((a) => a.id) ?? [];
                activitiesApi.update(record.id, { assigneeIds: v }).then(() => {
                  loadActivities();
                  showUndoMessage(record.id, { assigneeIds: oldIds });
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
            style={{ cursor: !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onClick={() => !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) && setInlineEditing({ id: record.id, field: 'assigneeIds' })}
          >
            {names}
          </span>
        );
      },
    },
    planDuration: {
      title: '计划工期',
      width: 80,
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
            style={{ cursor: !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onClick={() => startInlineEdit(record.id, 'planDuration', days != null ? String(days) : '')}
          >
            {days != null ? <>{days}<span style={{ fontSize: 12, color: 'var(--color-text-3)', paddingLeft: 2 }}>天</span></> : <span style={{ color: 'var(--color-text-4)' }}>-</span>}
          </span>
        );
      },
    },
    planStartDate: {
      title: '计划开始',
      width: 140,
      render: (_: unknown, record: Activity) => {
        const hasDeps = record.dependencies && (Array.isArray(record.dependencies) ? record.dependencies.length > 0 : (() => { try { const d = JSON.parse(record.dependencies as unknown as string); return Array.isArray(d) && d.length > 0; } catch { return false; } })());
        if (inlineEditing?.id === record.id && inlineEditing.field === 'planStartDate') {
          return (
            <AutoOpenDatePicker
              size="small"
              style={{ width: 130 }}
              format="YYYY-MM-DD"
              value={record.planStartDate ? dayjs(record.planStartDate) : undefined}
              onDismiss={() => setInlineEditing(null)}
              onChange={(dateStr) => {
                if (dateStr) {
                  const startVal = dayjs(dateStr).format('YYYY-MM-DD');
                  const payload: Record<string, unknown> = { planStartDate: startVal };
                  if (record.planEndDate) {
                    payload.planDuration = calcWorkdays(dayjs(startVal), dayjs(record.planEndDate));
                  }
                  const rollback: Record<string, unknown> = { planStartDate: record.planStartDate || undefined };
                  if (record.planEndDate) rollback.planDuration = record.planDuration ?? undefined;
                  activitiesApi.update(record.id, payload).then(() => { loadActivities(); setInlineEditing(null); showUndoMessage(record.id, rollback); });
                } else {
                  const rollback: Record<string, unknown> = { planStartDate: record.planStartDate || undefined, planDuration: record.planDuration ?? undefined };
                  activitiesApi.update(record.id, { planStartDate: undefined, planDuration: undefined }).then(() => { loadActivities(); setInlineEditing(null); showUndoMessage(record.id, rollback); });
                }
              }}
            />
          );
        }
        return (
          <span
            style={{ whiteSpace: 'nowrap', cursor: !hasDeps && !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onClick={() => {
              if (hasDeps) { Message.info('已设置前置依赖，计划时间由系统自动计算'); return; }
              if (!isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id))
                setInlineEditing({ id: record.id, field: 'planStartDate' });
            }}
          >
            {dateFmt(record.planStartDate)}
          </span>
        );
      },
    },
    planEndDate: {
      title: '计划结束',
      width: 140,
      render: (_: unknown, record: Activity) => {
        const hasDeps = record.dependencies && (Array.isArray(record.dependencies) ? record.dependencies.length > 0 : (() => { try { const d = JSON.parse(record.dependencies as unknown as string); return Array.isArray(d) && d.length > 0; } catch { return false; } })());
        const isOverdue = record.planEndDate && record.status !== 'COMPLETED' && dayjs(record.planEndDate).isBefore(dayjs(), 'day');
        if (inlineEditing?.id === record.id && inlineEditing.field === 'planEndDate') {
          return (
            <AutoOpenDatePicker
              size="small"
              style={{ width: 130 }}
              format="YYYY-MM-DD"
              value={record.planEndDate ? dayjs(record.planEndDate) : undefined}
              onDismiss={() => setInlineEditing(null)}
              onChange={(dateStr) => {
                if (dateStr) {
                  const endVal = dayjs(dateStr).format('YYYY-MM-DD');
                  const payload: Record<string, unknown> = { planEndDate: endVal };
                  if (record.planStartDate) {
                    payload.planDuration = calcWorkdays(dayjs(record.planStartDate), dayjs(endVal));
                  }
                  const rollback: Record<string, unknown> = { planEndDate: record.planEndDate || undefined };
                  if (record.planStartDate) rollback.planDuration = record.planDuration ?? undefined;
                  activitiesApi.update(record.id, payload).then(() => { loadActivities(); setInlineEditing(null); showUndoMessage(record.id, rollback); });
                } else {
                  const rollback: Record<string, unknown> = { planEndDate: record.planEndDate || undefined, planDuration: record.planDuration ?? undefined };
                  activitiesApi.update(record.id, { planEndDate: undefined, planDuration: undefined }).then(() => { loadActivities(); setInlineEditing(null); showUndoMessage(record.id, rollback); });
                }
              }}
            />
          );
        }
        return (
          <span
            style={{ whiteSpace: 'nowrap', color: isOverdue ? 'var(--status-danger)' : undefined, cursor: !hasDeps && !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onClick={() => {
              if (hasDeps) { Message.info('已设置前置依赖，计划时间由系统自动计算'); return; }
              if (!isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id))
                setInlineEditing({ id: record.id, field: 'planEndDate' });
            }}
          >
            {dateFmt(record.planEndDate)}
          </span>
        );
      },
    },
    actualStartDate: {
      title: '实际开始',
      width: 140,
      render: (_: unknown, record: Activity) => {
        if (inlineEditing?.id === record.id && inlineEditing.field === 'actualStartDate') {
          return (
            <AutoOpenDatePicker
              size="small"
              style={{ width: 130 }}
              format="YYYY-MM-DD"
              value={record.startDate ? dayjs(record.startDate) : undefined}
              onDismiss={() => setInlineEditing(null)}
              onChange={(dateStr) => {
                if (dateStr) {
                  const startVal = dayjs(dateStr).format('YYYY-MM-DD');
                  const payload: Record<string, unknown> = { startDate: startVal };
                  if (record.endDate) {
                    payload.duration = calcWorkdays(dayjs(startVal), dayjs(record.endDate));
                  }
                  const rollback: Record<string, unknown> = { startDate: record.startDate || undefined };
                  if (record.endDate) rollback.duration = record.duration ?? undefined;
                  activitiesApi.update(record.id, payload).then(() => { loadActivities(); setInlineEditing(null); showUndoMessage(record.id, rollback); });
                } else {
                  const rollback: Record<string, unknown> = { startDate: record.startDate || undefined, duration: record.duration ?? undefined };
                  activitiesApi.update(record.id, { startDate: undefined, duration: undefined }).then(() => { loadActivities(); setInlineEditing(null); showUndoMessage(record.id, rollback); });
                }
              }}
            />
          );
        }
        return (
          <span
            style={{ whiteSpace: 'nowrap', cursor: !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onClick={() => {
              if (!isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id))
                setInlineEditing({ id: record.id, field: 'actualStartDate' });
            }}
          >
            {dateFmt(record.startDate)}
          </span>
        );
      },
    },
    actualEndDate: {
      title: '实际结束',
      width: 140,
      render: (_: unknown, record: Activity) => {
        const isOverdue = record.planEndDate && record.endDate && dayjs(record.endDate).isAfter(dayjs(record.planEndDate), 'day');
        if (inlineEditing?.id === record.id && inlineEditing.field === 'actualEndDate') {
          return (
            <AutoOpenDatePicker
              size="small"
              style={{ width: 130 }}
              format="YYYY-MM-DD"
              value={record.endDate ? dayjs(record.endDate) : undefined}
              onDismiss={() => setInlineEditing(null)}
              onChange={(dateStr) => {
                if (dateStr) {
                  const endVal = dayjs(dateStr).format('YYYY-MM-DD');
                  const payload: Record<string, unknown> = { endDate: endVal };
                  if (record.startDate) {
                    payload.duration = calcWorkdays(dayjs(record.startDate), dayjs(endVal));
                  }
                  const rollback: Record<string, unknown> = { endDate: record.endDate || undefined };
                  if (record.startDate) rollback.duration = record.duration ?? undefined;
                  activitiesApi.update(record.id, payload).then(() => { loadActivities(); setInlineEditing(null); showUndoMessage(record.id, rollback); });
                } else {
                  const rollback: Record<string, unknown> = { endDate: record.endDate || undefined, duration: record.duration ?? undefined };
                  activitiesApi.update(record.id, { endDate: undefined, duration: undefined }).then(() => { loadActivities(); setInlineEditing(null); showUndoMessage(record.id, rollback); });
                }
              }}
            />
          );
        }
        return (
          <span
            style={{ whiteSpace: 'nowrap', color: isOverdue ? 'var(--status-danger)' : undefined, cursor: !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default' }}
            onClick={() => {
              if (!isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id))
                setInlineEditing({ id: record.id, field: 'actualEndDate' });
            }}
          >
            {dateFmt(record.endDate)}
          </span>
        );
      },
    },
    actualDuration: {
      title: '实际工期',
      width: 80,
      render: (_: unknown, record: Activity) => {
        const days = record.startDate && record.endDate ? calcWorkdays(dayjs(record.startDate), dayjs(record.endDate)) : record.duration;
        return (
          <span>
            {days != null ? <>{days}<span style={{ fontSize: 12, color: 'var(--color-text-3)', paddingLeft: 2 }}>天</span></> : <span style={{ color: 'var(--color-text-4)' }}>-</span>}
          </span>
        );
      },
    },
    notes: {
      title: '备注',
      dataIndex: 'notes',
      width: 300,
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
                cursor: !isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) ? 'pointer' : 'default',
                maxWidth: 120,
                display: 'inline-block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: notes ? undefined : 'var(--color-text-4)',
              }}
              onClick={() => startInlineEdit(record.id, 'notes', notes || '')}
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
    const canManage = hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) && !isArchived;
    const canCreate = hasPermission('activity', 'create') && isProjectManager(project?.managerId ?? '', project?.id) && !isArchived;

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
      align: 'center' as const,
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
        <Space size={4}>
          {!isArchived && hasPermission('activity', 'update') && isProjectManager(project?.managerId ?? '', project?.id) && (
            <Tooltip content="编辑">
              <IconEdit style={{ cursor: 'pointer', color: 'rgb(var(--primary-6))' }} onClick={() => handleOpenDrawer(record)} />
            </Tooltip>
          )}
          {!isArchived && hasPermission('activity', 'delete') && isProjectManager(project?.managerId ?? '', project?.id) && (
            <Tooltip content="删除">
              <IconDelete style={{ cursor: 'pointer', color: 'rgb(var(--danger-6))' }} onClick={() => handleDeleteActivity(record)} />
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
    return dynamicWidth + 36 + 50 + 100; // checkbox(36) + drag(50) + actions(100)
  }, [columnPrefs]);

  if (loading || !project) {
    return <MainLayout>加载中...</MainLayout>;
  }

  const statusConfig = STATUS_MAP[project.status as keyof typeof STATUS_MAP] ?? { label: project.status, color: 'default' };
  const priorityConfig = PRIORITY_MAP[project.priority as keyof typeof PRIORITY_MAP] ?? { label: project.priority, color: 'default' };
  const productLineConfig = PRODUCT_LINE_MAP[project.productLine as keyof typeof PRODUCT_LINE_MAP] ?? { label: project.productLine, color: 'default' };

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
            {/* 第一行：返回 + 项目名称 + 状态 + 产品线 + 优先级 + 归档按钮 */}
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
                        <Button type="text" size="mini" onClick={openMembersModal} style={{ padding: '0 4px' }}>管理</Button>
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

        {/* 归档只读提示（快照模式有自己的横幅，不显示此条） */}
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
                        {!isArchived && hasPermission('activity', 'create') && isProjectManager(project?.managerId ?? '', project?.id) && (
                          <Menu.Item key="1" onClick={() => handleOpenDrawer()}>
                            <IconPlus style={{ marginRight: 8 }} />
                            新建活动
                          </Menu.Item>
                        )}
                        {!isArchived && hasPermission('activity', 'create') && isProjectManager(project?.managerId ?? '', project?.id) && (
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
                  <ColumnSettings
                    columnDefs={ACTIVITY_COLUMN_DEFS}
                    prefs={columnPrefs}
                    onChange={saveColumnPrefs}
                    defaultPrefs={DEFAULT_COLUMN_PREFS}
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
                {/* 自定义表格行（支持拖拽） */}
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
                  components={{
                    body: {
                      row: ({ children, record, index, ...rest }: { children: React.ReactNode; record: Activity; index: number;[key: string]: unknown }) => {
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
              {id && <RiskAssessmentTab projectId={id} isArchived={isArchived} snapshotData={snapshotRiskAssessments} />}
            </Tabs.TabPane>

            {/* 产品列表 */}
            <Tabs.TabPane key="products" title="产品列表">
              {id && <ProductsTab projectId={id} isArchived={isArchived} snapshotData={snapshotProducts} />}
            </Tabs.TabPane>

            {/* 项目周报 */}
            <Tabs.TabPane key="weekly" title="项目周报">
              {id && <ProjectWeeklyTab projectId={id} managerId={project?.managerId} isArchived={isArchived} snapshotData={snapshotWeeklyReports} />}
            </Tabs.TabPane>

            {/* 排期工具（快照模式隐藏） */}
            {!isSnapshot && (
              <Tabs.TabPane key="scheduling" title="排期工具">
                {id && (
                  <SchedulingTools
                    projectId={id}
                    activities={activities}
                    onRefresh={loadActivities}
                    isArchived={isArchived}
                  />
                )}
              </Tabs.TabPane>
            )}

            {/* 项目快照（快照模式隐藏） */}
            {!isSnapshot && (
              <Tabs.TabPane key="snapshots" title="项目快照">
                {id && <SnapshotsTab projectId={id} managerId={project?.managerId} isArchived={isArchived} />}
              </Tabs.TabPane>
            )}
          </Tabs>
        </Card>

        {/* 新建/编辑活动抽屉 */}
        <Drawer
          width={700}
          title={editingActivity ? '编辑活动' : '新建活动'}
          visible={drawerVisible}
          onCancel={() => { insertAtIndexRef.current = null; setDrawerVisible(false); }}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {!editingActivity && (
                  <>
                    <Button icon={<IconUpload />} onClick={() => fileInputRef.current?.click()}>
                      批量导入
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      style={{ display: 'none' }}
                      onChange={handleImportExcel}
                    />
                  </>
                )}
              </div>
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
                      {u.realName}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </div>

            {/* 分隔线 */}
            <div style={{ borderTop: '1px solid var(--color-border-2)', margin: '4px 0 16px' }} />

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
              <Form.Item label="计划工期(天)">
                <InputNumber
                  min={1}
                  value={planDuration ?? undefined}
                  onChange={(v) => handlePlanChange('dur', v ?? null)}
                  placeholder="计划工期"
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
              <Form.Item label="实际工期(天)">
                <InputNumber
                  min={1}
                  value={actualDuration ?? undefined}
                  onChange={(v) => handleActualChange('dur', v ?? null)}
                  placeholder="实际工期"
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
          onOk={handleMembersConfirm}
          okText="确定"
          cancelText="取消"
          confirmLoading={membersLoading}
          style={{ maxWidth: 480 }}
        >
          {/* 已选成员标签 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 8 }}>
              当前协作者（{pendingMemberIds.length} 人）
            </div>
            {pendingMemberIds.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {pendingMemberIds.map((uid) => {
                  const u = users.find((u) => u.id === uid);
                  return (
                    <Tag
                      key={uid}
                      closable
                      onClose={() => setPendingMemberIds(pendingMemberIds.filter((id) => id !== uid))}
                      style={{ margin: 0 }}
                    >
                      {u?.realName || uid}
                    </Tag>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--color-text-4)' }}>暂无协作者，从下方搜索添加</div>
            )}
          </div>

          {/* 搜索添加 */}
          <div>
            <div style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 8 }}>添加成员</div>
            <Input
              placeholder="搜索姓名或用户名..."
              allowClear
              value={memberSearch}
              onChange={setMemberSearch}
              style={{ marginBottom: 8 }}
            />
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {users
                .filter((u) => u.id !== project?.managerId && !pendingMemberIds.includes(u.id))
                .filter((u) => {
                  if (!memberSearch) return true;
                  const kw = memberSearch.toLowerCase();
                  return u.realName.toLowerCase().includes(kw) || (u.username || '').toLowerCase().includes(kw);
                })
                .map((u) => (
                  <div
                    key={u.id}
                    onClick={() => { setPendingMemberIds([...pendingMemberIds, u.id]); setMemberSearch(''); }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 8px', borderRadius: 6, cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-fill-2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span>
                      <span style={{ fontWeight: 500 }}>{u.realName}</span>
                      {u.username && <span style={{ color: 'var(--color-text-3)', marginLeft: 6, fontSize: 13 }}>{u.username}</span>}
                    </span>
                    <IconPlus style={{ color: 'var(--color-text-3)', fontSize: 12 }} />
                  </div>
                ))}
              {users.filter((u) => u.id !== project?.managerId && !pendingMemberIds.includes(u.id)).filter((u) => {
                if (!memberSearch) return true;
                const kw = memberSearch.toLowerCase();
                return u.realName.toLowerCase().includes(kw) || (u.username || '').toLowerCase().includes(kw);
              }).length === 0 && (
                  <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--color-text-4)', fontSize: 13 }}>
                    {memberSearch ? '无匹配用户' : '所有用户已添加'}
                  </div>
                )}
            </div>
          </div>
        </Modal>

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
              input.accept = '.xlsx,.xls';
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
                  或点击选择文件（.xlsx / .xls，最大 5MB）
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

export default ProjectDetail;
