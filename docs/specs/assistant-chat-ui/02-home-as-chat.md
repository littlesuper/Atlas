# 首页即聊天页（合并 /assistant）— 设计

- 日期：2026-06-14
- 状态：已评审，待实现
- 关联：[00-design.md](./00-design.md)（聊天 UI 初版）、[01-implementation-plan.md](./01-implementation-plan.md)
- 范围：纯前端结构调整。后端与「不可妥协的安全模型」零改动。
- 说明：本设计**取代** 00 中关于「首页 hero 输入框（提交跳转）」与「独立 `/assistant` 页」的部分。

## 背景

初版交付后存在重复：首页 `/` 是「AI hero 输入框（提交后跳转到 `/assistant`）」，`/assistant` 是全屏聊天页。两处都是 AI 输入，跳转割裂、观感重复。本次把聊天能力直接合并进首页，删除 `/assistant` 页。

## 已确定决策

| 维度 | 决策 |
|---|---|
| 首页形态 | `/` 直接变成全屏聊天页（合并 `/assistant` 能力） |
| 风险区 | 空态（无对话）时在输入下方**按需**显示（仅真实风险点）；一旦开始对话则隐藏 |
| 侧边栏 | 去掉「AI 助手」项，「首页」即入口 |
| `/assistant` | 删除独立页面；保留 `/assistant → /` 重定向（向后兼容旧链接） |

## 架构

### 1. 首页 = 聊天页
`pages/Home/index.tsx` 重构为聊天壳（复用 `hooks/useAssistantChat`，逻辑同原 `pages/Assistant/index.tsx`）：
- 取 `messages`/`sending`/`send`/`applyProposal`/`reset`（来自 hook）。
- 读取 `?project=` 作为 `contextProjectId` 传给 `send`；**就地发送**，无跳转、无 `pendingUtterance` 交接。
- 渲染：
  - `messages.length === 0`（空态）：`<EmptyState onPick={doSend} />` + `<RiskOverview />`（按需风险区）。
  - 否则：`<MessageList messages onApply={applyProposal} />`。
  - 底部恒为 `<ChatInput value onChange onSend onNewChat sending />`（「新对话」调 `reset`）。
- 仍用 `MainLayout` 包裹；外层沿用 `flex h-[calc(100vh-3.5rem)] flex-col`。

### 2. 组件搬家（`pages/Assistant/` → `pages/Home/`）
`git mv` 以下文件（同层移动，内部相对 import `../../*` 与 `./*` 均不变）：
- `MessageList.tsx`、`ProposalCard.tsx`(+`.test.tsx`)、`AnswerBubble.tsx`(+`.test.tsx`)、`ChatInput.tsx`、`EmptyState.tsx`

移动后 `pages/Assistant/` 目录清空并删除。

### 3. 新增 `pages/Home/RiskOverview.tsx`
把原首页「项目风险点（AI 分析）」整块抽成独立组件：
- 自行 `riskApi.getDashboard()` / `getInsights()` 加载；监听 `window` 的 `assistant:applied` 刷新。
- `hasRiskPoints = highRiskProjects.length > 0 || topActionItems.length > 0`（沿用已修复门槛，**不含** `topConcerns`）。
- 无真实风险点或加载中 → 返回 `null`（不渲染、无骨架占位）。
- 仅在首页**空态**被渲染。

### 4. 删除
- `pages/Assistant/index.tsx`
- `components/AssistantHeroInput.tsx` + `.test.tsx`
- `store/assistantChatStore.ts` 的 `pendingUtterance` 字段与 `setPendingUtterance`（及其 store 测试用例）
- `MainLayout.tsx` 概览组的「AI 助手」导航项
- `App.tsx` 的 `/assistant` 独立路由与 `const Assistant = React.lazy(...)`

### 5. 路由（`App.tsx`）
- `/` → `Home`：维持现状的 inline 鉴权 `isAuthenticated ? <Home/> : <Navigate to="/login" replace />`，**不加**额外权限门控（首页人人可达）。
- `/assistant` → `<Navigate to="/" replace />`（向后兼容旧链接/书签；不再有独立页面）。

### 6. 入口与浮层（`MainLayout.tsx`）
- 概览组导航仅保留 `{ key:'/', label:'首页', path:'/', icon: Home }`（删掉「AI 助手」项）。
- 浮层挂载条件简化为 `canUseAssistant && location.pathname !== '/'`（去掉 `!== '/assistant'`）。
- `AssistantLauncher` 改为 `navigate(projectId ? '/?project=' + projectId : '/')`。

### 7. 权限
- 首页 `/` 维持现状不加路由级权限门控（所有登录用户可达、可问答/看预览）。原 `/assistant` 的 `activity:update` 门控随页面删除取消。
- 写入权限不变：`apply` 仍由后端各领域校验路径（Zod + 权限 + 审计）把关——无权限用户可问答/预览，点「确认应用」时被后端拦截。
- 浮层维持现有 `canUseAssistant`（`activity:update`）门控（仅写权限用户看到快捷入口；其余用户从侧边栏「首页」进入）。

### 8. store 调整
`assistantChatStore` 去掉 `pendingUtterance` / `setPendingUtterance`；其余（`messages` / `pushUser` / `pushAssistant` / `updateMessage` / `reset` + persist `messages`）不变。`useAssistantChat` 不受影响（本就不依赖 `pendingUtterance`）。

## 测试
- 重写 `pages/Home/index.test.tsx`：空态渲染（问候 / 输入 / 示例 chip）；空态下有真实风险点 → 显示风险区，无风险点 → 不显示；发出一条消息后 → 进入消息流且风险区消失；`?project=` 透传给 propose。
- 新增 `pages/Home/RiskOverview.test.tsx`（迁移自原 Home 测试）：有风险点显示、仅善意提示/无风险点 → `null`、加载失败 → `null`。
- 删 `components/AssistantHeroInput.test.tsx`。
- `store/assistantChatStore.test.ts`：移除 `setPendingUtterance` 用例。
- `components/AssistantLauncher.test.tsx`：断言改为 `navigate('/?project=p1')` 与 `navigate('/')`。
- 迁移来的 `ProposalCard.test.tsx` / `AnswerBubble.test.tsx` 内容不变（仅路径变）。

## 验收标准
1. 访问 `/` 即全屏聊天：空态有问候 + 输入 + 示例 chip；发消息后进入气泡对话流。
2. 空态下仅当有真实风险点（高风险项目 / 重点行动项）才在下方显示风险区；开始对话后风险区隐藏。
3. 侧边栏只有「首页」入口、无「AI 助手」；右下角浮层在非首页跳 `/` 且带 `?project=`。
4. 访问旧 `/assistant` 重定向到 `/`。
5. `pages/Assistant/` 目录与 `AssistantHeroInput` 已删除；全仓无残留 import。
6. `npm run lint` 0 warning；`tsc` 通过；单测全绿。
7. 后端无改动；`apply` 仍走「确认弹窗 + 后端校验」。
