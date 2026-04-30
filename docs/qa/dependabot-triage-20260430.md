# Dependabot Triage - 2026-04-30

本文件记录 Dependabot 启用后第一批 PR 的分流结果。分流只做判断，不代表自动合并授权。

## 推荐合并队列

| PR | 类型 | 状态 | 判断 | 备注 |
| --- | --- | --- | --- | --- |
| #10 `actions/setup-node` 4 -> 6 | GitHub Actions major | checks 通过 | 建议优先审查后合并 | 有助于处理 Node.js 20 actions deprecation；不改变项目运行时 Node 版本 |
| #11 `actions/checkout` 4 -> 6 | GitHub Actions major | checks 通过 | 建议优先审查后合并 | v6 调整凭据持久化位置；GitHub-hosted runner 通常满足要求 |
| #12 `actions/upload-artifact` 4 -> 7 | GitHub Actions major | checks 通过 | 建议优先审查后合并 | E2E artifact 步骤已在 PR CI 中验证 |
| #13 `zustand` 5.0.11 -> 5.0.12 | npm patch | checks 通过 | 建议审查后合并 | 低风险 patch，影响前端状态管理 |
| #16 `eslint-plugin-react-hooks` 7.0.1 -> 7.1.1 | npm patch | checks 通过 | 建议审查后合并 | 释放说明提到 ESLint v10 支持，但本 PR 自身不升级 ESLint |
| #17 `zod` 4.3.6 -> 4.4.1 | npm minor | checks 通过 | 建议审查后合并 | release notes 提到更严格的正确性修复；重点看 `server/src/schemas/` 和校验错误格式 |

## 不建议直接合并

| PR | 类型 | 状态 | 根因 | 建议 |
| --- | --- | --- | --- | --- |
| #14 `eslint` 9.39.4 -> 10.2.1 | npm major | `lint` / `security` / `test` 失败 | `npm ci` 因 `eslint-plugin-react-hooks@7.0.1` peer dependency 不支持 ESLint 10 而失败 | 先合 #16，再让 Dependabot rebasing；仍失败则作为独立 ESLint 10 升级任务 |
| #15 `react` 18.3.1 -> 19.2.5, `@types/react` 18 -> 19 | npm major | `test` 失败，E2E skipped | 前端单测出现 React child 对象渲染错误；该 PR 还没有同步升级 `react-dom` 和 `@types/react-dom` | 不作为自动依赖更新合并；需要单独 React 19 迁移计划 |

## 建议执行策略

1. 先合 GitHub Actions PR：#10、#11、#12。每个单独合并并等待 main CI。
2. 再合低风险 npm patch：#13、#16。每个单独合并并等待 main CI。
3. 再审查 #17，确认 Zod 更严格的解析行为没有改变业务校验语义。
4. 对 #14 不手动强推修复；先让 #16 进入 main，再观察 Dependabot 是否自动刷新。
5. 对 #15 关闭或保留为迁移跟踪均可，但不要在上线前作为普通依赖更新合入。

## 注意事项

- 当前分支保护仍要求 1 个审批和 `lint`、`security`、`test`、`e2e-core` 全部通过。
- 因为当前 GitHub 操作者与 PR 作者关系会触发 review requirement，合并 Dependabot PR 仍需要人工审批或继续使用已确认的临时审批数 B 方案。
- 所有依赖 PR 都应单个合并，避免把失败根因混在一起。
