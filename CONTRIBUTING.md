# 贡献指南

## 快速开始

```bash
npm install
npm run dev
```

详细命令参见 `AGENTS.md` 的"常用命令"章节。

## 开发规范

所有开发规范集中在 [`AGENTS.md`](./AGENTS.md)，包括：

- 技术栈和项目结构
- 前后端代码风格（TypeScript、Arco Design、Zustand、React Router v7）
- 后端输入校验（Zod）、日志（Pino）、API 文档（Swagger）
- 测试约定（Vitest 单测 + Playwright E2E）
- 数据库规范（Prisma + SQLite/PostgreSQL）
- 活动角色绑定和用户模型

提交代码前请确保已阅读 `AGENTS.md`。

## 提交前检查

所有 PR 必须通过以下检查（已集成到 PR 模板）：

| 检查项 | 命令 |
| --- | --- |
| ESLint | `npm run lint` |
| 服务端类型 | `npm run typecheck --workspace=server` |
| 服务端单测 | `npm test --workspace=server` |
| 前端单测 | `npm test --workspace=client` |
| 前端构建 | `npm run build --workspace=client` |
| 依赖审计 | `npm audit --audit-level=high` |
| E2E Smoke | `npm run test:e2e:smoke` |

## Pre-commit Hook

Husky pre-commit 会自动运行：

1. `git diff --check` — 拦截尾随空白和冲突标记
2. `lint-staged` — 对暂存文件运行 ESLint（`--max-warnings=0`）

## PR 流程

1. 从 `main` 创建功能分支
2. 按照 [PR 模板](./.github/pull_request_template.md) 填写变更摘要、影响范围、风险检查
3. 确保所有检查项通过
4. 至少一位 reviewer 批准后合并

## 测试

- **单元测试**：`npm test --workspace=server` / `npm test --workspace=client`
- **E2E 测试**：`npx playwright test`
- **测试约定**：详见 `AGENTS.md` 的"测试约定"章节

## 安全

- 禁止提交 `.env`、密钥、token 或密码
- 用户输入必须经过 Zod 校验（后端）或前端校验
- 涉及权限/认证的改动需在 PR 中说明风险

## AI 辅助开发提示词

`atlas-quality-system/prompts/` 目录包含 7 个结构化提示词，可在 Claude 对话中使用：

| 提示词 | 使用时机 |
| --- | --- |
| 01-需求澄清 | 新需求写代码前 |
| 02-代码生成 | 需求澄清后 |
| 03-代码审查 | 提交 PR 前 |
| 04-测试生成 | 功能开发完成后 |
| 05-Bug 诊断 | 遇到 bug 时 |
| 06-架构守护 | 涉及架构变更时 |
| 07-上线前检查 | 发布前 |
