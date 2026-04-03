#!/bin/bash
# ==================== Atlas 部署脚本 ====================
# 用法: ./deploy.sh [setup|update|logs|status|backup|restore|stop]

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

BACKUP_DIR="$APP_DIR/backups"

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

  # 检查 Docker
  if ! command -v docker &> /dev/null; then
    err "请先安装 Docker: curl -fsSL https://get.docker.com | sudo sh"
  fi

  if ! docker compose version &> /dev/null; then
    err "请先安装 Docker Compose V2"
  fi

  # 检查 .env
  if [ ! -f .env ]; then
    if [ -f .env.production ]; then
      cp .env.production .env
      # 自动生成安全密钥
      JWT=$(openssl rand -hex 32)
      JWT_R=$(openssl rand -hex 32)
      SERVER_IP=$(hostname -I | awk '{print $1}')

      sed -i "s|请替换为随机密钥|$JWT|" .env
      sed -i "s|请替换为另一个随机密钥|$JWT_R|" .env
      sed -i "s|你的服务器IP|$SERVER_IP|" .env

      log "已自动生成安全密钥并写入 .env"
      log "CORS_ORIGINS 已设为 http://$SERVER_IP:3000"
      warn "如需修改请编辑: vi $APP_DIR/.env"
    else
      err "缺少 .env.production 模板文件"
    fi
  fi

  # 创建备份目录
  mkdir -p "$BACKUP_DIR"

  # 构建并启动
  log "构建 Docker 镜像（首次约 2-5 分钟）..."
  docker compose build --no-cache

  log "启动服务..."
  docker compose up -d

  # 等待容器健康
  log "等待服务就绪..."
  for i in $(seq 1 30); do
    if curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  # 执行数据库初始化
  log "初始化数据库..."
  docker compose exec app npx prisma db push --schema=server/prisma/schema.prisma --accept-data-loss 2>/dev/null || true

  # 种子数据
  log "写入种子数据..."
  docker compose exec app npx tsx server/src/prisma/seed.ts 2>/dev/null || log "种子数据已存在，跳过"

  # 最终验证
  sleep 2
  if curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null; then
    echo ""
    log "============================================"
    log "✅ 部署成功！"
    log "访问地址: http://$(hostname -I | awk '{print $1}'):${PORT:-3000}"
    log "默认账号: admin / admin123"
    log "============================================"
    echo ""
    warn "⚠️  请立即登录后修改 admin 默认密码！"
  else
    err "健康检查失败，请查看日志: ./deploy.sh logs"
  fi
}

# ─── 更新部署 ────────────────────────────────────────
update() {
  # 更新前自动备份
  if docker compose ps --status=running | grep -q app; then
    log "更新前自动备份数据库..."
    backup
  fi

  log "拉取最新代码..."
  git pull origin main

  log "重新构建并重启..."
  docker compose build
  docker compose up -d

  # 等待就绪
  sleep 5
  log "同步数据库结构..."
  docker compose exec app npx prisma db push --schema=server/prisma/schema.prisma --accept-data-loss 2>/dev/null || true

  sleep 2
  if curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null; then
    VERSION=$(curl -sf http://localhost:${PORT:-3000}/api/health | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "unknown")
    log "✅ 更新成功！当前版本: v${VERSION}"
  else
    err "健康检查失败，请查看日志: ./deploy.sh logs"
  fi
}

# ─── 查看日志 ────────────────────────────────────────
logs() {
  docker compose logs -f --tail=100
}

# ─── 查看状态 ────────────────────────────────────────
status() {
  docker compose ps
  echo ""
  if curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null; then
    HEALTH=$(curl -sf http://localhost:${PORT:-3000}/api/health)
    VERSION=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "?")
    UPTIME=$(echo "$HEALTH" | python3 -c "import sys,json; u=json.load(sys.stdin)['uptime']; print(f'{int(u//3600)}h {int(u%3600//60)}m')" 2>/dev/null || echo "?")
    log "版本: v${VERSION} | 运行时间: ${UPTIME}"
  else
    warn "应用未响应"
  fi

  # 显示数据卷大小
  echo ""
  DB_SIZE=$(docker compose exec app sh -c 'ls -lh /data/atlas.db 2>/dev/null | awk "{print \$5}"' 2>/dev/null || echo "N/A")
  UPLOAD_SIZE=$(docker compose exec app sh -c 'du -sh /app/server/uploads 2>/dev/null | awk "{print \$1}"' 2>/dev/null || echo "N/A")
  log "数据库: ${DB_SIZE} | 上传文件: ${UPLOAD_SIZE}"
}

# ─── 停止服务 ────────────────────────────────────────
stop() {
  log "停止服务..."
  docker compose down
  log "✅ 已停止"
}

# ─── 数据库备份 ────────────────────────────────────────
backup() {
  mkdir -p "$BACKUP_DIR"
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE="$BACKUP_DIR/atlas_${TIMESTAMP}.db"

  log "备份数据库..."
  # 使用 SQLite 的 .backup 命令确保一致性（比 cp 更安全）
  docker compose exec app sh -c 'sqlite3 /data/atlas.db ".backup /tmp/backup.db"' 2>/dev/null || \
  docker compose cp app:/data/atlas.db "$BACKUP_FILE" 2>/dev/null

  if [ -f "$BACKUP_FILE" ]; then
    log "✅ 备份完成: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | awk '{print $1}'))"
  else
    # 如果上面的 backup 命令生成了临时文件
    docker compose cp app:/tmp/backup.db "$BACKUP_FILE" 2>/dev/null || err "备份失败"
    log "✅ 备份完成: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | awk '{print $1}'))"
  fi

  # 清理 30 天前的备份
  find "$BACKUP_DIR" -name "atlas_*.db" -mtime +30 -delete 2>/dev/null
  BACKUP_COUNT=$(ls "$BACKUP_DIR"/atlas_*.db 2>/dev/null | wc -l)
  log "当前共 ${BACKUP_COUNT} 个备份文件"
}

# ─── 数据库恢复 ────────────────────────────────────────
restore() {
  RESTORE_FILE="${2:-}"

  if [ -z "$RESTORE_FILE" ]; then
    # 列出可用备份
    echo "可用备份:"
    ls -lh "$BACKUP_DIR"/atlas_*.db 2>/dev/null || err "没有找到备份文件"
    echo ""
    err "用法: ./deploy.sh restore backups/atlas_YYYYMMDD_HHMMSS.db"
  fi

  if [ ! -f "$RESTORE_FILE" ]; then
    err "文件不存在: $RESTORE_FILE"
  fi

  warn "⚠️  即将用 $RESTORE_FILE 覆盖现有数据库！"
  warn "当前数据将被替换。确认请输入 yes："
  read -r confirm
  [ "$confirm" != "yes" ] && err "已取消"

  # 恢复前备份当前数据
  log "恢复前备份当前数据..."
  backup

  log "停止应用..."
  docker compose stop app

  log "恢复数据库..."
  docker compose cp "$RESTORE_FILE" app:/data/atlas.db

  log "重启应用..."
  docker compose start app

  sleep 3
  if curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null; then
    log "✅ 恢复完成"
  else
    warn "应用重启中，请稍等后检查: ./deploy.sh status"
  fi
}

# ─── 入口 ────────────────────────────────────────────
case "${1:-}" in
  setup)   setup ;;
  update)  update ;;
  logs)    logs ;;
  status)  status ;;
  stop)    stop ;;
  backup)  backup ;;
  restore) restore "$@" ;;
  *)
    echo "Atlas 部署工具"
    echo ""
    echo "用法: ./deploy.sh <命令>"
    echo ""
    echo "  setup    首次部署（自动生成密钥 + 构建 + 初始化）"
    echo "  update   更新部署（自动备份 + 拉代码 + 重建）"
    echo "  status   查看运行状态 + 数据量"
    echo "  logs     查看实时日志（Ctrl+C 退出）"
    echo "  stop     停止服务"
    echo "  backup   备份数据库（保留 30 天）"
    echo "  restore  恢复数据库"
    ;;
esac
