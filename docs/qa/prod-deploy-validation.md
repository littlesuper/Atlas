# Atlas 生产部署验证测试方案

> **目的：** 排查"迁移到正式生产环境后起不来 / 部分功能因数据库全新而失效"的所有可能原因，并以可执行用例的形式交给 opencode 做闭环验证。
> **作者：** Claude Code（基于代码当前状态梳理）
> **日期：** 2026-04-28
> **执行方：** opencode
> **验证目标主机：** 正式生产环境（systemd + tsx 运行时 + SQLite 模式）
> **范围：** 启动失败可能性 + 全新数据库导致的功能缺失 + 与生产部署相关的回归

---

## 0. 前置说明

本文档不重复 `test-plan.md` 的业务功能用例，只覆盖**部署 + 首次上线**相关的验证。建议执行顺序：

1. **A 段：启动可行性** —— 不通过则后续全部跳过
2. **B 段：服务自检** —— `/api/health`、日志、systemd 状态
3. **C 段：全新数据库的数据完整性** —— 节假日 / 角色 / 种子用户
4. **D 段：生产模式特有行为** —— CORS、限流、JWT 校验、helmet、SPA fallback
5. **E 段：核心业务回归** —— 仅做最小冒烟，深度回归走 `test-plan.md`
6. **F 段：升级/回滚演练** —— 后续发版安全网

每条用例需输出：`PASS / FAIL / N-A` + 实际现象 + 关键日志摘录。FAIL 用例必须给出根因猜测。

---

## A 段：启动失败可能性枚举

### A.1 部署脚本一致性

| ID | 检查项 | 期望 | 排查命令 | 备注 |
|---|---|---|---|---|
| A-001 | `DEPLOYMENT.md` 与 `deploy.sh` 模式一致 | 都是 SQLite + tsx + systemd | `head -40 DEPLOYMENT.md`；对照 `deploy.sh` | **已知风险**：`DEPLOYMENT.md` 仍写 PostgreSQL + PM2 + dist 编译路径。若运维按文档执行必然失败 |
| A-002 | `server/package.json` 没有真实 build 步骤 | `"build": "echo 'server uses tsx runtime, no build step'"` | `cat server/package.json` | 任何依赖 `server/dist/index.js` 的部署都会找不到产物 |
| A-003 | `server/prisma/schema.prisma` provider | 生产用 `sqlite`（与当前 deploy.sh 匹配） | `grep provider server/prisma/schema.prisma` | 若被人手改成 postgresql 又没装 PG，`prisma db push` 直接失败 |

### A.2 systemd 单元文件正确性

| ID | 检查项 | 期望 | 排查命令 |
|---|---|---|---|
| A-101 | unit 文件存在 | `/etc/systemd/system/atlas.service` | `systemctl cat atlas` |
| A-102 | `ExecStart` 中 `which node` 已被解析为绝对路径 | 类似 `/usr/bin/node /var/.../tsx/dist/cli.mjs ...` | `systemctl cat atlas \| grep ExecStart` |
| A-103 | `User=` 字段是真实存在的用户 | `id <user>` 不报错 | `systemctl cat atlas \| grep User=` |
| A-104 | `WorkingDirectory` 真实存在且属主匹配 | `ls -ld <path>` | |
| A-105 | `EnvironmentFile` 路径存在且权限 600 | `stat <path>/.env` | 若 chmod 700 父目录但 EnvironmentFile 在更外层会读不到 |
| A-106 | `ReadWritePaths` 中所有目录都已 mkdir | `data/`、`server/uploads/`、`.logs/` 都存在 | `ls -ld <each>` | **已知风险**：deploy.sh 没创建 `server/uploads/`，但 unit 把它列入 ReadWritePaths。systemd 会拒绝启动或忽略该路径 |
| A-107 | `ProtectHome=read-only` 不阻止 tsx 缓存 | tsx 启动无 `EROFS / EACCES` | `journalctl -u atlas -n 200` | tsx 可能写 `~/.cache/tsx`；建议设 `Environment=TSX_TSCONFIG_PATH=...` 或改 `ProtectHome=tmpfs` |
| A-108 | `StandardOutput`/`StandardError` 指向的目录已存在 | `.logs/app.log` `.logs/error.log` 可写 | |

### A.3 环境变量与生产强校验

入口 `server/src/index.ts:44-62` 在 `NODE_ENV=production` 下做如下硬校验，任意一条失败 **直接 process.exit(1)**：

| ID | 检查项 | 失败现象 |
|---|---|---|
| A-201 | `NODE_ENV` 必须为 `production` | 否则跳过校验，但其它生产分支也走不到 |
| A-202 | `JWT_SECRET` 已设置且非默认 `hw-system-jwt-secret` | fatal 退出 |
| A-203 | `JWT_REFRESH_SECRET` 已设置且非默认 `hw-system-refresh-secret` | fatal 退出 |
| A-204 | `CORS_ORIGINS` 已设置（即使前后同源也必须填） | fatal 退出 |
| A-205 | `DATABASE_URL` 指向可写绝对路径 | Prisma 报 `unable to open database file` |
| A-206 | `.env` 文件中无未转义的 `#` `=` `"` 等导致 systemd `EnvironmentFile` 解析失败 | env 部分丢失 |
| A-207 | `PORT` 未与现有进程冲突 | `EADDRINUSE` |

### A.4 Node / 依赖完整性

| ID | 检查项 | 排查 |
|---|---|---|
| A-301 | Node 版本 ≥ 20（deploy.sh 默认安装 20，部分依赖如 vitest@4 要求 ≥18） | `node -v` |
| A-302 | `npm ci --production=false` 已执行成功 | `ls node_modules/tsx`、`ls server/node_modules/@prisma/client` |
| A-303 | `npx prisma generate` 已执行 | `ls server/node_modules/.prisma/client` |
| A-304 | `client/dist/index.html` 存在 | `ls client/dist/index.html` | 否则生产模式 SPA fallback 会 sendFile 一个不存在的文件，所有非 API 请求 500 |
| A-305 | `package.json` 在 `__dirname/../../package.json`（即项目根） | tsx 模式下 OK；若有人引入 tsc 编译 dist，`__dirname=server/dist` 会指向 `server/package.json`（version=1.0.0），`/api/health` 返回错误版本号 |

### A.5 Prisma / 数据库

| ID | 检查项 | 排查 |
|---|---|---|
| A-401 | `prisma db push` 已对生产 db 执行过 | `sqlite3 <db> ".tables"` 应包含 22 张表（含 Holiday、CheckItem、RiskItem 等新模型） |
| A-402 | sqlite db 文件权限允许 systemd User 读写 | `stat <db>` |
| A-403 | sqlite -journal / -wal 文件能在 db 同目录创建 | systemd `ReadWritePaths` 必须包含 db 所在目录 |
| A-404 | Prisma Client 与 schema 同步 | 若 schema 改了但没 generate，运行时 `Unknown field` 500 |

### A.6 进程与端口

| ID | 检查项 | 排查 |
|---|---|---|
| A-501 | 3000 端口仅被 atlas 进程占用 | `ss -tlnp \| grep :3000` |
| A-502 | systemd 状态 `active (running)` | `systemctl status atlas` |
| A-503 | Restart=always 不在死循环 | `journalctl -u atlas --since "5 minutes ago"` 看 restart 频率 |

---

## B 段：服务自检

| ID | 命令 | 期望 |
|---|---|---|
| B-001 | `curl -fsSL http://localhost:3000/api/health` | `{ "status":"ok", "version":"1.1.20"...}`（version 必须等于根 `package.json`） |
| B-002 | `curl -I http://localhost:3000/` | 200，Content-Type `text/html` |
| B-003 | `curl -I http://localhost:3000/api/docs` | 生产应 404（`setupSwagger` 仅非生产） |
| B-004 | `curl -i -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}'` | 200，返回 accessToken |
| B-005 | 检查响应安全头：`X-Content-Type-Options`、`X-Frame-Options`、`Strict-Transport-Security`（如挂 HTTPS） | helmet 默认开启 |
| B-006 | `journalctl -u atlas -n 100` 无 `fatal`、无 `EACCES`、无 `ECONNREFUSED` | |
| B-007 | `.logs/app.log` 持续追加，结构化 JSON | pino 输出 |
| B-008 | 健康检查响应 < 200ms | 冷启动除外 |

---

## C 段：全新数据库导致的功能缺失

> **背景：** `seed.ts` 只创建：4 个内置角色（admin/项目经理/产品经理/只读）、若干 permission、3 个测试用户（admin / zhangsan / lisi）。**不创建** 节假日、检查项、风险数据、模板、产品、企微/AI 配置。

### C.1 节假日（已知会失效）

| ID | 检查项 | 期望 / 处理 |
|---|---|---|
| C-001 | `Holiday` 表行数 | 全新 db = 0 |
| C-002 | `/api/holidays?year=2026` 返回空数组 | 实际现象 |
| C-003 | `workday.ts` 兜底逻辑生效 | 工作日计算结果与代码内 `FALLBACK_HOLIDAYS` 一致（2025/2026 OK） |
| C-004 | 2027+ 年份的工作日计算 | 仅排周末（春节/清明/端午/中秋因农历相关无法兜底），**会算错** |
| C-005 | 管理员页 `/admin → 节假日管理 → 一键生成 2026` | `POST /api/holidays/generate` 写入数据库，前端日期组件刷新后能高亮节假日 |
| C-006 | 生成后 `refreshHolidayCache()` 立即生效 | 不需重启即生效 |
| C-007 | **建议修复**：把节假日生成纳入 `seed.ts` 或 deploy.sh 首次 setup | 验证：fresh setup 后 `Holiday` 表非空 |

### C.2 角色与权限

| ID | 检查项 | 期望 |
|---|---|---|
| C-101 | `Role` 表 4 行 | admin / 项目经理 / 产品经理 / 只读 |
| C-102 | `Permission` 表行数 ≥ 80（按 resource × action 笛卡尔） | seed.ts:12 actions × 各 resource |
| C-103 | admin 用户拥有 `*:*` 权限（ALL） | 所有受保护接口可访问 |
| C-104 | 新创建用户默认无角色 → 仅可访问 read-only 接口 | 验证 |

### C.3 种子用户与首次登录

| ID | 检查项 | 期望 |
|---|---|---|
| C-201 | admin / admin123 可登录 | 200 |
| C-202 | zhangsan / 123456、lisi / 123456 可登录 | 200 |
| C-203 | **强制改密**（`forcePasswordChange` 字段） | 若 schema 有此字段且 seed 默认 true，应在首次登录立即弹出改密；若默认 false，则与"安全加固提交"声明的强制改密功能不符 |
| C-204 | admin 默认密码改为强密码后，旧 token 仍能用直到过期 | tokenBlacklist 行为 |
| C-205 | 改密后旧 refresh token 是否被加入 `TokenBlacklist`（如有该表） | 验证黑名单写入 |

### C.4 业务核心数据（全新空库）

| ID | 模块 | 全新 db 现象 | 应对 |
|---|---|---|---|
| C-301 | 项目列表 | 空 | OK，正常引导用户创建第一条 |
| C-302 | 产品列表 | 空 | OK |
| C-303 | 项目模板 | 空 | 用户无法"从模板创建"，需手动建模板或导入 |
| C-304 | 周报 | 空 | OK |
| C-305 | 风险评估 | 空 | OK |
| C-306 | 通知 | 空 | OK |
| C-307 | 审计日志 | 空 | OK |

### C.5 全局配置表（行存在但默认值）

| ID | 表 | 期望 | 失效现象 |
|---|---|---|---|
| C-401 | `AiConfig` | 默认无 → 风险评估走兜底 | AI 自动评估按钮触发会报"未配置 AI" |
| C-402 | `WecomConfig` | 默认无 → 企微扫码登录不可用 | 登录页扫码按钮 / 跳转失败 |
| C-403 | `ProjectArchive` | 空 | OK |

### C.6 文件存储

| ID | 检查项 | 期望 |
|---|---|---|
| C-501 | `server/uploads/` 存在且可写 | 正常上传 |
| C-502 | 上传 1KB / 5MB / 11MB 文件 | 11MB 应被 `express.json({limit:'10mb'})` 或 multer 限制拦下 |
| C-503 | 上传后 `/uploads/<filename>` 可直接 GET | helmet `crossOriginResourcePolicy: cross-origin` 已配 |
| C-504 | 上传文件类型校验（recent commit "file validation"）| 上传 `.exe`、伪造 MIME 应被拒 |

---

## D 段：生产模式特有行为

### D.1 CORS

| ID | 用例 | 期望 |
|---|---|---|
| D-001 | 浏览器从 `CORS_ORIGINS` 中域名访问 | 通过 |
| D-002 | 从未配置的 origin 访问 | 浏览器侧 CORS 失败，后端不报 500 |
| D-003 | 同源（前端通过 express 静态托管） | 不触发 CORS preflight |
| D-004 | `CORS_ORIGINS` 多值用 `,` 分隔，无空格 | 否则 split 后 origin 含前导空格匹配失败 |

### D.2 限流（**已知风险**）

| ID | 用例 | 期望 |
|---|---|---|
| D-101 | 同 IP 15 分钟内登录 ≤20 次 | 通过 |
| D-102 | 第 21 次 | 429 + "登录尝试过于频繁" |
| D-103 | 经过 Nginx/LB 时 `req.ip` 是真实客户端 IP | 当前 `app.set('trust proxy', 1)` 仅信任 1 跳；多层代理会取错跳，所有用户共享一个 IP 全员被限流 |
| D-104 | 长时间不登录 → 15 分钟后窗口重置 | |

### D.3 JWT / 鉴权

| ID | 用例 | 期望 |
|---|---|---|
| D-201 | 不带 token 访问 `/api/projects` | 401 |
| D-202 | 过期 access token | 401 + 前端自动 refresh |
| D-203 | refresh token 也过期 | 跳登录页 |
| D-204 | 注销后旧 token | 应被加入黑名单 → 401（取决于 commit `e9cdc44` 中 token blacklist 实现） |
| D-205 | JWT 签名密钥被篡改重启后 | 所有旧 token 失效 |

### D.4 helmet / 静态资源

| ID | 用例 | 期望 |
|---|---|---|
| D-301 | `/` 加载 SPA | 200 + 正确 CSP（不阻塞 vendor chunks） |
| D-302 | 浏览器加载 `/uploads/<img>` | 200 + `Cross-Origin-Resource-Policy: cross-origin` |
| D-303 | 任意非 `/api`、非 `/uploads` 路由 | 返回 `index.html`（SPA fallback） |
| D-304 | `/api/不存在的接口` | 404 JSON，**不返回 index.html** |

### D.5 日志与可观测性

| ID | 用例 | 期望 |
|---|---|---|
| D-401 | 每个请求带 `x-request-id` | requestId 中间件生效 |
| D-402 | 错误日志包含堆栈 + requestId | pino logger.error |
| D-403 | 生产无 `pino-pretty`（性能） | 输出 ndjson |
| D-404 | `/api/health` 不写 access log（避免污染） | 视实现而定 |

---

## E 段：核心业务冒烟（生产专用，最小集）

> 完整业务用例参考 `test-plan.md`。这里仅做"上线后立即可用"的最小验证。

| ID | 场景 | 步骤 | 期望 |
|---|---|---|---|
| E-001 | admin 登录 → 修改默认密码 → 重新登录 | | 新密码生效，admin123 失效 |
| E-002 | 创建用户：可登录用户（含 username） | username 自动生成拼音 | 登录成功 |
| E-003 | 创建用户：仅联系人（canLogin=false） | 不需要密码 | 创建成功，登录被拒 |
| E-004 | 创建项目 → 添加活动 → 设置依赖 003FS+2 | | 自动排程 + 关键路径计算 |
| E-005 | 活动添加检查项 → 勾选 | | 进度更新，活动表"检查项"列显示 1/3 |
| E-006 | 触发 AI 风险评估（若已配 AI_API_KEY） | | 返回风险等级或熔断器 503 |
| E-007 | 上传周报附件 5MB | | 200，文件可下载 |
| E-008 | 节假日管理 → 生成 2026 → 创建跨春节项目 | | 工作日计算正确扣除假期 |
| E-009 | 切换到非 admin 账户 | | 受限页面（角色管理、AI 配置）不可见 |
| E-010 | 浏览器刷新 → token 自动刷新 → 状态保留 | | 不掉登录 |

---

## F 段：升级与回滚演练

| ID | 用例 | 期望 |
|---|---|---|
| F-001 | `./deploy.sh update` 触发 git pull + db push + restart | 服务无超过 5s 的不可用时间（需要前端重连） |
| F-002 | 更新前自动备份 db | `backups/` 出现新文件 |
| F-003 | 故意把 schema 改坏 → update 失败 → `./deploy.sh restore <backup>` | 数据库回滚 |
| F-004 | systemd 反复 restart 5 次后熔断 | 验证 unit 是否设置 `StartLimitBurst` / `StartLimitIntervalSec`（当前 unit 没设，会无限重启） |
| F-005 | 磁盘写满（dd 填充 data 目录） | sqlite 写入失败但服务不 crash |

---

## 执行约定（给 opencode）

### 输出格式

每个用例产出一行：

```
[A-106] FAIL — server/uploads 不存在 → systemd 启动报 "Failed to set up mount namespacing: Permission denied"
        log: journalctl -u atlas -n 50 第 23-27 行
        建议: 在 deploy.sh setup() 加 `mkdir -p server/uploads`
```

汇总报告写入 `docs/qa/reports/prod-deploy-<YYYYMMDD>.md`。

### 自动化建议

可立即转为脚本断言的项：

- A-001 ~ A-007：`grep` / `cat`
- A-101 ~ A-108：`systemctl cat` / `stat`
- A-201 ~ A-207：解析 `.env` 并匹配
- A-401 ~ A-403：`sqlite3 .tables` 并对照固定列表
- B 段全部：`curl` 即可
- C-001 ~ C-005：直接连 sqlite 查表
- D-101 ~ D-103：循环 curl

建议产出 `scripts/prod-check.sh`，把可自动化项串成单脚本。

### 风险优先级

| 等级 | 用例 |
|---|---|
| **P0（必须修）** | A-002、A-106、A-205、A-304、C-001~C-007、D-103 |
| **P1（建议修）** | A-107、A-305、C-203、C-401、F-004 |
| **P2（确认即可）** | 其余 |

---

## 已知必修项摘要（建议在测试前先合掉）

1. **`DEPLOYMENT.md` 与现行 deploy.sh 完全脱节**，运维误操作会直接失败。建议改写或加 `> 已弃用，使用 deploy.sh` 顶部告示。
2. **deploy.sh setup() 没创建 `server/uploads/`**，systemd `ReadWritePaths` 会报错。
3. **节假日表全新即空**，2027 年起工作日计算会出错。建议在 `seed.ts` 末尾或 `deploy.sh setup()` 自动调用 `holidays/generate` 把已收录年份写入数据库。
4. **`ProtectHome=read-only` 阻止 tsx 缓存**，建议加 `Environment=TSX_CACHE_DIR=${LOG_DIR}/tsx-cache` 或改 `tmpfs`。
5. **`trust proxy=1` 在多层代理下会全员限流**，需要根据实际部署拓扑调整跳数或改用 X-Real-IP 中间件。
6. **大量本地未提交修改**（含 holidays 路由、HolidayManagement 页、项目编辑页、新测试目录），如果生产部署的是远端 main，对应功能在生产端**根本不存在**，opencode 需先 `git status` 确认部署版本与本地一致。
