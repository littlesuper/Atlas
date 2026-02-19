import { useAuthStore } from '../store/authStore';
import { WeeklyReport } from '../types';

/**
 * 周报权限判断 hook
 * 统一 "当前用户是否可以编辑/删除某份周报" 的逻辑，
 * 避免在 index.tsx / ProjectWeeklyTab.tsx / Form.tsx 各自重复实现。
 */
export function useReportPermission() {
  const user = useAuthStore((s) => s.user);
  const { hasPermission } = useAuthStore();

  /** 是否可编辑（创建人 / 项目经理 / 协作者 / 管理员） */
  const canEdit = (report: WeeklyReport) => {
    if (!user) return false;
    if (user.permissions?.includes('*:*')) return true;
    if (report.createdBy === user.id) return true;
    const managerId = report.project?.managerId;
    if (managerId && managerId === user.id) return true;
    if (user.collaboratingProjectIds?.includes(report.projectId)) return true;
    return false;
  };

  /** 是否可删除（需额外 weekly_report:delete 权限） */
  const canDelete = (report: WeeklyReport) => {
    return canEdit(report) && hasPermission('weekly_report', 'delete');
  };

  return { canEdit, canDelete };
}
