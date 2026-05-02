# Atlas 回滚 Runbook

> 适用范围：Week 7 Day 3 回滚演练。本文档描述 **代码版本回滚**、**Feature Flag 降级** 和 **数据库恢复** 的执行顺序。不要在没有负责人确认的情况下对 staging / production 执行真实回滚。

## 回滚优先级

1. **关闭 Feature Flag**：如果故障只影响被 Flag 包裹的新功能，优先关闭对应 Flag。
2. **代码版本回滚**：如果故障影响核心路径、无法通过 Flag 隔离，回滚到上一个稳定 commit。
3. **数据库恢复**：只有确认数据或 schema 已被破坏，且代码回滚无法恢复服务时，才执行数据库恢复。

## 代码版本回滚命令

先找出目标稳定版本：

```bash
git log --oneline -10
```

预检查，不会真正执行：

```bash
./deploy.sh rollback-code <stable-git-sha>
```

脚本会打印目标短 SHA。确认无误后执行：

```bash
ATLAS_ROLLBACK_CONFIRM=<target-short-sha> ./deploy.sh rollback-code <stable-git-sha>
```

脚本会执行：

- 拉取远端引用。
- 校验目标版本存在。
- 要求当前部署工作区位于 `main` 分支。
- 检查工作区是否干净。
- 回滚前备份 SQLite 数据库。
- `git reset --hard <target-sha>` 切回目标版本。
- 安装依赖、生成 Prisma Client、构建前端。
- 重启 systemd 服务。
- 调用 `/api/health` 验证服务恢复。

## 数据库恢复命令

仅当需要恢复 SQLite 数据时执行：

```bash
./deploy.sh restore backups/atlas_YYYYMMDD_HHMMSS.db
```

数据库恢复会覆盖当前 `data/atlas.db`。执行前必须确认：

- 目标备份来自正确环境。
- 当前故障确实需要数据恢复。
- 回滚代码版本和数据库版本兼容。
- 已保留当前现场日志和备份。

## 回滚验收标准

- 总耗时小于 5 分钟。
- `/api/health` 返回 `status=ok`。
- 管理员可以登录。
- 项目列表可以打开。
- 活动列表可以打开。
- 错误率回到发布前水平。
- 值班人确认用户侧主要功能恢复。

## 演练步骤

1. 在 staging 部署当前版本。
2. 记录当前 commit、上一个稳定 commit、开始时间。
3. 触发一个可控故障或选择待回滚版本。
4. 优先尝试关闭对应 Feature Flag。
5. 若无法止血，执行 `rollback-code`。
6. 记录健康检查恢复时间。
7. 执行最小冒烟验证。
8. 填写演练报告。
9. 修复演练中发现的流程或脚本问题。

## 当前限制

- `rollback-code` 是单机 systemd 部署脚本，不适用于多实例或容器平台。
- 脚本不自动回滚数据库 schema，也不运行破坏性数据库命令。
- 真正 staging 演练会影响 staging 服务，需要发布负责人明确授权。
