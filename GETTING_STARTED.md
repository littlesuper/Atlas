# 贝锐硬件管理系统 - 快速启动指南

## 📋 前置要求

在开始之前,请确保您的系统已安装以下软件:

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **PostgreSQL** >= 17.0

## 🚀 快速启动

### 1. 安装依赖

```bash
# 在项目根目录执行
npm install
```

这将自动安装根目录、client 和 server 的所有依赖。

### 2. 配置数据库

#### 2.1 创建 PostgreSQL 数据库

```bash
# 使用 psql 命令行或图形化工具创建数据库
createdb hwsystem
```

#### 2.2 配置环境变量

server 目录下已有 `.env` 文件,根据您的实际情况修改:

```env
DATABASE_URL="postgresql://用户名@localhost:5432/hwsystem"
JWT_SECRET="hw-system-jwt-secret"
JWT_REFRESH_SECRET="hw-system-refresh-secret"
PORT=3000
AI_API_KEY=""
AI_API_URL=""
```

**重要提示:**
- 将 `用户名` 替换为您的 PostgreSQL 用户名
- 生产环境请务必修改 JWT_SECRET 和 JWT_REFRESH_SECRET

### 3. 初始化数据库

```bash
# 进入 server 目录
cd server

# 生成 Prisma Client
npx prisma generate

# 执行数据库迁移
npx prisma migrate dev --name init

# 初始化种子数据
npx tsx src/prisma/seed.ts

# 返回根目录
cd ..
```

### 4. 启动开发服务器

```bash
# 在项目根目录执行
npm run dev
```

这将同时启动前端和后端服务:
- 前端: http://localhost:5173
- 后端: http://localhost:3000

## 👤 默认账号

系统已预置3个测试账号:

| 用户名 | 密码 | 角色 | 说明 |
|--------|------|------|------|
| admin | admin123 | 系统管理员 | 拥有所有权限 |
| zhangsan | 123456 | 项目经理 | 可管理项目和活动 |
| lisi | 123456 | 产品经理 | 可管理产品,查看项目 |

## 📚 功能模块

### ✅ 已实现的核心功能

#### 1. 认证与权限
- ✅ JWT 双令牌认证(Access Token + Refresh Token)
- ✅ 基于角色的访问控制(RBAC)
- ✅ 自动 token 刷新
- ✅ 用户管理(创建、编辑、删除、禁用)
- ✅ 角色管理(权限配置、用户分配)

#### 2. 项目管理
- ✅ 项目列表(筛选、搜索、分页)
- ✅ 项目详情(基本信息、统计数据)
- ✅ 活动/任务管理(创建、编辑、删除、内联编辑)
- ✅ 工作日计算(排除周末)
- ✅ 项目进度自动计算
- ✅ 甘特图可视化(按阶段分组、依赖箭头、今日标线)
- ✅ 活动拖拽排序(树形结构)
- ✅ AI 风险评估(支持规则引擎和 AI API)
- ✅ 项目周报管理(按周分组、草稿箱、上周参考)
- ✅ 项目模板(预定义活动树，一键生成活动计划)
- ✅ 排期工具(资源冲突检测、What-If 模拟、一键重排、AI 排期建议)

#### 3. 产品管理
- ✅ 产品列表(筛选、搜索、分页)
- ✅ 产品详情
- ✅ 规格参数管理(键值对)
- ✅ 性能指标管理(键值对)
- ✅ 项目关联

#### 4. 文件上传
- ✅ 文件上传(图片、文档、压缩包)
- ✅ 文件删除
- ✅ 大小限制(10MB)
- ✅ 类型校验

## 🔧 开发说明

### 项目结构

```
HWSystem/
├── client/          # 前端应用(Vite + React + Arco Design)
│   ├── src/
│   │   ├── api/             # API 接口封装
│   │   ├── components/      # 通用组件
│   │   ├── layouts/         # 布局组件
│   │   ├── pages/           # 页面组件
│   │   ├── store/           # Zustand 状态管理
│   │   ├── styles/          # 全局样式
│   │   ├── types/           # TypeScript 类型定义
│   │   └── utils/           # 工具函数
│   └── vite.config.ts       # Vite 配置
│
├── server/          # 后端应用(Express + Prisma)
│   ├── src/
│   │   ├── middleware/      # 中间件(认证、权限)
│   │   ├── routes/          # 路由处理
│   │   ├── utils/           # 工具函数
│   │   ├── prisma/          # Prisma Schema 和 Seed
│   │   └── index.ts         # Express 入口
│   └── uploads/             # 上传文件存储目录
│
├── e2e/             # Playwright 端到端测试
│   ├── fixtures/            # 测试 fixture 与数据
│   ├── helpers/             # UI 交互工具函数
│   └── specs/               # 测试用例
│
├── specs/           # 需求规格文档
└── playwright.config.ts     # Playwright 配置
```

### 技术栈

**前端:**
- React 18.3 + TypeScript
- Vite 7 (构建工具)
- Arco Design (UI 组件库)
- Zustand (状态管理)
- React Router 7 (路由)
- Axios (HTTP 客户端)
- Day.js (日期处理)

**后端:**
- Express 4 + TypeScript
- Prisma 6 (ORM)
- PostgreSQL 17 (数据库)
- JWT (认证)
- bcryptjs (密码加密)
- Multer (文件上传)

### 常用命令

```bash
# 根目录(同时启动前后端)
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
npx prisma studio        # 打开 Prisma Studio(数据库 GUI)
npx prisma migrate dev   # 创建新的数据库迁移

# E2E 测试(根目录)
npx playwright install chromium   # 首次安装浏览器
npx playwright test               # 运行全部端到端测试
npx playwright test --headed      # 带浏览器界面运行(调试)
```

### 端到端测试 (E2E)

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

## 🎯 后续扩展建议

### 高级功能实现

1. **甘特图可视化**
   - 建议使用 `dhtmlx-gantt` 或 `frappe-gantt` 库
   - 后端接口已实现(`/api/activities/project/:projectId/gantt`)

2. **活动拖拽排序**
   - 建议使用 `@dnd-kit/core` 库
   - 后端接口已实现(`PUT /api/activities/project/:projectId/reorder`)

3. **富文本编辑器**(用于周报)
   - 建议使用 `@tiptap/react` 或 `react-quill`
   - 支持图片粘贴上传

4. **周报管理前端页面**
   - 创建/编辑周报
   - AI 智能建议
   - 附件上传

### 性能优化

- 实现表格虚拟滚动(大数据量时)
- 添加 React.memo 优化组件渲染
- 使用 SWR 或 React Query 实现数据缓存
- 实现图片懒加载

### 安全加固

- 添加 CSRF 保护
- 实现请求限流
- 添加 SQL 注入防护(Prisma 已内置)
- 启用 HTTPS
- 添加安全响应头

## ❓ 常见问题

### 1. 数据库连接失败

**问题:** `Error: Can't reach database server`

**解决:**
```bash
# 检查 PostgreSQL 是否运行
pg_isready

# 检查 server/.env 中的 DATABASE_URL 是否正确
cat server/.env

# 测试连接
cd server && npx prisma db push
```

### 2. 前端无法连接后端

**问题:** `Network Error` 或 `ERR_CONNECTION_REFUSED`

**解决:**
- 确保后端服务运行在 http://localhost:3000
- 检查 `client/vite.config.ts` 中的 proxy 配置
- 查看浏览器控制台网络请求

### 3. Prisma Client 未生成

**问题:** `Cannot find module '@prisma/client'`

**解决:**
```bash
cd server
npx prisma generate
```

## 📞 技术支持

- 规格文档: 查看 `specs/` 目录
- GitHub Issues: (添加您的仓库地址)
- Email: (添加您的支持邮箱)

## 📄 许可证

MIT License
