# Atlas — 硬件项目管理平台

一套面向硬件团队的 Web 管理平台，涵盖项目全生命周期管理、产品管理、周报协作与 AI 辅助风险评估，支持多用户协作、基于角色的权限控制以及明亮/暗色主题切换。

## 技术栈

### 前端
- React 18 + TypeScript
- Vite 7
- Arco Design（UI 组件库）
- Zustand（状态管理）
- React Router 7
- Axios、Day.js、WangEditor（富文本编辑器）

### 后端
- Express 4 + TypeScript
- Prisma 6（ORM）
- SQLite（开发环境）/ PostgreSQL 17（生产环境）
- JWT 双令牌认证 + bcryptjs 密码加密
- Multer（文件上传）、Helmet（安全头）、Pino（结构化日志）

### 测试
- Vitest（前端单元测试）
- Playwright（端到端测试，300+ 用例）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化数据库

开发环境使用 SQLite，无需额外安装数据库。

```bash
cd server
npx prisma generate
npx prisma migrate dev --name init
npx tsx src/prisma/seed.ts
cd ..
```

### 3. 启动开发服务器

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
│   │   ├── components/    # 通用组件（SafeHtml、AttachmentList、NotificationBell 等）
│   │   ├── hooks/         # 自定义 Hooks（权限、拖拽排序等）
│   │   ├── layouts/       # 布局组件（MainLayout）
│   │   ├── pages/         # 页面模块
│   │   │   ├── Login/     # 登录页（含企微扫码登录）
│   │   │   ├── Project/   # 项目管理（列表、详情、甘特图、风险评估、排期工具）
│   │   │   ├── Product/   # 产品管理
│   │   │   ├── WeeklyReports/ # 项目周报（按周分组、草稿箱、上周参考）
│   │   │   ├── Workload/  # 资源负载
│   │   │   └── Admin/     # 系统管理（用户、角色、权限、AI、项目模板、审计日志、企微配置）
│   │   ├── store/         # Zustand 状态管理（auth、theme）
│   │   ├── styles/        # 全局样式与主题变量
│   │   ├── types/         # TypeScript 类型定义（30+）
│   │   └── utils/         # 工具函数与常量
│   └── vite.config.ts
├── server/                # 后端应用
│   ├── src/
│   │   ├── routes/        # Express 路由（18 个模块）
│   │   ├── middleware/    # 认证、权限中间件
│   │   ├── prisma/        # Prisma schema（25 个模型）与种子数据
│   │   └── utils/         # 工具函数（工作日、依赖调度、风险引擎、AI 客户端等）
│   └── tsconfig.json
├── e2e/                   # Playwright 端到端测试
│   ├── fixtures/          # 测试数据与认证 fixture
│   ├── helpers/           # Arco Design UI 交互工具函数
│   └── specs/             # 测试用例（55 个文件）
├── specs/                 # 模块规格说明书
├── docs/                  # 补充文档（QA 测试计划与报告）
└── package.json           # monorepo 根配置（npm workspaces）
```

## 功能模块

### 认证与权限
- JWT 双令牌机制（access 8h + refresh 7d），自动静默刷新
- 基于角色的访问控制（RBAC）：系统管理员、项目经理、产品经理等
- 权限通配符支持（`*:*`、`resource:*`、`*:action`）
- 用户偏好持久化（列设置、主题偏好等）
- 企业微信扫码登录（可选）

### 项目管理
- 项目全生命周期管理：EVT → DVT → PVT → MP 阶段流转
- 活动/任务树：支持多级嵌套、拖拽排序、批量操作
- 活动内联编辑（10+ 可编辑字段）
- 自定义列显示：用户可拖拽调整列顺序与可见性，偏好自动保存
- 里程碑管理：可视化时间线，状态跟踪
- 项目归档：归档快照保留完整历史数据，支持对比
- 项目成员管理（按角色分组：项目经理、协作者、硬/软件产品/开发/测试、结构、品质、设计、采购、法务、供应链等）
- 新建/编辑项目通过抽屉打开（无独立页面）；旧地址 `/projects/new`、`/projects/:id/edit` 自动重定向到列表页并打开抽屉
- 活动 Excel 导入 / 导出：完整往返支持类型、前置依赖（如 `003FS+2`）、计划与实际日期、状态、负责人；Excel 中未列出的负责人会自动创建联系人

### 甘特图
- 基于 SVG 的可视化甘特图
- 按 EVT/DVT/PVT/MP 阶段分组展示
- 状态色彩编码：未开始（灰）、进行中（蓝）、已完成（绿）
- 依赖关系箭头、里程碑菱形标记、今日标线
- 响应式缩放与自动列宽

### AI 风险评估
- 基于项目活动数据自动生成风险分析
- 风险等级分类：高、中、低
- 影响范围与建议措施
- 规则引擎 + AI API 双模式

### 项目周报
- 周报创建与编辑（富文本编辑器）
- 分阶段进展填写（EVT/DVT/PVT/MP 各阶段独立记录）
- 进展状态标记：顺利进行 / 轻度阻碍 / 严重阻碍
- 附件上传（支持按区块关联：进展、计划、风险预警）
- 草稿/已提交状态流转，草稿箱独立 Tab 管理
- 汇总视图：已提交周报按周次分组展示，支持产品线筛选
- 创建周报时显示上周参考内容（可折叠）
- AI 智能建议

### 项目模板与排期工具
- 项目模板管理：预定义活动树（阶段/里程碑/任务），含工期与依赖关系
- 模板一键实例化：创建项目时选择模板，自动生成活动计划并推算日期
- 资源冲突检测：发现同一人员在多个活动间的时间重叠
- What-If 模拟：模拟任务延期对下游活动和项目结束日期的影响
- 一键重排：从基准日期重新计算所有未完成活动的计划时间
- AI 排期建议：基于历史项目数据推荐工期、识别潜在风险

### 资源负载
- 跨项目人员工作负载可视化
- 时间范围筛选
- 负载冲突预警

### 产品管理
- 硬件产品信息管理（CRUD）
- 规格参数与性能指标录入（键值对）
- 产品线分类与状态跟踪
- 项目关联
- 变更日志追踪
- CSV 导出

### 通知系统
- 任务到期提醒
- 周报提交提醒
- 里程碑临近提醒
- 通知面板（标记已读/全部已读）

### 活动评论
- 活动级别评论与讨论
- 分页展示

### 系统管理
- 用户管理：创建、编辑、禁用
- 角色管理：自定义角色与权限分配
- 权限矩阵：细粒度的功能权限控制（21 个预设权限）
- 项目模板管理：创建、编辑、复制、删除模板及其活动树
- AI 配置管理：多 API 提供商、连接测试、用量统计
- 审计日志：操作记录查询（登录、创建、更新、删除），支持按用户/操作类型筛选
- 企微配置：企业微信集成设置

### 明亮/暗色主题
- 右上角一键切换明亮与暗色模式
- 基于 Arco Design 暗色主题，额外优化色彩柔和度
- 覆盖 Arco 内置色板降低饱和度与亮度
- 自定义 CSS 变量体系，全部组件统一适配
- 主题偏好自动保存（localStorage + 服务端同步）

## 常用命令

```bash
# 开发
npm run dev              # 同时启动前后端
npm run dev:server       # 仅启动后端
npm run dev:client       # 仅启动前端

# 构建
npm run build            # 构建前后端
npm run start            # 启动生产服务器

# 数据库
cd server
npx prisma generate      # 生成 Prisma Client
npx prisma migrate dev   # 创建新迁移
npx prisma studio        # 打开数据库 GUI
npx tsx src/prisma/seed.ts  # 初始化种子数据

# 测试
cd client && npm test                # 前端单元测试 (Vitest)
npx playwright install chromium      # 安装浏览器（首次）
npx playwright test                  # 运行全部 E2E 测试
npx playwright test --headed         # 带界面运行（调试用）
```

## 环境变量

服务端环境变量位于 `server/.env`：

```env
DATABASE_URL="file:./dev.db"          # 开发用 SQLite（生产换 PostgreSQL）
JWT_SECRET="hw-system-jwt-secret"
JWT_REFRESH_SECRET="hw-system-refresh-secret"
PORT=3000
AI_API_KEY=""                          # 可选，AI 功能所需
AI_API_URL=""                          # 可选，AI 功能所需
CORS_ORIGINS="http://localhost:5173,http://localhost:3000"
NODE_ENV="development"
```

## 许可证

MIT
