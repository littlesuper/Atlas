import { useState, useCallback } from 'react';
import { Message } from '@arco-design/web-react';
import { projectsApi, activitiesApi, usersApi } from '../api';
import { Project, Activity, User } from '../types';

interface UseProjectDataOptions {
  projectId: string | undefined;
  snapshotId: string | undefined;
}

export function useProjectData({ projectId, snapshotId }: UseProjectDataOptions) {
  const isSnapshot = !!snapshotId;

  const [project, setProject] = useState<Project | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [criticalActivityIds, setCriticalActivityIds] = useState<string[]>([]);

  // 快照模式子 tab 数据
  const [snapshotMeta, setSnapshotMeta] = useState<{ archivedAt: string; remark?: string } | null>(null);
  const [snapshotWeeklyReports, setSnapshotWeeklyReports] = useState<any[] | null>(null);
  const [snapshotProducts, setSnapshotProducts] = useState<any[] | null>(null);
  const [snapshotRiskAssessments, setSnapshotRiskAssessments] = useState<any[] | null>(null);

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await projectsApi.get(projectId);
      setProject(res.data);
    } catch {
      Message.error('加载项目详情失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadActivities = useCallback(async () => {
    if (!projectId) return;
    setActivitiesLoading(true);
    try {
      const res = await activitiesApi.list(projectId);
      const flatten = (arr: Activity[]): Activity[] =>
        arr.flatMap((a) => [a, ...flatten(a.children || [])]);
      const flat = flatten(res.data || []).sort((a, b) => a.sortOrder - b.sortOrder);
      setActivities(flat);
    } catch {
      Message.error('加载活动列表失败');
    } finally {
      setActivitiesLoading(false);
    }
  }, [projectId]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await usersApi.list();
      setUsers(res.data.data || []);
    } catch {
      console.error('加载用户失败');
    }
  }, []);

  const loadCriticalPath = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await activitiesApi.getCriticalPath(projectId);
      setCriticalActivityIds(res.data.criticalActivityIds || []);
    } catch { /* ignore */ }
  }, [projectId]);

  const loadSnapshotData = useCallback(async () => {
    if (!snapshotId) return;
    setLoading(true);
    try {
      const res = await projectsApi.getProjectArchive(snapshotId);
      const data = res.data;
      setSnapshotMeta({ archivedAt: data.archivedAt, remark: data.remark });
      const snap = data.snapshot;
      if (snap.project) {
        setProject({
          ...snap.project,
          id: projectId || '',
          members: snap.project.members?.map((m: any) => ({ user: { id: m.userId, realName: m.realName, username: '' } })) || [],
          manager: { id: snap.project.managerId, realName: snap.project.managerName || '', username: '' },
        } as any);
      }
      if (snap.activities) {
        const flat = [...snap.activities].sort((a: any, b: any) => a.sortOrder - b.sortOrder);
        setActivities(flat);
      }
      setSnapshotProducts(snap.products || []);
      setSnapshotWeeklyReports(snap.weeklyReports || []);
      setSnapshotRiskAssessments(snap.riskAssessments || []);
    } catch {
      Message.error('加载快照数据失败');
    } finally {
      setLoading(false);
    }
  }, [snapshotId, projectId]);

  return {
    project, setProject,
    activities, setActivities,
    users,
    loading,
    activitiesLoading,
    criticalActivityIds,
    isSnapshot,
    snapshotMeta,
    snapshotWeeklyReports,
    snapshotProducts,
    snapshotRiskAssessments,
    loadProject,
    loadActivities,
    loadUsers,
    loadCriticalPath,
    loadSnapshotData,
  };
}
