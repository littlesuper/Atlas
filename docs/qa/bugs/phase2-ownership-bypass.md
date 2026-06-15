# [BUG] capabilityApply 归属校验在 cached.userId 为 falsy 时被跳过

- 严重度：P1（安全——任意用户可应用无 userId 的提议）
- 发现者：GLM QA
- 日期：2026-06-15
- 模块：assistant / capability / orchestrator

## 复现步骤
1. `proposalStore` 中存在一条 `userId: undefined` 的提议（来源：遗留数据、ctx.userId 丢失、或直接 `proposalStore.set` 写入）。
2. 另一个用户（非发起者）拿到该 `proposalId`，调用 `capabilityApply`。
3. 归属校验 `cached.userId && cached.userId !== ctx.userId` 因 `cached.userId` 为 falsy 而短路，**跳过 throw**。
4. 后续权限检查通过后，`execute` 被调用——非发起者成功应用了该提议。

## 期望行为
当 `cached.userId` 为 falsy（undefined / null / 空串）时，`capabilityApply` 应视为归属不明并拒绝应用（抛 `CapabilityForbiddenError`），或至少要求 `cached.userId === ctx.userId` 严格成立。当前代码的 `cached.userId &&` 守卫在 userId 缺失时**完全绕过**了归属检查。

## 实际行为
`cached.userId && cached.userId !== ctx.userId` 在 `cached.userId = undefined` 时短路为 false，不抛错。攻击者只要拥有对应 capability 的权限即可应用该提议。

## 根因猜测
`orchestrator.ts:196` 的 `cached.userId &&` 守卫最初可能是为了兼容旧 adapter 体系（不写 userId）的提议。但 Task 5 已删除旧 adapter，所有新提议都经 `capabilityPropose` 写入 `userId: ctx.userId`。该守卫已成为死代码留下的安全空洞。

## 失败测试（交接契约）
- 路径：`server/src/services/assistant/capability/orchestrator.test.ts`
- 运行命令：`cd server && npx vitest run src/services/assistant/capability/orchestrator.test.ts -t "BUG"`
- 当前失败输出（关键片段）：

```
FAIL  src/services/assistant/capability/orchestrator.test.ts > capabilityApply · 归属/权限 > BUG: 提议缺 userId 时归属校验被跳过（任意用户可应用）
AssertionError: promise resolved "{ rows: [], risks: [] }" instead of rejecting
```

## 交接约定（本报告即 PR 的 body）
- **Claude（修源码）**：只改源码让测试自然变绿；**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑确认绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）
- [ ] 同一测试已转绿，且测试本身未被修改
- 验证命令输出：<PASS 片段>
