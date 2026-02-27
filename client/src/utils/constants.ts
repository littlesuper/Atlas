// ============ 项目状态映射 ============
export const STATUS_MAP = {
  PLANNING: {
    label: '规划中',
    color: 'blue',
  },
  IN_PROGRESS: {
    label: '进行中',
    color: 'green',
  },
  ON_HOLD: {
    label: '已暂停',
    color: 'orange',
  },
  COMPLETED: {
    label: '已完成',
    color: 'gray',
  },
} as const;

// ============ 优先级映射 ============
export const PRIORITY_MAP = {
  LOW: {
    label: '低',
    color: 'gray',
  },
  MEDIUM: {
    label: '中',
    color: 'blue',
  },
  HIGH: {
    label: '高',
    color: 'orange',
  },
  CRITICAL: {
    label: '紧急',
    color: 'red',
  },
} as const;

// ============ 活动状态映射 ============
export const ACTIVITY_STATUS_MAP = {
  NOT_STARTED: {
    label: '未开始',
    color: 'gray',
  },
  IN_PROGRESS: {
    label: '进行中',
    color: 'blue',
  },
  COMPLETED: {
    label: '已完成',
    color: 'green',
  },
  CANCELLED: {
    label: '已取消',
    color: 'default',
  },
} as const;

// ============ 活动类型映射 ============
export const ACTIVITY_TYPE_MAP = {
  MILESTONE: {
    label: '里程碑',
    color: 'purple',
  },
  TASK: {
    label: '任务',
    color: 'blue',
  },
  PHASE: {
    label: '阶段',
    color: 'cyan',
  },
} as const;

// ============ 产品线映射 ============
export const PRODUCT_LINE_MAP = {
  DANDELION: {
    label: '蒲公英',
    color: 'blue',
  },
  SUNFLOWER: {
    label: '向日葵',
    color: 'orange',
  },
} as const;

// ============ 产品类别映射 ============
export const PRODUCT_CATEGORY_MAP = {
  ROUTER: {
    label: '路由器',
    color: 'blue',
  },
  GATEWAY: {
    label: '网关',
    color: 'cyan',
  },
  REMOTE_CONTROL: {
    label: '远控设备',
    color: 'purple',
  },
  ACCESSORY: {
    label: '配件',
    color: 'default',
  },
  OTHER: {
    label: '其他',
    color: 'default',
  },
} as const;

// ============ 产品状态映射 ============
export const PRODUCT_STATUS_MAP = {
  DEVELOPING: {
    label: '研发中',
    color: 'blue',
  },
  PRODUCTION: {
    label: '量产',
    color: 'green',
  },
  DISCONTINUED: {
    label: '停产',
    color: 'red',
  },
} as const;

// ============ 产品状态流转 ============
export const PRODUCT_STATUS_TRANSITIONS: Record<string, string[]> = {
  DEVELOPING: ['DEVELOPING', 'PRODUCTION'],
  PRODUCTION: ['PRODUCTION', 'DISCONTINUED'],
  DISCONTINUED: ['DISCONTINUED'],
};

// ============ 产品规格模板 ============
export const PRODUCT_SPEC_TEMPLATES: Record<string, string[]> = {
  ROUTER: ['工作电压', '工作温度', '接口类型', 'WiFi标准', '天线数', '传输速率'],
  GATEWAY: ['工作电压', '工作温度', '通信协议', '最大连接数', '接口类型', '功耗'],
  REMOTE_CONTROL: ['工作电压', '通信距离', '频率', '按键数', '电池类型', '待机时间'],
  ACCESSORY: ['材质', '尺寸', '重量', '兼容型号'],
  OTHER: [],
};

// ============ 周报进展状态映射 ============
export const PROGRESS_STATUS_MAP = {
  ON_TRACK: {
    label: '正常',
    color: 'green',
  },
  MINOR_ISSUE: {
    label: '有风险',
    color: 'orange',
  },
  MAJOR_ISSUE: {
    label: '严重延期',
    color: 'red',
  },
} as const;

// ============ 周报状态映射 ============
export const REPORT_STATUS_MAP = {
  DRAFT: {
    label: '草稿',
    color: 'gray',
  },
  SUBMITTED: {
    label: '已提交',
    color: 'green',
  },
  ARCHIVED: {
    label: '已归档',
    color: 'blue',
  },
} as const;

// ============ 风险等级映射 ============
export const RISK_LEVEL_MAP = {
  LOW: {
    label: '低风险',
    color: 'green',
  },
  MEDIUM: {
    label: '中风险',
    color: 'orange',
  },
  HIGH: {
    label: '高风险',
    color: 'red',
  },
  CRITICAL: {
    label: '严重风险',
    color: 'red',
  },
} as const;

// ============ 权限资源映射 ============
export const PERMISSION_RESOURCE_MAP: Record<string, string> = {
  '*': '全部',
  project: '项目',
  activity: '活动',
  product: '产品',
  user: '用户',
  role: '角色',
  weekly_report: '项目周报',
};

// ============ 权限操作映射 ============
export const PERMISSION_ACTION_MAP: Record<string, string> = {
  '*': '全部',
  create: '创建',
  read: '查看',
  update: '编辑',
  delete: '删除',
};

// ============ 用户状态映射 ============
export const USER_STATUS_MAP = {
  ACTIVE: {
    label: '启用',
    color: 'green',
  },
  DISABLED: {
    label: '禁用',
    color: 'red',
  },
} as const;

// ============ 阶段选项 ============
export const PHASE_OPTIONS = ['EVT', 'DVT', 'PVT', 'MP'] as const;

// ============ 依赖类型映射 ============
export const DEPENDENCY_TYPE_MAP = {
  '0': { label: 'FS', fullLabel: '完成-开始 (FS)' },
  '1': { label: 'SS', fullLabel: '开始-开始 (SS)' },
  '2': { label: 'FF', fullLabel: '完成-完成 (FF)' },
  '3': { label: 'SF', fullLabel: '开始-完成 (SF)' },
} as const;

// ============ 审计操作类型映射 ============
export const AUDIT_ACTION_MAP: Record<string, { label: string; color: string }> = {
  LOGIN: { label: '登录', color: 'cyan' },
  CREATE: { label: '创建', color: 'green' },
  UPDATE: { label: '更新', color: 'blue' },
  DELETE: { label: '删除', color: 'red' },
};

// ============ 审计资源类型映射 ============
export const AUDIT_RESOURCE_MAP: Record<string, { label: string; color: string }> = {
  auth: { label: '认证', color: 'cyan' },
  project: { label: '项目', color: 'blue' },
  activity: { label: '活动', color: 'green' },
  product: { label: '产品', color: 'purple' },
  user: { label: '用户', color: 'orange' },
  role: { label: '角色', color: 'gold' },
};
