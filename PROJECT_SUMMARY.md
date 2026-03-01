# Atlas 硬件项目管理平台 - 项目完成总结

## 项目概览

Atlas 是一套完整的硬件项目管理平台，为项目经理和产品经理提供项目全生命周期管理、产品信息管理、团队协作和权限控制等功能。

**项目规模:** 100+ 文件, 15000+ 行代码
**技术栈:** React + TypeScript + Arco Design + Express + Prisma + SQLite/PostgreSQL

---

## 已完成的功能模块

### 1. 认证与授权系统

**后端实现:**
- JWT 双令牌认证机制（Access Token 8 小时 + Refresh Token 7 天）
- bcrypt 密码加密（salt rounds: 10）
- 自动 token 刷新机制
- 基于角色的访问控制（RBAC）
- 权限中间件（支持通配符 `*:*`, `resource:*`, `*:action`）
- 用户状态管理（ACTIVE/DISABLED）
- 企业微信 OAuth 扫码登录

**前端实现:**
- 登录页面（深色渐变背景 + 毛玻璃卡片）
- 企微扫码登录组件
- Zustand 全局状态管理
- Axios 请求拦截器（自动添加 token）
- Axios 响应拦截器（401 自动刷新 + 请求队列防重复刷新）
- ProtectedRoute 路由守卫

**API 接口:**
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/refresh` - 刷新令牌
- `GET /api/auth/me` - 获取当前用户信息
- `PUT /api/auth/profile` - 更新个人资料
- `POST /api/auth/change-password` - 修改密码
- `GET /api/auth/wecom/config` - 获取企微配置
- `POST /api/auth/wecom/login` - 企微登录
- `GET /api/auth/preferences` - 获取用户偏好
- `PUT /api/auth/preferences` - 更新用户偏好

---

### 2. 用户与角色管理

**后端实现:**
- 用户 CRUD（创建、读取、更新、删除）
- 角色 CRUD
- 用户-角色多对多关联
- 角色-权限多对多关联
- 分页查询、关键词搜索
- 预设 4 个角色（系统管理员、项目经理、产品经理、只读成员）
- 预设 21 个权限（5 资源 × 4 操作 + 全通配）

**前端实现:**
- 账号管理页面（Tab 切换）
- 用户管理表格（搜索、编辑、删除）
- 用户创建/编辑 Modal
- 角色管理表格
- 角色创建/编辑 Modal（权限配置按资源分组）
- 权限可视化（Tag 标签展示）
- 权限控制（按钮根据权限显示/隐藏）

**API 接口:**
- `GET /api/users` - 获取用户列表
- `POST /api/users` - 创建用户
- `PUT /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户
- `GET /api/roles` - 获取角色列表
- `GET /api/roles/permissions` - 获取所有权限
- `POST /api/roles` - 创建角色
- `PUT /api/roles/:id` - 更新角色
- `DELETE /api/roles/:id` - 删除角色

---

### 3. 项目管理系统

**后端实现:**
- 项目 CRUD + 成员管理
- 活动/任务 CRUD（支持层级结构、批量操作）
- 工作日计算（排除中国法定节假日、周末，含调休）
- 项目进度自动计算
- 甘特图数据接口
- 活动依赖管理（FS/SS/FF/SF 四种类型 + lag）
- 依赖调度器（BFS 级联计算）
- 产品线筛选（支持逗号分隔多值 + null 值）
- 统计数据（全部/进行中/已完成/已暂停）
- 关键路径计算
- AI 风险评估（支持 AI API + 规则引擎，风险因素可展开查看触发的具体活动/人员）
- 项目周报管理 + AI 智能建议
- 活动归档快照与对比
- 活动评论系统

**前端实现:**
- 项目列表页（系统首页）
  - 统计卡片（可点击筛选，带装饰背景图标 + 光晕）
  - 项目表格（名称、产品线、状态、优先级、进度条、负责人、时间范围、活动数、周报状态实心图标）
  - 搜索框（300ms 防抖）
  - 产品线快速筛选 Toggle
  - 新建/编辑抽屉（含模板选择）
  - 分页（每页 20 条）
- 项目详情页
  - 返回按钮 + 项目基本信息
  - Tab 切换（活动列表 / 甘特图 / AI 风险评估 / 项目周报 / 产品 / 排期工具）
  - 活动列表：树形结构、内联编辑（10+ 字段）、拖拽排序、阶段工期合计标签（可筛选）、状态快速筛选、Esc 退出编辑
  - 活动创建/编辑抽屉
  - 活动评论面板
  - 列设置：可拖拽调整列顺序与可见性

**API 接口:**
- `GET /api/projects` - 获取项目列表（分页、筛选、搜索、统计）
- `GET /api/projects/:id` - 获取单个项目
- `POST /api/projects` - 创建项目
- `PUT /api/projects/:id` - 更新项目
- `DELETE /api/projects/:id` - 删除项目
- `GET /api/projects/:id/members` - 获取项目成员
- `POST /api/projects/:id/members` - 添加项目成员
- `DELETE /api/projects/:id/members/:userId` - 移除项目成员
- `GET /api/activities/project/:projectId` - 获取活动列表（树形）
- `GET /api/activities/project/:projectId/gantt` - 获取甘特图数据
- `POST /api/activities` - 创建活动
- `PUT /api/activities/:id` - 更新活动
- `DELETE /api/activities/:id` - 删除活动
- `PUT /api/activities/project/:projectId/reorder` - 批量排序
- `PUT /api/activities/batch-update` - 批量更新
- `DELETE /api/activities/batch-delete` - 批量删除
- `GET /api/activities/project/:projectId/critical-path` - 关键路径
- `POST /api/activities/project/:projectId/archives` - 创建归档快照
- `GET /api/activities/project/:projectId/archives` - 获取归档列表
- `GET /api/activities/archives/:id` - 获取归档详情
- `DELETE /api/activities/archives/:id` - 删除归档
- `POST /api/activities/archives/compare` - 对比归档
- `GET /api/activity-comments/activity/:activityId` - 获取活动评论
- `POST /api/activity-comments` - 创建评论
- `DELETE /api/activity-comments/:id` - 删除评论
- `GET /api/risk/project/:projectId` - 获取风险评估历史
- `POST /api/risk/project/:projectId/assess` - 发起风险评估
- `DELETE /api/risk/:id` - 删除评估
- `GET /api/risk/summary` - 风险汇总

---

### 4. 项目模板与排期工具

**后端实现:**
- 项目模板 CRUD（含活动树整体替换）
- 模板实例化：拓扑排序解析依赖链，推算所有活动日期
- 资源冲突检测：支持"所有项目"或"仅当前项目"范围切换，跨项目检测同一人员的时间重叠
- What-If 模拟：BFS 级联计算延期/提前影响，支持一键应用模拟结果到实际数据
- AI 排期建议：基于历史数据 + AI 分析推荐工期和风险

**前端实现:**
- 模板管理页面（Admin → 项目模板 Tab）
  - 模板列表表格（名称、产品线、描述、活动数、操作）
  - 模板创建/编辑抽屉（活动内联编辑表格）
  - 模板复制功能（自动映射依赖 ID）
- 项目创建时模板选择（自动实例化生成活动）
- 排期工具 Tab（项目详情 → 排期工具）
  - 资源冲突检测面板（支持"所有项目/仅当前项目"切换，跨项目冲突橙色标签区分）
  - What-If 模拟面板（选择活动 + 延期/提前天数 → 查看影响 → 可一键应用结果）
  - AI 排期建议面板（工期建议表 + 风险提示表）

**API 接口:**
- `GET /api/templates` - 获取模板列表
- `GET /api/templates/:id` - 获取模板详情（含活动树）
- `POST /api/templates` - 创建模板
- `PUT /api/templates/:id` - 更新模板
- `DELETE /api/templates/:id` - 删除模板
- `POST /api/templates/:id/instantiate` - 模板实例化到项目
- `GET /api/activities/workload` - 资源负载数据
- `GET /api/activities/resource-conflicts` - 资源冲突检测
- `POST /api/activities/project/:projectId/what-if` - What-If 模拟（支持正数延期/负数提前）
- `POST /api/activities/project/:projectId/what-if/apply` - 应用 What-If 模拟结果
- `POST /api/activities/project/:projectId/ai-schedule` - AI 排期建议

---

### 5. 周报管理系统

**后端实现:**
- 周报 CRUD + 状态流转（草稿 → 已提交 → 已归档）
- 按周次分组、按年/周查询
- 分阶段进展记录
- 附件关联
- AI 智能建议

**前端实现:**
- 周报汇总页（已提交周报按周次分组，最新在上方，产品线筛选）
- 草稿箱 Tab
- 周报创建/编辑表单（富文本编辑器）
- 上周参考内容（可折叠灰色区块）
- AI 建议面板

**API 接口:**
- `GET /api/weekly-reports` - 获取周报列表（默认排除草稿）
- `GET /api/weekly-reports/drafts` - 获取草稿列表
- `GET /api/weekly-reports/project/:projectId` - 获取项目周报
- `GET /api/weekly-reports/project/:projectId/latest` - 最新周报
- `GET /api/weekly-reports/project/:projectId/previous` - 上周参考
- `GET /api/weekly-reports/latest-status` - 所有项目最新周报状态
- `GET /api/weekly-reports/:id` - 获取周报详情
- `GET /api/weekly-reports/week/:year/:weekNumber` - 按周查询
- `POST /api/weekly-reports` - 创建周报
- `PUT /api/weekly-reports/:id` - 更新周报
- `POST /api/weekly-reports/:id/submit` - 提交周报
- `POST /api/weekly-reports/:id/archive` - 归档周报
- `DELETE /api/weekly-reports/:id` - 删除周报
- `POST /api/weekly-reports/project/:projectId/ai-suggestions` - AI 建议

---

### 6. 产品管理系统

**后端实现:**
- 产品 CRUD + 复制功能
- 规格参数与性能指标（JSON 键值对）
- 项目关联
- 变更日志追踪
- CSV 导出
- 分页查询 + 状态/类别筛选 + 搜索

**前端实现:**
- 产品管理页面
  - 产品列表表格（名称、型号+版本、类别、状态、关联项目、规格数）
  - 搜索框（300ms 防抖）
  - 状态/类别筛选下拉框
  - 分页（每页 20 条）
- 产品创建/编辑抽屉（基本信息 + 规格参数 + 性能指标）
- 产品详情抽屉

**API 接口:**
- `GET /api/products` - 获取产品列表
- `GET /api/products/:id` - 获取单个产品
- `POST /api/products` - 创建产品
- `PUT /api/products/:id` - 更新产品
- `DELETE /api/products/:id` - 删除产品
- `POST /api/products/:id/copy` - 复制产品
- `GET /api/products/:id/changelog` - 变更日志
- `GET /api/products/export` - CSV 导出

---

### 7. 通知系统

**后端实现:**
- 通知生成（任务到期、里程碑临近、周报提醒）
- 标记已读/全部已读
- 分页查询

**前端实现:**
- 通知铃铛组件（未读数 Badge）
- 通知面板（Portal 渲染，避免 z-index 遮挡）
- 标记已读/全部已读/删除

**API 接口:**
- `GET /api/notifications` - 获取通知列表
- `PUT /api/notifications/:id/read` - 标记已读
- `PUT /api/notifications/read-all` - 全部已读
- `DELETE /api/notifications/:id` - 删除通知
- `POST /api/notifications/generate` - 生成通知

---

### 8. 审计日志

**后端实现:**
- 操作记录追踪（LOGIN、CREATE、UPDATE、DELETE）
- 变更详情记录（before/after）
- IP 地址记录
- 按用户/操作类型/资源类型筛选

**API 接口:**
- `GET /api/audit-logs` - 获取审计日志（分页、筛选）
- `GET /api/audit-logs/users` - 获取有操作记录的用户列表

---

### 9. AI 配置管理

**后端实现:**
- 多 AI 提供商配置管理
- API 连接测试
- 模型列表获取
- 用量统计

**API 接口:**
- `GET /api/ai-config` - 获取 AI 配置列表
- `POST /api/ai-config` - 创建配置
- `PUT /api/ai-config/:id` - 更新配置
- `DELETE /api/ai-config/:id` - 删除配置
- `POST /api/ai-config/test-connection` - 测试连接
- `POST /api/ai-config/fetch-models` - 获取可用模型
- `GET /api/ai-config/usage-stats` - 用量统计

---

### 10. 企微配置

**API 接口:**
- `GET /api/wecom-config` - 获取企微配置
- `PUT /api/wecom-config` - 更新企微配置

---

### 11. 文件上传

**后端实现:**
- Multer 文件上传中间件
- 文件类型验证（图片/PDF/Word/Excel/ZIP/TXT）
- 文件大小限制（10MB）
- 唯一文件名生成（timestamp + random）
- 路径遍历防护

**API 接口:**
- `POST /api/uploads` - 上传文件
- `DELETE /api/uploads/:filename` - 删除文件

---

## 数据库模型（21 个）

### 认证与授权
| 模型 | 说明 |
|------|------|
| User | 用户 |
| Role | 角色 |
| Permission | 权限 |
| UserRole | 用户-角色关联（多对多） |
| RolePermission | 角色-权限关联（多对多） |

### 项目管理
| 模型 | 说明 |
|------|------|
| Project | 项目 |
| ProjectMember | 项目成员（多对多） |
| Activity | 活动/任务（自引用层级） |
| ActivityArchive | 活动归档快照 |
| ActivityComment | 活动评论 |

### 项目模板
| 模型 | 说明 |
|------|------|
| ProjectTemplate | 项目模板 |
| TemplateActivity | 模板活动（自引用层级） |

### 评估与报告
| 模型 | 说明 |
|------|------|
| RiskAssessment | 风险评估 |
| WeeklyReport | 项目周报 |

### 产品管理
| 模型 | 说明 |
|------|------|
| Product | 产品 |
| ProductChangeLog | 产品变更日志 |

### 系统管理
| 模型 | 说明 |
|------|------|
| AiConfig | AI 配置 |
| AiUsageLog | AI 用量日志 |
| WecomConfig | 企微配置 |
| Notification | 通知 |
| AuditLog | 审计日志 |

---

## 前端路由

| 路径 | 页面 | 权限要求 |
|------|------|---------|
| `/login` | 登录页 | 无 |
| `/` | 重定向到 `/projects` | 需登录 |
| `/projects` | 项目列表（首页） | 需登录 |
| `/projects/:id` | 项目详情 | 需登录 |
| `/products` | 产品管理 | 需登录 |
| `/admin` | 系统管理 | 需 `user:read` 权限 |
| `/weekly-reports` | 周报汇总 | 需登录 |
| `/weekly-reports/new` | 新建周报 | 需登录 |
| `/weekly-reports/:id/edit` | 编辑周报 | 需登录 |
| `/workload` | 资源负载 | 需登录 |

---

## 技术栈详情

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.3 | UI 框架 |
| TypeScript | 5.7 | 类型系统 |
| Vite | 7.x | 构建工具 |
| Arco Design | 2.66 | UI 组件库 |
| Zustand | 5.0 | 状态管理 |
| React Router | 7.1 | 路由管理 |
| Axios | 1.7 | HTTP 客户端 |
| Day.js | 1.11 | 日期处理 |
| @wangeditor/editor | 5.1 | 富文本编辑器 |
| Vitest | 4.0 | 单元测试 |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Express | 4.21 | Web 框架 |
| TypeScript | 5.7 | 类型系统 |
| Prisma | 6.x | ORM |
| SQLite / PostgreSQL | - / 17.0 | 数据库 |
| JWT | 9.0 | 认证 |
| bcryptjs | 2.4 | 密码加密 |
| Multer | 1.4 | 文件上传 |
| Helmet | 8.1 | 安全响应头 |
| Morgan | 1.10 | 请求日志 |
| express-rate-limit | - | 登录限流 |

### 测试

| 技术 | 版本 | 用途 |
|------|------|------|
| Playwright | 1.58 | E2E 测试（35+ 用例） |
| Vitest | 4.0 | 前端单元测试 |

---

## 数据统计

- **总文件数:** 100+
- **代码行数:** 15000+（不含注释）
- **数据模型:** 21 个
- **API 接口:** 60+
- **前端页面:** 8 个主页面
- **路由模块:** 15 个后端路由
- **权限数:** 21 个预设权限
- **角色数:** 4 个预设角色
- **测试账号:** 3 个
- **E2E 测试:** 35+ 用例（7 个测试文件）

---

## 核心特性

### 架构设计
- Monorepo 架构（npm workspaces）
- 前后端完全分离
- RESTful API 设计
- 模块化组织

### 代码质量
- 100% TypeScript
- 30+ 类型定义
- Prisma 自动生成类型
- 统一的错误处理

### 安全性
- JWT 双令牌认证
- bcrypt 密码加密
- RBAC 权限控制
- Helmet 安全响应头
- 登录接口限流（20 次/15 分钟）
- SQL 注入防护（Prisma）
- XSS 防护（React 自动转义）
- 文件上传验证 + 路径遍历防护
- 审计日志全操作记录

### 智能化
- AI 风险评估 + 规则引擎回退（风险因素支持展开查看具体任务列表）
- AI 周报智能建议
- AI 排期建议（基于历史数据）
- 工作日自动计算（中国法定节假日）
- What-If 模拟（延期/提前 + 一键应用） + 跨项目资源冲突检测
- 依赖调度器（BFS 级联）

### 用户体验
- 确认弹窗统一样式（标题左对齐 + 右上角关闭按钮 + 按钮靠右）
- 风险因素可展开查看触发的具体活动（逾期天数、工期偏差、跨项目冲突人员等）

### 性能优化
- 代码分割（React.lazy）
- 分页查询
- 数据库索引
- 请求队列防重复

---

## 文档清单

- README.md - 项目说明
- GETTING_STARTED.md - 快速启动指南
- DEPLOYMENT.md - 部署指南
- PROJECT_SUMMARY.md - 项目总结（本文档）
- CLAUDE.md - Claude Code 项目配置
- specs/ - 需求规格文档（5 个文件）
- docs/ - 补充文档

---

**最后更新:** 2026 年 2 月 27 日
**版本:** 1.3.0
**状态:** 生产就绪
