# Week 4 Acceptance

> Week 4: 测试体系（一）- 单元测试与代码审查
> 记录日期：2026-05-01

## ROADMAP 对照

| ROADMAP 项 | Atlas 落地状态 | 证据 | 结论 |
| --- | --- | --- | --- |
| Day 1-2 搭建单元测试框架 | 沿用并规范化现有 Vitest 体系 | `docs/qa/unit-test-infrastructure.md`、CI `test` job | 已完成 |
| Day 1-2 测试约定 | 采用 colocated tests，不强迁移到根级 `tests/` | `docs/qa/unit-test-infrastructure.md` | 已完成，按 Atlas 技术栈适配 |
| Day 3-4 识别核心模块 | 已形成 Top 10 候选核心模块 | `docs/qa/core-modules-test-targets.md` | 已完成，仍保留业务确认问题 |
| Day 3-4 生成关键测试 | 已完成 4 个批次，覆盖 9 个高风险模块/路径 | `docs/qa/core-modules-test-targets.md` Batch 1-4 | 已完成本周高优先级补测 |
| Day 5 集成 AI Code Review | CI 已新增 `ai-code-review` PR job | `.github/workflows/ci.yml`、`.github/scripts/ai-code-review.mjs`、`.github/prompts/ai-code-review.md` | 框架已完成 |
| Day 5 观察审查质量 | 暂不启用真实 Claude API 调用 | `docs/qa/ai-code-review.md` 当前项目决策 | 延期，原因是暂不配置 `ANTHROPIC_API_KEY` |

## 验收标准状态

| 验收标准 | 状态 | 说明 |
| --- | --- | --- |
| 单元测试框架就绪，CI 中跑测试 | 已满足 | `test` job 在 PR 和 `main` 中运行前后端覆盖率测试、构建和 typecheck。 |
| 核心模块覆盖率 >= 80% | 已量化 / 接近但未完全达标 | `docs/qa/core-module-coverage.md` 定义了后端核心模块覆盖率口径；当前 unique core files 为 statements 78.37%、branches 67.58%、functions 82.53%、lines 79.66%。 |
| AI Code Review 在 CI 中运行 | 框架已运行，真实审查未启用 | PR #31 中 `ai-code-review` job 通过；因不配置 `ANTHROPIC_API_KEY`，当前只验证跳过路径，不调用 Claude API。 |
| 至少有 50 个单元测试 | 已满足 | 当前本地验证为 server 932 passed / 1 todo，client 236 passed。 |

## Week 4 新增/确认的质量资产

| 类别 | 文件 |
| --- | --- |
| 单元测试基础设施 | `docs/qa/unit-test-infrastructure.md` |
| 核心模块测试目标 | `docs/qa/core-modules-test-targets.md` |
| 核心模块覆盖率口径 | `docs/qa/core-module-coverage.md`、`scripts/core-coverage-report.mjs` |
| AI Code Review 运行说明 | `docs/qa/ai-code-review.md` |
| AI Code Review CI 脚本 | `.github/scripts/ai-code-review.mjs` |
| AI Code Review 提示词 | `.github/prompts/ai-code-review.md` |
| CI 配置 | `.github/workflows/ci.yml` |

## 当前遗留风险

1. `ANTHROPIC_API_KEY` 暂不配置，因此无法观察真实 AI 审查质量，也不会产生 PR 评论。
2. ROADMAP 的“核心模块覆盖率 >= 80%”已有后端统计口径，但 statements、branches、lines 尚未全部达到 80%，且暂不作为 blocking gate。
3. `docs/qa/core-modules-test-targets.md` 仍有业务确认问题，尤其是 Top 10 核心模块、周报提交后编辑策略、级联删除策略和产品状态机规则。
4. 代码库仍有既有 ESLint warning 和 moderate audit，未在 Week 4 范围内清零。

## 建议下一步

Week 5 前如果继续补齐 Week 4 验收，建议优先补 `projects.ts`、`auth.ts`、`activities.ts`、`riskEngine.ts` 和 `excelActivityParser.ts` 的分支测试；如果接受当前“接近但未完全达标”的状态，则进入 Week 5。
