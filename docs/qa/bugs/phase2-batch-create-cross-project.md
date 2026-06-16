# [BUG] batch-create 仅校验 items[0] 的项目，可跨项目越权写入

- 严重度：P1（安全——IDOR 跨项目写，项目经理可借批量接口向他人/归档项目注入活动）
- 发现者：GLM QA
- 日期：2026-06-16
- 模块：routes / activities / crud

## 复现步骤
1. 用户 `manager-A` 是项目 `A` 的经理（`canManageProject(A)` 通过），对项目 `B` 无任何权限。
2. `manager-A` 调用 `POST /api/activities/batch-create`，body：
   ```json
   { "activities": [
     { "projectId": "A", "name": "A 的活动" },
     { "projectId": "B", "name": "B 的活动（越权）" }
   ]}
   ```
3. 路由（`routes/activities/crud.ts:149-208`）只取 `items[0].projectId`（= `A`）做一次 `prisma.project.findUnique` + `canManageProject`（line 156-161），通过后进入 `$transaction`。
4. `$transaction` 内对**每条** item 用 `item.projectId` 创建活动（line 174-176）——**B 从未被校验**。
5. 返回 `201 { success: true, count: 2 }`——B（他人项目，甚至可能是归档项目）被注入了 2 条... 即 1 条活动。

## 期望行为
与同文件批量接口对齐——`PUT /batch-update`（`crud.ts:323-326`）与 `DELETE /batch-delete`（`crud.ts:602-605`）都强制：

```ts
const projectIds = [...new Set(items.map(i => i.projectId))];
if (projectIds.length !== 1) {
  res.status(400).json({ error: '批量操作仅支持同一项目的活动' });
  return;
}
// 再对该唯一项目做 canManageProject
```

跨项目的批量创建应返回 **400**（与兄弟接口一致），且绝不写入用户无权操作的 `B`。

## 实际行为
`crud.ts:156` 仅 `const projectId = items[0].projectId;`，后续 `$transaction` 用各 item 自带 `projectId` 创建，无「单一项目」约束、无逐条归属校验、无逐条归档保护。结果：项目经理 A 可借 batch-create 向任意 `projectId` 注入活动（绕过单条 `POST /` 对每个项目的 `canManageProject` + `rejectIfArchived` 门控）。

## 失败测试（交接契约）
- 路径：`server/src/routes/activities.batchCreate.test.ts`
- 运行命令：`cd server && npx vitest run src/routes/activities.batchCreate.test.ts -t "BUG"`
- 当前失败输出（关键片段）：

```
FAIL  src/routes/activities.batchCreate.test.ts > POST /api/activities/batch-create — 跨项目越权 > BUG: batch-create 仅校验 items[0] 的项目，可跨项目写入未授权项目
AssertionError: expected [ 400, 403 ] to include 201
```

> 断言为「安全不变量」而非具体状态码，给修复留有两种合理实现：① 强制单项目 → 400（与 batch-update/delete 一致）；② 逐条 `canManageProject` → 403。两种实现都满足「拒绝 + 不写入 B」。
> 同文件「单项目批量且为经理应放行」用例当前已绿（201 + 两条 create 均为 A），证明 mock 与正常路径无误。

## 交接约定（本报告即 PR 的 body）
- **Claude（修源码）**：在 `routes/activities/crud.ts` 的 batch-create 处理器补「单一项目约束 + 该项目 canManageProject + 归档保护」（建议直接复用 batch-update/delete 的模式）；**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑确认两条用例均绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）
- [ ] BUG 用例转绿（res.status ∈ {400,403} + create 未以 projectId='B' 调用），单项目经理用例保持绿
- 验证命令输出：<PASS 片段>
