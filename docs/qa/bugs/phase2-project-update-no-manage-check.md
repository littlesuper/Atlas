# [BUG] project.update execute 不校验当前用户是否仍为项目经理

- 严重度：P1（安全——权限旁路，非项目经理可改项目字段）
- 发现者：GLM QA
- 日期：2026-06-15
- 模块：assistant / capability / projectUpdate

## 复现步骤
1. 用户 A 是项目 P 的经理。A 通过 AI 助手发起 `project.update`（如"把优先级改成高"），获得 proposalId。
2. 管理员将 P 的经理从 A 改为 B（仅改 `managerId`，其余字段不变）。
3. 用户 A 调用 `capabilityApply` 应用该提议。
4. `capabilityApply` 的指纹复核通过——**因为指纹不含 `managerId`**（仅 name|status|priority|startDate|endDate）。
5. `projectUpdate.execute` 直接 `prisma.project.update`——**无 `canManageProject` 校验**。
6. 用户 A（已非项目经理）成功修改了项目 P 的优先级。

## 期望行为
- `loadEntity` 应 select `managerId` 并纳入指纹；经理变更应触发 `VersionMismatchError`。
- 或 `execute` 应像 `createActivityCore` 那样调用 `canManageProject(req, managerId, projectId)` 拦截非管理者。
- 安全铁律③："apply 复用各模块已有的 service/路由（自带权限）"——当前 `project.update` 的 execute 绕过了项目路由的 `canManageProject` 中间件。

## 实际行为
`projectUpdate.ts` 的三层缺口：
1. `loadEntity` 的 `select` 不含 `managerId`（line 53）。
2. 指纹函数 `fp()` 不含 `managerId`（line 41）。
3. `execute` 无 `canManageProject` 调用（line 101-110）。

对比：`activityCreate.ts` 的 execute 委托 `createActivityCore`，后者有完整的归档 + `canManageProject` 校验。`projectUpdate` 缺失等价保护。

## 失败测试（交接契约）
- 路径：`server/src/services/assistant/capability/projectUpdate.test.ts`
- 运行命令：`cd server && npx vitest run src/services/assistant/capability/projectUpdate.test.ts -t "BUG"`
- 当前失败输出（关键片段）：

```
FAIL  src/services/assistant/capability/projectUpdate.test.ts > execute > BUG: 非项目经理仍可通过 AI 能力更新项目（execute 缺 canManageProject 校验）
Number of calls: 1
  expect(mockPrisma.project.update).not.toHaveBeenCalled();
```

## 交接约定（本报告即 PR 的 body）
- **Claude（修源码）**：只改源码让测试自然变绿；**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑确认绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）
- [ ] 同一测试已转绿，且测试本身未被修改
- 验证命令输出：<PASS 片段>
