# [BUG] refresh 换发令牌漏查 canLogin，撤销登录权限不生效

- 严重度：P2（安全——会话生命周期缺陷，管理员撤销访问存在最长 7 天窗口期）
- 发现者：GLM QA
- 日期：2026-06-16
- 模块：routes / auth / session

## 复现步骤
1. 用户 `user-1` 是可登录用户（`canLogin:true, status:ACTIVE`），持有有效 `refreshToken`（有效期 7 天，`REFRESH_TOKEN_EXPIRES_IN='7d'`）。
2. 管理员将该用户改为「仅联系人」（`canLogin:false`）以撤销其系统访问（`PUT /api/users/:id`，users.ts:382 会写 `canLogin`）。
3. `user-1`（或窃取其 refreshToken 的攻击者）调用 `POST /api/auth/refresh`。
4. refresh 处理器（`routes/auth/session.ts:145-157`）只检查 `user.status === 'DISABLED'`——**不检查 `canLogin`**。
5. 返回 `200 { accessToken }`——撤销访问在 refreshToken 剩余有效期内（最长 7 天）不生效。

## 期望行为
与登录路径（`session.ts:46-49`）对齐——登录对 `canLogin===false` 返回 `403 该账号未开启登录权限`。refresh 既然已检查 `DISABLED`（证明作者意图让 refresh 遵守账号生命周期标记），就应一并检查 `canLogin`：

```ts
if (!user.canLogin) {
  res.status(403).json({ error: '该账号未开启登录权限' });
  return;
}
```

`canLogin:false` 用户的 refresh 请求应返回 **403** 且不签发新 `accessToken`。

## 实际行为
`session.ts:154-157` 仅 `if (user.status === 'DISABLED')`。`canLogin` 字段在 refresh 路径完全未被读取——撤销可登录用户的登录权限后，其已签发的 refreshToken 仍可不断换发 accessToken。这与登录路径形成不对称：login 挡、refresh 不挡。

## 失败测试（交接契约）
- 路径：`server/src/routes/auth.refresh.test.ts`
- 运行命令：`cd server && npx vitest run src/routes/auth.refresh.test.ts -t "BUG"`
- 当前失败输出（关键片段）：

```
FAIL  src/routes/auth.refresh.test.ts > POST /api/auth/refresh — canLogin 门控 > BUG: canLogin=false 的用户仍可用 refreshToken 换发 accessToken（refresh 漏 canLogin 门控）
AssertionError: expected 200 to be 403
 - Expected: 403
 + Received: 200
```

> 同文件另两条用例当前已绿：
> - 「可登录的 ACTIVE 用户刷新令牌应放行」→ 200 + accessToken（happy path 未被破坏）；
> - 「DISABLED 用户刷新令牌仍被拦截」→ 403（既有 DISABLED 保护确认仍在）。
>
> 三条合起来精确钉死：缺口仅在 `canLogin` 这一个标记。

## 交接约定（本报告即 PR 的 body）
- **Claude（修源码）**：在 `routes/auth/session.ts` 的 refresh 处理器、`DISABLED` 检查旁补 `canLogin` 门控（与 login 路径同一文案/同一 403 语义）；**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑确认三条用例全绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）
- [ ] BUG 用例转绿（403 + `jwt.sign` 未调用），ACTIVE 放行与 DISABLED 拦截两条保持绿
- 验证命令输出：<PASS 片段>
