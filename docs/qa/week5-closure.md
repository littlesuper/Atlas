# Week 5 Closure

> Week 5: 测试体系（二）- 集成测试与 E2E
> 记录日期：2026-05-02

## ROADMAP 对照

| ROADMAP 项               | Atlas 落地状态                                                                         | 证据                                                                                                                         | 结论                                         |
| ------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Day 1-2 API 集成测试     | 已建立 Atlas 技术栈下的 Vitest + supertest 集成测试入口，但数量未达到 ROADMAP 字面要求 | `server/src/__tests__/integration/auth-projects.integration.test.ts`、`package.json` 的 `test:integration`                   | 部分完成，仍有验收缺口                       |
| Day 1-2 数据库测试       | 已覆盖从 Prisma schema 建库、索引使用、事务回滚 3 类数据库行为                         | `server/src/__tests__/integration/database.integration.test.ts`                                                              | 部分完成，仍需扩展数量和 PostgreSQL/迁移维度 |
| Day 3-4 搭建 Playwright  | Atlas 已有 Playwright 体系，并在 Week 5 明确接入 Chromium、Firefox、WebKit 项目配置    | `playwright.config.ts`、`package.json` 的 `test:e2e:all-browsers`                                                            | 已完成                                       |
| Day 3-4 覆盖核心用户旅程 | 已列出 10 条核心用户旅程，并映射到现有/新增 E2E specs                                  | `docs/qa/e2e-core-journeys.md`、`e2e/specs/`                                                                                 | 已完成                                       |
| Day 3-4 CI 中运行 E2E    | PR 必跑 `e2e-core`，主干最新 CI 成功                                                   | `.github/workflows/ci.yml`、main run `25244496592`                                                                           | 已完成                                       |
| Day 5 视觉回归测试       | 已使用 Playwright screenshot assertions 建立登录页、项目页、管理页基线                 | `e2e/specs/visual-regression.spec.ts`、`e2e/specs/visual-regression.spec.ts-snapshots/`、`package.json` 的 `test:e2e:visual` | 已完成                                       |
| Day 5 可访问性扫描       | 已使用 `@axe-core/playwright` 扫描登录页、项目页、管理页 critical/serious 问题         | `e2e/specs/accessibility.spec.ts`、`package.json` 的 `test:e2e:a11y` / `test:a11y`                                           | 已完成                                       |

## 验收标准状态

| 验收标准                        | 状态           | 说明                                                                                                                                                                                                           |
| ------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 至少 20 个集成测试              | 未满足         | 当前 `server/src/__tests__/integration/` 下明确的 `it(...)` 用例为 6 个。需要新增至少 14 个集成测试，或由项目负责人确认是否接受“已有大量 route/unit/e2e 覆盖但集成测试目录未满 20”的偏差。                     |
| 至少 10 个 E2E 测试覆盖核心旅程 | 已满足         | `docs/qa/e2e-core-journeys.md` 已列出 10 条核心用户旅程并全部标记 Covered；当前 `e2e/specs/` 下约 67 个 spec 文件、355 个测试用例。                                                                            |
| 视觉回归测试在运行              | 已满足         | `npm run test:e2e:visual` 指向 `@visual` 测试；CI 的 `test:e2e:core` 会运行 Chromium 项目下的核心 E2E。                                                                                                        |
| 可访问性扫描在运行              | 已满足         | `npm run test:e2e:a11y` / `npm run test:a11y` 指向 `@a11y` 测试；CI 的 `e2e-core` 已纳入视觉和无障碍相关 specs。                                                                                               |
| E2E 测试跨 3 种浏览器           | 已满足为能力项 | `playwright.config.ts` 配置 Chromium、Firefox、WebKit；`npm run test:e2e:all-browsers` 可执行三浏览器。PR CI 仍只跑 Chromium，原因是全量 E2E 耗时较长，三浏览器建议用于 release validation 或 targeted smoke。 |

## Week 5 新增/确认的质量资产

| 类别                 | 文件                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| API / 数据库集成测试 | `server/src/__tests__/integration/auth-projects.integration.test.ts`、`server/src/__tests__/integration/database.integration.test.ts` |
| E2E 多浏览器配置     | `playwright.config.ts`、`package.json`                                                                                                |
| 核心用户旅程索引     | `docs/qa/e2e-core-journeys.md`                                                                                                        |
| 项目模板实例化 E2E   | `e2e/specs/project-template-instantiation.spec.ts`                                                                                    |
| 活动导入撤销回滚 E2E | `e2e/specs/activity-import.spec.ts`                                                                                                   |
| 周报草稿/提交 E2E    | `e2e/specs/weekly-report-form.spec.ts`                                                                                                |
| 视觉回归             | `e2e/specs/visual-regression.spec.ts`、`e2e/specs/visual-regression.spec.ts-snapshots/`                                               |
| 可访问性扫描         | `e2e/specs/accessibility.spec.ts`                                                                                                     |
| CI 集成              | `.github/workflows/ci.yml`                                                                                                            |

## 本次收口验证

| 验证项        | 命令 / 证据                                                            | 结果                                                                     |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 集成测试数量  | `rg -n "^\\s*(test\|it)\\(" server/src/__tests__/integration \| wc -l` | 6                                                                        |
| E2E spec 数量 | `find e2e/specs -type f -name '*.spec.ts' \| wc -l`                    | 67                                                                       |
| E2E 测试数量  | `rg -n "^\\s*(test\|it)\\(" e2e/specs \| wc -l`                        | 355                                                                      |
| 主干 CI       | GitHub Actions run `25244496592`                                       | success                                                                  |
| 分支保护      | GitHub branch protection                                               | required checks: `lint`, `security`, `test`, `e2e-core`; review count: 1 |

## 当前遗留风险

1. Week 5 的集成测试数量未达到 ROADMAP 验收标准，且数据库测试目前使用 SQLite 现实开发环境，没有引入 Testcontainers PostgreSQL 或迁移正反执行验证。
2. PR CI 只跑 Chromium 项目；三浏览器能力已经配置，但不是每个 PR 的 required check。
3. 视觉基线目前覆盖登录页、项目页、管理页三类核心页面，尚未覆盖周报、风险、产品等复杂页面。
4. 可访问性扫描目前只阻断 critical/serious 级别，未把 moderate/minor 作为 blocking gate。

## 建议下一步

在进入 Week 6 前，建议先处理 Week 5 的集成测试验收缺口：

1. 补齐至少 14 个集成测试，优先覆盖认证、项目、活动、产品、周报、权限这几条真实 API 链路。
2. 暂不引入 Testcontainers PostgreSQL，除非已经准备好在 CI 中承担额外运行时间和数据库服务复杂度。
3. 将“20 个集成测试”满足后，再把 Week 5 标记为完整通过并进入 Week 6 可观测性。
