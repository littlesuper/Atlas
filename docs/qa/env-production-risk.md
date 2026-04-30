# `.env.production` 跟踪风险记录

快照日期：2026-04-30

在 Week 2 `.gitignore` 适配时发现根目录 `.env.production` 已被 Git 跟踪。该文件名通常用于生产环境配置，当前文件包含敏感配置字段名，例如：

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `AI_API_KEY`
- `AI_API_URL`
- `CORS_ORIGINS`

本次任务没有读取、输出或修改具体配置值，也没有删除、改名或停止跟踪该文件，避免影响生产配置和部署流程。

## 当前处理

- `.gitignore` 已补充常见环境文件、密钥文件、证书、测试产物、缓存和本地数据库忽略规则。
- 根目录 `.env.production` 暂未加入新的忽略规则，因为它已经是被跟踪文件；单纯加入 ignore 不能解决历史跟踪问题，反而会形成“tracked-but-ignored”的维护陷阱。

## 建议后续决策

1. 如果 `.env.production` 包含真实生产密钥：先轮换相关密钥，再通过独立 PR 执行 `git rm --cached .env.production`，并评估是否需要清理 Git 历史。
2. 如果 `.env.production` 只是示例占位：将其改为 `.env.production.example`，确认不含真实密钥后再提交。
3. 明确部署系统从 GitHub Secrets、Vercel/服务器环境变量或密钥管理服务读取生产配置，不依赖仓库内 `.env.production`。

在以上决策完成前，不应继续向 `.env.production` 写入新的生产配置。
