# [BUG] risk.update execute 在 DB 更新前写审计日志（失败时产生孤儿日志）

- 严重度：P2（数据完整性——审计日志与实际数据不一致）
- 发现者：GLM QA
- 日期：2026-06-15
- 模块：assistant / capability / riskUpdate

## 复现步骤
1. 用户通过 AI 助手发起 `risk.update`，意图含一条 `update_risk` 操作（如 severity MEDIUM → CRITICAL）。
2. 用户确认应用，`capabilityApply` 调用 `riskUpdateCapability.execute`。
3. execute 中，`riskItemLog.create`（审计日志）**先于** `riskItem.update`（实际数据写入）被调用。
4. 若 `riskItem.update` 因任何原因失败（DB 连接断开、约束冲突等），日志已写入但数据未变更。

## 期望行为
审计日志应**在数据成功写入后**创建，或在同一事务内完成。当 `riskItem.update` 失败时，不应留下"严重度已变更"的孤儿日志——该日志声称发生了变更，但实际数据未改。

## 实际行为
`riskUpdate.ts:99-110`：`riskItemLog.create` 在 `if` 块内、`riskItem.update` 在 `if` 块外之后调用。日志先写、数据后写，中间无事务保护。

```ts
// 当前代码（简化）
if (op.severity && op.severity !== existing.severity) {
    data.severity = op.severity;
    await prisma.riskItemLog.create({ ... }); // ← 先写日志
}
if (op.status && ...) {
    await prisma.riskItemLog.create({ ... }); // ← 先写日志
}
if (Object.keys(data).length > 0)
    await prisma.riskItem.update({ ... });     // ← 后更新（失败则日志成孤儿）
```

## 失败测试（交接契约）
- 路径：`server/src/services/assistant/capability/riskUpdate.test.ts`
- 运行命令：`cd server && npx vitest run src/services/assistant/capability/riskUpdate.test.ts -t "BUG"`
- 当前失败输出（关键片段）：

```
FAIL  src/services/assistant/capability/riskUpdate.test.ts > execute > BUG: update_risk 在 DB 更新失败时不应已写审计日志
Number of calls: 1
  expect(mockPrisma.riskItemLog.create).not.toHaveBeenCalled();
```

## 交接约定（本报告即 PR 的 body）
- **Claude（修源码）**：只改源码让测试自然变绿；**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑确认绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）
- [ ] 同一测试已转绿，且测试本身未被修改
- 验证命令输出：<PASS 片段>
