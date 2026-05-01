# AI Code Review

> Week 4 Day 5: AI code review pilot for pull requests.

## 目标

Atlas 在 CI 中新增 `ai-code-review` job，用 `prompts/03-代码审查提示词.md` 的审查清单对 PR diff 做辅助审查，并把结果写回 PR 评论。

本阶段只作为辅助参考，不加入 GitHub required checks，不因为 Claude 审查结论阻断合并。

## 运行方式

- 触发条件：`pull_request` 到 `main`。
- 审查脚本：`.github/scripts/ai-code-review.mjs`。
- 审查提示词：`.github/prompts/ai-code-review.md`，来源于 `atlas-quality-system/prompts/03-代码审查提示词.md`。
- 输出位置：PR 评论，评论内包含 `<!-- atlas-ai-code-review -->` 标记；重复运行时更新同一条评论，避免刷屏。
- 缺少密钥时：job 在 step summary 中说明跳过，并以成功状态退出。

## 配置

需要在 GitHub repository secret 中配置：

- `ANTHROPIC_API_KEY`：Claude API key。

可选配置 GitHub repository variable：

- `AI_REVIEW_MODEL`：Claude model，默认 `claude-sonnet-4-6`。

不要把 API key 写入仓库、workflow 文件、日志或 PR 描述。

## 非阻断策略

Day 5 的 ROADMAP 要求“本周先不强制，作为辅助参考”。因此：

- `ai-code-review` 不在 branch protection 的 required checks 中。
- Claude API 不可用、密钥缺失、评论失败时，脚本记录原因并成功退出。
- AI 报告中的 🔴/🟠 问题需要 AI 代码守护人判断，不自动作为合并门禁。

## 后续观察

每周复盘以下内容：

- AI 报告是否能发现实际风险。
- 是否存在噪音过多或误报。
- AI 漏掉但人工发现的问题，是否需要调整提示词。
- 运行成本和响应时间是否可接受。

当报告质量稳定后，再决定是否把 `ai-code-review` 提升为 required check 或只在高风险路径变更时强制运行。
