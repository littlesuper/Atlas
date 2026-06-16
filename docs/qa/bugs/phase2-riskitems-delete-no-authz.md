# [BUG] 删除风险项（DELETE /api/risk-items/:id）缺失项目权限与归档校验

- 严重度：P1（安全——IDOR 越权删，任意登录用户可删他人项目的风险项）
- 发现者：GLM QA
- 日期：2026-06-16
- 模块：routes / riskItems
- 同源：与 #84（POST 创建缺校验）同病；本 PR 覆盖 DELETE /:id

## 复现步骤
1. 用户 `stranger` 仅登录，与项目 `p1`（`managerId='owner-1'`）无任何关系。
2. `stranger` 调用 `DELETE /api/risk-items/ri-1`（`ri-1` 属于 `p1`）。
3. 路由（`routes/riskItems.ts:242-256`）只 `riskItem.findUnique({ where: { id } })` 查存在性——`existing.projectId` 已在手却**从不用于权限判定**，无 `canManageProject`、无项目查询、无归档保护。
4. 直接 `riskItem.delete({ where: { id } })` 删库。
5. 返回 `200 { success: true }`——他人项目的风险项被删除，审计线索销毁。

## 期望行为
与 #84 修复后的 POST 对齐——在 delete 之前补「查项目 + canManageProject + 归档保护」三件套（用 `existing.projectId` 查项目）。

非项目经理应返回 **403**，不删库。

## 实际行为
`riskItems.ts:242-256` 的 DELETE 处理器前置零项目级校验。任意登录用户可删除他人项目的任意风险项——可用来销毁刚被发现的真实风险（删掉即「不存在」），且删除不可逆。

## 失败测试（交接契约）
- 路径：`server/src/routes/riskItems.delete.test.ts`
- 运行命令：`cd server && npx vitest run src/routes/riskItems.delete.test.ts -t "BUG"`
- 当前失败输出（关键片段）：

```
FAIL  src/routes/riskItems.delete.test.ts > DELETE /api/risk-items/:id — authz > BUG: 非项目经理可删他人项目的风险项（DELETE /:id 缺 canManageProject 校验）
AssertionError: expected 200 to be 403
```

> 同文件「项目经理删自己项目的风险项应放行」用例当前已绿（200 + delete 被调用），证明 mock 设站正确。

## 交接约定（本报告即 PR 的 body）
- **Claude（修源码）**：在 `routes/riskItems.ts` 的 DELETE 处理器、存在性检查之后、`riskItem.delete` 之前，补「查项目 + canManageProject + 归档保护」三件套（复用 #84 POST 的同一段逻辑）；**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑确认两条用例均绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）
- [ ] BUG 用例转绿（403 + delete 未调用），经理用例保持绿
- 验证命令输出：<PASS 片段>
