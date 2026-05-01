# Week 2 Acceptance Review

本文件记录 2026-04-30 对 Week 2 "自动化质量基础"的验收结果，并补充 2026-05-01 的最终收口状态。

## 验收结论

Week 2 的核心基础设施已经落地：pre-commit、GitHub required checks、CI 基线、测试环境文档、依赖审计和 Dependabot 都已经接入。

2026-05-01 收口检查确认：GitHub open PR 队列已清空，首批 Dependabot PR 已逐个处理，`main` 分支保护仍要求 1 个审批以及 `lint`、`security`、`test`、`e2e-core` 四个 required checks。

但 ROADMAP 中有三项目标在 Atlas 当前状态下尚未完全达标：

- CI 全量 required checks 还不能在 10 分钟内完成。
- 静态扫描问题还没有清零。
- Docker 测试环境尚未在一台可用 Docker Compose 的机器上实测启动。

这些差距都已经被记录为显性风险，不建议为了"打勾"而降低门禁或假装完成。

## 验收明细

| 标准 | 状态 | 证据 | 差距 |
| --- | --- | --- | --- |
| 本地 pre-commit 在所有人机器上工作 | 部分达标 | pre-commit 配置已落地，后续提交和 `python3 -m pre_commit run` 均通过 | 只能证明当前执行环境可用，仍需团队成员本机执行一次 |
| CI 在 10 分钟内跑完，全部通过 | 未达标 | PR 和 main 的 `lint`、`security`、`test`、`e2e-core` 均通过 | `e2e-core` 通常约 22 分钟，完整 required CI 超过 10 分钟 |
| 所有静态扫描问题清零 | 未达标 | ESLint 当前 0 errors | 仍有 521 warnings；另有已跟踪的根目录 `.env.production` 风险 |
| 没有已知 high/critical 依赖漏洞 | 达标 | `npm audit --audit-level=high` 通过 | 仍有 `exceljs -> uuid` 的 moderate，强制修复会带来破坏性降级 |
| 任何人都能在本地启动测试环境 | 部分达标 | `Dockerfile.test`、`docker-compose.test.yml`、`npm run test:env*` 和文档已落地 | 当前执行机器没有可用 Docker Compose/daemon，尚未实测 `docker compose up` |

## 已落地内容

- Week 2 Day 1-2: pre-commit 与 lint baseline。
- Week 2 Day 1-2: `.gitignore` 安全护栏。
- Week 2 Day 3-4: CI/CD baseline。
- Week 2 Day 3-4: Docker 测试环境配置。
- Week 2 Day 5: 依赖审计、未使用依赖清理、Dependabot。

## 最终处理结果

1. GitHub Actions 依赖 PR #10、#11、#12 已逐个审查、合并，且 `main` CI 均通过。
2. 低风险 npm PR #13、#16、#17 已逐个审查、合并，且 `main` CI 均通过。
3. ESLint 10 PR #14 已在 Node.js 基线提升到 `>=20.19.0` 后合并，`main` CI 通过。
4. React 19 PR #15 已关闭：该 PR 属于 React 18 -> 19 技术栈迁移，不作为上线前普通依赖更新合并。
5. 早期 smoke PR #1 已关闭：`e2e-core` required check 已由后续 Week 2 CI/branch protection 工作覆盖，旧分支会回退 Week 2 质量体系文件。
6. 仍需安排一台有 Docker Compose v2 的机器执行 `npm run test:env`，补齐测试环境验收。
7. 后续 Week 3 之前，明确是否要把"CI 10 分钟内"作为硬目标；若是，需要重构 E2E required check 范围或并行策略。

## 仍需决策

- 是否允许把完整 E2E 从 required check 拆成"核心冒烟 required + 全量 nightly"。
- 是否接受逐步清理 ESLint warnings，而不是 Week 2 一次性清零。
- 如何处理已被 Git 跟踪的根目录 `.env.production`：这涉及敏感配置处置和历史记录风险，需要单独授权。
