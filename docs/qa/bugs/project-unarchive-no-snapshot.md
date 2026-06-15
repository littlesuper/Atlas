# [BUG] 归档项目无 archive 记录时，unarchive 静默回落 COMPLETED 返回 200（ARC-009 期望 400/404）

- 严重度：P2（test-plan ARC-009 为 P2；低频但 spec 明确的场景）
- 发现者：GLM QA
- 日期：2026-06-15
- 模块：projects/archive（`POST /api/projects/:id/unarchive`）

## 复现步骤

`server/src/routes/projects/archive.ts:132-144` 的 unarchive 处理器：

```ts
const latestArchive = await prisma.projectArchive.findFirst({
  where: { projectId: id },
  orderBy: { archivedAt: 'desc' },
});
const previousStatus = readArchivedProjectStatus(latestArchive?.snapshot) || 'COMPLETED';
const restoredStatus = (['IN_PROGRESS', 'COMPLETED', 'ON_HOLD'].includes(previousStatus))
  ? previousStatus as ProjectStatus
  : ProjectStatus.COMPLETED;
const updated = await prisma.project.update({ where: { id }, data: { status: restoredStatus } });
res.json(updated);
```

当 `project.status === ARCHIVED` 但**没有任何 `projectArchive` 记录**（快照丢失 / 被删 / 直接改库）时：
- `latestArchive === null` → `latestArchive?.snapshot` 为 `undefined` → `readArchivedProjectStatus(undefined)` 返回 `undefined` → `|| 'COMPLETED'` 命中 → `restoredStatus = COMPLETED`。
- 直接 `project.update` 并 `res.json(...)` → **200**。

## 期望行为

test-plan **ARC-009**（P2）：归档项目无 archive 记录时，`POST /unarchive` 应返回 **400/404**（提示无快照可恢复），而不是静默把项目置为 COMPLETED。

## 实际行为

返回 **200**，项目 status 被设为 `COMPLETED`（凭空回落，非真实历史状态）。

## 影响面 / 定性

- 场景低频：正常归档流程（archive 端点）会在事务里同时写 `projectArchive` 记录，故 `ARCHIVED` 项目通常都有快照。本场景仅在「快照记录丢失/被删」或「绕过 archive 端点直接改库」时出现。
- 但 ARC-009 把它列为显式用例，说明 spec 希望此状态被显式拒绝（而不是静默回落到一个猜测值）。
- **定性说明**（给 reviewer）：`|| 'COMPLETED'` 可被解读为「graceful fallback」（无快照时恢复到一个安全默认）或「spec 偏差」。本报告按 ARC-009 立场归为 P2 缺陷；若团队确属有意 fallback，可关闭本 PR 并在 spec 里更新 ARC-009 的预期。

## 失败测试（交接契约）

- 路径：`server/src/routes/projects.test.ts`
  - `describe`：`ARC-008: unarchive restores original status`
  - 用例：`GLM QA bug repro #6 (ARC-009): 归档项目无 archive 记录时 unarchive 应 400/404，而非静默回落 COMPLETED 返回 200`
- 运行命令：

```bash
cd server && npx vitest run src/routes/projects.test.ts -t "GLM QA bug repro #6"
```

- 当前失败输出（关键片段）：

```
 FAIL  src/routes/projects.test.ts > ARC-008: unarchive restores original status > GLM QA bug repro #6 (ARC-009): ...
AssertionError: expected [ 400, 404 ] to include 200

 Tests  1 failed | 49 skipped (50)
```

## 交接约定（本报告即 PR 的 body）

- **Claude（修源码）**：只改 `server/src/routes/projects/archive.ts` 的 unarchive 处理器——当 `latestArchive` 为 null（或其 snapshot 读不到状态）时返回 **400/404** + 明确提示（如「无归档快照，无法恢复原状态」），不要回落 COMPLETED。**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。若团队认定这是有意 fallback，请在 PR 评论说明并关闭。
- **GLM（复测）**：复跑 `cd server && npx vitest run src/routes/projects.test.ts` 确认全绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）

- [x] 同一测试已转绿，且测试本身未被修改
- 验证命令输出（2026-06-15 复测，Claude 修复提交 `83da6491`）：

```
cd server && npx vitest run src/routes/projects.test.ts
 Test Files  1 passed (1)
      Tests  50 passed (50)
```

- 反作弊：`git diff e844eff2..HEAD -- server/src/routes/projects.test.ts` 为空（复现测试零改动）；Claude 提交 `83da6491` 仅改动 `server/src/routes/projects/archive.ts`（+7/−1 源码，无任何 `.test` 文件）。✅ 已 `gh pr ready`。
