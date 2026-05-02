# Atlas QA 测试计划 — 给 opencode 的执行说明

本目录提供给执行端（opencode 或人工 QA）使用，包含完整、机器可读的测试用例。

## 文档清单

| 文件                              | 用途                                      |
| --------------------------------- | ----------------------------------------- |
| `README.md`                       | 本文件。环境/命令/执行流程                |
| `test-plan.md`                    | **完整测试用例**（380+ 条，16 个模块）    |
| `prod-deploy-validation.md`       | 生产部署验证用例（42 条）                 |
| `week2-acceptance.md`             | Week 2 质量体系落地验收与差距             |
| `unit-test-infrastructure.md`     | Week 4 Day 1-2 单元测试基础设施与测试约定 |
| `core-modules-test-targets.md`    | Week 4 Day 3-4 核心模块候选清单与补测目标 |
| `week5-closure.md`                | Week 5 集成测试与 E2E 体系收口报告        |
| `log-aggregation.md`              | Week 6 Day 1-2 日志聚合方案与常用查询     |
| `dependabot-triage-20260430.md`   | 2026-04-30 首批 Dependabot PR 分流        |
| `node-runtime-baseline.md`        | Node.js 运行时与工具链版本基线            |
| `reports/run-20260428.md`         | 测试执行报告（最新）                      |
| `reports/coverage-P0-20260428.md` | P0 覆盖映射                               |
| `reports/coverage-P1-20260428.md` | P1 覆盖映射                               |
| `reports/prod-deploy-20260428.md` | 生产部署验证报告                          |

## 0. 测试框架现状（**无需安装**）

| 维度     | 框架                             | 版本           | 是否就绪 |
| -------- | -------------------------------- | -------------- | -------- |
| 后端单元 | Vitest                           | server/devDeps | ✅       |
| 前端单元 | Vitest + jsdom                   | client/devDeps | ✅       |
| E2E      | Playwright                       | 1.58.2         | ✅       |
| 视觉回归 | Playwright screenshot assertions | 1.58.2         | ✅       |
| 无障碍   | @axe-core/playwright             | 4.11.1         | ✅       |
| API 集成 | supertest（已用于路由测试）      | server/devDeps | ✅       |

## 当前测试统计

| 套件     | 数量                  | 状态 |
| -------- | --------------------- | ---- |
| 后端单元 | 843 passed, 1 todo    | ✅   |
| 前端单元 | 236 passed            | ✅   |
| E2E      | 362 passed, 5 skipped | ✅   |
| **总计** | **1441 passed**       | ✅   |

### E2E 覆盖要点

- **61 个 spec 文件**，覆盖 16 个模块
- **内联编辑全覆盖**（`inline-editing-comprehensive.spec.ts`）：13 个交互点全部有 E2E 测试
- **WCAG 无障碍审计**：axe-core 扫描主要页面
- **色彩对比度验证**：Arco Tag 覆盖色已通过 WCAG AA（≥4.5:1）
- **权限/按钮可见性**：admin/zhangsan/lisi 三个角色全覆盖
- **项目创建通过 Drawer**：`createProjectViaPage` 辅助函数已适配抽屉流程
- **Token 生命周期**：登录/登出/刷新/黑名单（AUTH-016/017/033）
- **暗色主题**：切换/持久化/对比度/服务端同步（THEME-001-003, SYS-007）
- **XSS/注入防御**：SQL 注入、XSS 渲染、SVG 上传安全
- **IDOR 越权**：跨项目 API 访问控制

## 1. 环境准备

```bash
# 1. 启动后端 + 前端
./atlas.sh start          # 或 npm run dev

# 2. 数据库重置 + 种子（每次回归前推荐）
cd server
npx prisma db push --accept-data-loss
npx tsx src/prisma/seed.ts
npx tsx src/prisma/seedCheckItems.ts

# 3. 健康检查
curl http://localhost:3000/api/health
```

## 2. 测试执行命令

```bash
# 后端单元测试（Vitest + supertest）
cd server && npm test

# 前端单元测试（Vitest + jsdom）
cd client && npm test

# 前后端单元测试（仓库根目录统一入口）
npm test

# 前后端覆盖率报告（仓库根目录统一入口）
npm run test:coverage

# E2E（Playwright，含无障碍审计）
npx playwright test                        # 全量
npx playwright test e2e/specs/auth.spec.ts # 指定文件
npx playwright test --project=chromium     # 指定项目
npm run test:e2e:a11y                      # 无障碍扫描（axe-core）
npm run test:e2e:visual                    # 视觉回归（Chromium 基线）
npx playwright test --grep @P0             # 仅跑 P0（需在 spec 中加 tag）

# 查看 HTML 报告
npx playwright show-report
```

## 3. 给 opencode 的执行流程

按以下顺序处理 `test-plan.md`：

1. **第一遍：现有覆盖映射**
   - 对每条用例，去 `e2e/specs/` 用 grep 查关键词，标记是否已有覆盖
   - 输出报告：已覆盖 / 部分覆盖 / 完全缺口
2. **第二遍：补齐 P0 缺口**
   - 对每个 P0 缺口写 Playwright spec（参考现有 spec 的写法和 `e2e/helpers/arco.ts`）
   - 后端单元测试缺口写到 `server/src/**/__tests__/*.test.ts`
   - 前端单元测试写到 `client/src/**/__tests__/*.test.tsx`
3. **第三遍：跑全量 + 修复**
   - 跑 P0 全量并修复，直至全绿
   - 然后跑 P1，最后 P2/P3

## 4. 用例 ID 命名约定

```
<模块前缀>-<编号>
```

| 前缀  | 模块           |
| ----- | -------------- |
| AUTH  | 认证           |
| RBAC  | 权限/RBAC      |
| PROJ  | 项目           |
| ACT   | 活动           |
| CHK   | 检查项         |
| WR    | 周报           |
| RISK  | 风险评估       |
| PROD  | 产品           |
| SYS   | 系统级         |
| IMP   | Excel 导入     |
| WRX   | 周报富文本/XSS |
| AI    | AI 评估        |
| WC    | 企微 OAuth     |
| ARC   | 归档/快照      |
| I18N  | 国际化         |
| THEME | 主题/偏好      |
| CHAOS | 破坏性场景     |

## 5. 测试账号

| 账号     | 密码     | 角色                |
| -------- | -------- | ------------------- |
| admin    | admin123 | 系统管理员（`*:*`） |
| zhangsan | 123456   | 项目经理            |
| lisi     | 123456   | 普通成员            |

## 6. 关键约束（来自 CLAUDE.md / MEMORY）

- 改 schema 后必须 `db push` + `prisma generate` + 重启服务
- 服务端口固定：server=3000, client=5173
- 已归档项目的写操作被 `rejectIfArchived` 中间件统一拦截
- 认证缓存 5 min TTL，禁用用户立即驱逐
- E2E 使用 `e2e/.auth/state.json` 持久登录态（admin）
- E2E 串行运行（`fullyParallel: false, workers: 1`）—— 不要写依赖并发的用例

## 7. 已知风险（运行测试时注意）

- `dev.db` 在测试间共享，破坏性用例（DELETE/批量）后建议恢复 seed
- AI 相关用例未配置 `AI_API_KEY` 时会熔断 → 用例需 mock 或跳过
- 企微 OAuth 用例需 mock 上游（`server/src/routes/auth.ts` 中 wecom API）
