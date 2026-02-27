import request from './request';
import {
  User,
  Role,
  Permission,
  Project,
  Activity,
  ActivityArchive,
  ActivityComment,
  Notification,
  Product,
  ProductChangeLog,
  WeeklyReport,
  ReportAttachment,
  AiConfig,
  AiUsageStats,
  AuditLog,
  WecomConfig,
  ProjectTemplate,
  TemplateActivity,
  ResourceConflict,
  WhatIfResult,
  AiScheduleSuggestion,
} from '../types';

// 分页响应结构
interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ============ 认证 API ============
export const authApi = {
  login: (data: { username: string; password: string }) =>
    request.post<{ accessToken: string; refreshToken: string; user: User }>('/auth/login', data),

  refresh: (refreshToken: string) =>
    request.post<{ accessToken: string }>('/auth/refresh', { refreshToken }),

  getMe: () => request.get<User>('/auth/me'),

  updateProfile: (data: { realName?: string }) =>
    request.put<Pick<User, 'id' | 'username' | 'realName'>>('/auth/profile', data),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    request.post<{ success: boolean; message: string }>('/auth/change-password', data),

  getWecomConfig: () =>
    request.get<{ enabled: boolean; corpId?: string; agentId?: string; redirectUri?: string; state?: string }>('/auth/wecom/config'),

  wecomLogin: (data: { code: string }) =>
    request.post<{ accessToken: string; refreshToken: string; user: User }>('/auth/wecom/login', data),

  getPreferences: () =>
    request.get<Record<string, unknown>>('/auth/preferences'),

  updatePreferences: (preferences: Record<string, unknown>) =>
    request.put<Record<string, unknown>>('/auth/preferences', { preferences }),
};

// ============ 用户管理 API ============
export const usersApi = {
  list: (params?: { page?: number; pageSize?: number; keyword?: string; canLogin?: string }) =>
    request.get<PaginatedResponse<User>>('/users', { params }),

  create: (data: {
    username?: string;
    password?: string;
    realName: string;
    wecomUserId?: string;
    canLogin?: boolean;
    roleIds?: string[];
  }) => request.post<User>('/users', data),

  update: (id: string, data: {
    realName?: string;
    wecomUserId?: string | null;
    canLogin?: boolean;
    status?: string;
    roleIds?: string[];
    password?: string;
  }) => request.put<User>(`/users/${id}`, data),

  delete: (id: string) => request.delete(`/users/${id}`),
};

// ============ 角色管理 API ============
export const rolesApi = {
  list: () => request.get<Role[]>('/roles'),

  getPermissions: () => request.get<Permission[]>('/roles/permissions'),

  create: (data: { name: string; description?: string; permissionIds: string[] }) =>
    request.post<Role>('/roles', data),

  update: (id: string, data: { name?: string; description?: string; permissionIds?: string[] }) =>
    request.put<Role>(`/roles/${id}`, data),

  delete: (id: string) => request.delete(`/roles/${id}`),
};

// ============ 项目管理 API ============
export const projectsApi = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    keyword?: string;
    productLine?: string;
  }) => request.get<PaginatedResponse<Project> & { stats: { all: number; inProgress: number; completed: number; onHold: number } }>('/projects', { params }),

  get: (id: string) => request.get<Project>(`/projects/${id}`),

  create: (data: {
    name: string;
    description?: string;
    productLine: string;
    priority: string;
    status: string;
    startDate?: string;
    endDate?: string;
    managerId: string;
  }) => request.post<Project>('/projects', data),

  update: (id: string, data: {
    name?: string;
    description?: string;
    productLine?: string;
    priority?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    managerId?: string;
    progress?: number;
  }) => request.put<Project>(`/projects/${id}`, data),

  delete: (id: string) => request.delete(`/projects/${id}`),

  // 协作者管理
  getMembers: (projectId: string) =>
    request.get<Array<{ user: { id: string; realName: string; username: string } }>>(`/projects/${projectId}/members`),

  addMember: (projectId: string, userId: string) =>
    request.post<{ user: { id: string; realName: string; username: string } }>(`/projects/${projectId}/members`, { userId }),

  removeMember: (projectId: string, userId: string) =>
    request.delete(`/projects/${projectId}/members/${userId}`),
};

// ============ 活动/任务管理 API ============
export const activitiesApi = {
  // 获取项目所有活动（树形结构）
  list: (projectId: string) =>
    request.get<Activity[]>(`/activities/project/${projectId}`),

  // 获取甘特图数据
  getGantt: (projectId: string) =>
    request.get<{ tasks: unknown[]; links: unknown[] }>(`/activities/project/${projectId}/gantt`),

  // 创建活动
  create: (data: {
    projectId: string;
    name: string;
    type?: string;
    phase?: string;
    status?: string;
    priority?: string;
    description?: string;
    planStartDate?: string;
    planEndDate?: string;
    planDuration?: number;
    startDate?: string;
    endDate?: string;
    duration?: number;
    assigneeId?: string;
    assigneeIds?: string[];
    notes?: string;
    sortOrder?: number;
    dependencies?: Array<{ id: string; type: string; lag?: number }>;
  }) => request.post<Activity>('/activities', data),

  // 更新活动
  update: (activityId: string, data: {
    name?: string;
    type?: string;
    phase?: string;
    status?: string;
    priority?: string;
    description?: string;
    planStartDate?: string;
    planEndDate?: string;
    planDuration?: number;
    startDate?: string;
    endDate?: string;
    duration?: number;
    assigneeId?: string | null;
    assigneeIds?: string[];
    notes?: string | null;
    dependencies?: Array<{ id: string; type: string; lag?: number }> | null;
    [key: string]: unknown;
  }) => request.put<Activity>(`/activities/${activityId}`, data),

  // 删除活动
  delete: (activityId: string) => request.delete(`/activities/${activityId}`),

  // 批量排序
  reorder: (projectId: string, items: { id: string; sortOrder: number }[]) =>
    request.put(`/activities/project/${projectId}/reorder`, { items }),

  // 归档快照 CRUD
  createArchive: (projectId: string, label?: string) =>
    request.post<{ id: string; label?: string; createdAt: string; count: number }>(`/activities/project/${projectId}/archives`, { label }),

  listArchives: (projectId: string) =>
    request.get<Array<{ id: string; label?: string; createdAt: string; count: number }>>(`/activities/project/${projectId}/archives`),

  getArchive: (archiveId: string) =>
    request.get<ActivityArchive>(`/activities/archives/${archiveId}`),

  deleteArchive: (archiveId: string) =>
    request.delete(`/activities/archives/${archiveId}`),

  // 归档对比
  compareArchives: (archiveId1: string, archiveId2: string, projectId: string) =>
    request.post<{ diffs: Array<{ name: string; type: string; changes?: string[]; before?: any; current?: any }> }>('/activities/archives/compare', { archiveId1, archiveId2, projectId }),

  // 批量操作
  batchUpdate: (ids: string[], updates: { status?: string; assigneeIds?: string[]; phase?: string }) =>
    request.put<{ success: boolean; count: number }>('/activities/batch-update', { ids, updates }),

  batchDelete: (ids: string[]) =>
    request.delete<{ success: boolean; count: number }>('/activities/batch-delete', { data: { ids } }),

  // 关键路径
  getCriticalPath: (projectId: string) =>
    request.get<{ criticalActivityIds: string[] }>(`/activities/project/${projectId}/critical-path`),

  // 资源负载
  getWorkload: (params?: { projectId?: string }) =>
    request.get<Array<{
      userId: string; realName: string; username: string;
      totalActivities: number; inProgress: number; overdue: number; totalDuration: number;
    }>>('/activities/workload', { params }),

  // 资源冲突检测
  getResourceConflicts: (params?: { projectId?: string }) =>
    request.get<ResourceConflict[]>('/activities/resource-conflicts', { params }),

  // What-if 模拟
  whatIf: (projectId: string, activityId: string, delayDays: number) =>
    request.post<WhatIfResult>(`/activities/project/${projectId}/what-if`, { activityId, delayDays }),

  // 应用 What-if 模拟结果
  applyWhatIf: (projectId: string, affected: Array<{ id: string; newStart: string | null; newEnd: string | null }>, archiveLabel?: string) =>
    request.post<{ success: boolean; updatedCount: number }>(`/activities/project/${projectId}/what-if/apply`, { affected, archiveLabel }),

  // 一键重排
  reschedule: (projectId: string, baseDate?: string) =>
    request.post<{ success: boolean; updatedCount: number }>(`/activities/project/${projectId}/reschedule`, { baseDate }),

  // AI 排计划建议
  getAiSchedule: (projectId: string) =>
    request.post<AiScheduleSuggestion>(`/activities/project/${projectId}/ai-schedule`),
};

// ============ 项目模板 API ============
export const templatesApi = {
  list: () => request.get<ProjectTemplate[]>('/templates'),

  get: (id: string) => request.get<ProjectTemplate>(`/templates/${id}`),

  create: (data: {
    name: string;
    description?: string;
    productLine?: string;
    phases?: string[];
    activities?: Array<Partial<TemplateActivity> & { id: string; name: string }>;
  }) => request.post<ProjectTemplate>('/templates', data),

  update: (id: string, data: {
    name?: string;
    description?: string;
    productLine?: string;
    phases?: string[];
    activities?: Array<Partial<TemplateActivity> & { id: string; name: string }>;
  }) => request.put<ProjectTemplate>(`/templates/${id}`, data),

  delete: (id: string) => request.delete(`/templates/${id}`),

  instantiate: (id: string, data: { projectId: string; startDate: string }) =>
    request.post<{ success: boolean; count: number; activities: Activity[] }>(
      `/templates/${id}/instantiate`, data
    ),
};

// ============ 产品管理 API ============
export const productsApi = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    category?: string;
    keyword?: string;
    projectId?: string;
    projectStatus?: string;
    specKeyword?: string;
  }) => request.get<PaginatedResponse<Product> & {
    stats: { all: number; developing: number; production: number; discontinued: number };
  }>('/products', { params }),

  get: (id: string) => request.get<Product>(`/products/${id}`),

  create: (data: {
    name: string;
    model?: string;
    revision?: string;
    category?: string;
    status?: string;
    projectId?: string;
    description?: string;
    specifications?: Record<string, string>;
    performance?: Record<string, string>;
    documents?: Array<{ id: string; name: string; url: string; uploadedAt: string }>;
  }) => request.post<Product>('/products', data),

  update: (id: string, data: {
    name?: string;
    model?: string;
    revision?: string;
    category?: string;
    status?: string;
    projectId?: string;
    description?: string;
    specifications?: Record<string, string>;
    performance?: Record<string, string>;
    documents?: Array<{ id: string; name: string; url: string; uploadedAt: string }>;
  }) => request.put<Product>(`/products/${id}`, data),

  delete: (id: string) => request.delete(`/products/${id}`),

  copy: (id: string, revision: string) =>
    request.post<Product>(`/products/${id}/copy`, { revision }),

  getChangelog: (id: string) =>
    request.get<ProductChangeLog[]>(`/products/${id}/changelog`),

  exportCsv: (params?: { status?: string; category?: string; keyword?: string; projectStatus?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.category) query.set('category', params.category);
    if (params?.keyword) query.set('keyword', params.keyword);
    if (params?.projectStatus) query.set('projectStatus', params.projectStatus);
    return request.get('/products/export', {
      params,
      responseType: 'blob',
    });
  },
};

// ============ 审计日志 API ============
export const auditLogsApi = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    userId?: string;
    action?: string;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
    keyword?: string;
  }) => request.get<PaginatedResponse<AuditLog>>('/audit-logs', { params }),

  getUsers: () =>
    request.get<Array<{ userId: string; userName: string }>>('/audit-logs/users'),
};

// ============ 风险评估 API ============
export const riskApi = {
  getHistory: (projectId: string, params?: { page?: number; pageSize?: number }) =>
    request.get<any>(`/risk/project/${projectId}`, { params }),

  getTrend: (projectId: string) =>
    request.get<any>(`/risk/project/${projectId}`, { params: { pageSize: 50 } }),

  assess: (projectId: string) =>
    request.post<{
      id: string;
      riskLevel: string;
      riskFactors: Array<{ factor: string; severity: string; description: string }>;
      suggestions: string[];
      source?: string;
      assessedAt: string;
    }>(`/risk/project/${projectId}/assess`),

  delete: (id: string) =>
    request.delete(`/risk/${id}`),

  getSummary: () =>
    request.get<Array<{ projectId: string; projectName: string; riskLevel: string; assessedAt: string }>>('/risk/summary'),
};

// ============ 周报管理 API ============
export const weeklyReportsApi = {
  list: (params?: { projectId?: string; page?: number; pageSize?: number; status?: string; year?: number; weekNumber?: number; productLine?: string }) =>
    request.get<PaginatedResponse<WeeklyReport>>('/weekly-reports', { params }),

  getByProject: (projectId: string) =>
    request.get<WeeklyReport[]>(`/weekly-reports/project/${projectId}`),

  getLatest: (projectId: string) =>
    request.get<WeeklyReport>(`/weekly-reports/project/${projectId}/latest`),

  getLatestStatus: () =>
    request.get<Record<string, string>>('/weekly-reports/latest-status', { _silent: true } as never),

  getDrafts: () =>
    request.get<WeeklyReport[]>('/weekly-reports/drafts'),

  getPreviousReport: (projectId: string, year: number, weekNumber: number) =>
    request.get<WeeklyReport>(`/weekly-reports/project/${projectId}/previous`, { params: { year, weekNumber }, _silent: true } as never),

  get: (id: string) => request.get<WeeklyReport>(`/weekly-reports/${id}`),

  getByWeek: (year: number, weekNumber: number, params?: { productLine?: string }) =>
    request.get<WeeklyReport[]>(`/weekly-reports/week/${year}/${weekNumber}`, { params }),

  create: (data: {
    projectId: string;
    weekStart: string;
    weekEnd: string;
    progressStatus?: string;
    keyProgress?: string;
    nextWeekPlan?: string;
    riskWarning?: string;
    phaseProgress?: Record<string, { progress: string; risks: string; schedule: string }>;
    attachments?: ReportAttachment[];
  }) => request.post<WeeklyReport>('/weekly-reports', data),

  update: (id: string, data: {
    weekStart?: string;
    weekEnd?: string;
    progressStatus?: string;
    keyProgress?: string;
    nextWeekPlan?: string;
    riskWarning?: string;
    phaseProgress?: Record<string, { progress: string; risks: string; schedule: string }>;
    attachments?: ReportAttachment[];
    status?: string;
  }) => request.put<WeeklyReport>(`/weekly-reports/${id}`, data),

  submit: (id: string) => request.post<WeeklyReport>(`/weekly-reports/${id}/submit`),

  archive: (id: string) => request.post<WeeklyReport>(`/weekly-reports/${id}/archive`),

  delete: (id: string) => request.delete(`/weekly-reports/${id}`),

  getAiSuggestions: (projectId: string, weekStart: string, weekEnd: string) =>
    request.post<{ keyProgress: string; nextWeekPlan: string; riskWarning: string }>(
      `/weekly-reports/project/${projectId}/ai-suggestions`,
      { weekStart, weekEnd }
    ),
};

// ============ 文件上传 API ============
export const uploadApi = {
  upload: (file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return request.post<{ name: string; url: string; size: number; mimetype: string }>(
      '/uploads',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total && onProgress) {
            onProgress(Math.round((e.loaded * 100) / e.total));
          }
        },
      }
    );
  },

  delete: (filename: string) => request.delete(`/uploads/${filename}`),
};

// ============ 企微配置管理 API ============
export const wecomConfigApi = {
  get: () => request.get<WecomConfig>('/wecom-config'),

  update: (data: { corpId?: string; agentId?: string; secret?: string; redirectUri?: string }) =>
    request.put<WecomConfig>('/wecom-config', data),
};

// ============ 活动评论 API ============
export const activityCommentsApi = {
  list: (activityId: string, params?: { page?: number; pageSize?: number }) =>
    request.get<PaginatedResponse<ActivityComment>>(`/activity-comments/activity/${activityId}`, { params }),

  create: (data: { activityId: string; content: string }) =>
    request.post<ActivityComment>('/activity-comments', data),

  delete: (id: string) =>
    request.delete(`/activity-comments/${id}`),
};

// ============ 通知 API ============
export const notificationsApi = {
  list: (params?: { page?: number; pageSize?: number }) =>
    request.get<PaginatedResponse<Notification> & { unreadCount: number }>('/notifications', { params }),

  markRead: (id: string) =>
    request.put(`/notifications/${id}/read`),

  markAllRead: () =>
    request.put('/notifications/read-all'),

  delete: (id: string) =>
    request.delete(`/notifications/${id}`),

  generate: () =>
    request.post<{ success: boolean; generatedCount: number }>('/notifications/generate'),
};

// ============ AI 配置管理 API ============
export const aiConfigApi = {
  list: () => request.get<AiConfig[]>('/ai-config'),

  create: (data: { name: string; apiKey?: string; apiUrl?: string; modelName?: string; features?: string }) =>
    request.post<AiConfig>('/ai-config', data),

  update: (id: string, data: { name?: string; apiKey?: string; apiUrl?: string; modelName?: string; features?: string }) =>
    request.put<AiConfig>(`/ai-config/${id}`, data),

  delete: (id: string) => request.delete(`/ai-config/${id}`),

  testConnection: (data: { apiUrl: string; apiKey: string; modelName?: string; configId?: string }) =>
    request.post<{ success: boolean; message: string }>('/ai-config/test-connection', data),

  fetchModels: (data: { apiUrl: string; apiKey: string; configId?: string }) =>
    request.post<{ success: boolean; models: string[]; message: string }>('/ai-config/fetch-models', data),

  getUsageStats: (params?: { startDate?: string; endDate?: string }) =>
    request.get<AiUsageStats>('/ai-config/usage-stats', { params }),
};
