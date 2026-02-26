# Atlas 硬件项目管理平台 - 快速启动指南

## 前置要求

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0

开发环境使用 SQLite，无需额外安装数据库。生产环境建议使用 PostgreSQL 17+。

## 快速启动

### 1. 安装依赖

```bash
# 在项目根目录执行
npm install
```

这将自动安装根目录、client 和 server 的所有依赖。

### 2. 初始化数据库

```bash
cd server

# 生成 Prisma Client
npx prisma generate

# 执行数据库迁移
npx prisma migrate dev --name init

# 初始化种子数据（3 个测试账号 + 预设角色权限）
npx tsx src/prisma/seed.ts

cd ..
```

### 3. 启动开发服务器

```bash
npm run dev
```

同时启动前端和后端服务：
- 前端: http://localhost:5173
- 后端: http://localhost:3000
- 健康检查: http://localhost:3000/api/health

## 默认账号

系统已预置 3 个测试账号：

| 用户名 | 密码 | 角色 | 说明 |
|--------|------|------|------|
| admin | admin123 | 系统管理员 | 拥有所有权限 |
| zhangsan | 123456 | 项目经理 | 可管理项目和活动 |
| lisi | 123456 | 产品经理 | 可管理产品，查看项目 |

## 功能模块

### 认证与权限
- JWT 双令牌认证（Access Token 8h + Refresh Token 7d）
- 基于角色的访问控制（RBAC），权限通配符支持
- 自动 token 刷新
- 用户管理（创建、编辑、删除、禁用）
- 角色管理（权限配置、用户分配）
- 企业微信扫码登录（可选）

### 项目管理
- 项目列表（筛选、搜索、分页、统计卡片）
- 项目详情（基本信息、成员管理）
- 活动/任务管理（创建、编辑、删除、内联编辑、拖拽排序）
- 工作日计算（排除中国法定节假日与周末）
- 项目进度自动计算
- 甘特图可视化（SVG，按阶段分组、依赖箭头、今日标线）
- 活动归档快照与对比
- AI 风险评估（支持规则引擎和 AI API）
- 项目周报管理（按周分组、草稿箱、上周参考、AI 建议）
- 项目模板（预定义活动树，一键生成活动计划）
- 排期工具（资源冲突检测、What-If 模拟、一键重排、AI 排期建议）
- 活动评论与讨论

### 产品管理
- 产品列表（筛选、搜索、分页）
- 规格参数与性能指标管理（键值对）
- 项目关联
- 变更日志追踪
- CSV 导出

### 资源负载
- 跨项目人员工作负载可视化
- 负载冲突预警

### 通知系统
- 任务到期/里程碑临近/周报提交提醒
- 通知面板（标记已读/全部已读）

### 系统管理
- 用户与角色管理
- AI 配置管理（多提供商、连接测试、用量统计）
- 项目模板管理
- 审计日志查询
- 企微配置

### 文件上传
- 文件上传（图片、文档、压缩包）
- 文件删除
- 大小限制（10MB）、类型校验

## 项目结构

```
Atlas/
├── client/          # 前端应用（Vite + React + Arco Design）
│   ├── src/
│   │   ├── api/             # API 接口封装
│   │   ├── components/      # 通用组件
│   │   ├── hooks/           # 自定义 Hooks
│   │   ├── layouts/         # 布局组件
│   │   ├── pages/           # 页面组件
│   │   │   ├── Login/       # 登录页（含企微扫码）
│   │   │   ├── Project/     # 项目管理（列表、详情）
│   │   │   ├── Product/     # 产品管理
│   │   │   ├── WeeklyReports/ # 周报管理
│   │   │   ├── Workload/    # 资源负载
│   │   │   └── Admin/       # 系统管理
│   │   ├── store/           # Zustand 状态管理
│   │   ├── styles/          # 全局样式
│   │   ├── types/           # TypeScript 类型定义
│   │   └── utils/           # 工具函数
│   └── vite.config.ts       # Vite 配置
│
├── server/          # 后端应用（Express + Prisma）
│   ├── src/
│   │   ├── middleware/      # 中间件（认证、权限）
│   │   ├── routes/          # 路由处理（15 个模块）
│   │   ├── utils/           # 工具函数
│   │   ├── prisma/          # Prisma Schema（21 个模型）和 Seed
│   │   └── index.ts         # Express 入口
│   └── uploads/             # 上传文件存储目录
│
├── e2e/             # Playwright 端到端测试
│   ├── fixtures/            # 测试 fixture 与数据
│   ├── helpers/             # UI 交互工具函数
│   └── specs/               # 测试用例（7 个文件）
│
├── specs/           # 需求规格文档（5 个文件）
├── docs/            # 补充文档
└── playwright.config.ts     # Playwright 配置
```

## 常用命令

```bash
# 根目录（同时启动前后端）
npm run dev              # 启动开发服务器
npm run build            # 构建生产版本
npm run start            # 启动生产服务器

# 前端目录
cd client
npm run dev              # 启动前端开发服务器
npm run build            # 构建前端生产版本
npm test                 # 运行单元测试 (Vitest)

# 后端目录
cd server
npm run dev              # 启动后端开发服务器
npm run build            # 编译 TypeScript
npm run start            # 启动编译后的服务器
npx prisma studio        # 打开 Prisma Studio（数据库 GUI）
npx prisma migrate dev   # 创建新的数据库迁移

# E2E 测试（根目录）
npx playwright install chromium   # 首次安装浏览器
npx playwright test               # 运行全部端到端测试
npx playwright test --headed      # 带浏览器界面运行（调试）
```

## 端到端测试 (E2E)

项目使用 Playwright 进行端到端测试，测试文件位于 `e2e/` 目录。

```
e2e/
├── auth.setup.ts        # 登录并缓存认证状态（只执行一次）
├── fixtures/
│   ├── auth.ts          # authedPage fixture（已登录页面）
│   └── test-data.ts     # 测试数据常量
├── helpers/
│   └── arco.ts          # Arco Design UI 交互工具函数
└── specs/
    ├── auth.spec.ts          # 登录、登出、未认证重定向
    ├── navigation.spec.ts    # 侧边栏导航、Tab 切换
    ├── projects.spec.ts      # 项目 CRUD
    ├── activities.spec.ts    # 活动 CRUD
    ├── products.spec.ts      # 产品 CRUD
    ├── admin.spec.ts         # 系统管理（AI、用户、角色、日志）
    └── weekly-reports.spec.ts # 项目周报
```

**运行要求：**
- 前后端服务会由 `playwright.config.ts` 自动启动
- 测试使用 `storageState` 缓存登录态，避免触发服务端登录限流
- 测试串行执行（单 worker），兼容 SQLite 并发限制

## 环境变量

服务端环境变量位于 `server/.env`：

```env
DATABASE_URL="file:./dev.db"          # SQLite 开发数据库
JWT_SECRET="hw-system-jwt-secret"     # 生产环境请更换强密码
JWT_REFRESH_SECRET="hw-system-refresh-secret"
PORT=3000
AI_API_KEY=""                          # 可选，外部 AI API
AI_API_URL=""                          # 可选，外部 AI API
CORS_ORIGINS="http://localhost:5173,http://localhost:3000"
NODE_ENV="development"
WECOM_CORP_ID=""                       # 可选，企微集成
WECOM_AGENT_ID=""
WECOM_SECRET=""
WECOM_REDIRECT_URI="http://localhost:5173/login"
```

## 常见问题

### 1. Prisma Client 未生成

**问题:** `Cannot find module '@prisma/client'` 或 `@prisma/client did not initialize yet`

**解决:**
```bash
cd server
npx prisma generate
```

### 2. 前端无法连接后端

**问题:** `Network Error` 或 `ERR_CONNECTION_REFUSED`

**解决:**
- 确保后端服务运行在 http://localhost:3000
- 检查 `client/vite.config.ts` 中的 proxy 配置
- 查看浏览器控制台网络请求

### 3. native 模块加载失败（rollup/esbuild）

**问题:** `Cannot find module @rollup/rollup-darwin-arm64` 或类似错误

**解决:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### 4. 数据库迁移冲突

**问题:** 迁移文件与当前数据库不一致

**解决:**
```bash
cd server
# 重置数据库（开发环境）
npx prisma migrate reset
npx tsx src/prisma/seed.ts
```

## 生产部署

详见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 许可证

MIT License
