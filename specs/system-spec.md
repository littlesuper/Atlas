# 系统整体规格说明书

## 1. 系统概述

贝锐硬件管理系统（HWSystem）是一套面向硬件团队的 Web 管理平台，包含项目管理和产品管理两大核心模块，支持多用户协作和基于角色的权限控制。系统语言为简体中文。浏览器标签页标题为"贝锐硬件管理系统"，站点图标使用贝锐（oray.com）官方 favicon。

## 2. 技术架构

### 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React + TypeScript | 18.x |
| 构建工具 | Vite | 7.x |
| UI 组件库 | Arco Design | 2.x |
| 状态管理 | Zustand | 5.x |
| 路由 | React Router | 7.x |
| HTTP 客户端 | Axios | 1.x |
| 日期处理 | Day.js | 1.x |
| 拖拽排序 | @dnd-kit | 6.x |
| 后端框架 | Express + TypeScript | 4.x |
| ORM | Prisma | 6.x |
| 数据库 | PostgreSQL | 17.x |
| 认证 | JSON Web Token | 9.x |
| 密码加密 | bcryptjs | 2.x |

### 项目结构

```
HWSystem/
├── package.json               # monorepo 根配置 (npm workspaces)
├── specs/                     # 模块规格说明书
├── client/                    # 前端应用
│   ├── src/
│   │   ├── api/               # API 封装 (request.ts, index.ts)
│   │   ├── components/        # 通用组件
│   │   ├── layouts/           # MainLayout.tsx (顶部导航)
│   │   ├── styles/            # global.css (全局样式覆盖)
│   │   ├── pages/
│   │   │   ├── Login/         # 登录页
│   │   │   ├── Project/
│   │   │   │   ├── List/      # 项目列表（首页）
│   │   │   │   └── Detail/    # 项目详情 (ActivityList, GanttChart, RiskAssessmentTab)
│   │   │   ├── Product/       # 产品管理
│   │   │   ├── WeeklyReports/ # 周报汇总 + 项目周报Tab
│   │   │   └── Admin/         # 用户管理 + 角色管理
│   │   ├── store/             # authStore.ts (Zustand)
│   │   ├── types/             # TypeScript 类型定义
│   │   └── utils/             # constants.ts (状态/优先级/产品线/阶段选项映射), chineseWorkday.ts (中国工作日计算)
│   └── vite.config.ts         # Vite 配置 (含 /api 代理)
├── server/
│   ├── src/
│   │   ├── index.ts           # Express 入口
│   │   ├── middleware/        # auth.ts, permission.ts
│   │   ├── routes/            # auth, users, projects, activities, products, roles, risk, weeklyReports, uploads, aiConfig, notifications, activityComments, templates, auditLogs, wecomConfig
│   │   └── prisma/            # schema.prisma, seed.ts
│   └── .env                   # 环境变量
└── .gitignore
```

## 3. 系统布局

采用上下布局：

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [LOGO图片]  [项目管理] [项目周报] [项目资源] [产品管理] [系统管理] 🔔 🌙 [张三 ▼] │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                            页面内容区域                                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

- **左上角：** 自定义 LOGO 图片（`/logo.png`，透明底 PNG），点击跳转首页
- **导航菜单（从左到右）：** 项目管理、项目周报、项目资源、产品管理、系统管理（需 `user:read` 权限）
- **最右侧：** 通知铃铛（消息提醒）、主题切换按钮（明/暗模式）、当前用户姓名（下拉含退出登录）
- **内容区域：** 灰色背景（#f4f6f9），内嵌 Card 组件

## 4. 全局 UI 样式规范

通过 `client/src/styles/global.css` 对 Arco Design 组件进行全局样式覆盖，统一视觉风格。

### 设计语言
- **主色：** #4f7cff（蓝），#6c5ce7（紫）
- **圆角：** 卡片 12px，弹窗 16px，输入框/按钮 8px，标签 6px
- **边框：** 输入框 1.5px solid #e4e6ef，聚焦时 #4f7cff + 3px 蓝色光晕
- **过渡：** cubic-bezier(0.4, 0, 0.2, 1)，0.25s

### 页面内容区通用规范

**工具栏布局（各 Tab 页顶部操作栏）：**
- 布局：`display: flex; justifyContent: space-between; alignItems: center; marginBottom: 16`
- 左侧：统计信息或辅助文字（fontSize 13px，color #8c8ca1）
- 右侧：主操作按钮（`type="primary"`，`borderRadius: 8`）

**字号层级：**
| 用途 | 字号 | 字重 | 颜色 |
|------|------|------|------|
| 工具栏统计/辅助文字 | 13px | 400 | #8c8ca1 |
| 区块标题（如"本周重要进展"） | 14px | 600 | #1a1a2e |
| 正文内容 | 14px | 400 | #595959 |
| 卡片底部元信息 | 12px | 400 | #8c8ca1 |
| 占位提示（暂无） | 14px | 400 | #bfbfbf |

### 覆盖范围
| 组件类别 | 样式要点 |
|----------|----------|
| 导航栏 | 深色渐变背景，毛玻璃效果，菜单项悬浮高亮 |
| 卡片 | 12px 圆角，轻投影，无边框 |
| 表格 | 表头大写字母间距，悬浮行浅蓝背景 |
| 表单输入框 | 8px 圆角，1.5px 边框，聚焦蓝色光晕；嵌套在 affix-wrapper 内的 input 去除独立边框避免双重边框 |
| 下拉面板 | 10px 圆角，选中项蓝色背景 |
| 按钮 | 主按钮蓝色投影，虚线按钮悬浮变蓝 |
| 弹窗/抽屉 | 16px 圆角，底部按钮栏 36px 高 |
| 标签 | 6px 圆角，无边框 |
| 进度条 | 100px 圆角 |
| 登录页 | 深色渐变背景，卡片毛玻璃，顶部渐变装饰线 |

## 5. 路由结构

| 路径 | 页面 | 认证要求 |
|------|------|----------|
| /login | 登录页 | 无 |
| / | 重定向至 /projects | - |
| /projects | 项目列表（首页） | 已登录 |
| /projects/:id | 项目详情 | 已登录 |
| /weekly-reports | 项目周报汇总 | 已登录 |
| /weekly-reports/new | 创建周报 | 已登录 |
| /weekly-reports/:id/edit | 编辑周报 | 已登录 |
| /workload | 项目资源（资源负载视图） | 已登录 |
| /products | 产品管理 | 已登录 |
| /admin | 系统管理（账号管理） | 已登录 + user:read |

## 6. 前端认证流程

1. 未登录 → 自动跳转 `/login`
2. 登录成功 → 存储 `accessToken` 和 `refreshToken` 至 localStorage → 跳转 `/projects`
3. API 请求 → Axios 拦截器自动添加 `Authorization: Bearer <token>`
4. 收到 401 → 尝试用 refreshToken 刷新 → 成功则重试请求 → 失败则清除 token 跳转登录
5. 退出 → 清除 localStorage → 跳转 `/login`

## 7. 前端状态管理

使用 Zustand 管理全局认证状态：

```typescript
interface AuthState {
  user: AuthUser | null;       // 当前用户（含 roles, permissions, collaboratingProjectIds）
  isAuthenticated: boolean;    // 是否已认证
  loading: boolean;            // 加载中
  login(username, password);   // 登录
  logout();                    // 退出
  fetchUser();                 // 获取用户信息
  hasPermission(resource, action); // 权限检查
  isProjectManager(managerId, projectId?); // 项目管理权限检查（负责人或协作者）
}
```

## 8. API 代理配置

开发环境下，Vite 代理前端 `/api` 请求到后端 `http://localhost:3000`：

```typescript
// vite.config.ts
server: {
  port: 5173,
  proxy: {
    '/api': { target: 'http://localhost:3000', changeOrigin: true }
  }
}
```

## 9. 数据库概览

```
users ──┬── user_roles ──── roles ──── role_permissions ──── permissions
        │
        ├── project_members ──── projects
        │
        ├── projects ──┬── activities (自引用层级)
        │              ├── products
        │              ├── risk_assessments
        │              └── weekly_reports
        │
        └── activities (assignees, 多对多)
```

### 表清单

| 表名 | 说明 | 记录关系 |
|------|------|----------|
| users | 用户 | 1:N → user_roles, projects, activities, project_members |
| roles | 角色 | 1:N → user_roles, role_permissions |
| permissions | 权限 | 1:N → role_permissions |
| user_roles | 用户-角色 | N:N 关联表 |
| role_permissions | 角色-权限 | N:N 关联表 |
| projects | 项目（含 product_line 字段） | 1:N → activities, products, risk_assessments, weekly_reports, project_members |
| project_members | 项目协作者 | N:N 关联表（users ↔ projects），复合主键 [projectId, userId] |
| activities | 活动/任务 | 自引用（parentId）, N:1 → projects, N:N → users（assignees） |
| _ActivityAssignees | 活动-负责人 | N:N 隐式关联表（activities ↔ users） |
| activity_archives | 活动归档快照 | N:1 → projects |
| activity_comments | 活动评论 | N:1 → activities, users |
| products | 产品 | N:1 → projects |
| product_change_logs | 产品变更日志 | N:1 → products |
| risk_assessments | 风险评估 | N:1 → projects |
| weekly_reports | 项目周报 | N:1 → projects, users |
| notifications | 用户通知 | N:1 → users |
| project_templates | 项目模板 | 独立表 |
| template_activities | 模板活动 | N:1 → project_templates |
| ai_configs | AI 配置（多配置，按功能绑定） | 独立表 |
| ai_usage_logs | AI 调用日志（token 用量） | N:1 → projects |
| audit_logs | 审计日志 | N:1 → users |
| wecom_configs | 企微配置 | 独立表 |

## 10. 扩展功能（已实现）

以下功能已实现但不在原始规格文档中，此处补充记录：

| 功能 | 说明 | 关键文件 |
|------|------|----------|
| 排程工具 | 资源冲突检测、What-If 延期模拟、一键重排、AI 工期建议 | `activities.ts`, `SchedulingTools.tsx` |
| 关键路径计算 (CPM) | 前向/后向遍历算法，甘特图标记关键路径 | `activities.ts` |
| 批量操作 | 批量更新活动状态/阶段/负责人，批量删除 | `activities.ts` |
| 基线对比 | 对比两个存档快照或存档 vs 当前状态的差异 | `activities.ts` |
| 活动评论 | 活动级别的评论 CRUD | `activityComments.ts`, `ActivityComments.tsx` |
| 通知系统 | 活动到期、周报提醒、里程碑临近通知 | `notifications.ts`, `Notification` model |
| 审计日志 | 活动 CRUD 操作全链路日志记录 | `auditLogs.ts`, `AuditLog` model |
| 项目模板 | 模板管理 + 基于模板创建项目自动生成活动 | `templates.ts`, `TemplateManagement.tsx` |
| 里程碑时间线 | 独立 Tab 页，菱形标记可视化展示 | `Detail/index.tsx` |
| 依赖级联更新 | 修改计划日期自动 BFS 更新下游依赖活动 | `activities.ts` |
| 列设置偏好 | 用户可自定义活动表列可见性和排序，持久化到 `User.preferences` | `ColumnSettings.tsx` |
| 企微集成 | 企业微信配置管理 | `wecomConfig.ts` |
| 工作量统计 | 按人员聚合活动数/进行中/逾期/总工期 | `activities.ts` |
| 存档标签 | 存档快照可命名 | `ActivityArchive.label` |
| 暗色主题 | 支持 light/dark 主题切换，持久化偏好 | `themeStore.ts`, `global.css` |

## 11. 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| DATABASE_URL | PostgreSQL 连接字符串 | postgresql://littlesuper@localhost:5432/hwsystem |
| JWT_SECRET | Access Token 签名密钥 | hw-system-jwt-secret |
| JWT_REFRESH_SECRET | Refresh Token 签名密钥 | hw-system-refresh-secret |
| PORT | 后端服务端口 | 3000 |
| AI_API_KEY | 外部 AI API 密钥 | （空） |
| AI_API_URL | 外部 AI API 地址 | （空） |

## 12. 启动流程

```bash
# 1. 安装依赖
npm install

# 2. 生成 Prisma Client
cd server && npx prisma generate

# 3. 数据库迁移
npx prisma migrate dev --name init

# 4. 初始化种子数据
npx tsx src/prisma/seed.ts

# 5. 启动前后端（项目根目录）
cd .. && npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3000
- 健康检查：GET http://localhost:3000/api/health

## 12. 模块规格文档索引

| 文档 | 说明 |
|------|------|
| [auth-spec.md](./auth-spec.md) | 认证模块（登录、令牌、身份验证） |
| [project-spec.md](./project-spec.md) | 项目管理模块（项目、活动、甘特图、AI风险评估） |
| [product-spec.md](./product-spec.md) | 产品管理模块（产品信息、规格、性能） |
| [permission-spec.md](./permission-spec.md) | 权限管理模块（用户、角色、权限 RBAC） |
| [system-spec.md](./system-spec.md) | 系统整体规格（本文档） |
