# AI 助手聊天式交互改造 — 设计

- 日期：2026-06-14
- 状态：已评审，待实现
- 范围：纯前端改造。后端 `propose`/`apply` API 与「不可妥协的安全模型」零改动。

## 1. 背景与目标

当前全系统 AI 助手是「单次问答 + 竖向步骤时间线」的交互：每次输入会重置上一次，没有对话留存，右下角是一个 440px 浮层（`AssistantLauncher`），首页是 hero 胶囊输入。

目标是把交互改造成 **claude.ai 网页那种聊天式体验**：连续气泡对话流、底部自增长输入框、Markdown 回答，并把「改动预览 → 确认 → 应用」自然融进对话。

关键约束：Atlas 的 AI 是 **指令式助手**（先预览改动 → 用户确认 → 才写入），不是纯聊天。聊天外壳必须把 propose/apply 卡片作为一种「特殊的 AI 消息」容纳进来，而不是削弱确认与反幻觉护栏。

## 2. 已确定的范围决策

| 维度 | 决策 |
|---|---|
| 改造深度 | 仅「外观改成聊天流」。**不做**跨轮记忆、**不做**流式输出、**不做**会话入库 |
| 界面位置 | **独立全屏聊天页** `/assistant`（最像 claude.ai） |
| 首页布局 | 极简：默认只显示对话输入框；**仅当有风险点**才在下方显示风险区，否则不显示其他内容 |
| 非首页唤起 | 左侧导航「AI 助手」入口 + 右下角浮动按钮，**都直接跳转**到 `/assistant`，自动带当前项目作上下文 |
| 刷新保留 | 对话镜像到 `localStorage`，整页刷新后仍在（无数据库） |
| 确认步骤 | **保留**应用前的显式确认弹窗（`AlertDialog`），honor「每次写入需用户显式确认」 |
| 后端 | 零改动，复用 `assistantApi.propose` / `apply`，每轮仍是独立 propose 调用 |

### 不在本次范围（未来可叠加）
- 多轮上下文记忆（需后端把历史喂进意图解析，且保持反幻觉护栏）
- 流式输出（SSE 管线）
- 会话持久化到数据库 + 侧栏历史会话列表

## 3. 架构

### 3.1 新增页面与路由
- 新页面 `client/src/pages/Assistant/index.tsx`，路由 `/assistant`，沿用 `App.tsx` 既有的鉴权守卫写法（未登录跳 `/login`）。
- 全屏布局：复用 `MainLayout`（保留左侧导航），主区为聊天列（居中、最大宽度约 760px）+ 底部输入框。

### 3.2 导航与入口
- `MainLayout.tsx` 的 `navGroups` 在「概览」组新增 `{ key: '/assistant', label: 'AI 助手', path: '/assistant', icon: Bot }`（与浮层同图标），用既有 `canUseAssistant` 权限门控。
- `AssistantLauncher.tsx` 由「点开内嵌浮层」改为「点击跳转」：`navigate('/assistant?project=<routeProjectId>')`，把当前路由项目作为上下文（query 参数 `?project=<id>`，空则不带）。仍按现状在非首页显示。
- 首页（`pages/Home/index.tsx`）改为 claude.ai 式极简落地：**默认只显示对话输入框**（hero）。提交时把首条用户消息经 `setPendingFirstUtterance(text)` 写入 store 并 `navigate('/assistant')`，聊天页挂载时若有 pending 则自动发送一次。
- 首页风险区**按需显示**：仅当存在**真实**风险点（`highRiskProjects.length > 0 || topActionItems.length > 0`）时，才在输入框下方渲染「项目风险点（AI 分析）」整块；无风险点时首页只剩输入框，不显示风险分布等其他内容。为保持极简，加载期间不显示骨架占位，数据返回后再按需出现。
  - **不把 `topConcerns` 计入门槛**：后端即使无风险也会回一条「当前风险可控」之类的善意提示，若计入会导致风险区几乎总是出现（实测发现）。`topConcerns` 仅在风险区已显示时作为「AI 重点关注」内容展示。
- 上下文项目：聊天页从 `?project=<id>` 读取作为 `propose` 的 `contextProjectId`；无则传 `null`，由 AI 从话里认目标（与现状一致）。

### 3.3 对话状态 — 新增 Zustand store `assistantChatStore.ts`
为什么用 store 而非组件内 state：让对话在「离开 `/assistant` 再回来」时仍在，并让首页 hero 能先塞入首条消息再跳转。

- `messages: AssistantMessage[]`，按时间顺序渲染。
- 动作：`pushUser(text)`、`pushAssistant(msg)`、`updateMessage(id, patch)`（用于卡片应用后就地改状态）、`reset()`（「新对话」）、`setPendingFirstUtterance(text)`（首页交接）。
- 持久化：用 zustand `persist` 中间件镜像到 `localStorage`（仅前端，无 DB）。
- 单轮独立：每次发送都是一次新的 `assistantApi.propose(text, contextProjectId)`，**不**把历史拼进请求 → 安全模型不变。

#### 消息类型（discriminated union）
```ts
type AssistantMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; kind: 'answer';
      answer: string; basis?: 'deterministic' | 'grounded'; elapsedMs?: number }
  | { id: string; role: 'assistant'; kind: 'proposal';
      proposalId: string | null; preview: AssistantPreview; narrative: string;
      confidence?: 'high' | 'low'; elapsedMs?: number;
      applied: boolean }   // 应用后置 true，卡片就地显示「已应用」
  | { id: string; role: 'assistant'; kind: 'status';
      variant: 'ai_unavailable' | 'noop' | 'not_understood' | 'need_target';
      text: string };
```
（复用 `types/index.ts` 既有的 `AssistantPreview`/`AssistantDiffRow`/`AssistantRiskRow`。）

### 3.4 渲染 — 重构而非重写
把 `AssistantConversation.tsx` 里的 propose/apply 处理逻辑（handlePropose/doApply/相位机）抽出复用，换成按轮渲染的聊天气泡：

- **用户消息**：右对齐气泡（次级底色）。
- **步骤行**：原 5 步竖向时间线，收成 AI 回合上方一条紧凑行 `✓ 意图解析〔AI〕· 生成预览〔系统〕· 风险判定〔系统〕`，保留「AI 只在边缘、值由系统算」的可见性。
- **proposal 卡片**：内嵌 diff 表 + 风险徽标 + `应用全部`/`取消`；点应用经既有 `AlertDialog` 确认 → `apply` → 卡片就地变为「已应用，可在审计/撤回处回滚」（不重置对话）。`rows.length === 0` 显示「无改动」。低置信显示橙色提醒。
- **answer 气泡**：Markdown 渲染（新依赖 `react-markdown` + `remark-gfm`），底部来源徽标（`系统精确计算` 绿 / `据系统数据…` 橙）+「耗时 X.X 秒」。
- **status 消息**：ai_unavailable（503，提示手动）、noop/not_understood（「没听懂」）、need_target（认不出项目）各自的提示气泡。
- **应用成功**仍派发 `window` 事件 `assistant:applied`，相关页面（如首页看板）照旧监听刷新。

### 3.5 输入区与空态
- 底部输入：自增长 `textarea`（Enter 发送、Shift+Enter 换行），左 `+`（清空/新对话）、右圆形发送按钮，参考 mockup 的胶囊样式。
- 空态：居中问候 + 输入 + 4 个示例提示 chip（排期 / 项目字段 / 风险项 / 提问），点 chip 即作为首条消息发送。
- 顶部「新对话」按钮 → `reset()`。

### 3.6 组件落点
- 新增 `pages/Assistant/index.tsx`（页面外壳：空态 / 列表 / 输入）。
- 新增 `store/assistantChatStore.ts`。
- 新增消息渲染子组件（建议同目录 `pages/Assistant/` 下：`MessageList.tsx`、`ProposalCard.tsx`、`AnswerBubble.tsx`、`ChatInput.tsx`），让单文件保持聚焦。
- 改 `AssistantLauncher.tsx`：浮层 → 跳转 FAB。
- 改 `layouts/MainLayout.tsx`：加导航项；launcher 行为调整。
- 改 `pages/Home/index.tsx`：hero 提交 → 交接 + 跳转。
- `AssistantConversation.tsx`：拆出可复用的 propose/apply hook（如 `useAssistantTurn`），`panel` 渲染退役；`hero` 胶囊输入抽成轻量 `AssistantHeroInput`，供首页复用。

### 3.7 后端
无改动。复用：
- `POST /api/assistant/propose` `{ utterance, contextProjectId }` → `AssistantProposeResult`
- `POST /api/assistant/apply` `{ proposalId }` → `AssistantApplyResult`
503/409/404/400 的降级与既有处理保持一致。

## 4. 安全模型保持

本次为纯前端外壳改造，五条不可妥协约束全部不动：LLM 只在边缘、每次写入显式确认（保留确认弹窗）、走现有校验写入路径、代码层护栏、全程审计可回滚。每轮 propose 独立、不发送历史，不扩大 LLM 可触及的真值面。

## 5. 测试与影响面

- **单测**：新增 `assistantChatStore.test.ts`（消息增改、reset、首条交接、persist）。
- **组件测**：ProposalCard 的应用 / 取消 / 已应用态；AnswerBubble 的来源徽标；空态 chip 发送。
- **e2e**：盘点引用旧浮层/`AssistantConversation` 的 spec，迁移到 `/assistant` 页面流（作为本次工作的一部分，并在实现计划里列出受影响清单）。
- **新依赖**：`react-markdown`、`remark-gfm`（client）。

## 6. 验收标准

1. 左侧导航与右下角按钮、首页 hero 都能进入 `/assistant`，且带对当前项目的上下文。
2. 在 `/assistant` 连续输入多条，气泡按 claude.ai 式对话流堆叠，不再相互重置。
3. 指令类输入产出内嵌「改动预览」卡片，经确认弹窗后应用、卡片就地变「已应用」，并触发相关页面刷新。
4. 只读提问以 Markdown 渲染，带正确来源徽标与耗时。
5. 整页刷新后对话仍在；「新对话」清空。
6. AI 不可用 / 没听懂 / 认不出项目 / 低置信 等状态都有对应气泡提示。
7. `npm run lint` 0 warning；新增单测通过。
8. 首页默认只显示对话输入框；仅当存在真实风险点（高风险项目 / 重点行动项任一非空；不含善意提示 `topConcerns`）时才显示风险区，否则首页只有输入框。
