# Local Test Environment

本文件记录 Week 2 Day 3-4 的本地测试环境落地方式。目标是让团队成员可以用 Docker 启动一个独立的 Atlas 测试实例，不依赖本机 `server/.env` 或生产配置。

## 为什么没有照搬模板

质量体系模板里的 `docker-compose.test.yml` 包含 PostgreSQL、Redis、MailHog、MinIO、WireMock、Toxiproxy 等服务。

Atlas 当前实际情况不同：

- Prisma schema 仍是 `sqlite` provider。
- 现有单元测试和 E2E 都使用 SQLite。
- 当前代码没有运行时 Redis、邮件服务、S3/MinIO、WireMock、Toxiproxy 依赖。
- 生产部署校验文档已经记录：当前部署方式不支持直接把 Prisma provider 改成 PostgreSQL。

因此本次只落地一个符合现状的轻量测试环境：一个 `atlas-test` 容器同时启动后端和前端，并使用容器内独立的 SQLite 测试库。

## 启动方式

推荐使用 Docker Compose v2：

```bash
npm run test:env
```

等日志中出现 Vite 和后端启动完成后，打开：

- 前端：http://localhost:5174
- 后端健康检查：http://localhost:3001/api/health

测试账号来自 `server/prisma/seed.ts`：

- `admin` / `admin123`
- `zhangsan` / `123456`
- `lisi` / `123456`

## 后台启动

```bash
npm run test:env:up
npm run test:env:logs
```

停止并清理：

```bash
npm run test:env:down
```

如果本机只有旧版 `docker-compose` 命令，可以用等价命令：

```bash
docker-compose -f docker-compose.test.yml up --build
docker-compose -f docker-compose.test.yml down --remove-orphans
```

## 数据与配置

容器启动时会执行：

1. 删除容器内旧的 `server/prisma/docker-test.db`
2. `npx prisma generate`
3. `npx prisma db push --schema prisma/schema.prisma`
4. `npx tsx prisma/seed.ts`
5. 同时启动 server 和 Vite client

测试环境使用的关键变量：

- `DATABASE_URL=file:./docker-test.db`
- `JWT_SECRET=atlas-test-jwt-secret`
- `JWT_REFRESH_SECRET=atlas-test-refresh-secret`
- `AI_API_KEY=`（留空）
- `WECOM_*=`（留空，禁用企微）

这些都是测试专用值，不应复制到生产环境。

## 安全边界

`.dockerignore` 会排除 `.env`、`.env.*`、`server/.env*`、SQLite 数据库、上传目录、日志、缓存和构建产物，避免把本地密钥或生产配置带进 Docker build context。

特别注意：根目录 `.env.production` 当前仍是单独的安全风险，本测试环境不会读取它，也不会把它复制进镜像。

## 已知限制

- 当前本地机器可以执行 `docker --version`，但没有可用的 Docker Compose v2 插件，也没有旧版 `docker-compose` 命令；因此这次只能做配置级验证，不能在本机实际 `up`。
- 该环境是手工测试/验收环境，不替代 GitHub Actions 的 required checks。
- 完整 E2E 仍由现有 CI 运行；后续若要让 Docker 测试环境直接承载 E2E，需要单独调整 Playwright 启动策略。
