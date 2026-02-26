# Atlas — 硬件项目管理平台

一套面向硬件团队的 Web 管理平台，涵盖项目全生命周期管理、产品管理、周报协作与 AI 辅助风险评估，支持多用户协作、基于角色的权限控制以及明亮/暗色主题切换。

## 技术栈

### 前端
- React 18 + TypeScript
- Vite 7
- Arco Design（UI 组件库）
- Zustand（状态管理）
- React Router 7
- Axios、Day.js、TipTap（富文本编辑器）

### 后端
- Express 4 + TypeScript
- Prisma 6（ORM）
- PostgreSQL 17
- JWT 双令牌认证 + bcryptjs 密码加密
- Multer（文件上传）

### 测试
- Vitest（前端单元测试）
- Playwright（端到端测试，35+ 用例）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在 `server` 目录下创建 `.env` 文件：

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

- 前端：http://localhost:5173
- 后端：http://localhost:3000

## 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 系统管理员 |
| zhangsan | 123456 | 项目经理 |
| lisi | 123456 | 产品经理 |

## 项目结构

```
Atlas/
├── client/                # 前端应用
│   ├── src/
│   │   ├── api/           # API 请求封装
│   │   ├── components/    # 通用组件（SafeHtml、AttachmentList 等）
│   │   ├── hooks/         # 自定义 Hooks（权限、拖拽排序等）
│   │   ├── layouts/       # 布局组件（MainLayout）
│   │   ├── pages/         # 页面模块
│   │   │   ├── Auth/      # 登录页
│   │   │   ├── Project/   # 项目管理（列表、详情、甘特图、风险评估、排期工具）
│   │   │   ├── Product/   # 产品管理
│   │   │   ├── WeeklyReports/ # 项目周报（按周分组、草稿箱、上周参考）
│   │   │   └── Admin/     # 系统管理（用户、角色、权限、项目模板）
│   │   ├── store/         # Zustand 状态管理（auth、theme）
│   │   ├── styles/        # 全局样式与主题变量
│   │   ├── types/         # TypeScript 类型定义
│   │   └── utils/         # 工具函数与常量
│   └── vite.config.ts
├── server/                # 后端应用
│   ├── src/
│   │   ├── routes/        # Express 路由（含模板、排期、AI 排期）
│   │   ├── middleware/    # 认证、权限中间件
│   │   ├── prisma/        # Prisma schema 与种子数据
│   │   └── utils/         # 工具函数（工作日、依赖调度、AI 客户端等）
│   └── tsconfig.json
├── e2e/                   # Playwright 端到端测试
│   ├── fixtures/          # 测试数据与认证 fixture
│   ├── helpers/           # Arco Design UI 交互工具函数
│   └── specs/             # 测试用例
├── specs/                 # 模块规格说明书
└── package.json           # monorepo 根配置
```

## 功能模块

### 认证与权限
- JWT 双令牌机制（access + refresh），自动静默刷新
- 基于角色的访问控制（RBAC）：系统管理员、项目经理、产品经理等
- 用户偏好持久化（列设置、主题偏好等）

### 项目管理
- 项目全生命周期管理：EVT → DVT → PVT → MP 阶段流转
- 活动/任务树：支持多级嵌套、拖拽排序、批量操作
- 自定义列显示：用户可拖拽调整列顺序与可见性，偏好自动保存
- 里程碑管理：可视化时间线，状态跟踪（待开始、进行中、已完成、逾期）
- 项目归档：归档快照保留完整历史数据

### 甘特图
- 基于活动数据的可视化甘特图
- 按 EVT/DVT/PVT/MP 阶段分组展示
- 状态色彩编码：未开始（灰）、进行中（蓝）、已完成（绿）
- 里程碑菱形标记、今日标线
- 响应式缩放与自动列宽

### AI 风险评估
- 基于项目活动数据自动生成风险分析
- 风险等级分类：高、中、低
- 影响范围与建议措施
- 服务端 AI 接口集成

### 项目周报
- 周报创建与编辑（TipTap 富文本编辑器）
- 分阶段进展填写（EVT/DVT/PVT/MP 各阶段独立记录）
- 进展状态标记：顺利进行 / 轻度阻碍 / 严重阻碍
- 附件上传（支持按区块关联：进展、计划、风险预警）
- 草稿/已提交状态流转，草稿箱独立 Tab 管理
- 汇总视图：已提交周报按周次分组展示，最新周在上方，支持产品线筛选
- 创建周报时显示上周参考内容（可折叠灰色区块）

### 项目模板与排期工具
- 项目模板管理：预定义活动树（阶段/里程碑/任务），含工期与依赖关系
- 模板一键实例化：创建项目时选择模板，自动生成活动计划并推算日期
- 资源冲突检测：发现同一人员在多个活动间的时间重叠
- What-If 模拟：模拟任务延期对下游活动和项目结束日期的影响
- 一键重排：从基准日期重新计算所有未完成活动的计划时间
- AI 排期建议：基于历史项目数据推荐工期、识别潜在风险

### 产品管理
- 硬件产品信息管理
- 规格参数与性能指标录入
- 产品线分类

### 系统管理
- 用户管理：创建、编辑、禁用
- 角色管理：自定义角色与权限分配
- 权限矩阵：细粒度的功能权限控制
- 项目模板管理：创建、编辑、复制、删除模板及其活动树

### 明亮/暗色主题
- 右上角一键切换明亮与暗色模式
- 基于 Arco Design 暗色主题，额外优化色彩柔和度
- 覆盖 Arco 内置色板（arcoblue、red、orange、green）降低饱和度与亮度
- 自定义 CSS 变量体系，全部组件统一适配
- 主题偏好自动保存（localStorage + 服务端同步）

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

## 许可证

MIT
