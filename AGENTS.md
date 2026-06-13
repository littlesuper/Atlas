# AGENTS.md

## 项目概述

Atlas 是一套面向硬件团队的 Web 项目管理平台，使用 npm workspaces 的 monorepo 结构。

## 技术栈

- **前端:** React 19 + TypeScript + Vite 7 + Arco Design + Zustand + React Router 7 + i18next
- **后端:** Express 4 + TypeScript + Prisma 7 + Zod + Pino + SQLite(dev)/PostgreSQL(prod)
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
  routes/             # Express 路由模块
    activities/       # 活动（shared, crud, schedule, analysis, import）
    auth/             # 认证（shared, session, account, wecom）
    projects/         # 项目（shared, crud, members, archive）
    products/         # 产品（shared, crud, actions）
    weeklyReports/    # 周报（shared, crud, project, actions）
    ...               # 其余单文件路由（risk, roles, users, etc.）
  middleware/         # auth, permission, validate(Zod), requestId, httpLogger, cache
  schemas/            # Zod 校验 schema（auth, users, projects）
  utils/              # 工具函数（workday, dependencyScheduler, riskEngine, logger, circuitBreaker, roleMembershipResolver 等）
  swagger.ts          # OpenAPI/Swagger 文档配置
  db.ts               # PrismaClient 单例（含 driver adapter）
  prisma/             # schema.prisma（含 ActivityExecutor、RoleMember 等模型）、seed.ts

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
npx prisma generate            # 生成 Prisma Client（输出到 src/generated/prisma/）
npx prisma migrate dev --name <name>  # 创建迁移
npx prisma db push              # 快速同步 schema（开发环境，不生成迁移文件）
npx prisma studio              # 打开数据库 GUI
npx tsx src/prisma/seed.ts     # 初始化种子数据

cd client && npm test          # 前端单元测试
cd server && npm test          # 后端单元测试
npx playwright test            # E2E 测试
npm run lint                   # ESLint 检查
```

## 开发规范

- 前后端 100% TypeScript，类型定义集中在 `client/src/types/index.ts`
- 后端 Prisma 7 自动生成类型（输出到 `server/src/generated/prisma/`，已 gitignore），无需手动维护
- 所有 PrismaClient 通过 `server/src/db.ts` 单例访问（含 `@prisma/adapter-better-sqlite3` driver adapter）
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
- ESLint 忽略 Prisma 生成目录（`server/src/generated/**`）
- AI API 调用受熔断器保护（`server/src/utils/circuitBreaker.ts`）
- 前端共享工具函数使用 `client/src/utils/apiError.ts`（`getApiErrorMessage`）

## 活动角色绑定（Activity Role Binding）

活动的执行人通过 RBAC 角色自动填入：选择角色后，系统自动查询拥有该角色的用户（UserRole）并填入执行人列表，支持手动增减。

- **ActivityExecutor**：活动执行人多对多表，含来源标记（`ROLE_AUTO`/`MANUAL_ADD`/`MANUAL_KEEP`）和角色快照
- **Activity.roleId**：活动绑定的角色（可空）
- **角色来源**：直接读取用户管理中已分配的角色（UserRole 表），无需额外配置
- **API**: `GET /api/role-members`、`GET /api/role-members/preview/:roleId`（查询角色下的用户）
- 创建活动时：选择角色 → 自动填入该角色下所有 ACTIVE 用户，执行人下拉仅显示该角色用户
- 编辑活动时：切换角色 → 执行人列表更新为新角色用户；`resetExecutorsByRole: true` 可显式重置
- Excel 导入支持"角色"列，按角色名匹配自动填入执行人

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
- Prisma CLI 配置位于 `server/prisma.config.ts`（数据源 URL 等配置）
- 开发环境使用 SQLite（通过 `@prisma/adapter-better-sqlite3` driver adapter），生产环境切换为 PostgreSQL
- 修改 schema 后需运行 `npx prisma migrate dev --name <描述>` 创建迁移
- 开发环境也可用 `npx prisma db push` 快速同步 schema（不生成迁移文件）
- 种子数据包含 17 个测试账号，每个角色一个用户，密码统一 `123456`（admin 为 `admin123`）
- 种子数据包含示例项目（含风险评估和 4 个风险因子）

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

## 新设备环境搭建

```bash
# 内网 LAN 入口的 TLS 证书暂未覆盖 git-lan.awer.cc 这个子域名，先按 host 关掉验证
git config --global http.https://git-lan.awer.cc.sslVerify false
git clone https://git-lan.awer.cc/PGY/PMS.git Atlas && cd Atlas
npm install                    # 安装依赖（含 @types/react overrides）
cp server/.env.example server/.env  # 复制并填写环境变量（或从旧设备复制 .env）
cd server
npx prisma generate            # 生成 Prisma Client（输出到 src/generated/prisma/）
npx prisma db push             # 同步 schema 到 SQLite
npx tsx src/prisma/seed.ts     # 初始化种子数据（可选，会创建测试账号和示例项目）
cd ..
npm run dev                    # 启动前后端开发服务器
```

迁移已有数据库时，直接将 `server/prisma/dev.db` 复制到新设备即可，无需 seed。

## 生产部署

- **代码源**：`https://git-lan.awer.cc/PGY/PMS.git`（内网 LAN 入口，需 host-scoped `sslVerify=false`）
- **生产站点**：`w.awer.cc`
- **生产数据库**：SQLite（`/opt/atlas/data/atlas.db`）。`DEPLOYMENT.md` 顶部已声明该文档过时，里面的 PostgreSQL + PM2 方案不再使用
- **首次裸机部署**：`scripts/provision-prod.sh`（root 执行，幂等）——系统依赖 + Node 20 + 专用 `atlas` 账号 + UFW + 备份 cron + 自动部署 poll cron + 可选 Nginx/HTTPS
- **应用运维脚本**：`./deploy.sh {setup|update [<ref>]|poll-update|backup|restore|status|logs}`，systemd 服务名 `atlas`，运行账号 `atlas`
- **发版机制**：**仅 `v*` tag 触发自动部署**。推 commit、推 main、推非 `v*` tag 都不会上线
  - 发布：`git push pms main && git tag v1.2.0 && git push pms v1.2.0`
  - 生产 cron（`/etc/cron.d/atlas-poll-deploy`，每分钟一次）发现新 tag → `./deploy.sh update v1.2.0`：备份 → checkout tag → `npm ci` → 重建 → `prisma db push` → `systemctl restart atlas` → 健康检查
  - 当前部署的 tag 记在 `/opt/atlas/data/.last-deployed-tag`
- **回滚**：`sudo -u atlas bash -lc 'cd /opt/atlas && ./deploy.sh update v1.1.0'`
- **完整发布/回滚/排障流程**：见 `docs/release.md`

## 测试约定

### 测试文件命名与位置

- 测试文件与源文件同目录，命名 `<moduleName>.test.ts`（前端组件 `.test.tsx`）
- 跨切面测试放在 `__tests__/` 子目录（如 `server/src/routes/__tests__/performance.test.ts`）
- 专项测试可用点分后缀（如 `authStore.permission.test.ts`）

### 测试框架与配置

- **单元测试**：Vitest（`globals: true`）
- **前端环境**：`jsdom`，setup 文件 `client/src/test/setup.ts`（提供 `localStorage`、`matchMedia` mock 和 `@testing-library/jest-dom`）
- **后端环境**：`node`，无 setup 文件
- **E2E 测试**：Playwright（`e2e/` 目录，300+ 用例）

### 导入规范

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
```

始终显式导入 vitest API，不依赖全局注入。

### Describe / It 命名

- `describe` 使用功能名或 HTTP 端点（英文）
- `it` 行为描述：后端偏向英文（`should return 404 when...`），前端偏向中文（`未登录时返回 false`）
- 大型路由测试文件用注释分隔线分组

### Mock 模式

- **后端路由测试**：`vi.hoisted()` 定义 mock 对象 → `vi.mock()` 替换模块（Prisma、auth middleware）
- **前端组件测试**：`vi.mock()` + `importOriginal` 部分模拟（如 `react-router-dom` 的 `useNavigate`）
- **Store 测试**：`useAuthStore.setState()` 直接重置状态
- 每个 `beforeEach` 必须调用 `vi.clearAllMocks()`

### 测试结构

- 纯函数/工具类：单层 `describe('functionName', ...)`
- HTTP 端点：按方法分组 `describe('GET /api/...', ...)` / `describe('POST /api/...', ...)`
- 前端功能：按行为分组 `describe('hasPermission', ...)` / `describe('logout', ...)`
- 参数化测试用 `it.each`

### 断言

- 使用 Vitest 内置 `expect`，不引入额外断言库
- 前端 DOM 断言可用 `@testing-library/jest-dom` 扩展（`toBeInTheDocument` 等）

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
- `/api/role-members` - 角色成员预览（查询角色下用户）
- `/api/docs` - Swagger API 文档（仅开发环境）
- `/api/docs.json` - OpenAPI JSON 规范
