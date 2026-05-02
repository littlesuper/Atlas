# Atlas 降级开关清单

> 用途：事故时 1 分钟内判断哪些功能可以关闭，哪些不能关闭。生产环境不使用本地 override 接口，真实开关应通过 Unleash 控制台 / Frontend API / Edge 调整。

## Feature Flag 降级

| Flag | 默认值 | 关闭影响 | 是否核心路径 | 首选事故动作 |
| ---- | ------ | -------- | ------------ | ------------ |
| `atlas.ai.assistance` | `false` | 关闭 AI 配置、AI 周报建议、AI 排期建议、AI 风险增强；规则兜底仍可用 | 否 | AI 异常、外部 AI 延迟、成本异常时关闭 |
| `atlas.wecom.login` | `false` | 隐藏企业微信登录和企微配置；账号密码登录仍可用 | 否 | 企微 OAuth 异常、回调失败时关闭 |
| `atlas.project.templates` | `false` | 隐藏项目模板管理和模板创建项目；手动创建项目仍可用 | 否 | 模板生成活动异常时关闭 |
| `atlas.risk.dashboard` | `false` | 隐藏跨项目风险总览；单项目基础风险仍可访问 | 否 | 风险总览慢查询或 500 时关闭 |
| `atlas.workload.dashboard` | `false` | 隐藏项目资源负载看板；活动基础流程仍可用 | 否 | 负载看板性能异常时关闭 |
| `atlas.holiday.management` | `false` | 隐藏节假日管理后台；已有工作日计算兜底仍可用 | 否 | 节假日生成/管理异常时关闭 |
| `atlas.week7.demo` | `false` | 仅影响 Week 7 冒烟验证 | 否 | 任何异常均可关闭 |

## 不建议降级的核心路径

这些功能当前不应该通过 Feature Flag 关闭：

- 登录基础流程。
- 用户、角色、权限基础管理。
- 项目列表、项目详情。
- 活动列表、活动编辑。
- 产品基础管理。
- 周报基础流程。
- 审计日志。

如果上述核心路径异常，优先使用 `docs/qa/rollback-runbook.md` 做代码回滚，而不是试图临时隐藏入口。

## 操作顺序

1. 确认异常是否只影响某个可选模块。
2. 找到对应 Flag。
3. 在 Unleash 中关闭该 Flag 或把 rollout 降到 0%。
4. 等待前端 refresh interval 和后端 SDK 更新。
5. 验证核心路径恢复。
6. 在事故时间线记录开关变更。

## 非生产本地验证

仅用于本地或测试环境：

```bash
FEATURE_FLAGS_ALLOW_LOCAL_OVERRIDE=true npm run dev:server

curl -X PATCH http://localhost:3000/api/feature-flags/atlas.week7.demo \
  -H 'Content-Type: application/json' \
  -d '{"enabled":false}'
```

生产环境不要开启 `FEATURE_FLAGS_ALLOW_LOCAL_OVERRIDE=true`。
