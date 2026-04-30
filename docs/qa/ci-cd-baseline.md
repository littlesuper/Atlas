# CI/CD Baseline

本文件记录 Week 2 Day 3-4 的 GitHub Actions 落地结果，以及质量体系模板与 Atlas 当前项目状态的差异。

## 当前门禁

Atlas 目前使用 `.github/workflows/ci.yml` 作为主分支和 PR 的质量门禁。GitHub 分支保护要求以下 checks 通过：

- `lint`
- `security`
- `test`
- `e2e-core`

本次没有替换 workflow 名称或 job 名称，避免破坏已经配置好的 required checks。

## 本次加固

- 增加 `concurrency`，同一分支或同一 PR 的旧运行会被取消，减少排队和重复消耗。
- 增加 workflow 级 `permissions: contents: read`，按最小权限运行。
- 增加 `NODE_VERSION` 统一配置，避免各 job 分散维护 Node 版本；当前固定为 `20.19.0`，与根 `package.json` 的 `engines.node` 基线一致。
- 将 CI 依赖安装从 `npm install` 改为 `npm ci`，让 CI 使用锁文件做可复现安装。
- 为每个 job 增加 `timeout-minutes`，避免异常挂起：
  - `lint`: 10 分钟
  - `security`: 10 分钟
  - `test`: 15 分钟
  - `e2e-core`: 30 分钟

## 未直接复制 quality-gate 模板的原因

质量体系模板 `atlas-quality-system/ci-config/.github-workflows-quality-gate.yml` 是目标态模板，但当前 Atlas 还没有以下配套能力：

- `npm run format:check`
- `npm run typecheck`
- `npm run lint:style`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:a11y`
- Storybook / Chromatic
- Lighthouse CI
- k6 性能测试
- Stryker mutation testing
- dependency-cruiser / madge / depcheck 配置
- Snyk / Codecov / Chromatic / LHCI / Anthropic 相关 GitHub Secrets

如果直接复制模板，CI 会因为缺少脚本、配置或密钥而必然失败。因此当前采用"适配现有 CI、保留 required checks、逐步补强"的方式落地。

## 10 分钟目标状态

最新已知 main 分支 CI 运行中，`lint`、`security`、`test` 都在较短时间内完成，主要耗时来自 `e2e-core`。`e2e-core` 会安装 Playwright 浏览器并运行核心 E2E，单独耗时约 22 分钟，因此当前完整 required CI 还不能达到 10 分钟目标。

后续可选优化方向：

- 把 required E2E 缩小为真正核心冒烟用例，完整 E2E 改为 nightly 或手动运行。
- 按测试目录或标签拆分 Playwright shard 并行运行。
- 缓存 Playwright 浏览器和依赖。
- 对文档类变更使用 path filter 跳过重型 E2E。

这些优化会改变合并门禁强度或分支保护策略，需要单独决策后再执行。
