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
│   │   ├── routes/            # auth, users, projects, activities, products, roles, risk, riskItems, weeklyReports, uploads, aiConfig, notifications, activityComments, templates, auditLogs, wecomConfig
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
- **导航菜单（从左到右）：** 项目管理、风险总览、项目周报、项目资源、产品管理、系统管理（需 `user:read` 权限）
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
| /workload | 项目资源（资源看板） | 已登录 |
| /risk-dashboard | 风险总览（跨项目风险全景） | 已登录 |
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
| project_archives | 项目快照 | N:1 → projects，含全量 snapshot JSON（活动、产品、周报、风险评估） |
| activity_comments | 活动评论 | N:1 → activities, users |
| products | 产品 | N:1 → projects |
| product_change_logs | 产品变更日志 | N:1 → products |
| risk_assessments | 风险评估 | N:1 → projects, 1:N → risk_items |
| risk_items | 风险项（可跟踪闭环管理） | N:1 → projects, risk_assessments, users(owner) |
| risk_item_logs | 风险项操作日志 | N:1 → risk_items |
| weekly_reports | 项目周报 | N:1 → projects, users |
| notifications | 用户通知 | N:1 → users |
| project_templates | 项目模板 | 独立表 |
| template_activities | 模板活动 | N:1 → project_templates |
| ai_configs | AI 配置（多配置，按功能绑定） | 独立表 |
| ai_usage_logs | AI 调用日志（token 用量） | N:1 → projects |
| check_items | 活动检查项 | N:1 → activities |
| audit_logs | 审计日志 | N:1 → users |
| wecom_configs | 企微配置 | 独立表 |

## 10. 扩展功能（已实现）

以下功能已实现但不在原始规格文档中，此处补充记录：

| 功能 | 说明 | 关键文件 |
|------|------|----------|
| 排程工具 | 资源冲突检测、What-If 延期模拟、一键重排、AI 工期建议 | `activities.ts`, `SchedulingTools.tsx` |
| 关键路径计算 (CPM) | 前向/后向遍历算法，甘特图标记关键路径 | `activities.ts` |
| 批量操作 | 批量更新活动状态/阶段/负责人，批量删除 | `activities.ts` |
| 项目快照 | 保存项目全量数据快照，通过独立路由复用项目详情页只读查看 | `projects.ts`, `SnapshotsTab.tsx` |
| 活动评论 | 活动级别的评论 CRUD | `activityComments.ts`, `ActivityComments.tsx` |
| 通知系统 | 活动到期、周报提醒、里程碑临近通知 | `notifications.ts`, `Notification` model |
| 审计日志 | 活动 CRUD 操作全链路日志记录 | `auditLogs.ts`, `AuditLog` model |
| 项目模板 | 模板管理 + 基于模板创建项目自动生成活动 | `templates.ts`, `TemplateManagement.tsx` |
| 里程碑时间线 | 独立 Tab 页，菱形标记可视化展示 | `Detail/index.tsx` |
| 依赖级联更新 | 修改计划日期自动 BFS 更新下游依赖活动 | `activities.ts` |
| 列设置偏好 | 用户可自定义活动表列可见性和排序，持久化到 `User.preferences` | `ColumnSettings.tsx` |
| 企微集成 | 企业微信配置管理 | `wecomConfig.ts` |
| 资源看板 | 三段式仪表盘：统计卡片（逾期/无人负责/超载）+ 人员负载堆叠条形图 + 需关注问题表格 | `activities.ts`, `Workload/index.tsx` |
| 项目归档 | 项目归档/取消归档，归档时自动创建快照 | `projects.ts`, `Detail/index.tsx` |
| 暗色主题 | 支持 light/dark 主题切换，持久化偏好 | `themeStore.ts`, `global.css` |
| AI 增强风险评估 | 完整结构化上下文（规则引擎 + 关键路径 + 历史趋势 + 周报）、多层分析 prompt、AI 洞察摘要、行动项 | `riskContext.ts`, `riskPrompts.ts`, `risk.ts` |
| 风险定时评估 | 工作日自动评估 + 阈值预警（逾期 > 7 天、3 天到期未开始）+ 风险升级通知 | `scheduler.ts`, `node-cron` |
| 风险仪表盘 | 跨项目风险全景视图：AI 洞察、分布统计、矩阵表、行动项面板 | `RiskDashboard/index.tsx` |
| 风险处置闭环 | RiskItem 生命周期管理（OPEN → IN_PROGRESS → RESOLVED/ACCEPTED）、操作日志、评论、从 AI 评估批量导入 | `riskItems.ts`, `RiskItemsPanel.tsx` |
| 风险-周报联动 | 周报"从风险评估导入"、提交周报自动创建 RiskItem、AI 建议融合风险上下文 | `weeklyReports.ts`, `Form.tsx` |
| 检查项 | 每个活动可关联多个检查项，支持勾选/排序/内联编辑/批量创建，表格显示完成进度 | `checkItems.ts`, `CheckItems.tsx` |
| Excel 导入导出 | 活动批量导入（自动识别列、创建联系人、去重）+ 导出 Excel | `activities.ts`, `excelActivityParser.ts` |
| 用户偏好 | 列设置/主题等偏好持久化到 `User.preferences` JSON 字段，通过 `/api/auth/preferences` 读写 | `auth.ts`, `themeStore.ts` |
| 修改密码 | 已登录用户可修改自身密码（需验证当前密码） | `auth.ts` |
| 个人资料 | 已登录用户可修改自身姓名 | `auth.ts` |

## 11. 工程基础设施

### 后端中间件栈

| 中间件 | 文件 | 说明 |
|--------|------|------|
| requestId | `middleware/requestId.ts` | 为每个请求分配唯一 ID（UUID），注入 `req.requestId`，用于全链路追踪 |
| httpLogger | `middleware/httpLogger.ts` | 基于 Pino 的结构化 HTTP 访问日志，自动记录请求方法、路径、状态码、耗时 |
| authenticate | `middleware/auth.ts` | JWT 验证 + 5 分钟 TTL 内存缓存 |
| requirePermission | `middleware/permission.ts` | RBAC 权限检查（resource:action，支持通配符） |
| validate | `middleware/validate.ts` | 基于 Zod Schema 的请求校验（body/query/params），校验失败返回 400 + 详细错误 |
| apiCache | `middleware/cache.ts` | GET 请求内存缓存，按用户隔离，TTL 过期自动清理 |

### Zod 输入校验

校验 Schema 位于 `server/src/schemas/` 目录，通过 `validate` 中间件统一处理：
- `auth.ts` — 登录、刷新令牌、密码修改的请求体校验
- `users.ts` — 用户创建/更新的字段校验
- `projects.ts` — 项目创建/更新的字段校验

### 结构化日志

使用 Pino 替代 morgan，日志格式为结构化 JSON：
- 开发环境使用 `pino-pretty` 格式化输出
- 每条日志自动携带 `requestId`，支持跨服务追踪
- 配置文件：`server/src/utils/logger.ts`

### API 文档

通过 Swagger UI 提供交互式 API 文档（仅非生产环境）：
- 访问地址：`/api/docs`（Swagger UI）
- JSON 规范：`/api/docs.json`（OpenAPI 3.0.0）
- 配置文件：`server/src/swagger.ts`
- 支持 Bearer Token 认证调试

### 国际化 (i18n)

前端使用 i18next + react-i18next：
- 默认语言：简体中文（zh-CN）
- 预留英文翻译（en-US）
- 翻译文件：`client/src/i18n/locales/`
- 覆盖范围：通用操作（保存/取消/删除）、导航菜单、认证提示、模块标签等

### ESLint

使用 flat config 格式（`eslint.config.mjs`）：
- TypeScript 规则（`@typescript-eslint`）
- React Hooks 规则（`eslint-plugin-react-hooks`）
- 运行命令：`npm run lint`

### 性能优化

| 措施 | 说明 |
|------|------|
| Vite manualChunks | 前端构建分包：arco-design / react-dom / echarts 等大依赖独立 chunk |
| API 缓存 | `middleware/cache.ts`，按用户隔离的 GET 请求内存缓存 |
| 认证缓存 | `middleware/auth.ts`，5 分钟 TTL 用户信息缓存 |
| 熔断器 | `utils/circuitBreaker.ts`，保护 AI API 调用：失败阈值触发熔断 → 半开探测 → 恢复 |

### 安全措施

| 措施 | 说明 |
|------|------|
| Helmet | 安全 HTTP 响应头（X-Content-Type-Options, X-Frame-Options 等） |
| CORS | 可配置的跨域白名单（`CORS_ORIGINS` 环境变量），生产环境未设置则拒绝启动 |
| 登录限流 | 生产环境 20 次/15分钟，开发环境 200 次/15分钟 |
| HTML 清洗 | `utils/sanitize.ts`，XSS 防护，保留安全标签 |
| 路径安全 | 文件上传/删除使用 `path.basename` 防止目录遍历 |
| Trust Proxy | Express 信任一层代理，正确获取客户端 IP |
| 启动校验 | 生产环境启动时强制校验 JWT 密钥非默认值、CORS_ORIGINS 已设置，否则拒绝启动 |
| 密码变更 | 修改密码后自动清除认证缓存，使已签发 Token 在下次验证时重新查库 |

### 无障碍

E2E 测试集成 axe-core WCAG 2.0 AA 审计：
- 测试文件：`e2e/specs/accessibility.spec.ts`
- 自动检测颜色对比度、ARIA 属性、键盘可访问性等

### 单元测试

使用 Vitest 作为测试框架，前后端统一：

| 层级 | 测试文件 | 测试用例 | 覆盖范围 |
|------|---------|---------|---------|
| 后端 | 28 | 630 | 路由（13/17）、工具函数（15/18）、中间件（3/6） |
| 前端 | 18 | 236 | 页面（7）、组件（2）、Hooks（3/8）、Store（2/2）、工具（2） |
| **合计** | **46** | **866** | — |

后端关键覆盖：
- 路由：auth, users, projects, activities(68), weeklyReports(38), products(27), checkItems, notifications, templates, risk(15), riskItems, roles(15), aiConfig(14)
- 工具：circuitBreaker（状态机）、dependencyValidator（DFS 环检测）、criticalPath（CPM）、projectProgress（加权进度）、excelActivityParser（Excel 解析 32 用例）
- 中间件：auth（JWT + 缓存）、permission（RBAC + 通配符）、validate（Zod 校验）

前端关键覆盖：
- Hooks：useDebouncedCallback、useColumnPrefs、useUndoStack
- Store：authStore（登录/权限/协作者）、themeStore（主题切换/持久化）
- 页面：Login、AiManagement、ActivityComments、GanttArrows、DragReorder

### 代码质量

| 工具 | 说明 |
|------|------|
| husky | Git hooks 管理，`pre-commit` 触发 lint-staged |
| lint-staged | 提交前对暂存的 `.ts/.tsx` 文件自动执行 `eslint --fix` |
| Pino 结构化日志 | 全部路由和中间件使用 `logger.error/info/warn`，不再使用 `console.*`，每条日志自动携带 requestId |

### CI/CD

GitHub Actions 流水线（`.github/workflows/ci.yml`）包含四个 Job：
- `lint` — ESLint 代码检查
- `security` — `npm audit --audit-level=high` 依赖安全扫描
- `test` — 前后端单元测试（Vitest，46 文件 / 866 用例）+ 测试覆盖率报告 + 构建验证
- `e2e` — Playwright E2E 测试（48 文件 / 254 用例，失败自动上传报告）

### Docker 部署

| 文件 | 说明 |
|------|------|
| `Dockerfile` | 多阶段构建（build → production），非 root 用户运行，`node:20-alpine` 基础镜像 |
| `docker-compose.yml` | 单容器应用 + SQLite，健康检查，数据卷持久化（atlas-data + atlas-uploads） |
| `.dockerignore` | 排除 node_modules、.git、测试文件、开发数据库等 |
| `deploy.sh` | 一键部署工具（setup/update/status/logs/stop/backup/restore） |
| `.env.production` | 环境变量模板 |

```bash
# 一键部署（自动生成安全密钥）
./deploy.sh setup

# 日常运维
./deploy.sh update   # 拉代码 + 自动备份 + 重建
./deploy.sh status   # 查看版本、运行时间、数据量
./deploy.sh backup   # 备份数据库（保留 30 天）
./deploy.sh restore  # 恢复数据库
```

`docker-compose.yml` 通过 `${VAR:?error}` 语法强制要求设置 `JWT_SECRET`、`JWT_REFRESH_SECRET`、`CORS_ORIGINS`。

### 数据安全

| 措施 | 说明 |
|------|------|
| 数据卷隔离 | SQLite 数据库存储在 Docker volume `atlas-data`，与容器生命周期解耦 |
| 自动备份 | 每次 `update` 前自动备份；备份使用 SQLite `.backup` 命令保证一致性 |
| 备份保留 | `backups/` 目录保留 30 天备份，自动清理过期文件 |
| 密钥自动生成 | `deploy.sh setup` 自动用 `openssl rand -hex 32` 生成 JWT 密钥 |
| 非 root 运行 | Docker 容器内以 `atlas:1001` 用户运行，降低提权风险 |
| 启动校验 | 生产环境启动时强制校验 JWT 密钥非默认值 + CORS 已配置 |

### 优雅关机

服务端监听 SIGTERM / SIGINT 信号，收到后：
1. 停止接受新请求
2. 等待进行中的请求完成（最长 10 秒超时）
3. 关闭数据库连接
4. 退出进程

## 12. 环境变量

| 变量 | 说明 | 默认值 | 必填（生产） |
|------|------|--------|-------------|
| DATABASE_URL | SQLite 数据库路径 | file:./dev.db | 自动设置 |
| JWT_SECRET | Access Token 签名密钥 | hw-system-jwt-secret | ✅ 必改 |
| JWT_REFRESH_SECRET | Refresh Token 签名密钥 | hw-system-refresh-secret | ✅ 必改 |
| PORT | 后端服务端口 | 3000 | 否 |
| CORS_ORIGINS | 允许的跨域来源（逗号分隔） | http://localhost:5173 | ✅ 必改 |
| AI_API_KEY | 外部 AI API 密钥 | （空） | 否 |
| AI_API_URL | 外部 AI API 地址 | （空） | 否 |
| RISK_SCHEDULER_ENABLED | 是否启用风险定时评估 | false | 否 |
| RISK_SCHEDULER_CRON | 定时评估 cron 表达式 | 0 8 * * 1-5（工作日 8:00） | 否 |

## 13. 启动流程

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 生成 Prisma Client
cd server && npx prisma generate

# 3. 数据库同步（开发环境用 SQLite）
npx prisma db push

# 4. 初始化种子数据
npx tsx src/prisma/seed.ts

# 5. 启动前后端（项目根目录）
cd .. && npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3000
- API 文档：http://localhost:3000/api/docs
- 健康检查：GET http://localhost:3000/api/health

### Docker 部署（生产环境）

```bash
# 在 Ubuntu 服务器上：
git clone https://github.com/littlesuper/Atlas.git
cd Atlas
./deploy.sh setup    # 自动生成密钥、构建镜像、初始化数据库
```

- 应用：http://服务器IP:3000
- 默认账号：admin / admin123（首次登录后请立即修改密码）
- 数据库：SQLite（存储在 Docker volume，容器重建不丢失）
- 健康检查返回版本号格式：`x.y.z`（如 `1.2.3`）

### 版本号规则

版本号格式为 `x.y.z`：

| 段 | 含义 | 维护方式 |
|----|------|---------|
| x | 大版本号 | 人工修改（重大功能变更或不兼容改动时递增） |
| y | 小版本号 | 人工修改（新功能或功能增强时递增） |
| z | 提交版本号 | 自动递增（每次 git commit 自动 +1） |

规则：
- `x` 和 `y` 由开发者手动修改 `package.json` 中的 `version` 字段
- `z` 通过 `post-commit` Git Hook 在每次提交后自动递增
- 当 `x` 或 `y` 发生变化时，`z` 自动重置为 1
- 版本号存储在根目录 `package.json` 的 `version` 字段中
- 前端通过 `/api/health` 接口动态获取版本号（页面加载时请求），无需重启前端即可显示最新版本
- 后端 `/api/health` 接口每次请求时实时读取 `package.json`，无需重启服务端
- 前端右上角用户下拉菜单底部显示 `vx.y.z` 格式的版本号

## 14. 模块规格文档索引

| 文档 | 说明 |
|------|------|
| [auth-spec.md](./auth-spec.md) | 认证模块（登录、令牌、身份验证） |
| [project-spec.md](./project-spec.md) | 项目管理模块（项目、活动、甘特图、AI风险评估） |
| [product-spec.md](./product-spec.md) | 产品管理模块（产品信息、规格、性能） |
| [permission-spec.md](./permission-spec.md) | 权限管理模块（用户、角色、权限 RBAC） |
| [system-spec.md](./system-spec.md) | 系统整体规格（本文档） |
| [e2e-test-suite.md](./e2e-test-suite.md) | E2E 测试用例集（Playwright，48 文件 / 254 用例） |
| [test-cases.md](./test-cases.md) | API / 功能测试用例（五模块覆盖） |
