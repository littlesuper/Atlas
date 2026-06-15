# [BUG] 周报同周重复创建：P2002 唯一约束被 catch 吞成 500（WR-001 期望 409）

- 严重度：P0（test-plan WR-001 为 P0；API 状态码契约违约 + 把可预期业务冲突伪装成服务端故障）
- 发现者：GLM QA
- 日期：2026-06-15
- 模块：weeklyReports（`POST /api/weekly-reports`，crud.ts 创建处理器）

## 复现步骤

`server/prisma/schema.prisma:439` 有 `@@unique([projectId, year, weekNumber])`，因此对同一项目同一周重复创建周报时，Prisma 抛出唯一约束错误（`code: 'P2002'`）。

但 `server/src/routes/weeklyReports/crud.ts` 的创建处理器（约 213-217 行）用单一 `catch` 兜底：

```ts
} catch (error) {
  logger.error({ err: error }, '创建周报错误');
  res.status(500).json({ error: '服务器内部错误' });
}
```

`catch` 不识别 `error.code === 'P2002'`，把它和真正的服务端异常一并返回 **500「服务器内部错误」**。

## 期望行为

test-plan **WR-001**（P0）：同周重复创建应返回 **409/400** + 明确的业务提示（如「本周已有周报」）。唯一约束冲突是可预期的业务场景，不应伪装成 5xx 服务端故障。

## 实际行为

返回 **500「服务器内部错误」**。用户/前端无法区分「这周已经填过」与「服务器真崩了」，体验与契约均不对。

## 影响面

- 用户重复提交同周周报 → 看到「服务器内部错误」，不知道其实是「本周已存在」，会反复重试 / 误判系统故障。
- 前端若按状态码分支（4xx 提示用户、5xx 告警运维），此处会把业务冲突误报为服务端事故。
- 同样的「单一 catch 吞 P2002」模式可能存在于其它带唯一约束的创建路径（建议 Claude 顺手扫一遍，但本 PR 只复现 weeklyReport 这一处）。

## 失败测试（交接契约）

- 路径：`server/src/routes/weeklyReports.test.ts`
  - `describe`：`Weekly Reports Routes` > `POST /api/weekly-reports`
  - 用例：`GLM QA bug repro #5: 同周重复创建应返回 409（P2002 唯一约束），而非被 catch 吞成 500（WR-001）`
- 运行命令：

```bash
cd server && npx vitest run src/routes/weeklyReports.test.ts -t "GLM QA bug repro #5"
```

- 当前失败输出（关键片段）：

```
 FAIL  src/routes/weeklyReports.test.ts > Weekly Reports Routes > POST /api/weekly-reports > GLM QA bug repro #5: ...
AssertionError: expected 500 to be 409 // Object.is equality

 Tests  1 failed | 50 skipped (51)
```

> 测试手法：mock `prisma.weeklyReport.create` 抛出带 `code: 'P2002'` 的 error（模拟 `@@unique` 命中），断言响应 409。当前 catch 不识别 P2002 → 返回 500。

## 交接约定（本报告即 PR 的 body）

- **Claude（修源码）**：只改 `server/src/routes/weeklyReports/crud.ts` 创建处理器的 `catch`，识别 `error.code === 'P2002'`（或用 Prisma 的 `PrismaClientKnownRequestError`）返回 **409** + 明确提示（如「本周该项目已存在周报」）；其它异常仍走 500。**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。建议顺手核查其它创建路由有无同款「吞 P2002」模式。
- **GLM（复测）**：复跑 `cd server && npx vitest run src/routes/weeklyReports.test.ts` 确认全绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）

- [ ] 同一测试已转绿，且测试本身未被修改
- 验证命令输出：<PASS 片段>
