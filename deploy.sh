#!/bin/bash
# ==================== Atlas 部署脚本 ====================
# 用法: ./deploy.sh [setup|update|logs|status|backup|restore]

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

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
    err "请先安装 Docker: https://docs.docker.com/engine/install/ubuntu/"
  fi

  if ! command -v docker compose &> /dev/null; then
    err "请先安装 Docker Compose V2"
  fi

  # 检查 .env
  if [ ! -f .env ]; then
    if [ -f .env.production ]; then
      cp .env.production .env
      warn "已从 .env.production 创建 .env，请编辑配置："
      warn "  vi $APP_DIR/.env"
      warn "编辑完成后重新运行: ./deploy.sh setup"
      exit 0
    else
      err "缺少 .env 文件，请先创建"
    fi
  fi

  # 验证必要配置
  source .env
  [ "$JWT_SECRET" = "请替换为随机密钥" ] && err "请修改 .env 中的 JWT_SECRET"
  [ "$JWT_REFRESH_SECRET" = "请替换为另一个随机密钥" ] && err "请修改 .env 中的 JWT_REFRESH_SECRET"
  [ "$DB_PASSWORD" = "请替换为安全的随机密码" ] && err "请修改 .env 中的 DB_PASSWORD"

  # 构建并启动
  log "构建 Docker 镜像（首次可能需要几分钟）..."
  docker compose build --no-cache

  log "启动服务..."
  docker compose up -d

  # 等待数据库就绪
  log "等待数据库就绪..."
  sleep 5

  # 执行数据库迁移
  log "执行数据库迁移..."
  docker compose exec app npx prisma migrate deploy --schema=server/prisma/schema.prisma 2>/dev/null || \
  docker compose exec app npx prisma db push --schema=server/prisma/schema.prisma

  # 种子数据
  log "初始化种子数据..."
  docker compose exec app node -e "
    const { execSync } = require('child_process');
    try { execSync('npx tsx server/src/prisma/seed.ts', { stdio: 'inherit' }); }
    catch(e) { console.log('种子数据可能已存在，跳过'); }
  "

  # 验证
  sleep 2
  if curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null; then
    log "✅ 部署成功！"
    log "访问地址: http://$(hostname -I | awk '{print $1}'):${PORT:-3000}"
    log "默认账号: admin / admin123"
  else
    err "健康检查失败，请查看日志: docker compose logs app"
  fi
}

# ─── 更新部署 ────────────────────────────────────────
update() {
  log "拉取最新代码..."
  git pull origin main

  log "重新构建并重启..."
  docker compose build
  docker compose up -d

  # 执行迁移（如有新的 schema 变更）
  sleep 5
  log "执行数据库迁移..."
  docker compose exec app npx prisma migrate deploy --schema=server/prisma/schema.prisma 2>/dev/null || \
  docker compose exec app npx prisma db push --schema=server/prisma/schema.prisma

  sleep 2
  if curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null; then
    VERSION=$(curl -sf http://localhost:${PORT:-3000}/api/health | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "unknown")
    log "✅ 更新成功！当前版本: v${VERSION}"
  else
    err "健康检查失败，请查看日志: docker compose logs app"
  fi
}

# ─── 查看日志 ────────────────────────────────────────
logs() {
  docker compose logs -f --tail=100 "${2:-app}"
}

# ─── 查看状态 ────────────────────────────────────────
status() {
  docker compose ps
  echo ""
  if curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null; then
    log "健康检查: $(curl -sf http://localhost:${PORT:-3000}/api/health)"
  else
    warn "应用未响应"
  fi
}

# ─── 数据库备份 ────────────────────────────────────────
backup() {
  BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
  log "备份数据库到 ${BACKUP_FILE}..."
  docker compose exec -T db pg_dump -U atlas atlas > "$BACKUP_FILE"
  log "✅ 备份完成: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | awk '{print $1}'))"
}

# ─── 数据库恢复 ────────────────────────────────────────
restore() {
  if [ -z "$2" ]; then
    err "用法: ./deploy.sh restore <backup_file.sql>"
  fi

  if [ ! -f "$2" ]; then
    err "文件不存在: $2"
  fi

  warn "⚠️  即将用 $2 覆盖现有数据库，确认请输入 yes："
  read -r confirm
  [ "$confirm" != "yes" ] && err "已取消"

  log "恢复数据库..."
  docker compose exec -T db psql -U atlas atlas < "$2"
  log "✅ 恢复完成"
}

# ─── 入口 ────────────────────────────────────────────
case "${1:-}" in
  setup)   setup ;;
  update)  update ;;
  logs)    logs "$@" ;;
  status)  status ;;
  backup)  backup ;;
  restore) restore "$@" ;;
  *)
    echo "Atlas 部署工具"
    echo ""
    echo "用法: ./deploy.sh <命令>"
    echo ""
    echo "命令:"
    echo "  setup    首次部署（构建+迁移+种子数据）"
    echo "  update   拉取代码并重新部署"
    echo "  status   查看运行状态"
    echo "  logs     查看应用日志（Ctrl+C 退出）"
    echo "  backup   备份数据库"
    echo "  restore  恢复数据库"
    ;;
esac
