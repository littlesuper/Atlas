# [BUG] What-If 端点的级联 BFS 与 #70 同源（visited 标记致多路径汇聚下游残留中间值）

- 严重度：P1（用户可见的排期模拟预览给出错误日期；FS 依赖被违反）
- 发现者：GLM QA
- 日期：2026-06-15
- 模块：activities/schedule（`POST /api/activities/project/:projectId/what-if`）

## 与 #70 的关系（必读）

这是 **bug #70（`computeProjectScheduleCascade` 的 visited-BFS 缺陷）的同一根因、不同位置**：
- #70 在 `server/src/utils/scheduleEngine.ts:184-200`（纯函数，被 dryRunSchedule / 写入路径 cascadeUpdateDependents 共用）。
- 本 bug 在 `server/src/routes/activities/schedule.ts:309-358`——what-if 端点**内联的独立 BFS 副本**，它**不调用** `computeProjectScheduleCascade`，而是自己重写了一份一模一样的级联算法（含相同的 `visited` 提前标记缺陷）。

**因此修 #70 不会修到这里。** 两处需各自修复（建议 schedule.ts 改为复用 `computeProjectScheduleCascade`，从根上消灭重复算法）。

## 为什么现有测试没发现

`activities.test.ts` 把 `resolveActivityDates` 文件级 mock 成**恒返回 `{}`**（第 110 行），导致 what-if 端点的级联分支**永远不会触发**（`resolved.planStartDate` 恒 undefined → `startChanged/endChanged` 恒 false → 下游从不入队）。既有 what-if 用例只用「单活动、无依赖」的退化场景断言 `affectedCount >= 1`，**从未真正覆盖级联**。本 bug 正是在这条「被 mock 屏蔽」的路径里潜伏。

## 复现步骤

what-if 端点的 BFS（schedule.ts:309-358）：

```ts
const visited = new Set<string>();
const queue = [activityId];
while (queue.length > 0) {
  const currentId = queue.shift()!;
  if (visited.has(currentId)) continue;   // ← 同 #70：节点二次入队时整段跳过
  visited.add(currentId);
  const dependentIds = reverseDeps.get(currentId) || [];
  for (const depId of dependentIds) {
    ...
    if (startChanged || endChanged) { ...; queue.push(depId); }  // ← dep 值再变也只入队、不重算其下游
  }
}
```

当被顺延的**单个活动 S 经两条不等长路径**汇聚到 X（`S→A→X` 与 `S→B→C→X`），且 X 有下游 Y 时：

1. S 出队 → 更新 A、B（A 率先把 X 算成中间值 X_mid），X 入队。
2. B 出队 → 更新 C（C 还没碰到 X）。
3. X 出队（被 visited 标记）→ **用 X_mid 算出 Y**，Y 入队。
4. C 出队 → 把 X 更新到最终值 X_final，X 再次入队。
5. X 再次出队 → **visited 命中被跳过**，Y 不基于 X_final 重算。

结果：X 正确，**Y 残留中间值**（Y 的结束日可早于其 FS 前置 X 的完成日）。

## 期望行为

X 与 Y 都按「较晚路径（经 C）」完整级联；Y 依赖 X（FS）→ Y 必须在 X 完成后才开始。
拓扑（全 FS，工期 5）：`S→A→X`、`S→B→C→X`、`X→Y`；把 S 顺延 10 个工作日（S 新区间 `2026-03-16~03-20`）。
- X：`start=2026-04-07`、`end=2026-04-13`（清明 04-04~06 跳过）
- Y：`start=2026-04-14`、`end=2026-04-20`

## 实际行为

响应体 `affected` 中 Y 的 `newEnd = 2026-04-13`（应为 `2026-04-20`）——**Y 的结束日等于其 FS 前置 X 的结束日，早于 X 完成就开始**，FS 依赖被违反。用户在「What-If 模拟」里看到的下游影响日期是错的。

## 影响面

- **用户可见**：「What-If 延期模拟」（ACT-022）返回的受影响活动日期错误，项目经理据错误预览做判断。
- 与 #70 叠加：排期相关**三条路径**（写入 `cascadeUpdateDependents`、AI 助手 dryRunSchedule、what-if 端点）中已有两条携带该缺陷。
- 触发条件：被编辑/顺延的活动其下游存在「不等长双路径汇聚 + 汇聚点再带下游」的拓扑。

## 失败测试（交接契约）

- 路径：`server/src/routes/activities.test.ts`
  - `describe`：`POST /api/activities/project/:projectId/what-if — 多路径汇聚级联（GLM QA bug repro #2）`
  - 用例：`单个 seed 经两条不等长路径汇聚到 X 时，下游 Y 不应残留中间值（FS 依赖被违反）`
- 运行命令：

```bash
cd server && npx vitest run src/routes/activities.test.ts -t "GLM QA bug repro #2"
```

- 当前失败输出（关键片段）：

```
 FAIL  src/routes/activities.test.ts > POST /api/activities/project/:projectId/what-if — 多路径汇聚级联（GLM QA bug repro #2） > 单个 seed 经两条不等长路径汇聚到 X 时，下游 Y 不应残留中间值（FS 依赖被违反）
AssertionError: expected '2026-04-13T00:00:00.000Z' to be '2026-04-20T00:00:00.000Z' // Object.is equality

Expected: "2026-04-20T00:00:00.000Z"
Received: "2026-04-13T00:00:00.000Z"

 ❯ src/routes/activities.test.ts:1806:28

 Test Files  1 failed (1)
      Tests  1 failed | 89 skipped (90)
```

- 全文件回归（隔离验证）：`89 passed | 1 failed`——本用例的 mock 注入（beforeEach 注入真实 `resolveActivityDates`/`offsetWorkdays`/`calculateWorkdays`、afterEach 还原默认 mock）**不影响其它 89 条用例**。

> 测试技巧说明（给 Claude/ reviewer）：因文件级 mock 把 `resolveActivityDates` 固定成 `{}` 屏蔽了级联，本用例在 `beforeEach` 用 `vi.importActual` 注入真实实现以真正触发级联算法，`afterEach` 还原默认 mock。这是复现该端点级联缺陷的必要手段，**不是对测试本身的改造或弱化**。

## 交接约定（本报告即 PR 的 body）

- **Claude（修源码）**：只改 `server/src/routes/activities/schedule.ts`（建议：what-if 端点直接复用 `computeProjectScheduleCascade`，与写入路径/AI 助手统一算法；这样 #70 的修复同时覆盖三处）。**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。注意：本 PR 的失败用例依赖 `resolveActivityDates` 真实实现（测试内注入），若修复改了 `resolveActivityDates` 的行为须保证 #70 的 scheduleEngine 用例仍全绿。
- **GLM（复测）**：复跑 `cd server && npx vitest run src/routes/activities.test.ts` 确认全绿（90 条）且测试未被改动 → `gh pr ready`。建议同时确认 #70 已修，两处算法归一。

## 修复验证（Claude 修完后由 GLM 勾）

- [x] 同一测试已转绿，且测试本身未被修改
- 验证命令输出（2026-06-15 复测，Claude 修复提交 `1ada052b`）：

```
cd server && npx vitest run src/routes/activities.test.ts
 Test Files  1 passed (1)
      Tests  90 passed (90)
```

- 反作弊：`git diff 4a973489..HEAD -- server/src/routes/activities.test.ts` 为空（复现测试零改动，含其 `vi.importActual` 注入）；Claude 提交 `1ada052b` 仅改动 `server/src/routes/activities/schedule.ts`（源码，无任何 `.test` 文件）。✅ 已 `gh pr ready`。
- 注：Claude 选择就地修复 what-if 的 BFS（传播到不动点 + affected 去重），未改为复用 `computeProjectScheduleCascade`——可接受，测试全绿；两处算法仍各自独立，后续可考虑统一以杜绝再次分叉。
