# Atlas 发布与应急 Runbook

> 目标：发布前能自动判断是否可以继续，事故发生时能快速采集上下文并进入止血路径。

## 发布前 10 分钟

1. 确认发布版本、负责人和值班人。
2. 运行发布前健康门禁：

```bash
npm run release:precheck --workspace=server -- --base-url http://localhost:3000
```

3. 只有报告为 `GO` 时继续发布；`NO_GO` 时暂停发布，先查看失败的 `checks[]`。
4. 如本次发布涉及数据库迁移，确认备份、迁移状态和回滚/前向修复方案。
5. 发布前准备事故上下文采集命令，保留在终端历史中。
6. 如本次发布包含可灰度功能，确认 `FEATURE_FLAGS` 已按默认关闭或小范围开启配置。

## Feature Flag 配置

当前最小实现由服务端环境变量驱动，适合作为正式 Feature Flag 平台接入前的止血层。

JSON 配置：

```env
FEATURE_FLAGS='{"risk.ai":true,"weekly-report":false}'
```

逗号简写：

```env
FEATURE_FLAGS="risk.ai,!weekly-report"
```

只读检查：

```bash
curl http://localhost:3000/api/feature-flags
```

响应会返回当前 `flags`、已登记 `definitions` 和 `unknownFlags`。definitions 包括 owner、默认值、风险等级和止血说明；`unknownFlags` 非空时，`release:precheck` 和 `release:observe` 会返回 `NO_GO`，发布前必须修正拼写或补登记，避免悬空开关造成误判。未知 flag 默认关闭；出现事故时优先把相关 flag 改为关闭并重启服务，再决定是否需要应用版本回滚。

## 已接入高风险开关

| Flag | 默认 | 影响范围 | 止血方式 |
| --- | --- | --- | --- |
| `ai.external-calls` | 开启 | 后端所有外部 AI API 调用，包括风险评估、周报建议、AI 排计划等统一 `callAi` 出口 | 设置 `FEATURE_FLAGS="!ai.external-calls"` 并重启服务，系统会回退到规则引擎或空 AI 结果 |
| `activity.import` | 开启 | 活动 Excel 导入批量写入入口；项目详情页批量导入菜单和上传动作会读取快照并禁用/提示 | 设置 `FEATURE_FLAGS="!activity.import"` 并重启服务，导入接口会返回 `FEATURE_DISABLED`，其他活动管理能力保持可用 |
| `activity.bulk-mutation` | 开启 | 活动批量更新与批量删除入口；项目详情页批量状态/阶段/负责人/删除控件会读取快照并禁用/提示 | 设置 `FEATURE_FLAGS="!activity.bulk-mutation"` 并重启服务，批量变更会返回 `FEATURE_DISABLED`，单条活动操作保持可用 |

前端在项目详情页加载时会读取 `/api/feature-flags`。如果快照接口短暂不可用，前端按默认开启处理，最终仍由后端开关兜底阻断。

## 发布后 30 分钟

1. 启动发布后观察脚本，默认每 5 分钟检查一次，连续 6 次覆盖 30 分钟窗口：

```bash
npm run release:observe --workspace=server -- --base-url http://localhost:3000
```

如需本地快速验证，可缩短次数和间隔：

```bash
npm run release:observe --workspace=server -- --base-url http://localhost:3000 --checks 1 --interval-ms 0
```

输出 `status: "STABLE"` 才表示观察窗口内 health、database、metrics 和 active alerts 均未触发阻断；`ATTENTION_REQUIRED` 会以非 0 退出并给出第一处失败时间。

2. 每 5 分钟运行一次发布前健康门禁，确认 health、database 和 active alerts 仍为通过状态。
3. 如果出现用户反馈或 Sentry requestId，采集事故上下文：

```bash
npm run incident:collect --workspace=server -- --base-url http://localhost:3000 --request-id <requestId> --logs .logs
```

4. 将输出 JSON 贴入发布记录或事故频道，避免只靠口头描述。

## 灰度发布 dry-run

真实流量切换前，先生成 0%/5%/25%/50%/100% 的灰度推进计划：

```bash
npm run release:canary-plan --workspace=server -- \
  --version 1.4.8 \
  --target-version 1.4.7 \
  --base-url http://localhost:3000
```

输出 `status: "READY"` 才能继续演练；每个阶段都会给出 gate 命令和 rollback trigger。该工具不切流量，只固化每一阶段必须跑的 `release:precheck`、`release:observe` 和 `rollback:plan`。

灰度完成后生成执行记录：

```bash
npm run release:canary-report --workspace=server -- \
  --version 1.4.8 \
  --target-version 1.4.7 \
  --base-url http://localhost:3000 \
  --started-at 2026-05-05T17:00:00.000Z \
  --ended-at 2026-05-05T18:30:00.000Z \
  --stage preflight:PASS \
  --stage canary_5:PASS \
  --stage canary_25:PASS \
  --stage canary_50:PASS \
  --stage full_rollout:PASS
```

输出 `status: "COMPLETED"` 表示所有记录阶段通过；任一阶段 `FAIL` 会返回 `ROLLBACK_RECOMMENDED`，并给出首个失败阶段和回滚计划命令。

如果发布失败，生成统一失败执行记录：

```bash
npm run release:failure-report --workspace=server -- \
  --version 1.4.8 \
  --target-version 1.4.7 \
  --failed-at canary_25 \
  --triggered-gate "release:observe returned ATTENTION_REQUIRED" \
  --mitigation "FEATURE_FLAGS=\"!activity.import\"|npm run incident:collect --workspace=server -- --base-url http://localhost:3000" \
  --owner "release owner|backend on-call" \
  --follow-up "Audit activity import logs" \
  --base-url http://localhost:3000
```

输出 `status: "ACTION_REQUIRED"` 表示记录可用于继续止血/回滚；如果缺少回滚目标版本或负责人，会返回 `BLOCKED`。

## 立即暂停或回滚条件

- `release:precheck` 返回 `NO_GO`
- `/api/health` 返回 `degraded`
- `/api/metrics.alerts` 出现 P1 active alerts
- 新版本 30 分钟内集中出现同类 5xx 或前端白屏
- 数据库迁移后核心流程不可用

## 回滚演练 dry-run

在真正回滚前，先生成一份不执行任何破坏性动作的 JSON 计划：

```bash
npm run rollback:plan --workspace=server -- \
  --current-version 1.4.8 \
  --target-version 1.4.7 \
  --reason release-5xx \
  --disable-flag activity.import,activity.bulk-mutation \
  --database-strategy forward-fix \
  --base-url http://localhost:3000
```

输出 `status: "READY_FOR_REHEARSAL"` 才能继续演练；如果缺少目标版本，会返回 `NEEDS_TARGET` 并以非 0 退出。该工具只生成冻结发布、关闭开关、采集上下文、应用回滚、数据库策略、回滚后门禁和 30 分钟观察的步骤清单。

回滚演练完成后生成执行记录：

```bash
npm run rollback:report --workspace=server -- \
  --current-version 1.4.8 \
  --target-version 1.4.7 \
  --reason canary_failed \
  --started-at 2026-05-05T18:00:00.000Z \
  --ended-at 2026-05-05T18:20:00.000Z \
  --target-confirmed \
  --database-strategy-confirmed \
  --post-rollback-precheck GO
```

输出 `status: "PASSED"` 表示目标版本、数据库策略和回滚后门禁均已确认；否则返回 `FOLLOW_UP_REQUIRED`，并保留问题项和后续动作。

## 故障演练场景包

桌面演练可先从两个内置场景开始，工具只输出演练包，不制造故障、不改环境：

```bash
npm run incident:drill --workspace=server -- \
  --scenario api_5xx \
  --current-version 1.4.8 \
  --target-version 1.4.7 \
  --base-url http://localhost:3000
```

```bash
npm run incident:drill --workspace=server -- \
  --scenario database_degraded \
  --current-version 1.4.8 \
  --target-version 1.4.7 \
  --base-url http://localhost:3000
```

输出 `status: "READY"` 表示演练可开始；如果缺少目标版本，会返回 `NEEDS_TARGET`。场景包包含参与角色、注入事件、预期动作、可复制命令和退出条件。

演练结束后生成复盘 JSON 草稿：

```bash
npm run incident:drill-report --workspace=server -- \
  --scenario api_5xx \
  --started-at 2026-05-05T16:00:00.000Z \
  --ended-at 2026-05-05T16:25:00.000Z \
  --achieved "Incident commander can identify first failing check and affected route or feature|Mitigation command is selected without touching unrelated features|Rollback dry-run reaches READY_FOR_REHEARSAL or records a blocker"
```

输出 `status: "PASSED"` 表示退出条件全部达成且没有登记问题；如果存在未达成退出条件或问题项，会返回 `FOLLOW_UP_REQUIRED` 并以非 0 退出。

## 止血顺序

1. 关闭相关入口或 Feature Flag（如果已有）。
2. 回滚应用版本。
3. 如果数据库迁移不可逆，暂停继续回滚，转为前向修复和数据恢复。
4. 采集 `incident:collect` 输出，进入事故复盘。

## 当前自动化工具

| 工具 | 用途 |
| --- | --- |
| `npm run release:precheck --workspace=server` | 发布前健康门禁，输出 `GO/NO_GO` |
| `npm run incident:collect --workspace=server` | 采集 health、metrics 和可选 requestId 日志上下文 |
| `npm run incident:drill --workspace=server` | 生成 API 5xx / 数据库 degraded 桌面故障演练 JSON 场景包 |
| `npm run incident:drill-report --workspace=server` | 生成桌面故障演练复盘 JSON，输出 `PASSED/FOLLOW_UP_REQUIRED` |
| `npm run logs:request --workspace=server` | 按 requestId 检索本地/服务器日志，可追加 `--json` |
| `npm run alerts:check --workspace=server` | 拉取 active metric alerts 并推送 webhook |
| `npm run rollback:plan --workspace=server` | 生成回滚演练 dry-run JSON 计划，不执行回滚 |
| `npm run rollback:report --workspace=server` | 生成回滚演练执行记录，输出 `PASSED/FOLLOW_UP_REQUIRED` |
| `npm run release:canary-plan --workspace=server` | 生成 0/5/25/50/100 灰度推进 dry-run JSON 计划 |
| `npm run release:canary-report --workspace=server` | 生成灰度发布执行记录，输出 `COMPLETED/ROLLBACK_RECOMMENDED` |
| `npm run release:failure-report --workspace=server` | 生成发布失败执行记录，输出 `ACTION_REQUIRED/BLOCKED` |
| `npm run release:observe --workspace=server` | 发布后观察窗口自动采样，输出 `STABLE/ATTENTION_REQUIRED` 摘要 |
| `GET /api/feature-flags` | 查看当前 Feature Flag 快照 |
