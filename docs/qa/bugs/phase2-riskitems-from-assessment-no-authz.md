# [BUG] 从评估创建风险项（POST /api/risk-items/from-assessment/:assessmentId）缺失项目权限与归档校验

- 严重度：P1（安全——IDOR 越权写，任意登录用户可借他人评估向项目注入风险项）
- 发现者：GLM QA
- 日期：2026-06-16
- 模块：routes / riskItems
- 同源：与 #84（POST 创建缺校验）同病；本 PR 覆盖 POST /from-assessment/:assessmentId

## 复现步骤
1. 用户 `stranger` 仅登录，与项目 `p1`（`managerId='owner-1'`）无任何关系。
2. `p1` 有一次 AI 风险评估 `as-1`（含 `aiEnhancedData.actionItems`）。
3. `stranger` 知道 `as-1`（assessmentId 是可枚举的 UUID），调用 `POST /api/risk-items/from-assessment/as-1`。
4. 路由（`routes/riskItems.ts:304-370`）只 `riskAssessment.findUnique({ where: { id: assessmentId } })` 查存在性——`assessment.projectId` 已在手却**从不用于权限判定**，无 `canManageProject`、无项目查询、无归档保护。
5. 直接用 `assessment.projectId` 循环 `riskItem.create` + `riskItemLog.create`（`source: 'ai'`，看起来像系统自动创建）。
6. 返回 `201 { created: N, items: [...] }`——他人项目被注入 AI 来源的风险项。

## 期望行为
与 #84 修复后的 POST 对齐——在创建循环之前补「查项目 + canManageProject + 归档保护」三件套（用 `assessment.projectId` 查项目）。

非项目经理应返回 **403**，不创建风险项、不写日志。

## 实际行为
`riskItems.ts:304-370` 的 from-assessment 处理器前置零项目级校验。任意登录用户知道一个 assessmentId 即可向该项目注入风险项（含归档项目）——且 `source: 'ai'` 使注入看起来像合法的系统自动创建。

## 失败测试（交接契约）
- 路径：`server/src/routes/riskItems.fromAssessment.test.ts`
- 运行命令：`cd server && npx vitest run src/routes/riskItems.fromAssessment.test.ts -t "BUG"`
- 当前失败输出（关键片段）：

```
FAIL  src/routes/riskItems.fromAssessment.test.ts > POST /api/risk-items/from-assessment/:assessmentId — authz > BUG: 非项目经理可借他人评估向项目注入风险项（from-assessment 缺 canManageProject 校验）
AssertionError: expected 201 to be 403
```

> 同文件「项目经理从自己项目的评估创建风险项应放行」用例当前已绿（201 + create 被调用），证明 mock 设站正确。

## 交接约定（本报告即 PR 的 body）
- **Claude（修源码）**：在 `routes/riskItems.ts` 的 from-assessment 处理器、`riskAssessment.findUnique` 存在性 + actionItems 检查之后、创建循环之前，补「查项目 + canManageProject + 归档保护」三件套（复用 #84 POST 的同一段逻辑，用 `assessment.projectId`）；**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑确认两条用例均绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）
- [ ] BUG 用例转绿（403 + create/log 未调用），经理用例保持绿
- 验证命令输出：<PASS 片段>
