# AGENTS.md

## 项目概述

Atlas 是一套面向硬件团队的 Web 项目管理平台，使用 npm workspaces 的 monorepo 结构。

## 技术栈

- **前端:** React 18 + TypeScript + Vite 7 + Arco Design + Zustand + React Router 7 + i18next
- **后端:** Express 4 + TypeScript + Prisma 6 + Zod + Pino + SQLite(dev)/PostgreSQL(prod)
- **测试:** Vitest(单元) + Playwright(E2E, 300+ 用例) + axe-core(无障碍)
- **工具链:** ESLint(flat config) + Prettier + Swagger/OpenAPI

## 项目结构

```
client/src/           # 前端源码
  api/                # Axios 请求封装与 API 定义
  components/         # 通用组件
  pages/              # 页面模块（Login, Project, Product, WeeklyReports, Workload, Admin）
  store/              # Zustand store（authStore, themeStore）
  types/index.ts      # 所有 TypeScript 类型定义
  utils/constants.ts  # 状态/优先级/类别映射常量

server/src/           # 后端源码
  routes/             # Express 路由（18 个模块）
  middleware/         # auth, permission, validate(Zod), requestId, httpLogger, cache
  schemas/            # Zod 校验 schema（auth, users, projects）
  utils/              # 工具函数（workday, dependencyScheduler, riskEngine, logger, circuitBreaker 等）
  swagger.ts          # OpenAPI/Swagger 文档配置
  prisma/             # schema.prisma（25 个模型）、seed.ts

e2e/                  # Playwright E2E 测试（55 spec，300+ 用例，含 axe-core 无障碍审计）
specs/                # 需求规格文档
docs/                 # QA 测试计划与报告
```

## 常用命令

```bash
npm run dev                    # 启动前后端开发服务器
npm run dev:server             # 仅启动后端
npm run dev:client             # 仅启动前端
npm run build                  # 构建生产版本

cd server
npx prisma generate            # 生成 Prisma Client
npx prisma migrate dev --name <name>  # 创建迁移
npx prisma studio              # 打开数据库 GUI
npx tsx src/prisma/seed.ts     # 初始化种子数据

cd client && npm test          # 前端单元测试
cd server && npm test          # 后端单元测试
npx playwright test            # E2E 测试
npm run lint                   # ESLint 检查
```

## 开发规范

- 前后端 100% TypeScript，类型定义集中在 `client/src/types/index.ts`
- 后端 Prisma 自动生成类型，无需手动维护
- UI 组件使用 Arco Design (`@arco-design/web-react`)
- 状态管理使用 Zustand（不用 Redux）
- 路由使用 React Router v7
- 日期处理使用 Day.js
- 中文姓名转拼音使用 pinyin-pro（`client` 依赖）
- 开发环境数据库为 SQLite（`server/prisma/dev.db`），无需安装 PostgreSQL
- 工作日计算考虑中国法定节假日（`server/src/utils/workday.ts`）
- 后端输入校验使用 Zod（`server/src/schemas/`），通过 `validate` 中间件统一处理
- 后端日志使用 Pino（`server/src/utils/logger.ts`），每个请求自动分配 requestId
- API 文档通过 Swagger UI 访问：`/api/docs`（仅非生产环境）
- 国际化使用 i18next（`client/src/i18n/`），默认中文，预留英文翻译
- ESLint 使用 flat config（`eslint.config.mjs`），含 TypeScript + React Hooks 规则
- AI API 调用受熔断器保护（`server/src/utils/circuitBreaker.ts`）

## 活动角色绑定（Activity Role Binding）

活动的执行人通过 RBAC 角色映射自动填入，支持手动调整。详细规格见 `specs/activity-role-binding-spec.md`。

- **RoleMember**（`server/prisma/schema.prisma`）：全局"角色→人员"映射表
- **ActivityExecutor**：活动执行人多对多表，含来源标记（`ROLE_AUTO`/`MANUAL_ADD`）和角色快照
- **Activity.roleId**：活动绑定的角色（可空）
- **API**: `GET/POST/PATCH/DELETE /api/role-members`、`POST /api/role-members/batch-set`、`GET /api/role-members/preview/:roleId`
- **管理页面**: 系统管理 → 账号管理 → 角色成员 Tab
- **迁移脚本**: `server/src/scripts/migrateRoleBinding.ts`（从旧 assignees 迁移到 ActivityExecutor）
- **验证脚本**: `server/src/scripts/verifyRoleBindingMigration.ts`
- 创建活动时：若提供 `roleId` 且无 `executorIds`，自动按角色映射填入全员
- 编辑活动时：`resetExecutorsByRole: true` 可显式按新角色重置执行人

## 用户模型

User 模型支持两种使用场景：
- **可登录用户**（`canLogin: true`）：需要 username + password，可分配角色和权限，可登录系统
- **仅联系人**（`canLogin: false`）：只需 realName，可被分配为活动负责人，但无法登录

关键字段：
- `username`（可选，唯一）：登录用户名，创建时根据姓名自动生成拼音，创建后不可修改
- `password`（可选）：仅可登录用户需要
- `realName`（必填）：用户姓名
- `wecomUserId`（可选，唯一）：企业微信用户ID，用于企微扫码登录
- `canLogin`（布尔值）：控制是否允许登录系统
- `status`（ACTIVE/DISABLED）：账号启用/禁用状态

注意：User 模型没有 email 和 phone 字段。

## 数据库

- Schema 位于 `server/prisma/schema.prisma`，包含 25 个模型
- 开发环境使用 SQLite，生产环境切换为 PostgreSQL
- 修改 schema 后需运行 `npx prisma migrate dev --name <描述>` 创建迁移
- 开发环境也可用 `npx prisma db push` 快速同步 schema（不生成迁移文件）
- 种子数据包含 3 个测试账号：admin/admin123, zhangsan/123456, lisi/123456

## 系统版本号

版本号格式 `x.y.z`（存储在根目录 `package.json` 的 `version` 字段）：
- **x（大版本）**：人工修改，重大功能变更或不兼容改动时递增
- **y（小版本）**：人工修改，新功能或功能增强时递增
- **z（提交版本）**：自动递增，每次 git commit 通过 `post-commit` Hook 自动 +1；当 x 或 y 变化时 z 重置为 1

健康检查接口 `/api/health` 每次请求实时读取 `package.json` 返回 `version`（格式 `x.y.z`）
前端右上角版本号通过 `/api/health` 动态获取，刷新页面即可看到最新版本

## 环境变量

服务端环境变量位于 `server/.env`，关键配置：
- `DATABASE_URL` - 数据库连接（SQLite: `file:./dev.db`）
- `JWT_SECRET` / `JWT_REFRESH_SECRET` - JWT 签名密钥
- `PORT` - 服务端口（默认 3000）
- `CORS_ORIGINS` - 允许的跨域来源
- `AI_API_KEY` / `AI_API_URL` - AI 功能配置（可选）

## API 路由前缀

所有 API 路由以 `/api` 开头：
- `/api/auth` - 认证
- `/api/users` - 用户管理
- `/api/roles` - 角色管理
- `/api/projects` - 项目管理
- `/api/activities` - 活动管理
- `/api/products` - 产品管理
- `/api/risk` - 风险评估
- `/api/weekly-reports` - 周报
- `/api/templates` - 项目模板
- `/api/uploads` - 文件上传
- `/api/ai-config` - AI 配置
- `/api/audit-logs` - 审计日志
- `/api/wecom-config` - 企微配置
- `/api/activity-comments` - 活动评论
- `/api/notifications` - 通知
- `/api/check-items` - 活动检查项
- `/api/risk-items` - 风险项管理
- `/api/docs` - Swagger API 文档（仅开发环境）
- `/api/docs.json` - OpenAPI JSON 规范
