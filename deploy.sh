#!/bin/bash
# ==================== Atlas 部署脚本（裸机版） ====================
# 直接在 Ubuntu Server 上运行，无需 Docker
# 用法: ./deploy.sh [setup|update|start|stop|restart|status|logs|backup|restore]

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

BACKUP_DIR="$APP_DIR/backups"
DATA_DIR="$APP_DIR/data"
LOG_DIR="$APP_DIR/.logs"
SERVICE_NAME="atlas"
NODE_VERSION="20"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[Atlas]${NC} $1"; }
warn() { echo -e "${YELLOW}[Atlas]${NC} $1"; }
err()  { echo -e "${RED}[Atlas]${NC} $1"; exit 1; }

# ─── 首次安装 ────────────────────────────────────────
setup() {
  log "开始首次部署..."

  # 1. 检查/安装 Node.js
  if ! command -v node &> /dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt $NODE_VERSION ]]; then
    log "安装 Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
  log "Node.js $(node -v)"

  # 2. 检查 sqlite3
  if ! command -v sqlite3 &> /dev/null; then
    log "安装 sqlite3..."
    sudo apt-get install -y sqlite3
  fi

  # 3. 创建目录
  mkdir -p "$DATA_DIR" "$BACKUP_DIR" "$LOG_DIR" "${LOG_DIR}/tsx-cache" "${APP_DIR}/server/uploads"

  # 4. 生成 .env
  if [ ! -f .env ]; then
    JWT=$(openssl rand -hex 32)
    JWT_R=$(openssl rand -hex 32)
    SERVER_IP=$(hostname -I | awk '{print $1}')

    cat > .env << ENVEOF
NODE_ENV=production
PORT=3000
DATABASE_URL=file:${DATA_DIR}/atlas.db
JWT_SECRET=${JWT}
JWT_REFRESH_SECRET=${JWT_R}
CORS_ORIGINS=http://${SERVER_IP}:3000
AI_API_KEY=
AI_API_URL=
RISK_SCHEDULER_ENABLED=false
RISK_SCHEDULER_CRON=0 8 * * 1-5
ENVEOF
    log "已自动生成安全密钥写入 .env"
    log "CORS_ORIGINS = http://${SERVER_IP}:3000"
  fi

  # 5. 安装依赖
  log "安装依赖..."
  npm ci --production=false

  # 6. 构建
  log "生成 Prisma Client..."
  cd server && npx prisma generate && cd ..

  log "构建前端..."
  npm run build --workspace=client

  # 后端使用 tsx 运行时，无需预编译

  # 7. 初始化数据库
  log "初始化数据库..."
  cd server
  DATABASE_URL="file:${DATA_DIR}/atlas.db" npx prisma db push --accept-data-loss
  DATABASE_URL="file:${DATA_DIR}/atlas.db" npx tsx src/prisma/seed.ts 2>/dev/null || log "种子数据已存在，跳过"
  cd ..

  # 8. 生成节假日数据（seed 不含节假日）
  log "生成节假日数据..."
  sleep 2
  for year in 2025 2026; do
    curl -sf -X POST "http://localhost:${PORT:-3000}/api/holidays/generate" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $(curl -sf -X POST "http://localhost:${PORT:-3000}/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)" \
      -d "{\"year\":${year}}" > /dev/null 2>&1 && log "  ${year} 年节假日已生成" || warn "  ${year} 年节假日生成失败（可稍后手动生成）"
  done

  # 8. 设置文件权限
  chmod 600 .env
  chmod 700 "$DATA_DIR"

  # 9. 安装 systemd 服务
  install_service

  # 10. 启动
  sudo systemctl start $SERVICE_NAME

  sleep 3
  if curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null; then
    # 记录初始部署的引用，poll-update 据此判断是否需要更新
    local INIT_REF
    INIT_REF=$(git describe --tags --exact-match HEAD 2>/dev/null || git rev-parse --short HEAD)
    echo "$INIT_REF" > "$DATA_DIR/.last-deployed-tag"

    echo ""
    log "============================================"
    log "✅ 部署成功！"
    log "访问地址: http://$(hostname -I | awk '{print $1}'):${PORT:-3000}"
    log "默认账号: admin / admin123"
    log "当前版本: ${INIT_REF}"
    log "============================================"
    echo ""
    warn "⚠️  请立即登录后修改 admin 默认密码！"
  else
    err "启动失败，查看日志: ./deploy.sh logs"
  fi
}

# ─── 安装 systemd 服务 ────────────────────────────────
install_service() {
  log "配置 systemd 服务..."

  sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << SVCEOF
[Unit]
Description=Atlas 硬件项目管理系统
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
Environment=TSX_CACHE_DIR=${LOG_DIR}/tsx-cache
ExecStart=$(which node) ${APP_DIR}/node_modules/tsx/dist/cli.mjs ${APP_DIR}/server/src/index.ts
  Restart=always
  RestartSec=5
  StartLimitBurst=5
  StartLimitIntervalSec=300

# 安全加固
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${DATA_DIR} ${APP_DIR}/server/uploads ${LOG_DIR}
PrivateTmp=true

# 日志
StandardOutput=append:${LOG_DIR}/app.log
StandardError=append:${LOG_DIR}/error.log

[Install]
WantedBy=multi-user.target
SVCEOF

  sudo systemctl daemon-reload
  sudo systemctl enable $SERVICE_NAME
  log "服务已注册: systemctl status $SERVICE_NAME"
}

# ─── 更新部署 ────────────────────────────────────────
# 用法：
#   update              ← 跟随 main 分支最新提交
#   update <tag|sha>    ← 切换到指定 tag / commit / branch（典型场景：发布 + 回滚）
update() {
  local TARGET="${1:-}"

  # 更新前自动备份
  backup

  log "拉取最新代码..."
  git fetch --tags --prune origin

  if [ -n "$TARGET" ]; then
    log "切换到 ${TARGET}"
    # -f 强制丢弃对已跟踪文件的本地改动；未跟踪文件（uploads/、data/）保留
    git -c advice.detachedHead=false checkout -f "$TARGET"
    # 如果 TARGET 是分支名，还要再 reset 一下追上 remote
    if git show-ref --verify --quiet "refs/heads/${TARGET}"; then
      git reset --hard "origin/${TARGET}" 2>/dev/null || true
    fi
  else
    log "切换到 main 最新"
    git checkout -f main
    git reset --hard origin/main
  fi

  log "安装依赖..."
  npm ci --production=false

  log "构建..."
  cd server && npx prisma generate && cd ..
  npm run build --workspace=client
  # 后端使用 tsx 运行时，无需预编译

  log "同步数据库结构..."
  cd server
  DATABASE_URL="file:${DATA_DIR}/atlas.db" npx prisma db push --accept-data-loss
  cd ..

  log "重启服务..."
  sudo systemctl restart $SERVICE_NAME

  sleep 3
  if curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null; then
    VERSION=$(curl -sf http://localhost:${PORT:-3000}/api/health | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "?")
    # 记录当前部署的引用，poll-update 据此判断是否需要更新
    local CURRENT_REF
    CURRENT_REF=$(git describe --tags --exact-match HEAD 2>/dev/null || git rev-parse --short HEAD)
    echo "$CURRENT_REF" > "$DATA_DIR/.last-deployed-tag"
    log "✅ 更新完成！版本: v${VERSION}（部署引用 ${CURRENT_REF}）"
  else
    err "启动失败，查看日志: ./deploy.sh logs"
  fi
}

# ─── 轮询部署（cron 调用）───────────────────────────
# 检查 gitea 是否有新的 v* tag，有则切过去重新部署。
# - 每分钟跑一次；没新 tag 时静默退出
# - flock 防并发；上一轮还在跑就跳过
# - 只看 v* tag，不跟 main 分支动态——避免 commit hook 自增的 z 误触发上线
poll_update() {
  local TAG_PATTERN="${TAG_PATTERN:-v*}"

  # 防并发锁（fd 200，脚本退出自动释放）
  exec 200>"$DATA_DIR/.poll.lock"
  if ! flock -n 200; then
    return 0
  fi

  # 静默 fetch，失败时记一行到 stderr（让 cron 邮件 / 日志能看到）
  if ! git -C "$APP_DIR" fetch --tags --prune --quiet origin 2>/dev/null; then
    echo "[$(date '+%F %T')] poll-update: git fetch failed" >&2
    return 1
  fi

  # 找最新 tag（按 semver 排序）
  local LATEST_TAG LAST_DEPLOYED
  LATEST_TAG=$(git -C "$APP_DIR" tag -l "$TAG_PATTERN" --sort=-v:refname | head -1)
  [ -z "$LATEST_TAG" ] && return 0

  LAST_DEPLOYED=$(cat "$DATA_DIR/.last-deployed-tag" 2>/dev/null || echo "")
  [ "$LATEST_TAG" = "$LAST_DEPLOYED" ] && return 0

  log "检测到新发布 ${LATEST_TAG}（上次部署 ${LAST_DEPLOYED:-无}），开始更新"
  update "$LATEST_TAG"
}

# ─── 启动/停止/重启 ────────────────────────────────────
start()   { sudo systemctl start $SERVICE_NAME   && log "✅ 已启动"; }
stop()    { sudo systemctl stop $SERVICE_NAME    && log "✅ 已停止"; }
restart() { sudo systemctl restart $SERVICE_NAME && log "✅ 已重启"; }

# ─── 查看日志 ────────────────────────────────────────
logs() {
  if [ -f "$LOG_DIR/app.log" ]; then
    tail -f "$LOG_DIR/app.log" "$LOG_DIR/error.log"
  else
    sudo journalctl -u $SERVICE_NAME -f --no-pager
  fi
}

# ─── 查看状态 ────────────────────────────────────────
status() {
  sudo systemctl status $SERVICE_NAME --no-pager -l 2>/dev/null || true
  echo ""

  if curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null; then
    HEALTH=$(curl -sf http://localhost:${PORT:-3000}/api/health)
    VERSION=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "?")
    UPTIME=$(echo "$HEALTH" | python3 -c "import sys,json; u=json.load(sys.stdin)['uptime']; print(f'{int(u//3600)}h {int(u%3600//60)}m')" 2>/dev/null || echo "?")
    log "版本: v${VERSION} | 运行: ${UPTIME}"
  else
    warn "应用未响应"
  fi

  # 数据量
  if [ -f "$DATA_DIR/atlas.db" ]; then
    DB_SIZE=$(du -h "$DATA_DIR/atlas.db" | awk '{print $1}')
    UPLOAD_SIZE=$(du -sh "$APP_DIR/server/uploads" 2>/dev/null | awk '{print $1}' || echo "0")
    BACKUP_COUNT=$(ls "$BACKUP_DIR"/atlas_*.db 2>/dev/null | wc -l || echo "0")
    log "数据库: ${DB_SIZE} | 上传: ${UPLOAD_SIZE} | 备份: ${BACKUP_COUNT} 个"
  fi
}

# ─── 数据库备份 ────────────────────────────────────────
backup() {
  mkdir -p "$BACKUP_DIR"

  if [ ! -f "$DATA_DIR/atlas.db" ]; then
    warn "数据库文件不存在，跳过备份"
    return 0
  fi

  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE="$BACKUP_DIR/atlas_${TIMESTAMP}.db"

  log "备份数据库..."
  # SQLite .backup 保证一致性（不受写入影响）
  sqlite3 "$DATA_DIR/atlas.db" ".backup '${BACKUP_FILE}'"

  log "✅ 备份完成: ${BACKUP_FILE} ($(du -h "$BACKUP_FILE" | awk '{print $1}'))"

  # 清理 30 天前的备份
  find "$BACKUP_DIR" -name "atlas_*.db" -mtime +30 -delete 2>/dev/null || true
  BACKUP_COUNT=$(ls "$BACKUP_DIR"/atlas_*.db 2>/dev/null | wc -l)
  log "当前共 ${BACKUP_COUNT} 个备份"
}

# ─── 数据库恢复 ────────────────────────────────────────
restore() {
  RESTORE_FILE="${2:-}"

  if [ -z "$RESTORE_FILE" ]; then
    echo "可用备份:"
    echo ""
    ls -lh "$BACKUP_DIR"/atlas_*.db 2>/dev/null || err "没有备份文件"
    echo ""
    err "用法: ./deploy.sh restore backups/atlas_YYYYMMDD_HHMMSS.db"
  fi

  [ ! -f "$RESTORE_FILE" ] && err "文件不存在: $RESTORE_FILE"

  warn "⚠️  即将覆盖现有数据库！确认请输入 yes："
  read -r confirm
  [ "$confirm" != "yes" ] && err "已取消"

  # 恢复前备份
  backup

  log "停止服务..."
  sudo systemctl stop $SERVICE_NAME

  log "恢复数据库..."
  cp "$RESTORE_FILE" "$DATA_DIR/atlas.db"

  log "启动服务..."
  sudo systemctl start $SERVICE_NAME

  sleep 3
  if curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null; then
    log "✅ 恢复完成"
  else
    warn "服务启动中，请稍候检查: ./deploy.sh status"
  fi
}

# ─── 入口 ────────────────────────────────────────────
case "${1:-}" in
  setup)        setup ;;
  update)       shift; update "$@" ;;
  poll-update)  poll_update ;;
  start)        start ;;
  stop)         stop ;;
  restart)      restart ;;
  status)       status ;;
  logs)         logs ;;
  backup)       backup ;;
  restore)      restore "$@" ;;
  *)
    echo "Atlas 部署工具"
    echo ""
    echo "用法: ./deploy.sh <命令>"
    echo ""
    echo "  setup            首次部署（安装依赖 + 构建 + 初始化）"
    echo "  update [<ref>]   更新（自动备份 + 拉代码 + 重建 + 重启）"
    echo "                   不带参数 = 跟 main；带参 = 切到指定 tag/sha/branch"
    echo "                   例: ./deploy.sh update v1.2.0    （部署 v1.2.0）"
    echo "                       ./deploy.sh update v1.1.0    （回滚到 v1.1.0）"
    echo "  poll-update      自动部署轮询：检查 gitea 有无新的 v* tag，有则部署"
    echo "                   （由 /etc/cron.d/atlas-poll-deploy 每分钟调用，无新 tag 时静默退出）"
    echo "  start            启动服务"
    echo "  stop             停止服务"
    echo "  restart          重启服务"
    echo "  status           查看状态"
    echo "  logs             查看日志（Ctrl+C 退出）"
    echo "  backup           备份数据库"
    echo "  restore          恢复数据库"
    ;;
esac
