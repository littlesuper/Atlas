# 交接：codex 质量系统栈 rebase 到主线

- 日期：2026-06-15
- 受众：codex（OpenAI Codex CLI，在 `codex/*` worktree 上工作）
- 背景：AI 能力层 Phase 2 + qa/base 修复已并入主线，主线已是 shadcn 前端。codex 的质量系统栈（week5–8）分叉早于 shadcn 迁移，需 rebase 上来。

## 目标

把质量系统栈（tip `codex/week8-team-alignment`，自 `f083982f` 起 62 个提交：logging / metrics / dashboards / sentry / alert-rules / feature-flags / canary-rollback / runbooks / knowledge-base / monthly-audit / checklists 等）**rebase 到当前主线 `feat/glm-qa-pipeline`**（当时 HEAD `1c5b9252`；rebase 前请 `git fetch` / 确认主线最新 HEAD，主线仍在前进）。

```
git rebase --onto feat/glm-qa-pipeline f083982f codex/week8-team-alignment
# 或在你的 worktree 上交互式 rebase 到主线 HEAD
```

## 冲突预期（直接整栈 merge 实测 66 处，分两类）

### 1) 前端 + e2e（~39 文件）= Arco ↔ shadcn —— **要重做，不是机械解冲突**
主线已把整套前端从 Arco Design 迁到 shadcn/ui（重写了 168 个 client 文件）。你的质量系统前端接线（错误边界 `ErrorBoundary`、sentry 初始化、`api/request.ts` 错误处理、`App.tsx`/`main.tsx` 观测注入、`MainLayout`、`Project/Detail/*`、`Login`、`Admin`、`authStore`、`vite.config`）长在**旧 Arco 代码**上。

- **正确做法**：在**当前 shadcn 组件**上**重新实现**这些观测/错误边界接线，而不是把你分支的旧版本合回来。
- ⚠️ 机械解冲突会把已删除的 Arco 代码卷回来、弄坏 shadcn 迁移。
- 涉及 e2e specs 也是：主线已按 shadcn 选择器改过，你的 e2e 改动要对齐新选择器。

### 2) 后端 / 配置 —— 手工合
- **`package.json` ×3（root/server/client）**：取并集（保留主线 shadcn 依赖 + 你的 sentry/metrics/observability 依赖）。
- **`CLAUDE.md` / `AGENTS.md`**：主线已把「全系统 AI 助手」章节**重写成能力层**（Phase 2，见 `### 助手框架（…/capability/）`）——**保留主线那段**，再把你的质量系统文档章节加上。两文件保持同步。
- **`server/src/index.ts`**：中间件接线——把你的 logging/metrics/sentry 中间件接到 Phase 2 后的 server 结构上。
- **~30 个 server 路由/中间件/测试**（`activities.ts`/`auth.ts`/`aiConfig.ts`/`httpLogger`/`validate`/`performance.test` 等）：你加的观测钩子按当前路由实现重接。

## 好消息

栈里 **158 个后端/ops/docs 文件大多是新增**（`atlas-quality-system/`、ops、`.github`、scripts、docs），rebase 应基本干净；难点集中在那 ~39 个前端/e2e。

## 收尾

- rebase 完本地 `cd server && npx vitest run` 全绿（注意 worktree 需 `npx prisma generate` 生成 client）+ 前端 `cd client && npm test` 绿再交付。
- 助手层（`server/src/services/assistant/`）**别动**——那是 Phase 2 能力层，你的栈不碰它，rebase 时不应产生该目录的冲突。

## 主线相关锚点（rebase 后核对没被你卷回旧版）
- AI 写操作统一走能力层 `server/src/services/assistant/capability/`（5 个能力），旧 `assistant/{orchestrator,registry,bootstrap}.ts` + `adapters/` **已删除**，勿复活。
- 前端为 shadcn/ui（无 `@arco-design/*`）。
