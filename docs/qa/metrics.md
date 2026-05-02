# Week 6 Day 3：监控指标

## 当前落地范围

本次先落地 Atlas 服务端 Prometheus 指标基础：

- `/api/metrics` 指标端点。
- HTTP 技术指标：请求数、状态码、响应时间直方图。
- Node.js 默认运行时指标：CPU、内存、GC、event loop 等。
- 业务指标：登录成功、失败、禁用、参数错误等结果计数。

生产环境默认不暴露 `/api/metrics`。如果需要被 Prometheus 抓取，必须显式设置：

```bash
METRICS_ENABLED=true
```

开发和测试环境默认允许访问，便于本地验证。

## 指标列表

HTTP 请求总数：

```text
atlas_http_requests_total{method,route,status_code}
```

HTTP 请求耗时：

```text
atlas_http_request_duration_seconds_bucket{method,route,status_code}
atlas_http_request_duration_seconds_sum{method,route,status_code}
atlas_http_request_duration_seconds_count{method,route,status_code}
```

业务事件：

```text
atlas_business_events_total{event,result}
```

当前已埋点：

| event                  | result                                                    |
| ---------------------- | --------------------------------------------------------- |
| `auth_login`           | `success`                                                 |
| `auth_login`           | `validation_failed` / `invalid_user` / `invalid_password` |
| `auth_login`           | `forbidden` / `disabled` / `error`                        |
| `project_create`       | `success` / `error`                                       |
| `activity_create`      | `success`                                                 |
| `weekly_report_create` | `success` / `forbidden`                                   |
| `weekly_report_submit` | `success`                                                 |

## 标签约束

`route` 使用 Express 路由模板，例如 `/api/projects/:id`，避免把真实 ID 放进标签。`user_id`、`trace_id` 不进入 Prometheus 标签，避免高基数问题；单次请求追踪应走 Loki 日志查询。

## 常用 PromQL

QPS：

```promql
sum(rate(atlas_http_requests_total[5m]))
```

按路由查看 QPS：

```promql
sum by (route) (rate(atlas_http_requests_total[5m]))
```

错误率：

```promql
sum(rate(atlas_http_requests_total{status_code=~"5.."}[5m]))
/
sum(rate(atlas_http_requests_total[5m]))
```

P95 响应时间：

```promql
histogram_quantile(
  0.95,
  sum by (le, route) (rate(atlas_http_request_duration_seconds_bucket[5m]))
)
```

登录失败率：

```promql
sum(rate(atlas_business_events_total{event="auth_login",result!="success"}[5m]))
/
sum(rate(atlas_business_events_total{event="auth_login"}[5m]))
```

核心业务动作吞吐：

```promql
sum by (event, result) (
  rate(atlas_business_events_total{event=~"project_create|activity_create|weekly_report_create|weekly_report_submit"}[5m])
)
```

核心业务动作失败率：

```promql
sum(rate(atlas_business_events_total{event=~"project_create|activity_create|weekly_report_create|weekly_report_submit",result!="success"}[5m]))
/
sum(rate(atlas_business_events_total{event=~"project_create|activity_create|weekly_report_create|weekly_report_submit"}[5m]))
```

## 本地验证

启动后端时显式打开本地指标端点：

```bash
METRICS_ENABLED=true npm run dev:server
```

访问指标端点：

```bash
curl http://localhost:3000/api/metrics
```

应能看到 `atlas_http_requests_total`、`atlas_http_request_duration_seconds`、`atlas_business_events_total` 等指标。

生产环境如未设置 `METRICS_ENABLED=true`，该端点返回 404。

## 本地 Prometheus + Grafana

启动可观测性栈：

```bash
mkdir -p .logs
export GRAFANA_ADMIN_PASSWORD='replace-with-local-password' # pragma: allowlist secret
docker compose -f docker-compose.logging.yml up -d
```

本地地址：

| 工具       | 地址                    |
| ---------- | ----------------------- |
| Prometheus | `http://localhost:9090` |
| Grafana    | `http://localhost:3002` |

Prometheus 本地抓取 `host.docker.internal:3000/api/metrics`。Grafana 会自动加载 `Atlas Prometheus` 数据源和 `Atlas Observability` dashboard。

如果在 Linux 上运行且 Docker 不支持 `host.docker.internal`，需要把 Prometheus target 改成宿主机可访问的 IP 或把 Atlas 服务加入同一个 Compose 网络。

## 告警规则

Week 6 Day 4 已新增 Prometheus 告警规则模板，详见 `docs/qa/alerts.md`。
