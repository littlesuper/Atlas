# [BUG] 排期级联在"多路径不等长汇聚"拓扑下，下游活动残留中间值（FS 依赖被违反）

- 严重度：P1（影响排期正确性；写入路径 `cascadeUpdateDependents` 复用同一算法，错误日期可落库）
- 发现者：GLM QA
- 日期：2026-06-15
- 模块：scheduleEngine（`computeProjectScheduleCascade`）

## 复现步骤

`computeProjectScheduleCascade` 用 BFS 沿 reverse-deps 级联重算下游日期，但每个节点首次出队即被 `visited` 标记，**后续再次入队时直接跳过、不再重算其下游**。

当**单个 seed 同时经两条不等长路径**汇聚到同一节点 X（`S→A→X` 与 `S→B→C→X`），且 X 有下游 Y 时：

1. S 出队 → 更新 A、B（较短路径上的 A 率先把 X 算成"中间值 X_mid"），X 入队。
2. B 出队 → 更新 C，C 入队（C 还没碰到 X）。
3. X 出队（被标记 visited）→ **用 X_mid 算出 Y**（错误中间值），Y 入队。
4. C 出队 → 把 X 更新到最终值 X_final，X 再次入队。
5. X 再次出队 → **因 visited 命中被跳过**，Y 不会基于 X_final 重算。

结果：X 本身是正确的（步骤 4 修好了），但 **Y 残留步骤 3 的中间值**——Y 可以早于其 FS 前置 X 的完成日就开始。

最小拓扑（单测中已构造）：

```
S ──► A ──► X ──► Y
└──► B ──► C ──┘
```

## 期望行为

X 与 Y 都按"较晚路径（经 C）"完整级联。Y 依赖 X（FS）→ Y 必须在 X 完成之后才开始。
- X：start `2026-04-07`、end `2026-04-13`
- Y：start `2026-04-14`、end `2026-04-20`

## 实际行为

X 正确（`2026-04-07` ~ `2026-04-13`），但 **Y 残留中间值**：start `2026-04-07`、end `2026-04-13`——**Y 的开始日等于其 FS 前置 X 的开始日，早于 X 完成日 6 个工作日**，FS 依赖被违反。

## 根因（定位给 Claude）

`server/src/utils/scheduleEngine.ts:184-200` 的 BFS：

```ts
while (queue.length > 0) {
  const currentId = queue.shift()!;
  if (visited.has(currentId)) continue;   // ← 同一节点二次入队时整段跳过
  visited.add(currentId);
  const dependentIds = reverseDeps.get(currentId);
  if (!dependentIds) continue;
  for (const depId of dependentIds) {
    const dep = byId.get(depId);
    if (!dep) continue;
    if (recomputeFromDeps(dep, byId)) {    // ← dep 值变了…
      changedIds.add(depId);
      queue.push(depId);                    // ← …会再次入队，但其下游在它首次出队时已被（用旧值）处理过
    }
  }
}
```

`visited` 防的是节点自身的重复处理，但副作用是：节点值发生**二次变化**时，它的下游不会随之重算。修复方向（任选其一，留给 Claude）：
- 按拓扑序迭代直到不动点（每轮全量重算所有受影响节点，直到无变化）；或
- 节点值变化时清除其下游的 `visited`，使其可被重新处理；或
- 不用 `visited` 跳过，改为"值未变化才停止传播"（注意防环——DAG 本无环，可加最大迭代轮次兜底）。

## 影响面

- **预览路径**：`dryRunSchedule`（AI 排期助手 propose）→ 用户看到错误日期 + `assessRisks` 基于错误快照判风险（可能漏报 `milestone_slip` / `project_overdue`）。
- **写入路径**：`server/src/routes/activities/shared.ts:183` `cascadeUpdateDependents` 以单个 `changedActivityId` 为 seed 调本函数——正是本 bug 的触发形态。错误的 `planStartDate/planEndDate/planDuration` 会**落库**。
- 触发条件：被编辑的活动其下游存在"不等长双路径汇聚 + 汇聚点再带下游"的拓扑（菱形/不规则 DAG）。生产中真实可现。

## 失败测试（交接契约）

- 路径：`server/src/utils/scheduleEngine.test.ts`
  - `describe` 链：`computeProjectScheduleCascade` > `multi-path reconvergence (GLM QA bug repro)` > `fully cascades Y when a single seed reaches convergence node X via two unequal-length paths`
- 运行命令：

```bash
cd server && npx vitest run src/utils/scheduleEngine.test.ts -t "multi-path reconvergence"
```

- 当前失败输出（关键片段）：

```
 FAIL  src/utils/scheduleEngine.test.ts > computeProjectScheduleCascade > multi-path reconvergence (GLM QA bug repro) > fully cascades Y when a single seed reaches convergence node X via two unequal-length paths
AssertionError: expected '2026-04-07' to be '2026-04-14' // Object.is equality

Expected: "2026-04-14"
Received: "2026-04-07"

 ❯ src/utils/scheduleEngine.test.ts:249:62
    247|       // 随后较长路径 C 把 X 更新到最终值，但 X 已被 visited 标记、不再重算下游，
    248|       // 导致 Y 残留中间值 start 04-07、end 04-13（Y 在 X 完成前就开始——FS 依赖被违反）。
    249|       expect(fmt(byId(result.snapshot, 'Y')?.planStartDate)).toBe('202…

 Test Files  1 failed (1)
      Tests  1 failed | 19 skipped (20)
```

> 注：同用例中对 X 的断言（start `2026-04-07`、end `2026-04-13`）**通过**——X 本身被修对了，问题精准在"X 二次更新后下游 Y 不重算"。

## 交接约定（本报告即 PR 的 body）

- **Claude（修源码）**：只改 `server/src/utils/scheduleEngine.ts`（必要时含 `shared.ts` 调用方，若算法签名变化）让测试自然变绿；**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。注意：`computeProjectScheduleCascade` 是纯函数且被写入路径共用，修复需保证幂等/无环收敛，不要引入新的突变或回归（现有 19 条用例须全绿）。
- **GLM（复测）**：复跑 `cd server && npx vitest run src/utils/scheduleEngine.test.ts` 确认全绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）

- [ ] 同一测试已转绿，且测试本身未被修改
- 验证命令输出：<PASS 片段>
