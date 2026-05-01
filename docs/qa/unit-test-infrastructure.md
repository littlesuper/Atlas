# Week 4 Day 1-2 Unit Test Infrastructure

本文件记录 Week 4 Day 1-2 "测试基础设施"在 Atlas 中的落地方式。ROADMAP 模板中的后端 `pytest + pytest-cov + factory-boy` 不适用于 Atlas，因为 Atlas 后端是 Express + TypeScript；本阶段保留现有 Vitest 技术栈，并补齐统一入口、覆盖率报告和测试约定。

## 适配结论

| ROADMAP 要求 | Atlas 落地方式 | 说明 |
| --- | --- | --- |
| 后端单元测试框架 | Vitest + Supertest | 后端是 TypeScript/Express，不引入 Python 测试栈 |
| 前端单元测试框架 | Vitest + Testing Library + jsdom | 沿用现有 Vite/React 测试体系 |
| 覆盖率报告 | `npm run test:coverage` | 前后端都输出 text、json-summary、html |
| "hello world" 测试 | 不新增无意义测试 | 现有前后端单元测试已覆盖框架可用性 |
| `tests/` 目录 | 不迁移 | Atlas 现有约定是源码旁 colocated tests：`*.test.ts(x)` 与 `__tests__/` |

## 本地命令

```bash
# 前后端单元测试
npm test

# 前后端覆盖率报告
npm run test:coverage

# 单独运行后端
npm test --workspace=server
npm run test:coverage --workspace=server

# 单独运行前端
npm test --workspace=client
npm run test:coverage --workspace=client
```

覆盖率报告输出到：

- `server/coverage/`
- `client/coverage/`

这些目录已被 `.gitignore` 忽略，不提交到仓库。

## CI 入口

GitHub Actions `test` job 使用同一组脚本：

- `npm run test:coverage --workspace=server`
- `npm run test:coverage --workspace=client`

这让本地验证和 CI 行为保持一致，避免 CI 使用一套命令、本地文档写另一套命令。

## 测试目录约定

Atlas 不强制把所有测试迁移到根级 `tests/` 目录。新增测试按以下顺序放置：

| 场景 | 推荐位置 | 示例 |
| --- | --- | --- |
| 单个模块的纯函数/组件测试 | 与源码同目录 `*.test.ts(x)` | `client/src/utils/workday.test.ts` |
| 某目录下多文件协作测试 | 当前目录下 `__tests__/` | `server/src/routes/__tests__/performance.test.ts` |
| 路由/API 测试 | 对应 route 同目录或 `routes/__tests__/` | `server/src/routes/projects.test.ts` |
| 跨页面真实流程 | `e2e/specs/` | `e2e/specs/projects.spec.ts` |

## 测试写法约定

1. 使用 AAA 模式：Arrange、Act、Assert 三段清晰分开。
2. 测试名称描述业务场景和期望结果，不只写函数名。
3. 后端 API 测试优先使用 Supertest 调 Express app，不直接 mock 路由实现细节。
4. 前端组件测试优先从用户行为出发：render、点击、输入、断言可见文本或状态变化。
5. 测试数据优先使用本文件下方的 factory/helper 模式集中创建，避免在多个测试里散落硬编码对象。
6. 涉及认证、权限、审计、上传、AI 配置、企业微信、Prisma schema 的测试必须覆盖失败路径。
7. 不为了覆盖率断言实现细节；覆盖率缺口应优先补关键业务路径。

## Factory / Test Data 约定

Atlas 当前已有不少测试直接在测试文件中构造对象。新增测试应逐步收敛到以下模式：

```ts
const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'project-1',
  name: '测试项目',
  status: 'ACTIVE',
  ...overrides,
});
```

规则：

- factory 函数放在最靠近使用处的位置；只有被 3 个以上测试文件复用时，才抽到共享 helper。
- `overrides` 必须能覆盖默认值，便于表达边界条件。
- 不在 factory 中生成随机值，除非测试明确验证唯一性。
- 数据库相关测试必须在 `beforeEach` 或测试内部显式准备数据，避免依赖执行顺序。

## 当前基线

2026-05-01 在隔离 worktree 中验证：

| 套件 | 命令 | 结果 |
| --- | --- | --- |
| 前端单元 | `npm test --workspace=client` | 18 files / 236 tests passed |
| 后端单元 | `npm test --workspace=server` | 38 files / 879 passed / 1 todo |

已知测试噪声：

- `client/src/components/ErrorBoundary.test.tsx` 会输出预期错误栈，用于验证 ErrorBoundary。
- `client/src/pages/Admin/AiManagement.test.tsx` 仍有 React `act(...)` warning。
- `client/src/pages/Project/Detail/ActivityComments.test.tsx` 仍有 Arco TextArea `NaN height` warning。

这些不是本阶段阻断项，但应在后续测试质量优化中逐步清理。

## Week 4 后续衔接

Day 3-4 进入"补充关键单元测试"前，需要先由业务负责人和 AI 代码守护人确认 Atlas Top 10 核心功能。核心功能确认后，再用 `docs/prompts/04-测试生成提示词.md` 补齐关键路径测试，并逐步建立覆盖率目标。
