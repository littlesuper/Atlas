# Atlas 生产事故应急清单

> 来源：`atlas-quality-system/checklists/生产事故应急清单.md`。本版本按 Atlas 当前部署方式（单机 `systemd + tsx + SQLite`）和 Week 7 已落地的 Feature Flag / Canary / rollback runbook 做了项目化适配。

## 核心原则

- 先止血，后追因。
- P0/P1 优先恢复服务，不在生产环境临时改代码。
- 新功能优先关 Feature Flag；无法隔离时再执行代码回滚。
- 涉及数据库恢复、生产配置、密钥、真实 staging/production 操作时，必须由发布负责人确认。

## 紧急联系卡

把下面内容补齐后贴到团队 Wiki / 发布群公告 / 值班手册：

```text
Atlas 出问题了？

1. 不要恐慌，先确认是不是生产事故。
2. 立刻通知 AI 守护人和值班人。
3. 打开 /api/health、GitHub Actions、日志、监控/告警页面。
4. 判断 P0/P1/P2/P3。
5. 先选择止血动作：关 Feature Flag / 回滚代码 / 恢复数据库。
6. 每 15 分钟同步一次状态。
7. 恢复后写复盘和补测试。

AI 守护人：__________  电话/微信：__________
值班人：____________  电话/微信：__________
业务负责人：________  电话/微信：__________
发布负责人：________  电话/微信：__________
监控大盘：_________________________
错误追踪：_________________________
生产地址：_________________________
回滚 Runbook：docs/qa/rollback-runbook.md
降级开关清单：docs/qa/degradation-switches.md
```

## 严重等级

| 等级 | 特征 | 响应时间 | 处理原则 |
| ---- | ---- | -------- | -------- |
| P0 | 系统不可用、登录不可用、大规模数据损坏、疑似安全事件 | 5 分钟内 | 立刻止血，通知所有相关方 |
| P1 | 核心功能不可用、超过 30% 用户受影响、错误率 > 10%、响应 > 10s | 15 分钟内 | 止血优先，业务负责人同步 |
| P2 | 非核心功能不可用、少量用户受影响、错误率 1%-10% | 1 小时内 | 可先诊断，再修复 |
| P3 | 边缘问题、UI/文案、小范围不影响业务 | 1 工作日内 | 正常修复流程 |

## 前 5 分钟

1. 确认是否真的出事：
   - `/api/health` 是否正常。
   - 登录是否正常。
   - 项目列表、活动列表是否正常。
   - GitHub Actions 最近一次 main CI 是否成功。
   - 是否有用户反馈或错误追踪激增。
2. 判断影响范围：
   - 影响哪些用户、角色、模块、地区或浏览器。
   - 是否涉及数据写入错误或权限错误。
3. 判断和发布的关系：
   - 上次发布是否在 1 小时内。
   - 最近是否打开了 Feature Flag。
   - 最近是否变更了 `.env`、部署脚本、数据库、权限配置。
4. 定级 P0/P1/P2/P3。
5. 发出事故通知。

通知模板：

```text
[Atlas 生产事故 - P{0/1/2/3}]

事件：
影响：
开始时间：
当前状态：
处理人：
临时方案：
下次更新：
```

## 止血决策树

| 情况 | 首选动作 | 文档 |
| ---- | -------- | ---- |
| 新功能异常，且受 Feature Flag 控制 | 关闭对应 Flag | `docs/qa/degradation-switches.md` |
| 发布后 1 小时内核心路径异常 | 代码版本回滚 | `docs/qa/rollback-runbook.md` |
| AI / 企微 / 模板 / 看板等可选模块异常 | 关闭可选模块 Flag | `docs/qa/degradation-switches.md` |
| 数据库文件损坏或数据被错误覆盖 | 先停写入，再评估数据库 restore | `docs/qa/rollback-runbook.md` |
| 无法定位，且 P0/P1 持续 | 升级响应级别，召集发布负责人和值班人 | 本文档 |

## 快速命令

健康检查：

```bash
curl -fsS http://localhost:3000/api/health
./deploy.sh status
```

查看日志：

```bash
./deploy.sh logs
sudo journalctl -u atlas -n 200 --no-pager
```

代码回滚预检查：

```bash
./deploy.sh rollback-code <stable-git-sha>
```

确认后执行代码回滚：

```bash
ATLAS_ROLLBACK_CONFIRM=<target-short-sha> ./deploy.sh rollback-code <stable-git-sha>
```

数据库恢复只在明确需要时执行：

```bash
./deploy.sh restore backups/atlas_YYYYMMDD_HHMMSS.db
```

## 事故处理中不要做

- 不要在生产环境直接改代码。
- 不要在没有备份的情况下恢复数据库。
- 不要在未确认影响范围时执行数据库破坏性命令。
- 不要把后端 Unleash token 放进前端环境变量。
- 不要只在私聊里处理事故，必须有统一状态同步渠道。
- 不要在回滚后马上关闭事故，至少完成核心冒烟验证。

## 恢复验收

- `/api/health` 返回 `status=ok`。
- 管理员可以登录。
- 项目列表可打开。
- 活动列表可打开。
- 错误率恢复到发布前水平。
- 日志无新增 P0/P1 错误。
- 业务负责人确认核心用户路径恢复。

## 复盘

恢复后 24 小时内完成复盘：

- 发生了什么。
- 为什么监控/测试/流程没有提前拦住。
- 哪个止血动作有效。
- 哪些步骤卡住。
- 需要补哪些测试、告警、Runbook 或 Feature Flag。
- 改进行动、负责人、截止时间。
