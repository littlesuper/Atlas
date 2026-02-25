# 硬件管理系统 (Atlas)

一套面向硬件团队的 Web 管理平台,包含项目管理和产品管理两大核心模块,支持多用户协作和基于角色的权限控制。

## 技术栈

### 前端
- React 18 + TypeScript
- Vite 7
- Arco Design (UI 组件库)
- Zustand (状态管理)
- React Router 7
- Axios
- Day.js

### 后端
- Express 4 + TypeScript
- Prisma 6 (ORM)
- PostgreSQL 17
- JWT (认证)
- bcryptjs (密码加密)

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在 `server` 目录下创建 `.env` 文件:

```env
DATABASE_URL="postgresql://littlesuper@localhost:5432/hwsystem"
JWT_SECRET="hw-system-jwt-secret"
JWT_REFRESH_SECRET="hw-system-refresh-secret"
PORT=3000
```

### 3. 初始化数据库

```bash
cd server
npx prisma generate
npx prisma migrate dev --name init
npx tsx src/prisma/seed.ts
cd ..
```

### 4. 启动开发服务器

```bash
npm run dev
```

- 前端: http://localhost:5173
- 后端: http://localhost:3000

## 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 系统管理员 |
| zhangsan | 123456 | 项目经理 |
| lisi | 123456 | 产品经理 |

## 项目结构

```
HWSystem/
├── client/          # 前端应用
├── server/          # 后端应用
├── e2e/             # Playwright 端到端测试
│   ├── fixtures/    # 测试数据与认证 fixture
│   ├── helpers/     # Arco Design UI 交互工具函数
│   └── specs/       # 测试用例
├── specs/           # 模块规格说明书
└── package.json     # monorepo 根配置
```

## 测试

### 单元测试

```bash
cd client && npm test        # 前端单元测试 (Vitest)
```

### 端到端测试 (E2E)

使用 Playwright 进行端到端测试，覆盖认证、导航、项目管理、活动管理、产品管理、系统管理和项目周报等完整用户流程。

```bash
# 安装浏览器（首次）
npx playwright install chromium

# 运行全部 E2E 测试（需先启动前后端服务）
npx playwright test

# 带界面运行（调试用）
npx playwright test --headed

# 运行单个测试文件
npx playwright test e2e/specs/projects.spec.ts
```

测试配置见 `playwright.config.ts`，会自动启动前后端开发服务器。

## 功能模块

- **认证模块**: JWT 双令牌机制,支持自动刷新
- **权限管理**: 基于角色的访问控制 (RBAC)
- **项目管理**: 项目全生命周期管理,活动/任务树,甘特图,AI 风险评估,项目周报
- **产品管理**: 硬件产品信息管理,规格参数,性能指标

## 许可证

MIT
