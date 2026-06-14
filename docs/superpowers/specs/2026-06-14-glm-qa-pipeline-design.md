# GLM 当 QA、Claude 当开发的「双代理 TDD 接力」— 设计文档

- 日期：2026-06-14
- 状态：设计已确认，待写实施计划
- 相关：本仓库 AI 助手安全模型（`CLAUDE.md` 的「全系统 AI 助手」一节）、测试约定（`CLAUDE.md` 的「测试约定」）

## 1. 背景与目标

Atlas 已有成熟测试体系（Vitest 单测 client 56 + server 136、Playwright E2E 86 个 spec、三条 GitHub Actions 流水线）。现在希望引入第二个 AI 代理 **GLM** 专职「测试」，**Claude Code 继续专职「修 bug」**，两者分工协作。

**核心原则（一句话）**：GLM 不许空口说「这有 bug」，必须交出一个**真会失败的测试（红）**；Claude 不许空口说「修好了」，必须让**同一个测试变绿、且不准改测试**。CI 当中立裁判。

这与本仓库 AI 助手已确立的安全哲学同源——「LLM 只在边缘、必须有确定性证据、走现有校验路径、代码层护栏而非靠 prompt 自觉」。本方案把同一套思路从「AI 写业务」复用到「AI 做测试」。

### 目标
1. GLM 完成一个**闭环 QA**：探索找 bug → 写失败测试复现 → 交 Claude 修 → GLM 复测确认。
2. 通过 **opencode** 接入 GLM，复用项目现有 `AGENTS.md` 上下文。
3. 交接走 **失败测试 + GitHub PR**，可追溯、CI 自动验证。
4. 两个代理**互不踩文件/数据库**。

## 2. 非目标（YAGNI）

- 不让 GLM 改生产源码（修 bug 永远是 Claude 的事）。
- 不替换/重写现有测试体系或 CI；只在其上叠加协作流程。
- 起步阶段不做无人值守全自动化（nightly 扫描列为二期可选）。
- 不引入新的测试框架；GLM 写的测试沿用 Vitest / Playwright 与 `CLAUDE.md` 既有约定。

## 3. 角色与边界契约

### GLM（QA 代理，用 opencode 跑）—— 只动测试与报告
职责：
- 跑现有测试 + 探索 app → 找 bug
- 每个 bug 写一个**失败测试**复现：逻辑/接口问题用 Vitest（`client` / `server`），交互/页面问题用 Playwright E2E（`e2e/`）
- 写一页 **bug 报告**（复现步骤 / 期望 vs 实际 / 失败测试路径 / 严重度）
- 提交到分支 `qa/<YYYY-MM-DD>-<slug>` → push 到 GitHub `origin` → 开 **draft PR** 并打 `qa-bug` 标签（此刻 CI 应为红）
- Claude 修完后：复跑确认绿 → 把 PR 从 draft 标为 ready

**硬边界**：GLM 不得改 `client/src/**`、`server/src/**` 生产源码；只写 `**/*.test.ts(x)`、`e2e/**`、`docs/qa/**`。

### Claude Code（开发代理，照旧）—— 只动生产源码
职责：
- 接 `qa-bug` PR → `gh pr checkout` → 跑失败测试**确认红** → 改源码修绿 → push 到同分支
- 遵循既有 `systematic-debugging` / TDD 纪律

**硬边界**：Claude 不得删除/弱化/skip GLM 的复现测试来骗绿；只能改源码让测试自然通过。

## 4. 安全模型 / 防作弊

让「一个 AI 测、一个 AI 修」可信的关键，是双方都拿不出假证据：

| 风险 | 护栏 |
| --- | --- |
| GLM 编造不存在的 bug | 没有「真红」的测试 = 不算发现；PR 开起来 CI 必须是红的 |
| Claude 改测试而非改源码骗绿 | 修复 commit 对复现测试文件的 diff 会在 PR 里暴露；（二期）CI 守卫直接 fail |
| 两个代理改同一文件冲突 | 角色路径边界 + worktree 隔离（见 §6） |
| GLM 误改生产源码 | opencode permission 收紧 + PR 审查 + （二期）CI 路径守卫 |

**裁判是 CI，不是任一 AI 的自述**：一个合格的 `qa-bug` PR 生命周期必须是 **红 → 绿**，且「红→绿」由源码改动达成、复现测试内容不变。

> 注：opencode 的 `permission.edit` 支持 **glob 模式 → 动作**（allow/ask/deny，**last match wins**），可把「只许写测试、禁改 `src/`」做成**硬护栏**（见 §5）。再叠加 PR 审查、二期 CI 守卫作二三层兜底。残余风险是 glob 配错或 `write`/创建文件工具未完全遵循 glob——故落地时必须实测护栏（见实施计划的护栏验收任务）。

## 5. 接入架构：opencode + GLM

- 安装 opencode：`npm i -g opencode-ai`
- **接入 GLM**：opencode **内置 Z.AI Coding Plan provider**（providerID `zai-coding-plan`），无需自配 provider——`opencode auth login` 选 Z.AI / Zhipu，粘贴 GLM Coding Plan 的 API key（存到 opencode 的 `auth.json`，不入库）。
  - 模型用 **GLM-5.2**（当前环境已配置）；opencode 引用格式 `providerID/modelID`，即 **`zai-coding-plan/glm-5.2`**。确切 id 以 `opencode models | grep -i glm` 为准。
  - OpenAI 兼容端点（仅在自配 provider 时才需要）：`https://api.z.ai/api/coding/paas/v4`。
- 项目根放 `opencode.json`，只定义一个 **`qa` agent**：
  - `model` 指向 GLM；`prompt` = `{file:./docs/qa/GLM-QA-GUIDE.md}`（QA 角色与边界）。
  - **`permission.edit` 用 glob 做硬护栏**：默认允许，`deny` 掉 `client/src/**`、`server/src/**`，再 `allow` 回 `**/*.test.ts(x)`、`e2e/**`、`docs/qa/**`（last match wins，故测试文件即便位于 `src/` 下也放行）。
  - `permission.bash`：对 `git *`/`gh *`/`npm test*`/`npx vitest*`/`npx playwright*` 放行，其余 `ask`。
- opencode 自动读取项目根 `AGENTS.md` 获取项目上下文（已存在，无需改动其镜像关系）。
- QA 专属角色单独放 `docs/qa/GLM-QA-GUIDE.md`，**不写进 `AGENTS.md`/`CLAUDE.md`**，保持二者镜像约定不被污染。

> ⚠️ 落地时按 opencode/GLM **当前**官方文档核对：内置 provider 名与确切 model id、opencode agent/permission 键名、以及 `write`/创建文件工具是否同样遵循 `edit` 的 glob（若不，需为其补等效规则）。

### `opencode.json` 结构示意
```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "qa": {
      "description": "GLM QA：找 bug、写失败测试、开 qa-bug PR，不改源码",
      "mode": "primary",
      "model": "zai-coding-plan/glm-5.2",
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
（确切 provider 接入与 model id 以 `opencode auth login` / `opencode models` 实测为准。）

## 6. 隔离策略

**起步：同机双 git worktree，手动驱动。**
- 主工作区 `Atlas/`：Claude Code 照旧。
- QA 工作区 `../Atlas-qa/`：GLM 跑 opencode。
- 各 worktree 独立 `node_modules`、独立 `server/prisma/dev.db`、独立 dev 端口 → 互不踩文件与数据库。
- 建立：
  ```bash
  git worktree add ../Atlas-qa -b qa/base origin/main
  cd ../Atlas-qa && npm install
  cd server && npx prisma generate && npx prisma db push && npx tsx src/prisma/seed.ts
  ```
- GLM 在 QA worktree 开 `qa/<date>-<slug>` 分支、push、开 PR；Claude 在主 worktree `gh pr checkout` 来修。

**二期可选**：GLM nightly 定时批量扫描产出一批 `qa-bug` PR，白天用 Claude 逐个处理。

## 7. 端到端工作流（单个 bug）

```
GLM(opencode)   探索 → 写失败测试 → 开 draft PR(qa-bug)      CI: 🔴
      │
      ▼   人：「修 PR #N」
Claude Code     gh pr checkout N → 确认红 → 改源码 → push      CI: 🟢
      │
      ▼
GLM             复跑确认绿 → PR 标 ready → 人合并
```

1. GLM：探索发现 bug → 写失败测试 → `git checkout -b qa/2026-06-14-xxx` → commit 测试+报告 → `git push -u origin` → `gh pr create --draft --label qa-bug --body <报告>`。CI 红。
2. 人：把 PR 交给 Claude（「修 PR #N」）。
3. Claude：`gh pr checkout N` → 跑失败测试确认红 → 改源码 → push。CI 绿。
4. GLM：复跑确认绿 → `gh pr ready N` → 人合并。

## 8. 交付物清单

**Phase 1（核心闭环，手动驱动）**
1. 本设计文档（已写）。
2. `docs/qa/GLM-QA-GUIDE.md` —— GLM 操作手册：角色、硬边界、失败测试+PR 协议、bug 报告模板、沿用 `CLAUDE.md` 的测试命名/结构/mock 约定。
3. `opencode.json` —— GLM provider + `qa` agent（key 留环境变量占位）。
4. `qa-bug` 标签 + 交接 checklist（并入 `docs/qa/bugs/_TEMPLATE.md` 作 PR `--body-file`，避免与现有默认 PR 模板冲突）+ 在 `docs/qa/README.md` 登记新流程。
5. （可选）`docs/qa/bugs/` 目录与报告模板，作为 PR body 的来源。

**Phase 2（可选，跑顺后再上）**
6. CI 反作弊守卫：`qa-bug` PR 的修复 commit 若改动了复现测试文件即 fail。
7. nightly GLM 扫描工作流。

## 9. 风险与开放问题

- **GLM/opencode 配置细节会随版本漂移**：provider/model/端点需落地时按当前官方文档核对（已在 §5 标注）。
- **路径边界**：已用 opencode `permission.edit` 的 glob 做硬护栏（§5）；残余风险是 glob 配错或 `write`/创建文件工具未遵循 glob——故实施计划含一个「护栏验收」任务实测：QA agent 试图改 `src/` 必须被拒、改测试必须放行。
- **GLM 写的测试质量**：需在 GUIDE 里强约束「测试必须先红再说」「断言要具体、可复现」，避免脆弱/无意义测试涌入。
- **成本**：GLM 探索式跑测试会消耗 token/额度；起步手动驱动可控，nightly 前需评估。

## 10. 验收标准

Phase 1 视为落地成功，当且仅当：
1. 能用 opencode + GLM 在 QA worktree 跑起来，读到项目上下文与 `GLM-QA-GUIDE.md`。
2. 走通一个**真实**闭环：GLM 开出一个 CI 为红的 `qa-bug` PR（含失败测试+报告）→ Claude 在同分支改源码修绿（未改测试）→ GLM 确认绿。
3. 全程两个代理无文件/数据库冲突。
4. 新流程在文档中登记，他人可照做。
