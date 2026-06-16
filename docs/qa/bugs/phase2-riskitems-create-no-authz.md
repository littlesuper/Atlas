# [BUG] 创建风险项（POST /api/risk-items）缺失项目权限与归档校验

- 严重度：P1（安全——IDOR 越权写，任意已登录用户可向任意项目注入风险项）
- 发现者：GLM QA
- 日期：2026-06-16
- 模块：routes / riskItems

## 复现步骤
1. 用户 `stranger` 仅登录，与项目 `p1` 无任何关系（非管理员 / 非项目经理 / 非协作者）。
2. `stranger` 调用 `POST /api/risk-items`，body `{ projectId: 'p1', title: '被植入的风险', severity: 'CRITICAL' }`。
3. 路由（`routes/riskItems.ts:74`）中间件链为 `authenticate + validate(createRiskItemSchema)`——**无 `canManageProject`、无 `rejectIfArchived`、无项目存在性查询**。
4. 处理器直接 `prisma.riskItem.create({ data: { projectId, ... } })`（line 83-93）并写一条 `CREATED` 日志（line 100-107）。
5. 返回 `201` + 新风险项——`p1`（他人项目）被注入了一条 `CRITICAL` 风险项，且带有合法的 `RiskItemLog`，看起来像内部操作。

## 期望行为
与同类写路径保持一致（`activities/crud.ts`、`products/crud.ts:170-176`、`weeklyReports/crud.ts:165/256` 均查项目 + `canManageProject` + 归档 403）：

```ts
const project = await prisma.project.findUnique({ where: { id: projectId }, select: { managerId: true, status: true } });
if (!project) { res.status(404).json({ error: '项目不存在' }); return; }
if (project.status === 'ARCHIVED') { res.status(403).json({ error: '归档项目不可修改' }); return; }
if (!canManageProject(req, project.managerId, projectId)) { res.status(403).json({ error: '无权操作' }); return; }
```

非项目经理应返回 **403**，不创建风险项、不写日志。

## 实际行为
`riskItems.ts:74-113` 的 POST 处理器把 body 里的 `projectId` 原样写入，前置零项目级校验。后果有三：
1. **越权注入**：任意已登录用户可向任意项目植入风险项（可设 `CRITICAL` 制造噪音，或后续 `PUT` 把他人风险项标 `RESOLVED` 掩盖真问题——见同文件 `PUT /:id` 同源缺陷）。
2. **绕过归档保护**：可向 `ARCHIVED` 项目写入（其他模块写路径均 403 拒绝）。
3. **错误码契约破裂**：传入不存在的 `projectId` 会触发 Prisma 外键约束 `P2003`，被通用 `catch` 吞成 **500**（应为 400/404）。

## 失败测试（交接契约）
- 路径：`server/src/routes/riskItems.create.test.ts`
- 运行命令：`cd server && npx vitest run src/routes/riskItems.create.test.ts -t "BUG"`
- 当前失败输出（关键片段）：

```
FAIL  src/routes/riskItems.create.test.ts > POST /api/risk-items — authz > BUG: 非项目经理可向他人项目注入风险项（POST / 缺 canManageProject 校验）
AssertionError: expected 201 to be 403
 - Expected: 403
 + Received: 201
```

> 同文件「项目经理创建自己项目的风险项应放行」用例当前已绿（201 + `riskItem.create` 被调用），证明 mock 设站正确；缺口仅在非经理身份未被拦截。

## 交接约定（本报告即 PR 的 body）
- **Claude（修源码）**：在 `routes/riskItems.ts` 的 POST 处理器补「查项目 + `canManageProject` + 归档保护」三件套（建议同源修补 `PUT /:id`、`DELETE /:id`、`POST /from-assessment/:assessmentId`）；**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑确认两条用例均绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）
- [ ] BUG 用例转绿（403 + `riskItem.create`/`riskItemLog.create` 未调用），经理用例保持绿
- 验证命令输出：<PASS 片段>
