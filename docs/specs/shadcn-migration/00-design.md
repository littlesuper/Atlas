# shadcn/ui 全量迁移（原地重写 client/）· 设计

> 目标：把 Atlas 前端从 Arco Design **原地重写**为真正的 shadcn/ui（Tailwind + Radix），达到 100% shadcn 风格（这是 Arco 重皮肤永远做不到的最后 10%——顶栏吸顶、lucide 图标、组件内部）。
> 后端（Express/Prisma + AI 助手 + 全部 `/api`）**不动**；前端**视图层**全部替换，**逻辑层尽量复用**。
> 2026-06-14 经 L.S. 确认：① 用真 shadcn/ui；② 原地重写 `client/`（非并行目录）；③ 复用后端。

## 0. 执行约束（重要）

- **本沙箱离线**，装不了 Tailwind / shadcn / Radix / lucide（与 `@fontsource/inter` 同一堵墙）。**安装由你在本机终端联网执行**（命令见 §2）；装好后 `node_modules` 落盘，我即可在沙箱内构建/迁移（构建不需要网络）。
- **"原地重写"≈ 在 `client/` 内逐页用 shadcn 替换 Arco**：迁移期 Arco 与 shadcn **暂时并存**，最后一处 Arco 用法移除后再卸载 `@arco-design/*`。并非单次原子替换（否则全站同时崩）。
- 上一个方案的 **Arco 重皮肤成果**（`styles/global.css` 的 Arco 覆盖、`MainLayout` 的 Arco 侧栏）在迁移完成后删除；过渡期保留以维持老页面可用。

## 1. 复用 vs 重写

- ✅ **复用**：后端全部；前端 `types/`、`api/`（Axios 封装）、`store/`（Zustand）、`i18n/`、`utils/` 业务函数、路由结构（React Router 7）。
- 🔁 **重写**：所有 Arco 组件/页面 → shadcn；`styles/global.css`（Arco 覆盖）→ Tailwind base + shadcn 主题；前端单测（依赖 Arco DOM 的部分）；300+ E2E 选择器。
- ❌ **弃用**：Arco 重皮肤的 Arco-token 覆盖（迁移完成即删）。

## 2. 工具与依赖（你联网执行）

```bash
cd client
# Tailwind（v4 用 @tailwindcss/vite 插件；v3 用 postcss）
npm i -D tailwindcss @tailwindcss/vite
# shadcn 初始化（选：framework=Vite、base color=Slate、CSS variables=yes、alias=@/*）
npx shadcn@latest init
# 运行时依赖（shadcn 组件用）
npm i class-variance-authority clsx tailwind-merge lucide-react
# 生态：表格 / 表单 / 日期 / 通知
npm i @tanstack/react-table react-hook-form @hookform/resolvers zod react-day-picker date-fns sonner
# 字体
npm i @fontsource/inter
# 常用组件按需 add（迁移中随用随加）
npx shadcn@latest add button input textarea card badge dialog alert-dialog dropdown-menu \
  tooltip tabs select sonner avatar separator sheet table form label checkbox switch \
  popover calendar progress skeleton scroll-area breadcrumb sidebar
```

- **路径别名**：`vite.config.ts` + `tsconfig.json` 加 `@/* → src/*`（shadcn 默认）。
- **React 19 + Radix**：核对各 Radix 版本对 React 19 的支持（多数已支持）；如个别组件报 peer 警告，记录并升级。

## 3. 主题

- 复用重皮肤推导的 **slate 令牌**写进 shadcn `index.css` 的 `:root` / `.dark`（oklch，直接抄 shadcn-admin 的 `theme.css` 值——我们已对齐过）。shadcn 主色原生近黑、暗色原生近白主按钮，**无需 hack**。
- 字体 **Inter**（`@fontsource/inter`，本地打包）。
- **暗色切换**：改造现有 `themeStore`——把 `body[arco-theme='dark']` 换成在 `<html>` 上切 `.dark` class（shadcn 约定）；localStorage 持久化逻辑复用。

## 4. 组件映射（Arco → shadcn [+ 生态库]）

| Arco | shadcn / 生态 |
| --- | --- |
| Button | `Button` |
| Input / Textarea | `Input` / `Textarea` |
| Select / Cascader | `Select`（复杂用 `Command` + `Popover`） |
| Form | `react-hook-form` + `zod` + shadcn `Form` |
| Table（排序/筛选/分页/固定列/行内编辑/拖拽） | `@tanstack/react-table` + shadcn `table` 原语 |
| Modal | `Dialog`；`Modal.confirm` → `AlertDialog`（受控） |
| Drawer | `Sheet` |
| Message / Notification（命令式） | `sonner`（`toast(...)`） |
| Tabs | `Tabs` |
| DatePicker / RangePicker | `Popover` + `Calendar`（react-day-picker）；工作日/节假日逻辑复用 `utils` |
| Dropdown | `DropdownMenu` |
| Tag | `Badge` |
| Avatar / Tooltip / Progress | `Avatar` / `Tooltip` / `Progress` |
| Steps | 自定义 stepper（Tailwind） |
| Upload / Pagination / Tree | 自定义（Upload 用原生 input；Pagination 用 TanStack） |
| 图标 `@arco-design/web-react/icon` | `lucide-react` |

## 5. 硬骨头（工作量与风险大头）

- **表格**（最大）：Arco Table 用得最广（活动/项目/周报/工作量…），含排序、筛选、分页、固定列、行内编辑、飞书式拖拽排序、归档 diff 行。shadcn 无开箱表格 → 用 TanStack Table 逐个重建。**建议先打通一个代表表（项目列表），固化模式再批量。**
- **表单**：所有 Arco Form → react-hook-form + zod，逐个重写校验与联动。
- **日期**：DatePicker/RangePicker → react-day-picker；工作日计算 utils 复用。
- **甘特图 / 排期视图**：自绘组件迁到 Tailwind。
- **AI 助手**：`AssistantConversation` / `AssistantLauncher` 用了 Arco Steps/Table/Tag/Message/Modal/Input → 整体重写为 shadcn（逻辑/接口不变）。
- **命令式 API**：Arco `Message` / `Modal.confirm` / `Notification` 在全站被命令式调用 → 换成 `sonner` 的 `toast()` 与受控 `AlertDialog`，需改造每个调用点。
- **wangEditor 富文本**：保留（与 UI 库无关），仅容器样式适配。

## 6. 分阶段（每阶段 check-in + 回归；Arco 与 shadcn 并存至 P4 末）

- **P0 工具**：Tailwind + `shadcn init` + 主题令牌 + 别名 + Inter；Arco 仍在，验证两者共存、构建不崩、老页面照常。
- **P1 基础件 + 封装**：`add` 常用 shadcn 组件；封装薄 wrapper（统一 `toast`、确认弹窗 hook、表格脚手架）。
- **P2 应用外壳**：`MainLayout` → shadcn `Sidebar`/`Sheet`/`DropdownMenu` + lucide——**这里直接拿到真·像素级侧栏 + 吸顶顶栏**；`themeStore` 切 `.dark`；登录页。
- **P3 页面逐个**：Login → Projects(list+detail) → Products → WeeklyReports → Workload → Admin → Home。每页：视图重写 + 该页前端单测 + 该页 e2e 重写 + 回归。**先做项目列表打通表格模式。**
- **P4 收尾**：移除最后 Arco 用法 → 卸载 `@arco-design/*` → 删 `global.css` 的 Arco 覆盖 → 全量回归（单测 + e2e smoke/p0 + axe a11y）。

## 7. 测试

- **服务端测试不动**（前端重写不影响后端）。
- **前端单测**：大量 mock/断言依赖 Arco DOM → 随每页视图重写而更新（与 P3 同步）。
- **E2E**：选择器全变（Arco class 消失）→ 随每页迁移重写对应 spec；以 smoke/p0 绿作为每阶段关卡。

## 8. 风险

- **巨大改动面**：60+ 前端文件、300+ e2e，数周级；原地重写过程中应用阶段性不稳定（接受）。
- **表格/表单**是工作量与风险集中点——先做代表页验证模式。
- **React 19 + Radix** peer 兼容需逐一核对。
- i18n / auth / 路由复用但需重新接线到 shadcn 组件。

## 9. 验收

- `@arco-design/*` 从 `package.json` 移除、源码无残留 import。
- Tailwind + shadcn 构建通过；lint / typecheck 0。
- 前端单测、E2E（smoke/p0）、axe a11y 全绿。
- 明暗两态全站 shadcn 风格。
