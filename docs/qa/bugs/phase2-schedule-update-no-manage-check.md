# [BUG] schedule.update execute 不校验当前用户是否为项目经理

- 严重度：P1（安全——权限旁路，非项目经理可经 AI 改排期）
- 发现者：GLM QA
- 日期：2026-06-15
- 模块：assistant / capability / scheduleUpdate

## 复现步骤
1. 用户 A（`id='stranger'`）**不是** 项目 P（`id='p1'`，`managerId='owner-1'`）的项目经理，也非协作者、非管理员；仅有 `activity:update` 权限。
2. A 通过 AI 助手对 P 发起排期调整（如"把硬件打样推迟 14 天"）。`capabilityPropose` 阶段不写库、只产预览，正常返回 proposalId。
3. A 调用 `capabilityApply` 应用该提议。
4. `capabilityApply` 的归属校验（本人提议）+ 权限边界（`activity:update`）+ 指纹复核均通过——**因为这些都不校验"是否该项目经理"**。
5. `scheduleUpdateCapability.execute`（scheduleUpdate.ts:100-107）直接调 `executeScheduleApply` 写库——**无 `canManageProject` 校验**。
6. 用户 A 成功修改了项目 P 的排期。

## 期望行为
- `execute` 应在调 `executeScheduleApply` 之前，按真实路由 `/api/schedule-assistant` 的门控复检：查 `prisma.project.findUnique({ id })` 取 `managerId`，调 `canManageProject(req, managerId, projectId)`；非管理者抛 `CapabilityForbiddenError`（路由层 assistant.ts:211 映射 403）。
- 安全铁律③："apply 复用各模块已有的 service/路由（自带 Zod + 权限 + 审计）"——当前 `schedule.update` 的 execute 绕过了排期路由的 `canManageProject` 中间件。

## 实际行为
`scheduleUpdate.ts` 的 execute（line 100-107）直接 `executeScheduleApply(target!.id, intent.operations, f.snapshot, req)`，前置无任何项目权限校验。对比真实路由 `routes/scheduleAssistant.ts:70`：

```ts
if (!canManageProject(req, project.managerId, projectId)) {
  res.status(403).json({ error: '只能在自己负责的项目中使用排期助手' });
  return;
}
```

capability 路径缺失等价保护——这是与已修的 `project.update`（projectUpdate.ts:105 已加 `canManageProject`）**同源**的越权漏洞。

## 失败测试（交接契约）
- 路径：`server/src/services/assistant/capability/scheduleUpdate.test.ts`
- 运行命令：`cd server && npx vitest run src/services/assistant/capability/scheduleUpdate.test.ts -t "BUG"`
- 当前失败输出（关键片段）：

```
FAIL  src/services/assistant/capability/scheduleUpdate.test.ts > scheduleUpdateCapability > execute (delegates to shared executeScheduleApply) > BUG: 非项目经理经 AI 调整排期未被拦截（execute 缺 canManageProject）
AssertionError: expected TypeError: Cannot destructure property 'd… to be an instance of CapabilityForbiddenError
 ❯ src/services/assistant/capability/scheduleUpdate.test.ts:170:108
 Test Files  1 failed (1)
      Tests  1 failed | 10 passed (11)
```

> 失败语义：`execute` 根本没做 `canManageProject` 校验，直接往下走到 `executeScheduleApply`——抛出的不是 `CapabilityForbiddenError` 而是后续解构 `undefined` 的 `TypeError`，恰好证明越权路径被执行了。修复后该用例应被 `CapabilityForbiddenError` 拦在 `executeScheduleApply` 之前，`mockExecute` 不会被调用。

## 修复建议（与 project.update 对齐，已与 Claude 约定）
在 `scheduleUpdate.ts` 的 `execute` 里、调 `executeScheduleApply` 之前，新增：

```ts
import { canManageProject } from '../../../middleware/permission';
import { CapabilityForbiddenError } from './orchestrator';
// ...
async execute(intent, _ctx: CapabilityContext, req: Request, target) {
  const proj = await prisma.project.findUnique({ where: { id: target!.id }, select: { managerId: true } });
  if (!proj || !canManageProject(req, proj.managerId, target!.id)) {
    throw new CapabilityForbiddenError('只能调整自己负责的项目');
  }
  // ...既有 executeScheduleApply 调用
}
```

测试已预先 mock `prisma.project.findUnique`（`mockProjectFind`），并保证现有绿用例以项目经理身份（`{ user: { id: 'u1' } }` + `mockProjectFind → { managerId: 'u1' }`）放行，修复后自然转绿。

## 交接约定（本报告即 PR 的 body）
- **Claude（修源码）**：只改 `scheduleUpdate.ts` 让测试自然变绿；**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑确认绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）
- [ ] 同一测试已转绿，且测试本身未被修改
- 验证命令输出：<PASS 片段>
