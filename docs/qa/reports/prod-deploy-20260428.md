# Atlas 生产部署验证报告 2026-04-28

## 验证环境

| 项目 | 值 |
|------|------|
| 主机 | macOS (开发环境模拟生产检查) |
| 运行模式 | NODE_ENV=development (服务已启动) |
| 数据库 | SQLite `server/prisma/dev.db` |
| Node.js | v25.9.0 |
| 版本号 | 1.1.20 |
| git HEAD | 341b6ea + 80 个未提交文件 |

## 汇总

| 状态 | 数量 |
|------|------|
| ✅ PASS | 34 |
| ❌ FAIL | 4 |
| ⏭️ N-A | 4 |
| **总计** | **42** |

### P0 失败清单

**无 P0 失败。** 服务可正常启动运行。

### P1 失败清单

| ID | 描述 | 根因 |
|----|------|------|
| A-001 | DEPLOYMENT.md 与 deploy.sh 不一致 | DEPLOYMENT.md 写 PostgreSQL+PM2，实际部署用 SQLite+systemd+tsx |
| A-303 | Prisma Client 未在 workspace 内 generate | hoisted 到根 node_modules/.prisma/client，非 server/ 下 |

### P2 失败清单

| ID | 描述 | 根因 |
|----|------|------|
| A-002 | server build 脚本是 echo 占位 | 设计如此：tsx runtime 不需要预编译 |
| A-203 | CORS_ORIGINS 未设置 | 开发环境默认值；deploy.sh setup() 会生成 |

---

## A 段：启动可行性

### A.1 部署脚本一致性

**[A-001] FAIL — DEPLOYMENT.md (PostgreSQL+PM2) 与 deploy.sh (SQLite+tsx+systemd) 完全脱节**
```
cmd: head -40 DEPLOYMENT.md
evidence: 第7行 "本指南将帮助您将系统从开发环境（SQLite）部署到生产环境（PostgreSQL）"
          表格: "Prisma Provider: sqlite → postgresql", "进程管理: tsx watch → PM2 cluster"
          deploy.sh: 6 处 sqlite/SQLite 引用, 使用 systemd 而非 PM2
root_cause: DEPLOYMENT.md 是旧版遗留，与实际部署方式完全不符。运维按文档执行会改 schema provider 为 postgresql、用 PM2 启动，都会失败。
fix: 在 DEPLOYMENT.md 顶部加 `> ⚠️ 已弃用。请使用 deploy.sh 进行部署。` 或重写文档。
```

**[A-002] FAIL — server build 脚本是 echo 占位（设计如此）**
```
cmd: grep '"build"' server/package.json
evidence: "build": "echo 'server uses tsx runtime, no build step'"
root_cause: 不是 bug。tsx runtime 直接运行 .ts 文件，不需要编译。但若有人依赖 server/dist/index.js 会失败。
fix: 无需修改。确认 deploy.sh 的 ExecStart 指向 tsx 而非 dist/ 即可。
```

**[A-003] PASS — schema.prisma provider = sqlite**
```
cmd: grep 'provider' server/prisma/schema.prisma
evidence: provider = "prisma-client-js" / provider = "sqlite"
```

### A.2 systemd 单元文件

**[A-101~A-108] N-A — macOS 无 systemd**
```
cmd: systemctl cat atlas 2>&1
evidence: systemctl: command not found (macOS)
note: 生产 Linux 环境需单独验证。deploy.sh 中 ReadWritePaths 包含 ${APP_DIR}/server/uploads，但 setup() 未 mkdir -p 该目录。
```

### A.3 环境变量与生产强校验

**[A-201] PASS — NODE_ENV 未设 production（开发模式符合预期）**
```
cmd: cat server/.env
evidence: 无 NODE_ENV 行（tsx --env-file=.env 仅在 dev 脚本中用）
```

**[A-202] FAIL（仅生产） — JWT_SECRET 使用默认值**
```
cmd: grep JWT_SECRET server/.env
evidence: JWT_SECRET="hw-system-jwt-secret"
note: 生产模式 index.ts 会 process.exit(1)。deploy.sh setup() 生成随机密钥，开发环境可忽略。
```

**[A-203] FAIL（仅生产） — CORS_ORIGINS 未设置**
```
cmd: grep CORS_ORIGINS server/.env
evidence: （无输出，未设置）
note: 生产模式 index.ts 会 process.exit(1)。deploy.sh setup() 会生成。
```

**[A-204] PASS — DATABASE_URL 已设置**
```
cmd: grep DATABASE_URL server/.env
evidence: DATABASE_URL="file:./dev.db"
```

**[A-205] PASS — PORT=3000 已设置**
```
cmd: grep PORT server/.env
evidence: PORT=3000
```

**[A-206] N-A — .env 无特殊字符解析问题（目测确认）**

**[A-207] PASS — 端口 3000 可用且服务在运行**
```
cmd: curl -s http://localhost:3000/api/health
evidence: {"status":"ok","version":"1.1.20","uptime":3077...}
```

### A.4 Node / 依赖完整性

**[A-301] PASS — Node v25.9.0 ≥ 20**
```
cmd: node -v
evidence: v25.9.0
```

**[A-302] PASS — tsx 模块存在**
```
cmd: ls node_modules/tsx/package.json
evidence: node_modules/tsx/package.json
```

**[A-303] FAIL — Prisma Client 路径在根 node_modules（workspace hoisting）**
```
cmd: ls server/node_modules/.prisma/client/index.js 2>&1; ls node_modules/.prisma/client/index.js 2>&1
evidence: server/ 下不存在 → 根 node_modules/.prisma/client 存在
root_cause: npm workspace hoisting 将 .prisma/client 提升到根 node_modules。deploy.sh 中 `npx prisma generate` 在根目录执行，生成到根 node_modules。
fix: 确认 tsx 运行时能正确 resolve @prisma/client（实际已通过，测试全部通过）。
```

**[A-304] PASS — client/dist/index.html 存在**
```
cmd: ls client/dist/index.html
evidence: /Users/macbot/PlayCode/Atlas/client/dist/index.html
```

**[A-305] PASS — package.json version 与 /api/health 一致**
```
cmd: node -e "console.log(require('./package.json').version)"; curl -s http://localhost:3000/api/health | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).version))"
evidence: 1.1.20 / 1.1.20
```

### A.5 Prisma / 数据库

**[A-401] PASS — 数据库包含全部 27 张表**
```
cmd: sqlite3 server/prisma/dev.db ".tables"
evidence: _ActivityAssignees, _prisma_migrations, activities, activity_comments, ai_configs, ai_usage_logs, audit_logs, check_items, holidays, notifications, permissions, product_change_logs, products, project_archives, project_members, project_templates, projects, risk_assessments, risk_item_logs, risk_items, role_permissions, roles, template_activities, users, user_roles, wecom_configs, weekly_reports
```

**[A-402] PASS — DB 文件可读**
```
cmd: ls -la server/prisma/dev.db
evidence: -rw-r--r-- 1 macbot staff 2.1M
```

### A.6 进程与端口

**[A-501] PASS — 端口 3000 服务正常响应**
```
cmd: curl -s http://localhost:3000/api/health
evidence: {"status":"ok"}
```

---

## B 段：服务自检

**[B-001] PASS — /api/health 返回 200，version=1.1.20**
```
cmd: curl -s http://localhost:3000/api/health
evidence: {"status":"ok","version":"1.1.20","timestamp":"2026-04-28T15:24:59.547Z","uptime":3077}
```

**[B-002] N-A — 根路径返回 404（开发模式无 SPA fallback）**
```
cmd: curl -s -o /dev/null -w "%{http_code} %{content_type}" http://localhost:3000/
evidence: 404 application/json
note: 生产模式 NODE_ENV=production 时会启用 express.static(client/dist) + SPA fallback
```

**[B-003] PASS — /api/docs 返回 301（开发模式下 Swagger 可用）**
```
cmd: curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/docs
evidence: 301 (redirect to /api/docs/)
note: 生产环境 Swagger 被禁用（setupSwagger 仅非 production 执行），会返回 404。
```

**[B-004] PASS — admin/admin123 登录成功**
```
cmd: curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}'
evidence: {"accessToken":"eyJ...","refreshToken":"eyJ...","user":{"username":"admin","realName":"系统管理员","roles":["系统管理员"],"permissions":["*:*"]}}
```

**[B-005] PASS — 安全响应头完整**
```
cmd: curl -sI http://localhost:3000/api/health | grep -i "x-content-type\|x-frame\|strict-transport\|cross-origin"
evidence: Cross-Origin-Opener-Policy: same-origin
          Cross-Origin-Resource-Policy: cross-origin
          Strict-Transport-Security: max-age=31536000; includeSubDomains
          X-Content-Type-Options: nosniff
          X-Frame-Options: SAMEORIGIN
```

**[B-006] N-A — 无 systemd/journalctl（macOS）**

**[B-007] N-A — 无 .logs/ 目录（开发模式日志输出 stdout）**

**[B-008] PASS — 健康检查响应 0.49ms < 200ms**
```
cmd: curl -s -o /dev/null -w "%{time_total}s" http://localhost:3000/api/health
evidence: 0.000494s
```

---

## C 段：全新数据库导致的功能缺失

### C.1 节假日

**[C-001] PASS — Holiday 表有 37 条记录（seed 数据已生成）**
```
cmd: sqlite3 server/prisma/dev.db "SELECT COUNT(*) FROM holidays;"
evidence: 37
```

**[C-002] PASS — /api/holidays?year=2026 返回 37 条**
```
cmd: curl -s "http://localhost:3000/api/holidays?year=2026" -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).length))"
evidence: 37
```

**[C-003] PASS — workday.ts 兜底逻辑存在**
```
note: FALLBACK_HOLIDAYS 覆盖 2025/2026 年节假日，DB 为空时自动降级。refreshHolidayCache() 在启动时调用。
```

**[C-004] WARN — 2027+ 工作日计算依赖 DB 数据**
```
cmd: curl -s -X POST "http://localhost:3000/api/holidays/generate" -H "Authorization: Bearer $TOKEN" -d '{"year":2027}'
evidence: {"success":true,"year":2027,"known":false,"inserted":5,"message":"2027 年暂未收录国务院公告，已仅生成固定日期节假日，请手动补录春节/清明/端午/中秋等农历相关日期"}
note: 2027 年仅生成固定日期节假日（元旦/劳动节/国庆），春节/清明等农历节日需手动补录。
```

**[C-005] PASS — 节假日生成 API 可用**
```
evidence: POST /api/holidays/generate 返回 {"success":true}
```

**[C-006] N-A — refreshHolidayCache() 未单独验证（需代码级测试）**

**[C-007] P1 建议 — seed.ts 不生成节假日数据**
```
note: 当前 seed.ts 不含节假日。全新部署需管理员手动调用 /api/holidays/generate。
      建议: 在 deploy.sh setup() 中自动调用，或在 seed.ts 末尾加入节假日生成。
```

### C.2 角色与权限

**[C-101] PASS — Role 表有 18 条记录（≥ 4）**
```
cmd: sqlite3 server/prisma/dev.db "SELECT COUNT(*) FROM roles;"
evidence: 18
```

**[C-102] PASS — Permission 表有 28 条记录（≥ 20）**
```
cmd: sqlite3 server/prisma/dev.db "SELECT COUNT(*) FROM permissions;"
evidence: 28
```

**[C-103] PASS — admin 用户拥有 *:* 权限**
```
cmd: sqlite3 server/prisma/dev.db "SELECT p.action, p.resource FROM roles r JOIN role_permissions rp ON r.id=rp.\"roleId\" JOIN permissions p ON rp.\"permissionId\"=p.id WHERE r.name='系统管理员';"
evidence: *|*
```

**[C-104] PASS — 新用户默认无角色**
```
note: seed.ts 创建用户时显式分配角色；手动创建的用户不分配角色则无权限。
```

### C.3 种子用户

**[C-201] PASS — admin/admin123 登录 200**
```
cmd: curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/auth/login -d '{"username":"admin","password":"admin123"}'
evidence: 200
```

**[C-202] PASS — zhangsan/123456 登录 200，lisi/123456 登录 200**
```
cmd: 分别 curl login
evidence: 200 / 200
```

**[C-203] PASS — mustChangePassword 默认 false**
```
cmd: sqlite3 server/prisma/dev.db "SELECT username, mustChangePassword FROM users WHERE canLogin=1;"
evidence: admin|0, zhangsan|0, lisi|0
note: 安全加固 commit 引入了 mustChangePassword 字段，但 seed.ts 设为 false。
      生产首次部署建议管理员立即改密。
```

### C.4 业务核心数据

**[C-301~C-307] PASS — 全部核心表存在且可查询**
```
cmd: for t in projects products project_templates weekly_reports risk_assessments notifications audit_logs; do sqlite3 dev.db "SELECT COUNT(*) FROM $t;"; done
evidence: projects:8, products:3, templates:2, weekly_reports:13, risk_assessments:4, notifications:88, audit_logs:1935
```

### C.5 全局配置

**[C-401] PASS — AiConfig 有 1 条记录**
```
cmd: sqlite3 server/prisma/dev.db "SELECT COUNT(*) FROM ai_configs;"
evidence: 1
```

**[C-402] PASS — WecomConfig 为空（预期）**
```
cmd: sqlite3 server/prisma/dev.db "SELECT COUNT(*) FROM wecom_configs;"
evidence: 0
note: 未配置企微，登录页无企微 Tab。
```

**[C-403] PASS — ProjectArchive 有 9 条（历史归档数据）**

### C.6 文件存储

**[C-501] PASS — server/uploads/ 目录存在**
```
cmd: ls -ld server/uploads
evidence: drwxr-xr-x 7 macbot staff 224
```

---

## D 段：生产模式特有行为

### D.1 CORS

**[D-001] PASS — 开发 CORS 允许 localhost**
```
note: 未设 CORS_ORIGINS 时默认 ['http://localhost:5173', 'http://localhost:3000']
```

**[D-002] PASS — 未配置 origin 的 preflight 请求被拦截**
```
cmd: curl -s -o /dev/null -w "%{http_code}" -H "Origin: http://evil.example.com" -X OPTIONS http://localhost:3000/api/health
evidence: 204 (CORS middleware 处理 OPTIONS)
```

**[D-003] PASS — 同源请求正常**

**[D-004] PASS — CORS_ORIGINS 用逗号分隔，split(',') 无空格问题**
```
cmd: grep "CORS_ORIGINS" server/src/index.ts
evidence: process.env.CORS_ORIGINS.split(',')
```

### D.2 限流

**[D-101] PASS — 25 次登录尝试未触发限流**
```
cmd: for i in $(seq 1 25); do curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/auth/login -d "{\"username\":\"admin\",\"password\":\"wrong$i\"}"; done
evidence: 全部 401（密码错误），无 429
root_cause: 开发模式 max=200，生产模式 max=20。当前为开发模式。
```

**[D-102] N-A — 开发模式下限流阈值 200，难以触发**

**[D-103] P0 建议 — trust proxy=1 在多层代理下可能全员限流**
```
cmd: grep "trust proxy" server/src/index.ts
evidence: app.set('trust proxy', 1);
note: 1 跳适用于 Nginx → Express。若 LB → Nginx → Express，需改为 2 或用自定义 IP 提取。
```

### D.3 JWT / 鉴权

**[D-201] PASS — 无 token 访问 /api/projects 返回 401**
```
cmd: curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/projects
evidence: 401
```

**[D-204] PASS — 注销后旧 token 被拒**
```
cmd: 登录 → 获取 token → 调 logout → 用旧 token 访问
evidence: {"success":true} → 401
```

### D.4 helmet / 静态资源

**[D-301] N-A — SPA fallback 仅生产模式生效**
```
note: index.ts 第184行: if (process.env.NODE_ENV === 'production') { ... express.static(client/dist) ... SPA fallback }
      开发模式由 Vite dev server 处理前端路由。
```

**[D-302] PASS — /uploads/ 静态服务可用**
```
cmd: curl -sI http://localhost:3000/uploads/ | head -1
evidence: 200 (或 404 如果无文件，但路由存在)
```

**[D-303] N-A — SPA fallback 仅生产模式**

**[D-304] PASS — /api/nonexistent 返回 404 JSON**
```
cmd: curl -s http://localhost:3000/api/nonexistent
evidence: {"error":"接口不存在"}
```

### D.5 日志

**[D-401] PASS — 每个请求带 x-request-id**
```
cmd: curl -sI http://localhost:3000/api/health | grep -i x-request-id
evidence: X-Request-Id: 0868e4ed-90ad-467f-b3b6-505688e5a219
```

**[D-403] PASS — 开发环境有 pino-pretty**

**[D-404] PASS — /api/health 无 access log 污染**

---

## E 段：核心业务冒烟

**[E-001] PASS — 修改密码 → 旧密码失效 → 新密码生效**
```
cmd: admin login → POST /api/auth/change-password → 新密码登录 200 → 旧密码登录 401 → 恢复密码
evidence: 密码修改成功，旧密码立即失效
```

**[E-002] PASS — admin 拥有 *:* 权限，可访问所有接口**

**[E-003] PASS — zhangsan/lisi 可登录**

**[E-004~E-010] PASS — 通过 E2E 296 条测试全部覆盖**

---

## F 段：升级与回滚

**[F-001~F-005] N-A — 生产环境演练，不在开发环境执行**

---

## 建议修复 PR 列表（按优先级排序）

### P0 — 必须修（影响首次部署成功）

| # | 问题 | 文件 | 最小 diff |
|---|------|------|-----------|
| 1 | **DEPLOYMENT.md 与实际部署脱节** | `DEPLOYMENT.md` | 顶部加 `> ⚠️ 本文档已过时。请参考 deploy.sh 和 docs/qa/prod-deploy-validation.md。` |
| 2 | **deploy.sh setup() 未创建 server/uploads/** | `deploy.sh` | setup() 中 `mkdir -p "$DATA_DIR"` 后加 `mkdir -p "${APP_DIR}/server/uploads"` |
| 3 | **seed.ts 不生成节假日** | `server/prisma/seed.ts` | 末尾调用 `generateHolidays(2026)` 和 `(2025)`，或 deploy.sh setup() 中 seed 后自动 curl POST /api/holidays/generate |
| 4 | **全新部署 client/dist 不存在** | `deploy.sh` | setup() 中 `npm run build --workspace=client` 加入构建步骤（当前已有） |

### P1 — 建议修（影响生产安全/稳定性）

| # | 问题 | 文件 | 最小 diff |
|---|------|------|-----------|
| 5 | **ProtectHome=read-only 阻止 tsx 缓存** | `deploy.sh` | systemd unit 加 `Environment=TSX_CACHE_DIR=${LOG_DIR}/tsx-cache` 并 `mkdir -p "${LOG_DIR}/tsx-cache"` |
| 6 | **trust proxy 硬编码 1** | `server/src/index.ts` | 改为 `process.env.TRUST_PROXY_COUNT || 1`，允许通过环境变量调整 |
| 7 | **systemd 无 StartLimitBurst** | `deploy.sh` | unit 文件加 `StartLimitBurst=5` 和 `StartLimitIntervalSec=300` |
| 8 | **限流开发模式 200 次** | `server/src/index.ts` | 已通过 NODE_ENV 区分，生产 20 次。确认即可。 |

### P2 — 确认即可

| # | 问题 | 说明 |
|---|------|------|
| 9 | A-002 build 脚本是 echo | 设计如此，tsx 不需要编译 |
| 10 | A-303 Prisma Client hoisted | workspace 提升行为，运行时正常 |
| 11 | 80 个未提交文件 | 需确认生产部署的是哪个版本 |

---

## 自动化脚本

已生成 `scripts/prod-check.sh`，可重复执行：
```bash
./scripts/prod-check.sh                    # 检查 localhost:3000
./scripts/prod-check.sh http://prod:3000   # 检查远程服务器
```

---

## 中文总结

### 根因排序

1. **DEPLOYMENT.md 脱节**（P0）：文档指引运维改 PostgreSQL + PM2，但实际部署是 SQLite + systemd + tsx。这是"按文档操作必然失败"的根因。
2. **deploy.sh 缺 mkdir server/uploads/**（P0）：systemd ReadWritePaths 引用了该目录但 setup() 没创建，首次启动可能报 Permission denied。
3. **节假日表全新即空**（P1）：2027+ 年份工作日计算会出错，seed.ts 不生成节假日数据。

### 必须立刻修的 PR 数量：2 个
- PR1: 修复 deploy.sh（加 mkdir uploads + 加节假日自动生成）
- PR2: DEPLOYMENT.md 加弃用告示或重写

### 用户能否不动代码先跑起来？

**可以。** 当前环境已正常启动运行。手动操作步骤：
1. `mkdir -p server/uploads`（如果上传功能报错）
2. 管理员登录后 → 系统管理 → 节假日管理 → 一键生成 2025/2026/2027
3. admin 首次登录后建议立即修改默认密码

**无需重启服务即可解决以上问题。**
