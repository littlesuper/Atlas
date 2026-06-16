# [BUG] PUT /api/roles/:id 传不存在的 permissionId 返回 500 且先清空了角色权限

- 严重度：P2（健壮性 + 数据完整性——错误码契约破裂，且失败时角色权限被清空）
- 发现者：GLM QA
- 日期：2026-06-16
- 模块：routes / roles

## 复现步骤
1. 管理员调用 `PUT /api/roles/r1`，body `{ permissionIds: ['perm-real', 'perm-does-not-exist'] }`（其中 `perm-does-not-exist` 在 `Permission` 表中不存在）。
2. 路由（`routes/roles.ts:180-273`）中间件链为 `authenticate + requirePermission('role','update')`——**无 `validate`**，`permissionIds` 原样进入处理器。
3. 处理器（line 225-239）：**先** `prisma.rolePermission.deleteMany({ where: { roleId: id } })`（清空旧权限），**再** `prisma.rolePermission.createMany({ data: permissionIds.map(...) })`——**无 `permission.count` 存在性校验**。
4. `createMany` 因外键约束抛 Prisma `P2003`，被通用 `catch`（line 269-272）吞成 `500 服务器内部错误`。
5. 客户端只看到 500，但 `r1` 的权限关联已被 `deleteMany` 清空——角色处于「零权限」的损坏态。

## 期望行为
与同文件 POST `/api/roles`（`roles.ts:126-134`）对齐——后者在 `createMany` 前先校验：

```ts
const existingPermissions = await prisma.permission.count({ where: { id: { in: permissionIds } } });
if (existingPermissions !== permissionIds.length) {
  res.status(400).json({ error: '部分权限ID不存在' });
  return;
}
```

不存在的 `permissionId` 应返回 **400**，且**校验必须在 `deleteMany` 之前**（避免失败时数据损坏）。

## 实际行为
`roles.ts:225-239` 的 PUT 处理器：
1. 无 `permission.count` 校验（POST 有，PUT 没有）。
2. `deleteMany` 先于 `createMany` 执行——一旦 `createMany` 失败，权限已被清空且不会回滚（二者非同一事务）。
3. `P2003` 被通用 catch 吞成 500。

三重缺陷：错误码（500 vs 400）、缺校验、失败即数据损坏。

## 失败测试（交接契约）
- 路径：`server/src/routes/roles.updatePermissionIds.test.ts`
- 运行命令：`cd server && npx vitest run src/routes/roles.updatePermissionIds.test.ts -t "BUG"`
- 当前失败输出（关键片段）：

```
FAIL  src/routes/roles.updatePermissionIds.test.ts > PUT /api/roles/:id — permissionIds 校验 > BUG: PUT 传不存在的 permissionId 返回 500 且先清空了角色权限（缺 count 校验 + 顺序错误）
AssertionError: expected 500 to be 400
 - Expected: 400
 + Received: 500
```

> 同文件「全部 permissionId 合法时正常替换」用例当前已绿（200 + deleteMany/createMany 均调用），证明正常路径与 mock 设站无误。
> 断言同时检查 `permission.count` 被调用且 `deleteMany` **未**被调用——精确钉死「校验缺失 + 顺序错误」两点。

## 交接约定（本报告即 PR 的 body）
- **Claude（修源码）**：在 `routes/roles.ts` 的 PUT 处理器、`deleteMany` 之前补 `permission.count` 存在性校验（复用 POST 的同一文案/400 语义）；**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑确认两条用例均绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）
- [ ] BUG 用例转绿（400 + `permission.count` 被调用 + `deleteMany` 未调用），合法替换用例保持绿
- 验证命令输出：<PASS 片段>
