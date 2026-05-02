# Week 6 Day 4：告警规则

## 当前落地范围

本次落地 Prometheus 告警规则模板，文件位于：

```text
ops/metrics/alert-rules.yml
```

`docker-compose.logging.yml` 已把规则文件挂载到 Prometheus，`ops/metrics/prometheus.yml` 会通过 `rule_files` 加载它。

本次不配置真实 Slack、钉钉、企微、短信、电话或邮件通道；真实通知通道需要 webhook、收件人或供应商密钥，按当前项目规则不写入仓库。

## 告警清单

| 告警                                 | 类型 | 阈值                    | 持续时间 | 说明                              |
| ------------------------------------ | ---- | ----------------------- | -------- | --------------------------------- |
| `AtlasHighLoginFailureRate`          | 业务 | 登录失败率 > 5%         | 10m      | 对应 ROADMAP 的注册失败率场景替代 |
| `AtlasCoreBusinessActionFailureRate` | 业务 | 核心写操作失败率 > 5%   | 10m      | 项目、活动、周报写操作            |
| `AtlasNoCoreBusinessActions`         | 业务 | 核心写操作 30m 为 0     | 30m      | 默认 info，需结合业务时段启用     |
| `AtlasApiScrapeDown`                 | 技术 | `/api/metrics` 抓取失败 | 2m       | Prometheus 无法抓取 Atlas API     |
| `AtlasHighHttp5xxRate`               | 技术 | HTTP 5xx > 1%           | 10m      | 对应 ROADMAP 的错误率告警         |
| `AtlasHighHttpP95Latency`            | 技术 | P95 > 1s                | 10m      | 对应 ROADMAP 的响应时间告警       |
| `AtlasApiHighProcessCpu`             | 技术 | API 进程 CPU > 0.8 core | 15m      | 使用 Node.js 默认指标             |
| `AtlasApiHighMemory`                 | 技术 | API RSS > 512 MiB       | 15m      | 需上线后按基线调阈值              |

## 和 ROADMAP 的适配说明

ROADMAP 中的部分示例不直接适用于 Atlas 当前代码：

| ROADMAP 示例                | 当前处理方式                                              |
| --------------------------- | --------------------------------------------------------- |
| 注册失败率 > 5%             | Atlas 当前没有开放注册流程，替换为登录失败率 > 5%         |
| 支付成功率下降 > 5%         | Atlas 当前没有支付模块，替换为核心业务写操作失败率 > 5%   |
| 关键页面 5 分钟无访问       | 当前没有前端 page view 指标，先用核心业务写操作零流量模板 |
| 磁盘 > 80%                  | 当前未接入 node_exporter / 主机磁盘指标，暂不启用         |
| SSL 证书 < 30 天到期        | 当前未接入 blackbox_exporter / 证书探测，暂不启用         |
| Slack / 钉钉 / 微信 webhook | 需要真实 webhook 或密钥，本次仅保留规则，不配置通道       |

## 本地验证

启动可观测性栈：

```bash
mkdir -p .logs
export GRAFANA_ADMIN_PASSWORD='replace-with-local-password' # pragma: allowlist secret
docker compose -f docker-compose.logging.yml up -d
```

打开 Prometheus：

```text
http://localhost:9090/alerts
```

应能看到 `atlas-business-alerts` 和 `atlas-technical-alerts` 两组规则。

本机如果没有 Docker Compose，可做静态验证：

```bash
python3 - <<'PY'
import yaml
from pathlib import Path

rules = yaml.safe_load(Path('ops/metrics/alert-rules.yml').read_text())
prometheus = yaml.safe_load(Path('ops/metrics/prometheus.yml').read_text())

assert prometheus['rule_files'] == ['/etc/prometheus/alert-rules.yml']
assert len(rules['groups']) == 2
assert sum(len(group['rules']) for group in rules['groups']) == 8
print('alert rules ok')
PY
```

## 通知通道建议

上线前建议由人工在目标环境配置 Alertmanager 或托管 Grafana Alerting，并用环境变量或平台密钥管理注入真实 webhook。

推荐分级：

| 严重级别   | 建议通道       | 说明                         |
| ---------- | -------------- | ---------------------------- |
| `critical` | 电话/短信 + IM | 服务不可用、5xx 持续升高     |
| `warning`  | IM / 邮件      | 延迟、业务失败率、资源风险   |
| `info`     | Dashboard / IM | 低流量、趋势观察、需人工确认 |

启用真实通知前，至少测试三类场景：

1. 人为关闭 Atlas API，确认 `AtlasApiScrapeDown` 触发。
2. 用测试流量制造 5xx，确认 `AtlasHighHttp5xxRate` 触发。
3. 用错误登录制造失败率，确认 `AtlasHighLoginFailureRate` 触发。

## Runbook

### atlas-high-login-failure-rate

1. 在 Loki 查询 `event=auth_login` 或认证路由相关错误日志。
2. 区分正常输错密码、禁用账号、参数校验失败和系统异常。
3. 如果同时出现 5xx 或数据库错误，按技术故障处理；否则先观察是否为用户行为或撞库风险。

### atlas-core-business-action-failure-rate

1. 在 Grafana 查看核心业务动作失败率面板，确认是项目、活动还是周报写操作。
2. 在 Loki 按 `requestId` 关联对应 4xx/5xx 日志。
3. 如果失败集中在权限/归档项目校验，先确认是否符合预期；如果是 5xx，按接口故障处理。

### atlas-no-core-business-actions

1. 先确认当前是否处于预期业务时间。
2. 查看 QPS、登录事件和前端访问情况，判断是自然低流量还是系统不可用。
3. 生产启用前应结合真实业务时段调大或关闭该规则，避免低流量时误报。

### atlas-api-scrape-down

1. 检查 Atlas API 是否运行，确认 `/api/health` 是否正常。
2. 检查 `METRICS_ENABLED=true` 是否在需要抓取的环境中显式设置。
3. 检查 Prometheus target 是否能访问 `host.docker.internal:3000/api/metrics` 或生产等价地址。

### atlas-high-http-5xx-rate

1. 在 Grafana 查看 5xx 是否集中在某个 route。
2. 在 Loki 按 route、level、requestId 查询错误日志。
3. 如果和最近发布相关，优先评估回滚；如果和外部依赖相关，检查熔断器和降级表现。

### atlas-high-http-p95-latency

1. 查看 P95 是否集中在特定 route。
2. 关联慢请求日志、数据库查询、文件上传或 AI 相关调用。
3. 如果只有少量长尾请求，先调阈值或拆分 route 维度；如果整体升高，按容量或依赖故障处理。

### atlas-api-high-process-cpu

1. 查看是否有 E2E、导入、批量操作或异常重试流量。
2. 检查日志中是否有循环重试、调度器或大数据量处理。
3. 上线后根据真实 CPU 核数和容器限制调整 0.8 core 阈值。

### atlas-api-high-memory

1. 查看是否有大文件导入、批量导出或长时间运行任务。
2. 观察 RSS 是否持续增长；若持续上升，优先排查缓存、文件 buffer 和未释放对象。
3. 上线后根据容器内存限制调整 512 MiB 阈值。

## 后续补强

- 接入前端 page view 指标后，把 `AtlasNoCoreBusinessActions` 拆成关键页面访问告警和核心写操作告警。
- 接入 node_exporter 后，补充主机 CPU、磁盘、网络告警。
- 接入 blackbox_exporter 后，补充 SSL 证书到期告警。
- 在预生产环境配置真实通知通道，并保留告警触发和送达截图作为上线验收证据。
