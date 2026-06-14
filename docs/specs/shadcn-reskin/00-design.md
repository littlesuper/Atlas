# shadcn-admin 风格重皮肤 · 设计

> 目标：把 Atlas 前端外观重做成 [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) 的风格——slate 单色板、左侧分组侧边栏、Inter 字体、细边框、10px 圆角——**保留 Arco Design 组件与全部页面/测试**，仅改主题令牌 + 布局外壳。
> 2026-06-14 经 L.S. 确认：① 重皮肤而非迁移；② 主色用 shadcn 默认**单色（近黑 slate）**，无蓝色强调；③ 顶部导航改**左侧栏**。

## 1. 已确认决策

- **重皮肤，不迁移**：保留 `@arco-design/web-react`，不引入 Tailwind/Radix。60 个组件文件、300+ E2E 基本不动。
- **主色**：shadcn 默认单色——近黑 slate 主按钮，链接/激活态也走中性，无品牌蓝。
- **导航**：顶部深色横向导航 → 左侧分组侧边栏（可折叠）+ 浅色顶栏。
- **细节**：统一 ~10px 圆角；卡片用细边框代替投影；引入 Inter；深色模式对齐 shadcn 深 slate。
- 接受**非像素级一致**——抓"质感"（配色 + 布局 + 圆角 + 边框 + 字体），不逐组件复刻。

## 2. 设计令牌（shadcn slate → Arco CSS 变量）

来源：shadcn-admin `src/styles/theme.css`（oklch）。下表给 hex 近似锚点；落地在 `client/src/styles/global.css` 覆盖 Arco 变量。

### 2.1 锚点值

| 语义 | light (hex) | dark (hex) |
| --- | --- | --- |
| background | `#ffffff` | `#020817` |
| foreground（主文字） | `#020817` | `#f8fafc` |
| primary（主按钮底） | `#1e293b`（近黑 slate-800/900） | `#e2e8f0`（深色下反相为浅 slate） |
| primary-foreground | `#f8fafc` | `#1e293b` |
| muted / secondary / accent（浅底/hover） | `#f1f5f9`（slate-100） | `#1e293b`（slate-800） |
| muted-foreground（次要文字） | `#64748b`（slate-500） | `#94a3b8`（slate-400） |
| border / input | `#e2e8f0`（slate-200） | `rgba(255,255,255,.1)` / `.15` |
| ring（焦点环） | `#94a3b8` | `#475569` |
| destructive（危险） | `#ef4444` 系 | `#f87171` 系 |
| radius | `10px`（0.625rem） | 同 |

### 2.2 Arco 变量映射

- **主色板 `--primary-1..10`**：用项目已有依赖 `@arco-design/color` 从 slate 深色种子（≈`#1e293b`）生成 10 阶**中性/slate** 主色板（`primary-6` 为主、`-5` hover 略亮、`-7` active 更深、`-1` 浅 slate 选中底）。结果：按钮 / 链接 / 激活态 / 开关 / 焦点环全部变近黑 slate，实现单色观感。
- **文字 `--color-text-1..4`**：`#020817` / `#475569` / `#64748b` / `#94a3b8`（越大越浅）。
- **背景 `--color-bg-1..5`**：`#ffffff` 起（卡片/弹层/下拉用 bg-1=白）；`--page-bg` 设 `#ffffff`（靠边框分隔，最贴 shadcn；如显空可改极浅 `#f8fafc`）。
- **填充 `--color-fill-1..4`**：`#f8fafc` / `#f1f5f9` / `#e2e8f0` / `#cbd5e1`（表头、hover、tag 底）。
- **边框 `--color-border / -2 / -3`**：`#e2e8f0` 系细边框。
- **圆角**：`--border-radius-small:6px; --border-radius-medium:8px; --border-radius-large:10px;`；现有 `.arco-card`(12px) 改 10px、按钮/输入 8px。
- **阴影**：卡片去投影 → `1px solid var(--color-border-2)`（已有暗色卡片即此做法，扩展到亮色）。
- **字体**：`html/body` 字体栈前置 `'Inter'`；用 `@fontsource/inter` **本地打包引入**（生产内网无外网，不用 Google Fonts CDN）。
- **语义状态色**：保留现有 `--status-*`（成功绿/警告橙/危险红）与风险标签色——仅主色与中性层 slate 化；状态色不动以维持业务语义与对比度修正。

### 2.3 深色模式

复用现有 `body[arco-theme='dark']` 块，替换为 shadcn 深 slate：底 `#020817` 系、文字 `#f8fafc` 系、边框 `white/10%`、`--primary-*` 反相为浅 slate（深底上的浅主按钮）。

## 3. 布局外壳（`client/src/layouts/MainLayout.tsx`）

顶栏 → 侧边栏 + 顶栏：

- 结构：Arco `Layout` = `Sider`（左，可折叠，展开 ~216px / 折叠 64px）+ 内层 `Layout`(`Header` + `Content`)。
- **Sider**（白底、右细边框）：品牌区（方形 logo + Atlas/贝锐科技）→ 分组垂直 `Menu`（**平台**：首页 / 项目管理 / 风险总览 / 项目周报 / 项目资源 / 产品管理；**系统**：系统管理，按权限过滤）→ 底部用户区（头像 + 名 + 角色，下拉含退出 / 版本号）。激活项浅 slate 底 + 主文字。
- **Header**（浅色、~52px、下细边框）：侧栏折叠键 + 面包屑（按路由）+ ⌘K 搜索框（先占位，命令面板后续接）+ 主题切换 + `NotificationBell` + 用户头像下拉。
- **响应式**：≤768px Sider 收为抽屉（Arco `Sider` breakpoint 或 `Drawer`），Header 出汉堡键。
- `AssistantLauncher` 浮层保持（首页除外，逻辑不变）。
- **登录页**：`.login-container` 紫色渐变 → shadcn 中性（浅 slate 背景 + 白卡 + 近黑主按钮）。

## 4. 范围

- **改**：`styles/global.css`（令牌 + 组件覆盖，必要时拆出 `styles/theme.css` 集中令牌）、`layouts/MainLayout.tsx`（侧边栏外壳）、`main.tsx`（Inter 引入）、登录页样式、`package.json`（加 `@fontsource/inter`）。
- **不改**：Arco 组件用法、页面业务逻辑、API、`client/src/types`、各页面文件结构。
- **可能波及**：依赖旧布局选择器（`.main-header` / `.nav-item` / 顶栏导航文案）的 E2E 用例 → 第 5 步排查更新。

## 5. 风险

- **E2E 选择器**：旧布局类名/结构被替换，依赖它们的 e2e 需更新（导航点击、登录页）。先 grep `main-header`/`nav-item`/`nav-menu` 评估面。
- **对比度（WCAG AA）**：单色 slate + 浅灰文字需过 axe-core；保留现有 Tag 对比修正。
- **可点性线索弱化**：主色全中性后，原先靠蓝色区分"可点/激活"的线索变弱 → 用 hover 底色 + 字重 + 必要下划线补偿。
- **Inter 引入**：必须 `@fontsource/inter` 本地打包，禁用外网 CDN（内网部署）。

## 6. 实施顺序（每步 lint/typecheck/test + 明暗目测，逐步 check-in）

1. **令牌层**：`global.css` 覆盖 Arco 变量 + `@arco-design/color` 生成 slate 主色板 + Inter 引入。**不动布局**，先验证全站换肤不崩。
2. **深色模式**对齐 shadcn slate。
3. **布局外壳**：MainLayout 顶栏 → 侧边栏 + 顶栏（含响应式抽屉）。
4. **登录页**配色。
5. **排查并修复**受影响 E2E（布局选择器/导航/登录）。
6. **全量回归**：client 单测 + E2E smoke/p0 + axe a11y；明/暗两态目测主要页面（首页、项目列表、项目详情、周报、系统管理、登录）。

## 7. 验收

- `npm run lint` 0 warnings；client `tsc` 0 错误；client 单测全绿。
- E2E：smoke + p0 通过；axe a11y 无新增违规。
- 明/暗两态主要页面目测符合 shadcn-admin 质感。
