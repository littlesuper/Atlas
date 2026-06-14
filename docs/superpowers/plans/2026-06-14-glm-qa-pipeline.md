# GLM-QA / Claude-修复 双代理流水线 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地一条「GLM 当 QA 找 bug + 写失败测试 → Claude Code 改源码修绿 → GLM 复测」的双代理 TDD 接力流水线。

**Architecture:** GLM 经 opencode 接入，扮演 QA 代理（只写测试/报告，opencode 权限硬拦截禁改 `src/`）；交接走「失败测试 + GitHub draft PR（`qa-bug` 标签）」；Claude Code 在同分支把测试修绿；CI 当裁判（红→绿）。两代理用同机双 git worktree 隔离。

**Tech Stack:** opencode（GLM-5.1 via 内置 Z.AI provider）、GitHub PR + `gh` CLI、Vitest + Playwright（沿用现有测试体系）、git worktree。

**设计来源：** [`docs/superpowers/specs/2026-06-14-glm-qa-pipeline-design.md`](../specs/2026-06-14-glm-qa-pipeline-design.md)

---

## ⚠️ 执行前必读

- **目标分支**：本计划所有 commit 落在一个**专用分支**，**不要**提交到当前的 `feat/shadcn-ui-migration`（避免混入 UI 迁移、并触发 post-commit 版本号 hook 造成噪音）。Task 0 负责建分支。
- **人工步骤**：标 **[人工]** 的步骤需要人操作（GLM API key、跑 opencode 交互、建 worktree）；其余步骤执行者（Claude/subagent）可自动完成。
- **文档已存在**：`docs/superpowers/specs/2026-06-14-glm-qa-pipeline-design.md`（设计）当前为未跟踪文件，Task 0 一并纳入提交。

---

## 文件结构

| 文件 | 责任 | 动作 |
| --- | --- | --- |
| `docs/qa/README.md` | QA 流程登记（入口/流转/边界） | 新建 |
| `docs/qa/GLM-QA-GUIDE.md` | GLM QA 代理操作手册（兼作 opencode agent system prompt） | 新建 |
| `docs/qa/bugs/_TEMPLATE.md` | bug 报告模板（作 PR body 来源） | 新建 |
| `opencode.json` | 定义 `qa` agent：GLM 模型 + 路径硬护栏 + bash 白名单 | 新建 |
| `.github/PULL_REQUEST_TEMPLATE/qa-bug.md` | `qa-bug` PR 模板（交接契约 checklist） | 新建 |
| `docs/superpowers/specs/2026-06-14-...-design.md` | 设计文档（已写） | 提交 |

---

## Task 0: 建专用分支并提交设计文档

**Files:**
- 提交：`docs/superpowers/specs/2026-06-14-glm-qa-pipeline-design.md`、`docs/superpowers/plans/2026-06-14-glm-qa-pipeline.md`

- [ ] **Step 1: 从 main 建专用分支**（不污染当前 UI 分支）

```bash
git fetch origin
git switch -c feat/glm-qa-pipeline origin/main
```
若希望基于当前进度而非 main，可改用 `git switch -c feat/glm-qa-pipeline`（保留当前 HEAD）。未提交的 UI 改动会随之浮动，不影响本计划（本计划只 `git add` 自己的新文件）。

- [ ] **Step 2: 提交设计 + 计划文档**

```bash
git add docs/superpowers/specs/2026-06-14-glm-qa-pipeline-design.md \
        docs/superpowers/plans/2026-06-14-glm-qa-pipeline.md
git commit -m "docs(qa): GLM-QA 双代理流水线设计与实施计划"
```
Expected: 提交成功，仅含这两个文件（`git show --stat HEAD` 确认）。

---

## Task 1: QA 目录骨架（README + bug 报告模板）

**Files:**
- Create: `docs/qa/README.md`
- Create: `docs/qa/bugs/_TEMPLATE.md`

- [ ] **Step 1: 写 `docs/qa/README.md`**

```markdown
# Atlas QA 流程：GLM 测、Claude 修

本目录承载「双代理 TDD 接力」：**GLM（QA，opencode）找 bug 并写失败测试 → Claude Code 修源码 → GLM 复测**。

- 设计文档：`docs/superpowers/specs/2026-06-14-glm-qa-pipeline-design.md`
- GLM 操作手册：`docs/qa/GLM-QA-GUIDE.md`
- bug 报告模板：`docs/qa/bugs/_TEMPLATE.md`
- opencode 配置：根目录 `opencode.json`（`qa` agent）

## 一个 bug 的流转
1. GLM 开 `qa/<date>-<slug>` 分支，提交失败测试 + 报告，开 draft PR 打 `qa-bug` 标签（CI 应为红）。
2. 人把 PR 交给 Claude Code（「修 PR #N」）。
3. Claude `gh pr checkout N` → 确认红 → 改源码 → push（CI 转绿）。
4. GLM 复测确认绿（测试未被改动）→ `gh pr ready N` → 人合并。

## 边界（硬约束）
- GLM 只写 `**/*.test.ts(x)`、`e2e/**`、`docs/qa/**`，**禁改 `client/src/**`、`server/src/**`**（opencode 权限硬拦截）。
- Claude 只改源码，**禁改 / skip / 删除** GLM 的复现测试。
```

- [ ] **Step 2: 写 `docs/qa/bugs/_TEMPLATE.md`**

```markdown
# [BUG] <一句话标题>

- 严重度：P0 / P1 / P2 / P3
- 发现者：GLM QA
- 日期：<YYYY-MM-DD>
- 模块：<如 WeeklyReports / scheduleEngine / auth>

## 复现步骤
1. ...
2. ...

## 期望行为
...

## 实际行为
...

## 失败测试（交接契约）
- 路径：`<path/to/xxx.test.ts>`
- 运行命令：`<命令>`
- 当前失败输出（关键片段）：

​```
<粘贴 FAIL 输出>
​```

## 修复验证（Claude 修完后由 GLM 填）
- [ ] 同一测试已转绿，且测试本身未被修改
- 验证命令输出：<PASS 片段>
```

- [ ] **Step 3: 校验文件存在**

Run: `ls docs/qa/README.md docs/qa/bugs/_TEMPLATE.md`
Expected: 两个路径都列出，无 "No such file"。

- [ ] **Step 4: 提交**

```bash
git add docs/qa/README.md docs/qa/bugs/_TEMPLATE.md
git commit -m "docs(qa): QA 流程登记与 bug 报告模板"
```

---

## Task 2: GLM QA 代理操作手册（GLM-QA-GUIDE.md）

这是 GLM 的 system prompt（opencode 经 `prompt: {file:...}` 加载），也是人读的手册。内容必须自洽、强约束。

**Files:**
- Create: `docs/qa/GLM-QA-GUIDE.md`

- [ ] **Step 1: 写 `docs/qa/GLM-QA-GUIDE.md`（完整内容如下）**

```markdown
# GLM QA Agent 操作手册

> 你是 Atlas 项目的 **QA 代理（GLM）**。唯一职责：**找 bug，并用一个真会失败的测试证明它**。修 bug 不是你的事——那是 Claude Code 的事。

## 硬边界（不可逾越）
1. **绝不修改生产源码**：不碰 `client/src/**`、`server/src/**`（其下的 `*.test.ts(x)` 测试文件除外）。opencode 权限已硬拦截；即便技术上能改也绝不改。
2. **没有「真红」的测试 = 没发现 bug**：任何 bug 主张都必须附一个**当前会失败**的测试。先把测试跑红，再说有 bug。
3. **不写脆弱/无意义测试**：断言要具体、确定、可复现；不依赖当前时间、随机数、网络、执行顺序。
4. **不改测试迁就现状**：测试反映「应有行为」，红就是红，不为变绿而弱化断言。

## 工作循环（一个 bug，一个 PR）
1. **探索找 bug**：跑现有测试、读代码、（必要时）起 dev server 操作页面，寻找：逻辑错误、边界条件、错误处理缺失、UI 交互异常、回归。
2. **写失败测试复现**：
   - 逻辑 / 接口 / store / 工具函数 → Vitest 单测，与源文件**同目录**，命名 `<name>.test.ts(x)`。
   - 页面交互 / 端到端 → Playwright E2E，放 `e2e/**`，沿用现有 `@p1`/`@p2` 等 tag 习惯。
   - **遵循 `CLAUDE.md`「测试约定」**：显式 `import { describe, it, expect } from 'vitest'`；后端 `it` 用英文、前端用中文；mock 用 `vi.hoisted()` + `vi.mock()`；每个 `beforeEach` 调 `vi.clearAllMocks()`。
3. **跑红确认**：运行该测试，**必须 FAIL**。把失败输出记进报告。若没红，说明 bug 不成立 → 回第 1 步。
4. **写 bug 报告**：复制 `docs/qa/bugs/_TEMPLATE.md`，填复现步骤、期望 vs 实际、失败测试路径与输出、严重度。
5. **开 PR 交接**：

   ​```bash
   git checkout -b qa/$(date +%Y-%m-%d)-<slug>
   git add <失败测试文件> docs/qa/bugs/<报告>.md
   git commit -m "test(qa): 复现 <bug 简述>（红）"
   git push -u origin HEAD
   gh pr create --draft --label qa-bug \
     --title "qa: <bug 简述>" \
     --body-file docs/qa/bugs/<报告>.md
   ​```
   此刻 PR 的 CI 应为 **🔴 红**。把 PR 编号交给人类，由 Claude Code 接手修。

6. **复测确认**（Claude 修完、推到同分支后）：

   ​```bash
   git pull
   <重跑那条失败测试>     # 现在必须 PASS
   ​```
   绿了 → `gh pr ready <N>`（draft 转正），并在报告「修复验证」勾 ✅。仍红 → 在 PR 评论指出哪里还没修好。

## 你绝不做的事
- 不为「顺手」去改 `src/` 源码。
- 不为让 CI 变绿而 skip / 删除 / 弱化测试。
- 不在没有失败测试时声称发现 bug。
- 不把多个 bug 塞进一个 PR——**一个 PR 一个 bug**，便于逐个修与追溯。

## 项目上下文与命令
项目结构、技术栈见根目录 `AGENTS.md`（opencode 已自动加载）。测试命令：
- 后端单测：`cd server && npx vitest run <path>`
- 前端单测：`cd client && npx vitest run <path>`
- E2E：`npx playwright test <spec>`（复用已起服务器加前缀 `PLAYWRIGHT_REUSE_SERVER=true`）
```

> 注：上面代码块里的 ​```bash 用了零宽字符占位以避免 Markdown 嵌套围栏冲突；写入文件时改回正常的三反引号。

- [ ] **Step 2: 校验文件存在且非空**

Run: `wc -l docs/qa/GLM-QA-GUIDE.md`
Expected: 行数 > 30。

- [ ] **Step 3: 提交**

```bash
git add docs/qa/GLM-QA-GUIDE.md
git commit -m "docs(qa): GLM QA 代理操作手册"
```

---

## Task 3: opencode 配置（qa agent + 路径硬护栏）

**Files:**
- Create: `opencode.json`

- [ ] **Step 1: 写 `opencode.json`（完整内容如下）**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "qa": {
      "description": "GLM QA：找 bug、写失败测试、开 qa-bug PR，不改源码",
      "mode": "primary",
      "model": "zai/glm-5.1",
      "prompt": "{file:./docs/qa/GLM-QA-GUIDE.md}",
      "temperature": 0.2,
      "permission": {
        "edit": {
          "*": "allow",
          "client/src/**": "deny",
          "server/src/**": "deny",
          "**/*.test.ts": "allow",
          "**/*.test.tsx": "allow",
          "e2e/**": "allow",
          "docs/qa/**": "allow"
        },
        "bash": {
          "*": "ask",
          "git *": "allow",
          "gh *": "allow",
          "npm test*": "allow",
          "npx vitest*": "allow",
          "npx playwright*": "allow"
        }
      }
    }
  }
}
```

- [ ] **Step 2: 校验 JSON 合法**

Run: `npx --yes jiti -e "JSON.parse(require('fs').readFileSync('opencode.json','utf8')); console.log('ok')"` 或更简单：`node -e "JSON.parse(require('fs').readFileSync('opencode.json','utf8'));console.log('ok')"`
Expected: 输出 `ok`，无解析报错。

- [ ] **Step 3: 提交**

```bash
git add opencode.json
git commit -m "chore(qa): opencode qa agent 配置（GLM + 路径硬护栏）"
```

> ⚠️ **model id 待实测校正**：Task 5 跑 `opencode models | grep -i glm` 后，若实际 id 非 `zai/glm-5.1`（如 `z-ai/glm-4.6`），回此文件改 `model` 字段并补一次提交。

---

## Task 4: qa-bug PR 模板 + GitHub 标签

**Files:**
- Create: `.github/PULL_REQUEST_TEMPLATE/qa-bug.md`

- [ ] **Step 1: 写 `.github/PULL_REQUEST_TEMPLATE/qa-bug.md`**

```markdown
<!-- qa-bug PR：由 GLM QA 开，复现一个 bug，交 Claude Code 修 -->

## 🐛 Bug
<一句话描述>

## 复现 / 期望 vs 实际
见 `docs/qa/bugs/<报告>.md`

## 失败测试（交接契约）
- 路径：`<path/to/xxx.test.ts>`
- 当前应为 **🔴 红**（CI 会验证）

## 给 Claude 的修复约定
- [ ] 只改源码让测试自然变绿
- [ ] **不修改 / skip / 删除**本 PR 的复现测试
- [ ] CI 由 🔴 转 🟢

## 给 GLM 的复测约定
- [ ] 复跑确认绿（测试未被改动）→ `gh pr ready`
```

- [ ] **Step 2: 建 `qa-bug` 标签**

Run:
```bash
gh label create qa-bug --color B60205 --description "GLM QA 复现的 bug，待 Claude 修" 2>/dev/null || echo "标签已存在，跳过"
```
Expected: 成功创建，或提示已存在。

- [ ] **Step 3: 提交**

```bash
git add .github/PULL_REQUEST_TEMPLATE/qa-bug.md
git commit -m "chore(qa): qa-bug PR 模板"
```

---

## Task 5: [人工] 安装 opencode + 接入 GLM + 建 QA worktree

本任务需人操作（API key、交互式登录、建工作区）。

- [ ] **Step 1: 安装 opencode**

Run: `npm i -g opencode-ai && opencode --version`
Expected: 打印版本号。

- [ ] **Step 2: 登录 Z.AI（GLM Coding Plan）**

Run: `opencode auth login`
操作：选 **Z.AI / Zhipu**，粘贴 GLM Coding Plan 的 API key（存入 opencode 的 `auth.json`，**不入库**）。

- [ ] **Step 3: 确认 GLM model id**

Run: `opencode models | grep -i glm`
Expected: 列出可用 GLM 模型。**核对** `opencode.json` 里的 `model` 与此一致；不一致则改之并 `git commit`（见 Task 3 注）。

- [ ] **Step 4: 建 QA worktree（与主工作区隔离）**

Run:
```bash
git worktree add ../Atlas-qa -b qa/base origin/main
cd ../Atlas-qa && npm install
cd server && npx prisma generate && npx prisma db push && npx tsx src/prisma/seed.ts
cd ../..
git worktree list
```
Expected: `git worktree list` 同时列出主仓库与 `../Atlas-qa`；`../Atlas-qa/server/prisma/dev.db` 独立存在。

> 注：QA worktree 需能读到 `opencode.json` 与 `docs/qa/`。若 `qa/base` 基于 `origin/main` 而本计划文件还在 `feat/glm-qa-pipeline` 上，可先把该分支合并/推送，或临时 `git worktree add ../Atlas-qa feat/glm-qa-pipeline` 以便 worktree 拿到配置。

---

## Task 6: [人工] 护栏验收（安全模型实测）—— 必过

证明「GLM 只能写测试、禁改 src」的硬护栏真的生效。**这是安全模型的关键验收，不可跳过。**

- [ ] **Step 1: 启动 QA agent**

在 `../Atlas-qa` 下：`opencode --agent qa`（若该 CLI 标志不存在，用 `opencode` 进 TUI 后按 Tab 切到 `qa` agent；或 `opencode run --agent qa "<prompt>"` 非交互）。

- [ ] **Step 2: 试探禁改 src（必须被拒）**

向 agent 下达：「在 `server/src/utils/workday.ts` 末尾加一行注释 `// test」。
Expected: opencode **拒绝/拦截**该 edit（命中 `server/src/**: deny`）。若被允许 → 护栏失效，**停止**，回 Task 3 修正 glob 与排序后重测。

- [ ] **Step 3: 验证允许写测试（必须放行）**

向 agent 下达：「新建 `server/src/utils/__probe__.test.ts`，内容 `import { it, expect } from 'vitest'; it('probe', () => expect(1).toBe(1));`」。
Expected: 允许写入（命中 `**/*.test.ts: allow`，last match wins 胜过 `server/src/**: deny`）。
随后删除探针：`rm -f ../Atlas-qa/server/src/utils/__probe__.test.ts`。

- [ ] **Step 4: 记录结论**

把「禁改 src ✅ / 允许写测试 ✅」记入 `docs/qa/README.md` 末尾的「护栏验收」一节，并提交：
```bash
git add docs/qa/README.md && git commit -m "docs(qa): 记录护栏验收通过"
```

---

## Task 7: [人工] 端到端闭环验收（一个真实 bug 走通全程）

对应设计文档 §10.2 的验收标准——这是整条流水线的最终验收。

- [ ] **Step 1: GLM 产出红 PR**

在 `../Atlas-qa` 跑 `qa` agent，让它找一个真实 bug（或先用一个你已知的小缺陷做演练），按 GUIDE 写失败测试 + 报告，开 draft `qa-bug` PR。
Verify: `gh pr view <N>` 显示 draft + `qa-bug` 标签；PR 的 CI 为 **🔴 红**（失败测试如期失败）。

- [ ] **Step 2: Claude 修绿**

在主工作区 `Atlas/`，把 PR 交给 Claude Code：「修 PR #<N>」。Claude 执行 `gh pr checkout <N>` → 跑测试确认红 → 改源码 → push。
Verify: PR 的 CI 转 **🟢 绿**；`git diff` 显示**仅源码改动、复现测试未被修改**。

- [ ] **Step 3: GLM 复测并转正**

回 `../Atlas-qa`，`qa` agent 复跑该测试确认绿、勾报告「修复验证」、`gh pr ready <N>`。
Verify: PR 转为 ready；测试绿且未被改动。

- [ ] **Step 4: 合并并收尾**

人审后合并 PR。确认两个 worktree 全程无文件/数据库冲突。
✅ 至此 Phase 1 落地完成（达成设计文档 §10 全部验收标准）。

---

## Phase 2（可选，跑顺后再做，本计划不展开）

- CI 反作弊守卫：`qa-bug` PR 的修复 commit 一旦改动复现测试文件即 fail。
- nightly GLM 扫描工作流：定时批量产出 `qa-bug` PR，白天用 Claude 逐个处理。

---

## Self-Review

**1. Spec coverage（逐条对照设计文档）：**
- §3 角色与边界 → Task 2（GUIDE 硬边界）、Task 3（opencode 权限） ✅
- §4 安全模型/防作弊 → Task 3（glob 硬护栏）、Task 6（护栏实测）、Task 4（PR 契约 checklist） ✅
- §5 opencode + GLM 接入 → Task 3（配置）、Task 5（安装/登录/model 校正） ✅
- §6 隔离（双 worktree）→ Task 5 Step 4 ✅
- §7 端到端工作流 → Task 2（GUIDE 流程）、Task 7（实测） ✅
- §8 交付物清单 Phase 1（1 设计/2 GUIDE/3 opencode.json/4 PR 模板+标签+登记/5 bugs 目录）→ Task 0/2/3/4/1 ✅
- §9 风险（model 漂移、glob 残余风险）→ Task 3 注 + Task 6 ✅
- §10 验收标准 → Task 6 + Task 7 ✅
- 无遗漏。

**2. Placeholder scan：** 无 "TBD/TODO/稍后填"。`<slug>`/`<N>`/`<报告>` 是运行时参数（模板占位符，非计划缺口），属预期。GUIDE 内嵌代码块用零宽字符避免围栏冲突已在 Task 2 Step 1 注明。✅

**3. Type/命名一致性：** 分支名 `feat/glm-qa-pipeline`、标签 `qa-bug`、agent 名 `qa`、QA worktree `../Atlas-qa`、QA 分支 `qa/<date>-<slug>` 全计划一致；权限 glob 与设计文档 §5 完全一致。✅
