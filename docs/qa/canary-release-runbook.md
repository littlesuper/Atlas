# Atlas 灰度发布 Runbook

> 适用范围：Week 7 发布与应急。当前 Atlas 生产部署是单机 `systemd + tsx + SQLite`，仓库内没有负载均衡或多副本路由配置，因此本 Runbook 采用 **Feature Flag 灰度** 作为当前可落地方案。

## 当前策略

- 发布包仍按现有部署方式上线到 staging / production。
- 新功能必须先由 Feature Flag 默认关闭保护。
- 灰度阶段通过 Unleash 的百分比 rollout 或用户分组完成：`5% -> 25% -> 50% -> 100%`。
- 每个阶段至少观察 30 分钟。
- GitHub Actions 提供手动 `Canary Release Gate`，用于记录阶段、检查 `/api/health`、评估指标阈值。
- 当前没有真实流量切分层，不能声明“按部署实例自动 5% 分流”。

## 发布前条件

- PR required checks 全部通过：`lint`、`security`、`test`、`e2e-core`。
- 本次变更涉及的新功能已经接入 Feature Flag。
- staging 已部署待发布版本，并完成核心路径冒烟。
- 发布负责人已准备回滚方案和负责人联系方式。
- 本次发布不包含未演练过的数据库破坏性迁移。

## 阶段流程

| 阶段 | 操作 | 最少观察 | 通过条件 |
| ---- | ---- | -------- | -------- |
| 5% | 开启目标 Feature Flag 的 5% rollout | 30 分钟 | 错误率、健康检查、核心用户反馈正常 |
| 25% | 将 rollout 提升到 25% | 30 分钟 | 指标不劣化，未出现 P0/P1 |
| 50% | 将 rollout 提升到 50% | 30 分钟 | 指标不劣化，客服/业务无集中反馈 |
| 100% | 全量开启 | 30 分钟 | 发布后继续观察 24 小时 |

## GitHub 手动闸门

在 GitHub Actions 中运行 `Canary Release Gate`：

```bash
gh workflow run canary-release.yml \
  -f stage=5 \
  -f target_url=https://staging.example.com \
  -f release_ref=main \
  -f metrics_json='{"errorRate":0.001,"p95Ms":320,"successRate":0.999}'
```

本地干跑：

```bash
npm run release:canary-gate -- --stage 5 --skip-health --metrics-file /tmp/canary-metrics.json
```

不提供 `metrics_json` 时，闸门至少检查 `/api/health` 是否可访问，且响应时间不超过默认阈值。

## 指标阈值

默认阈值由 `scripts/canary-gate.mjs` 执行：

| 指标 | 默认阈值 | 说明 |
| ---- | -------- | ---- |
| `/api/health` 响应 | `<= 1000ms` | 健康检查必须返回 2xx 且 `status=ok` |
| 错误率 | `<= 1%` | 来自监控系统或人工统计 |
| p95 延迟 | `<= 1000ms` | 业务接口优先看核心路径 |
| 成功率 | `>= 99%` | 可用性守门指标 |

如果任一指标不通过，不进入下一阶段。

## 回滚标准

出现任一情况立即停止放量：

- P0/P1 缺陷。
- 登录、项目、活动、产品、周报等核心路径不可用。
- 错误率超过阈值或持续上升。
- p95 延迟超过阈值并持续 5 分钟以上。
- 数据写入异常、权限异常、审计日志异常。

首选止血动作：

1. 关闭相关 Feature Flag。
2. 如果无法通过 Feature Flag 隔离，执行回滚 Runbook。
3. 回滚后保留现场日志，进入事故复盘。

## 当前限制

- 仓库没有 staging / production 的真实 URL、部署密钥或负载均衡配置。
- GitHub workflow 只做手动闸门和指标判断，不会自动执行真实部署或真实回滚。
- 真正的“指标恶化自动回滚”需要接入监控系统和部署平台 API 后才能实现。

## 下一步

- 给 `deploy.sh` 补齐代码版本回滚命令。
- 在 staging 做一次真实回滚演练，并记录耗时。
- 将演练结果归档到 `docs/qa/reports/`。
