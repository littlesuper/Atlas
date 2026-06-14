# 灯塔验收报告 · 对话式排期 + 风险暴露

> 对照 `01-beacon-spec.md` §J 的 13 条验收标准逐条自检。
> 生成时间：2026-06-13。实现方式：TDD（先红后绿），LLM 只在两个边缘，日期/风险全部确定性代码。

## 测试规模

| 套件 | 结果 |
|---|---|
| 后端单元/路由（全量） | 158121 passed（含本灯塔新增） |
| 本灯塔后端新增测试 | 100 passed（7 个文件，5×连跑零波动） |
| 前端单元（全量） | 155318 passed |
| 本灯塔前端新增测试 | 12 passed（ScheduleAssistantPanel） |
| 我的文件 typecheck | 0 error（前后端） |
| 我的文件 lint | 0 warning |

**预存量基线问题（非本次引入，已 `git stash` 复核）**：
- `server/src/utils/week8ClosureGate.test.ts` / `week8HandoffPack.test.ts`：TS 枚举类型 error
- `client/src/hooks/useColumnPrefs.test.ts`：Arco `Message` 撞 React 19 移除的 `ReactDOM.render`，产生 2 个 Unhandled Rejection（测试本身 pass）
- 6 个 `no-unused-vars` 警告，分散在若干 `*.test.ts(x)`
- 全量 158k 套件偶发 2 例 flaky（5 次全量跑里 1 次出现、无法复现、与本灯塔文件无关）

---

## §J 13 条逐条核对

### ✅ 1. PM 用自然语言可完成五类操作
shift_activity / set_planned / set_duration / add_dependency / remove_dependency 五种操作类型在
`schemas/scheduleAssistant.ts`（Zod discriminated union）、`utils/scheduleEngine.ts`（dryRunSchedule）、
`utils/scheduleAssistantPrompts.ts`（parseIntentResponse）三层贯通。
**验证**：`scheduleAssistantPrompts.test.ts` 正样本 P1–P6；`scheduleEngine.test.ts` 各操作干跑断言。

### ✅ 2. 干跑 = 实算
propose 与 apply 共用同一纯函数 `dryRunSchedule`→`computeProjectScheduleCascade`；apply 在通过指纹校验的
同一快照上重算，结果与 propose 预览逐字节一致。**验证**：`scheduleAssistant.test.ts`
"§J-2 干跑=实算: propose diff deep-equals the diff applied at apply time"。

### ✅ 3. 撞里程碑 / 撞硬节点 / 整体超期（命中与不命中）
`utils/scheduleRisks.ts` `assessRisks` 三类确定性判定。**验证**：`scheduleRisks.test.ts`
R1 命中 hard_node_breach、R2 不命中、R3 milestone_slip、R4 project_overdue，外加"无硬节点/无项目截止/
仅非里程碑变更"等反例与"三类风险叠加"用例。

### ✅ 4. LLM 只从活动清单选 id，编造则被拦
prompt 强约束（活动白名单 + 2026-04-26 反例锚定）+ 代码层兜底：`parseIntentResponse` 对每个
activityId/dependsOnId 过白名单，命中清单外 → `fabricated_id`；`dryRunSchedule` 再设
`UnknownActivityIdError` 二次兜底。**验证**：`scheduleAssistantPrompts.test.ts`（fabricated activityId /
fabricated dependsOnId）、`scheduleAssistantIntent.test.ts`（LLM 编造 id → not_understood）、
`scheduleEngine.test.ts`（unknown id 抛错）。

### ✅ 5. 解析不出 → 明确"没听懂"，不瞎改
空操作 → `proposeFromIntent` 返回 `noOp`；解析失败/编造 → 路由 200 noOp"没听懂"。
**验证**：`scheduleAssistant.test.ts`（noOp 不创建提议）、`scheduleAssistant`(route) `not_understood`→200、
前端 `ScheduleAssistantPanel.test.tsx`"没听懂" info、不渲染"应用全部"。

### ✅ 6. AI 不可用降级 / 叙述不可用仍可应用 / 手动排期不受影响
- 意图解析 AI 不可用（熔断打开/未配置/API 错）→ propose 503"AI 助手暂不可用"，不伪造意图。
- 叙述 AI 不可用 → `proposeFromIntent` catch → narrative=''，仍返回 proposalId，前端展示结构化 diff 可确认。
- 手动排期是独立的 `PUT /api/activities/:id` 路径，完全不受影响。
**验证**：`scheduleAssistantIntent.test.ts`（三种 ai_unavailable）、`scheduleAssistant.test.ts`
（narrate 抛错降级）、route（503 / narration 失败仍返回 proposalId）、前端（503 警示 / 空叙述降级）。

### ✅ 7. 未点"应用全部"前数据库零改动
propose 全程纯函数 + 内存缓存，无任何 `prisma.*.update`/`$transaction`/`auditLog`。
**验证**：`scheduleAssistant.test.ts`"does NOT write to DB during propose"。

### ✅ 8. apply 只认服务端缓存意图，前端篡改 diff 无效
apply 入参**只有** proposalId（API 根本不接收 diff）；服务端取 `cached.intent` 在 fresh 快照上重算。
前端无 diff 可篡改 —— 比"忽略前端 diff"更强。**验证**：route apply body 仅 `{proposalId}`；
service apply 用 cached.intent 重算。

### ✅ 9. apply 经过 dependencyValidator，成环被拒
对 deps 变更的活动逐个 `detectCircularDependency`，命中 → `DependencyCycleError` → 400，且不写库不审计。
**验证**：`scheduleAssistant.test.ts`"rejects when dependency cycle would form"、route 400 DEPENDENCY_CYCLE。
（对应 04 边界样本 B4：M1 已依赖 A3，再让 A3 依赖 M1 成环。）

### ✅ 10. 审计含 rawUtterance + 解析意图 + 实际 diff，可回滚
apply 调 `auditLog({ resourceType:'schedule_assistant', changes:{ rawUtterance, resolvedIntent, appliedDiff }})`。
写入是普通活动更新，沿用既有审计 + 项目快照/撤回机制可回滚。
**验证**：`scheduleAssistant.test.ts` happy-path 断言三个字段齐全。

### ✅ 11. 缓存过期 / 期间被改 → 拒绝并提示重新 propose
`ProposalCache` 10min TTL；apply 比对 `computeSnapshotFingerprint`（项目截止 + 每活动 plan*/硬节点/依赖）。
TTL 过期 → 404；指纹不一致 → 409。**验证**：`scheduleAssistant.test.ts`（TTL 过期、版本不一致且不写库）、
route 409 PROJECT_VERSION_MISMATCH。

### ✅ 12. 所有 LLM 调用经 circuitBreaker；source 风格一致
两个边缘均 `aiCircuitBreaker.execute(() => callAi(...))`；feature 标识 `'schedule_assistant'` 与现有
`'risk'` 等同风格，token 用量经 `aiUsageLog` 记录。风险为确定性产物，无需 ai/rule_engine 源标识。
**验证**：`scheduleAssistantIntent/Narrate.test.ts` 断言 execute 被调用、temperature=0、feature 名。
> 备注：核对发现现有四处 AI 调用（risk/weeklyReports/activities.schedule/scheduler）**未**包熔断器——
> 这是预存量"接线缺失"。本灯塔按方案 X 仅在自身两个边缘接入，未顺手扩散（守 §I 范围）。建议另开 task 补齐。

### ✅ 13. 既有写入路径 / 调度器 / 内联编辑约束未被破坏
`cascadeUpdateDependents` 重构为"读全项目→内存纯级联→单事务批量写回"，算法等价于原 BFS。
内联编辑与依赖锁定计划时间的约束不变（助手不走内联编辑，走 propose/apply，应用后由调度器重算）。
**验证**：全量后端 158121 passed（含 `activities.test.ts` 对 PUT/:id + cascade 的回归）。

---

## 范围与"明确不做"（§I）核对
- ❌ 无自动应用：不存在任何绕过 apply 的写库路径。
- ❌ 无跨项目调度：仅单项目内依赖级联。
- ❌ 无工期/延期概率预测：风险纯结构化判定。
- ❌ LLM 不碰日期/风险：仅意图解析 + 结果叙述两个边缘。
- ❌ 未编辑排期以外实体：只动 activity 的 plan 日期/工期/依赖（+ 新增 hardConstraintDate 字段）。

## 数据库迁移
`20260613082959_add_activity_hard_constraint_date`：`ALTER TABLE activities ADD COLUMN "hardConstraintDate" DATETIME;`
可空、零回填、向后兼容。生产走 `prisma migrate deploy`。
