# Atlas 应急工具包

> 用途：Week 7 Day 4 应急预案。所有链接和联系人需要发布负责人在上线前补齐。

## 必备入口

| 项目 | 位置 | 状态 |
| ---- | ---- | ---- |
| 生产事故应急清单 | `docs/qa/incident-response.md` | 已准备 |
| 回滚 Runbook | `docs/qa/rollback-runbook.md` | 已准备 |
| 灰度发布 Runbook | `docs/qa/canary-release-runbook.md` | 已准备 |
| 降级开关清单 | `docs/qa/degradation-switches.md` | 已准备 |
| 对外公告模板 | `docs/qa/public-announcement-templates.md` | 已准备 |
| 第一次应急演练方案 | `docs/qa/emergency-drill-plan.md` | 已准备 |
| 应急演练记录模板 | `docs/qa/reports/emergency-drill-template.md` | 已准备 |
| 生产部署验证 | `docs/qa/prod-deploy-validation.md` | 已准备 |
| 生产验证脚本 | `scripts/prod-check.sh` | 已准备 |

## 常用命令

```bash
./deploy.sh status
./deploy.sh logs
./deploy.sh backup
./deploy.sh rollback-code <stable-git-sha>
./deploy.sh restore backups/atlas_YYYYMMDD_HHMMSS.db
scripts/prod-check.sh http://localhost:3000
npm run release:canary-gate -- --stage 5 --base-url http://localhost:3000
```

## 需要人工补齐

| 项目 | 负责人 | 位置 |
| ---- | ------ | ---- |
| 生产 URL | 发布负责人 | 团队 Wiki / 发布群公告 |
| staging URL | 发布负责人 | 团队 Wiki / 发布群公告 |
| 监控大盘链接 | 值班人 | 团队 Wiki / 发布群公告 |
| 错误追踪链接 | 值班人 | 团队 Wiki / 发布群公告 |
| Unleash 控制台链接 | 发布负责人 | 团队 Wiki / 密钥管理系统 |
| 应急联系人 | 团队负责人 | `docs/qa/incident-response.md` 联系卡 |
| 法务/合规联系人 | 业务负责人 | 团队 Wiki |
| 对外沟通负责人 | 业务负责人 | 团队 Wiki |

## 演练要求

- 发布前至少走查一次 `docs/qa/incident-response.md`。
- 第一次故障演练使用 `docs/qa/emergency-drill-plan.md` 规划。
- staging 故障演练使用 `docs/qa/reports/emergency-drill-template.md` 记录。
- 故障演练后把缺口补回工具包。
- 任何真实生产操作都必须在统一发布/事故频道记录。
