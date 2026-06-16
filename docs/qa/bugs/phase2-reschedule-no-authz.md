# [BUG] 一键重排（reschedule）完全缺失项目权限校验

- 严重度：P1（安全——IDOR 越权写，任意已登录用户可改任意项目排期）
- 发现者：GLM QA
- 日期：2026-06-16
- 模块：routes / activities / schedule

## 复现步骤
1. 用户 `stranger` 仅登录（`authenticate`），与项目 `p1` 无任何关系（非管理员、非项目经理、非协作者）。
2. `stranger` 调用 `POST /api/activities/project/p1/reschedule`，body `{ baseDate: '2026-01-05' }`。
3. 该路由（`routes/activities/schedule.ts:163`）的中间件链**只有 `authenticate`**：没有 `requirePermission`、没有 `canManageProject`、没有项目存在性检查、没有归档保护。
4. 路由直接 `prisma.activity.findMany({ where: { projectId } })` 取出 `p1` 全部未完成活动，重算 `planStartDate/planEndDate/planDuration` 后 `prisma.$transaction(...)` 批量 `activity.update` 写库。
5. 返回 `200 { success: true, updatedCount: N }`——`p1`（他人项目）的排期被陌生人覆写。

## 期望行为
与同文件 `POST /project/:projectId/what-if/apply`（`schedule.ts:385-399`）保持一致的门控：

```ts
router.post('/project/:projectId/reschedule', authenticate, requirePermission('activity', 'update'), async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) { res.status(404)... return; }
  if (!canManageProject(req, project.managerId, projectId)) { res.status(403)... return; }
  // （建议同 what-if/apply 一并加归档保护）
  ...
});
```

非项目经理应返回 **403**，且不触发任何写库。

## 实际行为
`schedule.ts:163` 的 reschedule 处理器在写库前**零权限校验**——`canManageProject` 在该文件里只被 `what-if/apply` 调用（line 397），reschedule 从未调用。任意已登录用户可一键重排任意项目（含归档项目）的全部排期，等同于批量破坏他人数据。

## 失败测试（交接契约）
- 路径：`server/src/routes/activities.reschedule.test.ts`
- 运行命令：`cd server && npx vitest run src/routes/activities.reschedule.test.ts -t "BUG"`
- 当前失败输出（关键片段）：

```
FAIL  src/routes/activities.reschedule.test.ts > POST /api/activities/project/:projectId/reschedule — authz > BUG: 非项目经理可一键重排任意项目排期（reschedule 缺 canManageProject 校验）
AssertionError: expected 200 to be 403
 - Expected: 403
 + Received: 200
```

> 同文件「经理重排自己的项目应放行」用例当前已绿（200 + `$transaction` 被调用），证明 mock 设站正确、路由功能正常；缺口仅在非经理身份未被拦截。

## 交接约定（本报告即 PR 的 body）
- **Claude（修源码）**：在 `routes/activities/schedule.ts` 的 reschedule 处理器加 `requirePermission('activity','update')` + `canManageProject` 门控（建议同 what-if/apply 一并补归档保护）；**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑确认两条用例均绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）
- [ ] BUG 用例转绿（403 + `$transaction` 未调用），经理用例保持绿
- 验证命令输出：<PASS 片段>
