# Week 6 Day 1-2：日志聚合

## 目标

把 Atlas 生产环境的 JSON 日志接入可查询的日志系统，并提供常用查询，让 AI 守护人能快速判断错误、慢请求和单次请求链路。

## 当前选择

本仓库先落地自托管 Loki + Promtail + Prometheus + Grafana 模板，原因：

- 不需要写入第三方 token 或生产密钥。
- 适配现有裸机部署：`deploy.sh` 已把服务日志写到 `.logs/app.log` 和 `.logs/error.log`。
- Loki 配置了 30 天保留期，符合 Week 6 验收里的“至少能查询 30 天历史日志”。
- Grafana 通过 provisioning 自动配置 Loki / Prometheus 数据源和 Atlas dashboard。

这套模板不会自动影响线上服务；只有显式执行 Docker Compose 命令才会启动日志聚合栈。

## 启动方式

```bash
mkdir -p .logs
export GRAFANA_ADMIN_PASSWORD='replace-with-local-password' # pragma: allowlist secret
docker compose -f docker-compose.logging.yml up -d
docker compose -f docker-compose.logging.yml ps
```

Grafana 地址：

```text
http://localhost:3002
```

本地默认账号：

```text
admin / 使用 GRAFANA_ADMIN_PASSWORD 环境变量设置的值
```

## 验证采集

写入一条模拟 Atlas JSON 日志：

```bash
mkdir -p .logs
printf '%s\n' '{"timestamp":"2026-05-02T00:00:00.000Z","level":"error","trace_id":"trace-demo","user_id":"user-demo","message":"demo error","context":{"method":"GET","url":"/api/health","status_code":500,"duration_ms":1200}}' >> .logs/app.log
```

在 Grafana Explore 里选择 `Atlas Loki`，运行：

```logql
{service="atlas"} | json | trace_id="trace-demo"
```

## 常用查询

错误日志：

```logql
{service="atlas", level="error"}
```

5xx 请求：

```logql
{service="atlas"} | json status_code="context.status_code" | status_code >= 500
```

慢请求（超过 1s）：

```logql
{service="atlas"} | json duration_ms="context.duration_ms" | duration_ms > 1000
```

按 trace_id 查一次请求：

```logql
{service="atlas"} | json | trace_id="替换为实际 trace_id"
```

按用户定位问题：

```logql
{service="atlas"} | json | user_id="替换为实际 user_id"
```

最近 5 分钟错误量：

```logql
sum(count_over_time({service="atlas", level="error"}[5m]))
```

P95 请求耗时：

```logql
quantile_over_time(0.95, {service="atlas"} | json duration_ms="context.duration_ms" | unwrap duration_ms [5m])
```

## 标签约束

Promtail 只把 `service`、`environment`、`stream`、`level` 作为 Loki 标签。`trace_id` 和 `user_id` 保留为 JSON 字段用于查询，但不作为标签，避免高基数标签导致 Loki 成本和性能问题。

## 生产接入注意事项

- 生产环境需要把 `environment: local` 改为 `production` 或通过部署模板注入。
- 如果改用 Datadog / CloudWatch / BetterStack，需要由运维提供目标地址和 token；不要把 token 写入仓库。
- Grafana 默认密码只适用于本地模板，正式环境必须改成环境变量或密钥管理。
- 日志中仍应只输出结构化字段，禁止手写拼接 password、token、cookie、authorization 等敏感信息。
