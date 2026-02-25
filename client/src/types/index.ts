// ============ 用户相关类型 ============

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export interface User {
  id: string;
  username: string;
  email: string;
  realName: string;
  phone?: string;
  wecomUserId?: string;
  status: UserStatus;
  roles: string[]; // 角色名称数组
  permissions: string[]; // 权限代码数组 (格式: resource:action)
  collaboratingProjectIds?: string[]; // 协作项目 ID 列表
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  description?: string;
}

// ============ 项目相关类型 ============

export enum ProjectStatus {
  PLANNING = 'PLANNING',
  IN_PROGRESS = 'IN_PROGRESS',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface ProjectMember {
  user: Pick<User, 'id' | 'realName' | 'username'>;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  productLine: string; // DANDELION | SUNFLOWER
  priority: Priority;
  status: ProjectStatus;
  startDate: string;
  endDate?: string;
  progress?: number;
  managerId: string;
  manager?: Pick<User, 'id' | 'realName' | 'username'>;
  members?: ProjectMember[];
  createdAt: string;
  updatedAt: string;
  activities?: Activity[];
  products?: Product[];
  _count?: { activities: number; products: number };
}

// ============ 活动/任务相关类型 ============

export enum ActivityType {
  MILESTONE = 'MILESTONE',
  TASK = 'TASK',
  PHASE = 'PHASE',
}

export enum ActivityStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  DELAYED = 'DELAYED',
  CANCELLED = 'CANCELLED',
}

export interface ActivityDependency {
  id: string;
  type: string; // '0'=FS, '1'=SS, '2'=FF, '3'=SF
  lag?: number; // workdays, default 0, negative = lead
}

export interface Activity {
  id: string;
  projectId: string;
  parentId?: string | null;
  name: string;
  description?: string;
  type: ActivityType;
  phase?: string; // EVT | DVT | PVT | MP
  assigneeId?: string | null;
  assignee?: Pick<User, 'id' | 'realName'> | null;
  assigneeIds?: string[];
  assignees?: Pick<User, 'id' | 'realName'>[];
  status: ActivityStatus;
  priority: Priority;
  planStartDate?: string | null;
  planEndDate?: string | null;
  planDuration?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  duration?: number | null;
  dependencies?: ActivityDependency[] | null;
  notes?: string | null;
  sortOrder: number;
  children?: Activity[];
  createdAt: string;
  updatedAt: string;
}

// ============ 产品相关类型 ============

export interface ProductImage {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
}

export interface ProductDocument {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
}

export interface ProductChangeLog {
  id: string;
  productId?: string | null;
  userId: string;
  userName: string;
  action: string; // CREATE | UPDATE | DELETE | COPY
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  model?: string;
  revision?: string;
  category?: string; // ROUTER | GATEWAY | REMOTE_CONTROL | ACCESSORY | OTHER
  status: string; // DEVELOPING | PRODUCTION | DISCONTINUED
  projectId?: string | null;
  project?: Pick<Project, 'id' | 'name'> & { productLine?: string } | null;
  description?: string;
  specifications?: Record<string, unknown>;
  performance?: Record<string, unknown>;
  images?: ProductImage[];
  documents?: ProductDocument[];
  createdAt: string;
  updatedAt: string;
}

// ============ 周报相关类型 ============

export interface PhaseProgressItem {
  progress: string;
  risks: string;
  schedule: string;
}

export interface ReportAttachment {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
  section: string; // keyProgress | nextWeekPlan | riskWarning
}

export interface WeeklyReport {
  id: string;
  projectId: string;
  project?: Pick<Project, 'id' | 'name' | 'productLine' | 'managerId'>;
  weekStart: string;
  weekEnd: string;
  year: number;
  weekNumber: number;
  changeOverview?: string;
  demandAnalysis?: string;
  keyProgress?: string;
  nextWeekPlan?: string;
  riskWarning?: string;
  risks?: unknown[];
  phaseProgress?: Record<string, PhaseProgressItem>;
  attachments?: ReportAttachment[];
  status: string; // DRAFT | SUBMITTED | ARCHIVED
  progressStatus: string; // ON_TRACK | MINOR_ISSUE | MAJOR_ISSUE
  submittedAt?: string;
  createdBy: string;
  creator?: { id: string; realName: string; username: string };
  createdAt: string;
  updatedAt: string;
}

// ============ 风险评估相关类型 ============

export interface RiskFactor {
  factor: string;
  severity: string;
  description: string;
}

export interface RiskAssessment {
  id: string;
  projectId: string;
  riskLevel: string;
  riskFactors: RiskFactor[];
  suggestions: string[];
  assessedAt: string;
}

// ============ AI 管理相关类型 ============

export interface AiConfig {
  id: string;
  name: string;
  apiKey: string;
  apiUrl: string;
  modelName: string;
  features: string;
  updatedAt?: string;
}

export interface AiUsageLog {
  id: string;
  feature: string;
  projectId?: string;
  project?: Pick<Project, 'id' | 'name'>;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  createdAt: string;
}

export interface AiUsageStats {
  totals: {
    callCount: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  dailyStats: Array<{
    date: string;
    feature: string;
    callCount: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>;
  recentLogs: AiUsageLog[];
}

// ============ 企微配置相关类型 ============

export interface WecomConfig {
  id?: string;
  corpId: string;
  agentId: string;
  secret: string;
  redirectUri: string;
  updatedAt?: string;
}

// ============ 审计日志相关类型 ============

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;       // LOGIN, CREATE, UPDATE, DELETE
  resourceType: string;  // auth, project, activity, product, user, role
  resourceId?: string;
  resourceName?: string;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  ipAddress?: string;
  createdAt: string;
}

// ============ 通用类型 ============

export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
  success?: boolean;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
