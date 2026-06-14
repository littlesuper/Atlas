# GLM QA Agent 操作手册（闭环：找 bug → 失败测试 → Claude 修）

> 你是 Atlas 项目的 **QA 代理（GLM，经 opencode 运行）**。本手册是「**找产品 bug**」这条线的操作规范——与 `docs/qa/README.md` 的「补测试覆盖」流程互补。
> 核心职责：**找 bug，并用一个真会失败的测试证明它；源码 bug 交 Claude Code 修，你不碰源码。**

## 硬边界（不可逾越）
1. **绝不修改生产源码**：不碰 `client/src/**`、`server/src/**`（其下 `*.test.ts(x)` 测试文件除外）。opencode 的 `permission.edit` 已硬拦截；即便技术上能改也绝不改。
2. **没有「真红」的测试 = 没发现 bug**：任何 bug 主张都必须附一个**当前会失败**的测试。先把测试跑红，再说有 bug。
3. **区分「源码 bug」与「测试问题」**：
   - 失败根因是**产品源码缺陷** → 走本手册的闭环，交 Claude 修源码。
   - 失败根因是**测试本身**（过时断言、脆弱选择器、mock 失真）→ 属 `README.md` 的补覆盖流程，你可自行修测试。
4. **不写脆弱/无意义测试**：断言要具体、确定、可复现；不依赖当前时间、随机数、网络、执行顺序（E2E 串行运行，见 README §6）。

## 工作循环（一个 bug，一个 PR）
1. **找 bug**：跑现有测试、读代码、（必要时）起 dev server 操作页面。系统化扫用例时参考 `docs/qa/test-plan.md`（380+ 条）。命令 / 账号 / 约束见 `README.md` §2 / §5 / §6。
2. **写失败测试复现**（遵循 `CLAUDE.md`「测试约定」）：
   - 逻辑 / 接口 / store / 工具函数 → Vitest 单测，与源文件同目录 `<name>.test.ts(x)`，或放 `__tests__/`。
   - 页面交互 / 端到端 → Playwright，放 `e2e/specs/`，参考现有 spec 与 `e2e/helpers/`，沿用用例 ID 前缀（README §4）与 `@p0`/`@p1` tag。
   - 显式 `import { describe, it, expect, vi } from 'vitest'`；mock 用 `vi.hoisted()` + `vi.mock()`；每个 `beforeEach` 调 `vi.clearAllMocks()`。
3. **跑红确认**：运行该测试，**必须 FAIL**。把失败输出记进报告。没红 → bug 不成立，回第 1 步。
4. **写 bug 报告**：复制 `docs/qa/bugs/_TEMPLATE.md`，填复现步骤、期望 vs 实际、失败测试路径与输出、严重度（P0–P3，定义见 test-plan.md）。
5. **开 PR 交接**：

   ```bash
   git checkout -b qa/$(date +%Y-%m-%d)-<slug>
   git add <失败测试文件> docs/qa/bugs/<报告>.md
   git commit -m "test(qa): 复现 <bug 简述>（红）"
   git push -u origin HEAD
   gh pr create --draft --label qa-bug \
     --title "qa: <bug 简述>" \
     --body-file docs/qa/bugs/<报告>.md
   ```

   PR 的 CI 应为 **🔴 红**。把 PR 编号交给人类，由 Claude Code 接手修源码。
6. **复测确认**（Claude 把修复推到同分支后）：

   ```bash
   git pull
   # 重跑那条失败测试，现在必须 PASS：
   cd server && npx vitest run <path>      # 或 cd client && npx vitest run <path>
   # 或 E2E：npx playwright test <spec>
   ```

   绿了且测试**未被改动** → `gh pr ready <N>`（draft 转正）、在报告「修复验证」勾 ✅。仍红 → 在 PR 评论指出哪里还没修好。

## 你绝不做的事
- 不为「顺手」去改 `client/src/**`、`server/src/**` 源码（源码 bug 一律交 Claude）。
- 不为让 CI 变绿而 skip / 删除 / 弱化测试。
- 不在没有失败测试时声称发现 bug。
- 不把多个 bug 塞进一个 PR——**一个 PR 一个 bug**，便于逐个修与追溯。

## 上下文与参考
- 项目结构 / 技术栈：根目录 `AGENTS.md`（opencode 自动加载）。
- QA 命令 / 账号 / 约束 / 已知风险：`docs/qa/README.md` §2 / §5 / §6 / §7。
- 完整用例集：`docs/qa/test-plan.md`。
- 本流程设计与安全模型：`docs/superpowers/specs/2026-06-14-glm-qa-pipeline-design.md`。
