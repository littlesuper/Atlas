# Atlas 发布说明

Atlas 生产环境只部署 `v*` tag。推送普通 commit、更新 `main`、或推送非 `v*` tag 都不会自动上线。

## 发布规则

- Gitea 地址：`https://git-lan.awer.cc/PGY/PMS.git`（内网 LAN 入口，TLS 证书需在客户端跳过验证）
- 生产站点：`w.awer.cc`
- 自动部署来源：Gitea tag
- 自动部署匹配：仅 `v*`，例如 `v1.1.21`、`v1.2.0`
- 轮询脚本：`./deploy.sh poll-update`
- 轮询配置：`/etc/cron.d/atlas-poll-deploy`
- 当前部署记录：`data/.last-deployed-tag`

## 正常发版

发版前先确认本地代码已经提交并推送到 Gitea：

```bash
git status --short
git push origin main
```

创建并推送发布 tag：

```bash
git tag v1.1.21
git push origin v1.1.21
```

生产服务器的 cron 会在下一次轮询时发现新的 `v*` tag，并执行：

```bash
./deploy.sh update v1.1.21
```

更新过程会自动备份数据库、拉取代码、安装依赖、生成 Prisma Client、构建前端、同步数据库结构并重启 systemd 服务。

## 查看状态

在生产服务器上执行：

```bash
sudo -u atlas bash -lc 'cd /opt/atlas && ./deploy.sh status'
```

查看自动部署日志：

```bash
sudo -u atlas bash -lc 'cd /opt/atlas && tail -n 200 .logs/poll.log'
```

查看应用日志：

```bash
sudo -u atlas bash -lc 'cd /opt/atlas && ./deploy.sh logs'
```

## 回滚

回滚到旧的发布 tag：

```bash
sudo -u atlas bash -lc 'cd /opt/atlas && ./deploy.sh update v1.1.20'
```

如果需要恢复数据库备份，先列出备份：

```bash
sudo -u atlas bash -lc 'cd /opt/atlas && ls -lh backups/atlas_*.db'
```

再恢复指定备份：

```bash
sudo -u atlas bash -lc 'cd /opt/atlas && ./deploy.sh restore backups/atlas_YYYYMMDD_HHMMSS.db'
```

## 注意事项

- 不要在生产服务器手动跟随 `main` 更新，生产应始终运行一个明确的 `v*` 发布快照。
- 不要复用已经推送过的 tag；如果需要重新发布，创建新的版本号。
- Gitea 凭据建议使用只读 Personal Access Token，供生产服务器 `git fetch --tags` 使用。
- 如果轮询没有触发，优先检查 `/etc/cron.d/atlas-poll-deploy`、`.logs/poll.log`、Gitea 凭据和 tag 名称是否符合 `v*`。

## 发布记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| `v1.1.22` | 2026-05-24 | 验证 tag-based 自动部署链路（commit → tag → 生产 cron poll → update） |
| `v1.1.21` | 2026-05-24 | 打通 tag 触发的生产发布流程 |
| `v1.1.14` | — | 历史版本 |

