# CLAUDE.md

## 项目概述

Atlas 是一套面向硬件团队的 Web 项目管理平台，使用 npm workspaces 的 monorepo 结构。

## 技术栈

- **前端:** React 18 + TypeScript + Vite 7 + Arco Design + Zustand + React Router 7
- **后端:** Express 4 + TypeScript + Prisma 6 + SQLite(dev)/PostgreSQL(prod)
- **测试:** Vitest(单元) + Playwright(E2E)

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
  routes/             # Express 路由（15 个模块）
  middleware/         # auth.ts（JWT）、permission.ts（RBAC）
  utils/              # 工具函数（workday, dependencyScheduler, riskEngine, aiClient 等）
  prisma/             # schema.prisma（21 个模型）、seed.ts

e2e/                  # Playwright E2E 测试
specs/                # 需求规格文档
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
npx playwright test            # E2E 测试
```

## 开发规范

- 前后端 100% TypeScript，类型定义集中在 `client/src/types/index.ts`
- 后端 Prisma 自动生成类型，无需手动维护
- UI 组件使用 Arco Design (`@arco-design/web-react`)
- 状态管理使用 Zustand（不用 Redux）
- 路由使用 React Router v7
- 日期处理使用 Day.js
- 开发环境数据库为 SQLite（`server/prisma/dev.db`），无需安装 PostgreSQL
- 工作日计算考虑中国法定节假日（`server/src/utils/workday.ts`）

## 数据库

- Schema 位于 `server/prisma/schema.prisma`，包含 21 个模型
- 开发环境使用 SQLite，生产环境切换为 PostgreSQL
- 修改 schema 后需运行 `npx prisma migrate dev --name <描述>` 创建迁移
- 种子数据包含 3 个测试账号：admin/admin123, zhangsan/123456, lisi/123456

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
