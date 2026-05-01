# Week 4 Day 3-4 Core Module Test Targets

本文件用于执行 Week 4 Day 3-4 的第一步：识别 Atlas Top 10 核心功能，并为后续补充关键单元测试建立候选目标。

注意：本清单是 AI 代码守护人基于代码结构、测试计划、E2E 覆盖和上线风险整理的候选版本，不是最终业务决策。进入"生成测试"前，需要业务负责人确认这些模块是否就是 Atlas 的核心模块。

## 识别依据

候选排序参考以下信号：

1. `docs/qa/test-plan.md` 中 P0/P1 用例数量和安全/数据一致性风险。
2. `server/src/routes/`、`server/src/utils/`、`client/src/pages/` 中的核心代码分布。
3. `e2e/specs/` 中已有端到端覆盖密度。
4. 当前单元测试与覆盖率基线中暴露的低覆盖区域。
5. 上线后对数据、权限、交付计划、文件和生产安全的影响。

## Top 10 候选核心功能

| 排名 | 核心功能候选 | 主要代码 | 已有测试证据 | 主要缺口 / 风险 | 建议后续动作 |
| --- | --- | --- | --- | --- | --- |
| 1 | 认证、Token 生命周期、强制改密、用户偏好 | `server/src/routes/auth.ts`, `server/src/middleware/auth.ts`, `client/src/store/authStore.ts`, `client/src/pages/Login/` | `server/src/routes/auth.test.ts`, `server/src/middleware/auth.test.ts`, `client/src/pages/Login/Login.test.tsx`, `e2e/specs/auth*.spec.ts`, `e2e/specs/token-lifecycle.spec.ts` | 这是所有业务入口和权限边界的基础；需持续覆盖 token 黑名单、refresh、禁用用户、缓存失效 | 保持 P0 安全测试优先；后续补测试时重点检查缓存失效和异常路径 |
| 2 | RBAC、用户/角色管理、活动角色绑定 | `server/src/routes/users.ts`, `server/src/routes/roles.ts`, `server/src/routes/roleMembers.ts`, `server/src/utils/roleMembershipResolver.ts`, `client/src/pages/Admin/` | `server/src/routes/users.test.ts`, `roles.test.ts`, `roleMembers.test.ts`, `roleMembershipResolver.test.ts`, `e2e/specs/permission-*.spec.ts`, `role-management.spec.ts`, `user-management.spec.ts`, `activity-role-binding.spec.ts` | 权限错配会直接导致越权；活动角色绑定是 Atlas 近期重点变更 | Day 3-4 补测试时优先检查跨项目/跨角色边界和 role reset 场景 |
| 3 | 项目生命周期、协作者、归档/快照 | `server/src/routes/projects.ts`, `client/src/pages/Project/List/`, `client/src/pages/Project/Detail/`, `client/src/pages/Project/Edit/` | `server/src/routes/projects.test.ts`, `client/src/pages/Project/List/ProjectList.test.tsx`, `e2e/specs/projects.spec.ts`, `project-archive.spec.ts`, `project-collaborators.spec.ts`, `snapshots.spec.ts` | `projects.ts` 同时承担列表、成员、归档、快照，状态和权限分支多；覆盖率仍有明显空间 | 优先补归档事务一致性、快照只读、协作者越权单元/API 测试 |
| 4 | 活动/任务计划、依赖、工作日、甘特图、What-If、重排 | `server/src/routes/activities.ts`, `server/src/utils/workday.ts`, `server/src/utils/dependencyScheduler.ts`, `server/src/utils/dependencyValidator.ts`, `server/src/utils/criticalPath.ts`, `client/src/pages/Project/Detail/` | `server/src/routes/activities.test.ts`, `workday.test.ts`, `dependency*.test.ts`, `criticalPath.test.ts`, `e2e/specs/activity-*.spec.ts`, `gantt-chart.spec.ts`, `scheduling-tools.spec.ts` | 这是硬件项目管理的核心；日期、依赖、重排和导入撤销任何错误都可能污染项目计划 | Day 3-4 优先补未覆盖的边界：调休/节假日、跨项目批量更新、重排不动已完成任务 |
| 5 | 活动 Excel 批量导入与撤销 | `server/src/routes/activities.ts`, `server/src/utils/excelActivityParser.ts`, `client/src/pages/Project/Detail/` | `server/src/routes/activities.import-excel.test.ts`, `server/src/utils/excelActivityParser.test.ts`, `e2e/specs/activity-import.spec.ts`, `activity-export.spec.ts` | 导入是高风险批量写入路径；文件校验、错误行报告、撤销一致性必须可靠 | 补 route 层导入成功/部分失败/撤销失败后的事务一致性测试 |
| 6 | 产品管理、规格、状态机、上传、对比、导出 | `server/src/routes/products.ts`, `server/src/routes/uploads.ts`, `client/src/pages/Product/`, `client/src/pages/Project/Detail/ProductsTab.tsx` | `server/src/routes/products.test.ts`, `server/src/utils/__tests__/upload-security.test.ts`, `e2e/specs/product*.spec.ts`, `products.spec.ts` | 产品文件上传和状态机同时涉及安全与业务流程；上传 route 本身仍缺单元/API 测试 | 优先补上传路由安全、产品状态机逆向、CSV 转义/导出测试 |
| 7 | 风险评估、AI 降级、RiskItem 状态机 | `server/src/routes/risk.ts`, `server/src/routes/riskItems.ts`, `server/src/utils/riskEngine.ts`, `server/src/utils/aiClient.ts`, `server/src/utils/circuitBreaker.ts`, `client/src/pages/RiskDashboard/`, `RiskAssessmentTab.tsx`, `RiskItemsPanel.tsx` | `server/src/routes/risk.test.ts`, `riskEngine.test.ts`, `aiClient.test.ts`, `circuitBreaker.test.ts`, `e2e/specs/risk*.spec.ts`, `risk-dashboard.spec.ts` | `riskItems.ts` 覆盖偏低；AI 脏数据和熔断降级会影响上线稳定性 | 补 RiskItem 状态流转、AI 非法 JSON、AI 超时/熔断的 route 层测试 |
| 8 | 周报、富文本、附件、XSS/Sanitize | `server/src/routes/weeklyReports.ts`, `server/src/utils/sanitize.ts`, `client/src/pages/WeeklyReports/` | `server/src/routes/weeklyReports.test.ts`, `server/src/utils/sanitize.test.ts`, `client/src/pages/WeeklyReports/*.test.ts`, `e2e/specs/weekly*.spec.ts`, `xss-rendering.spec.ts` | 富文本和附件是典型 XSS/上传入口；状态流转规则还需要业务确认 | 优先补 SUBMITTED 后编辑策略、附件 section 校验、富文本清洗边界测试 |
| 9 | 检查项、活动评论、通知协作闭环 | `server/src/routes/checkItems.ts`, `activityComments.ts`, `notifications.ts`, `client/src/pages/Project/Detail/CheckItems.tsx`, `ActivityComments.tsx`, `client/src/components/NotificationBell.tsx` | `server/src/routes/checkItems.test.ts`, `notifications.test.ts`, `client/src/pages/Project/Detail/ActivityComments.test.tsx`, `client/src/components/NotificationBell.test.tsx`, `e2e/specs/check-items.spec.ts`, `comments.spec.ts`, `notifications.spec.ts` | 活动评论 route 尚无对应单元/API 测试；协作功能容易出现权限和关联数据问题 | 补 activity-comments route 测试，并补检查项级联/通知已读幂等测试 |
| 10 | 系统安全与上线基础：审计日志、上传、Swagger/CORS/限流/错误处理 | `server/src/routes/auditLogs.ts`, `uploads.ts`, `server/src/middleware/`, `server/src/swagger.ts`, `server/src/utils/logger.ts` | `server/src/middleware/__tests__/security.test.ts`, `validate.test.ts`, `permission.test.ts`, `e2e/specs/audit-log*.spec.ts`, `accessibility.spec.ts`, `idor-permission.spec.ts` | 这些不是单一业务页面，但影响上线安全；auditLogs、uploads、logger、Swagger 仍需要更直接的单元/API 覆盖 | 补审计查询权限、上传路径穿越、生产环境 Swagger 关闭、错误响应不泄漏 stack 的测试 |

## 不建议进入 Top 10 但需要保留观察的模块

| 模块 | 原因 | 建议 |
| --- | --- | --- |
| i18n / 主题 / 偏好持久化 | 已有主题 store 测试和 E2E，但对上线核心业务影响低于权限、计划、产品、风险 | 放入 P1/P2 回归，不作为 Day 3-4 首批补单元测试重点 |
| 假期管理 | 与工作日计算强相关，但当前核心算法已有 `workday.test.ts`；管理端 route 还需结合实际使用频率判断 | 若团队高频维护节假日，提升到活动计划模块的子重点 |
| 模板管理 | 对项目创建效率重要，但不直接决定权限/数据安全/计划正确性 | 保持现有 `templates.test.ts` 和 E2E，后续按缺陷驱动补测 |
| 工作负载看板 | 对管理视图有价值，但多数计算来自活动计划数据 | 并入活动计划模块跟踪 |

## 建议的 Day 3-4 测试补充顺序

如果业务负责人确认上述 Top 10，建议本周先补 8-12 个高价值单元/API 测试，不追求一次性把所有核心模块覆盖率拉到 80%：

1. `server/src/routes/riskItems.ts`: RiskItem 状态流转、删除评估后保留风险项、越权/不存在资源。
2. `server/src/routes/activityComments.ts`: 创建/删除评论的权限边界、活动不存在、跨项目越权。
3. `server/src/routes/uploads.ts`: 路径穿越、伪 MIME/扩展名、错误响应不泄漏本地路径。
4. `server/src/routes/projects.ts`: 归档/取消归档事务边界、快照只读证据。
5. `server/src/routes/activities.ts`: 跨项目批量更新拒绝、重排保留已完成活动、导入撤销失败回滚。
6. `server/src/routes/weeklyReports.ts`: SUBMITTED 后编辑策略和附件 section 校验。
7. `server/src/routes/products.ts`: 状态机非法逆向和 CSV 转义。
8. `server/src/routes/auditLogs.ts`: 非授权用户查询审计日志被拒绝、筛选参数边界。

## Day 3-4 补测批次记录

| 日期 | 批次 | 覆盖模块 | 新增测试文件 | 场景数量 | 验证命令 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-05-01 | Batch 1 | 活动评论、审计日志 | `server/src/routes/activityComments.test.ts`, `server/src/routes/auditLogs.test.ts` | 15 | `npx vitest run src/routes/activityComments.test.ts src/routes/auditLogs.test.ts` | 通过 |
| 2026-05-01 | Batch 2 | 角色成员、通知、检查项 | `server/src/routes/roleMembers.test.ts`, `server/src/routes/notifications.test.ts`, `server/src/routes/checkItems.test.ts` | 13 | `npx vitest run src/routes/roleMembers.test.ts src/routes/notifications.test.ts src/routes/checkItems.test.ts` | 通过 |

## 需要业务确认的问题

1. 上述 Top 10 是否就是 Atlas 上线前的核心功能？是否需要把"假期管理"提升到 Top 10？
2. 周报 `SUBMITTED` 后是否允许继续编辑？这是测试需要固化的业务规则。
3. 活动删除时对子活动、检查项、评论、风险项的级联策略是否已经定稿？
4. 产品状态机中 `DEVELOPING -> DISCONTINUED` 是否允许直接跳转？
5. Day 3-4 是否接受先补高风险后端 API/工具测试，而不是平均给每个模块补一个测试？

在这些问题确认前，本文件不作为最终验收结论，只作为测试补齐的候选输入。
