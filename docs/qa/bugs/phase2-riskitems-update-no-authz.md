# [BUG] 更新风险项（PUT /api/risk-items/:id）缺失项目权限与归档校验

- 严重度：P1（安全——IDOR 越权写，任意登录用户可改他人项目的风险项）
- 发现者：GLM QA
- 日期：2026-06-16
- 模块：routes / riskItems
- 同源：与 #84（POST 创建缺校验）同病；本 PR 覆盖 PUT /:id

## 复现步骤
1. 用户 `stranger` 仅登录，与项目 `p1`（`managerId='owner-1'`）无任何关系。
2. `stranger` 调用 `PUT /api/risk-items/ri-1`，body `{ severity: 'LOW', status: 'RESOLVED' }`（`ri-1` 属于 `p1`）。
3. 路由（`routes/riskItems.ts:163-236`）只 `riskItem.findUnique({ where: { id } })` 查存在性——`existing.projectId` 已在手却**从不用于权限判定**，无 `canManageProject`、无项目查询、无归档保护。
4. 直接 `riskItem.update` 写库 + 写 `RiskItemLog`（`SEVERITY_CHANGED` / `STATUS_CHANGED`，看起来像合法操作）。
5. 返回 `200`——他人项目的 CRITICAL 风险被降级为 LOW 并标记 RESOLVED。

## 期望行为
与 #84 修复后的 POST 对齐——在 update 之前补：

```ts
const project = await prisma.project.findUnique({ where: { id: existing.projectId }, select: { managerId: true, status: true } });
if (!project) { res.status(404)... return; }
if (!canManageProject(req, project.managerId, existing.projectId)) { res.status(403)... return; }
if (project.status === 'ARCHIVED') { res.status(403)... return; }
```

非项目经理应返回 **403**，不更新、不写日志。

## 实际行为
`riskItems.ts:163-236` 的 PUT 处理器前置零项目级校验。任意登录用户可：改 severity（CRITICAL→LOW 掩盖风险）、改 status（→RESOLVED 关闭风险）、改 ownerId（甩锅/推诿）——且 `RiskItemLog` 使操作看起来合法。

## 失败测试（交接契约）
- 路径：`server/src/routes/riskItems.update.test.ts`
- 运行命令：`cd server && npx vitest run src/routes/riskItems.update.test.ts -t "BUG"`
- 当前失败输出（关键片段）：

```
FAIL  src/routes/riskItems.update.test.ts > PUT /api/risk-items/:id — authz > BUG: 非项目经理可改他人项目的风险项（PUT /:id 缺 canManageProject 校验）
AssertionError: expected 200 to be 403
```

> 同文件「项目经理改自己项目的风险项应放行」用例当前已绿（200 + update 被调用），证明 mock 设站正确。

## 交接约定（本报告即 PR 的 body）
- **Claude（修源码）**：在 `routes/riskItems.ts` 的 PUT 处理器、`riskItem.findUnique` 存在性检查之后、`riskItem.update` 之前，补「查项目 + canManageProject + 归档保护」三件套（复用 #84 POST 的同一段逻辑）；**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑确认两条用例均绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）
- [ ] BUG 用例转绿（403 + update/log 未调用），经理用例保持绿
- 验证命令输出：<PASS 片段>
