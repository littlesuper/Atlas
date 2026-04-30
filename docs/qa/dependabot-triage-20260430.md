# Dependabot Triage - 2026-04-30

本文件记录 Dependabot 启用后第一批 PR 的分流结果，以及 2026-05-01 收口时的最终处理状态。

## 最终处理状态

| PR | 类型 | 状态 | 判断 | 备注 |
| --- | --- | --- | --- | --- |
| #10 `actions/setup-node` 4 -> 6 | GitHub Actions major | 已合并 | 已处理 | 有助于处理 Node.js 20 actions deprecation；不改变项目运行时 Node 版本 |
| #11 `actions/checkout` 4 -> 6 | GitHub Actions major | 已合并 | 已处理 | v6 调整凭据持久化位置；GitHub-hosted runner 满足要求 |
| #12 `actions/upload-artifact` 4 -> 7 | GitHub Actions major | 已合并 | 已处理 | E2E artifact 步骤已在 PR 与 `main` CI 中验证 |
| #13 `zustand` 5.0.11 -> 5.0.12 | npm patch | 已合并 | 已处理 | 低风险 patch，影响前端状态管理 |
| #16 `eslint-plugin-react-hooks` 7.0.1 -> 7.1.1 | npm patch | 已合并 | 已处理 | 为后续 ESLint 10 兼容扫清 peer dependency 阻塞 |
| #17 `zod` 4.3.6 -> 4.4.1 | npm minor | 已合并 | 已处理 | 已审查 `server/src/schemas/` 使用方式，未发现高风险 API 路径 |
| #14 `eslint` 9.39.4 -> 10.2.1 | npm major | 已合并 | 已处理 | 先合 #16，再通过 #19 将 Node.js 基线提升到 `>=20.19.0`，随后 `main` CI 通过 |
| #15 `react` 18.3.1 -> 19.2.5, `@types/react` 18 -> 19 | npm major | 已关闭 | 不合并 | 当前 Atlas 是 React 18 应用；PR 未同步升级 `react-dom` / `@types/react-dom`，且 `test` 失败、E2E skipped |

## 初始不建议直接合并的 PR

| PR | 类型 | 状态 | 根因 | 建议 |
| --- | --- | --- | --- | --- |
| #14 `eslint` 9.39.4 -> 10.2.1 | npm major | 初始 `lint` / `security` / `test` 失败，后续已合并 | `npm ci` 因 `eslint-plugin-react-hooks@7.0.1` peer dependency 不支持 ESLint 10 而失败；之后又暴露 ESLint 10 需要 Node `^20.19.0 || ^22.13.0 || >=24` | 已先合 #16，再通过 #19 明确 Node.js `>=20.19.0` 基线，最后合并 #14 |
| #15 `react` 18.3.1 -> 19.2.5, `@types/react` 18 -> 19 | npm major | 已关闭 | 前端单测出现 React child 对象渲染错误；该 PR 还没有同步升级 `react-dom` 和 `@types/react-dom` | 不作为自动依赖更新合并；需要单独 React 19 迁移计划 |

## 执行策略复盘

1. 先合 GitHub Actions PR：#10、#11、#12。每个单独合并并等待 main CI。
2. 再合低风险 npm patch：#13、#16。每个单独合并并等待 main CI。
3. 再审查 #17，确认 Zod 更严格的解析行为没有改变业务校验语义。
4. 对 #14 不手动强推修复；先让 #16 进入 main，再补齐 Node.js 基线，最后单独合并。
5. 对 #15 关闭，不在上线前作为普通依赖更新合入。

## 注意事项

- 当前分支保护仍要求 1 个审批和 `lint`、`security`、`test`、`e2e-core` 全部通过。
- GitHub open PR 队列在 2026-05-01 收口时为空。
- 所有依赖 PR 都应单个合并，避免把失败根因混在一起。
