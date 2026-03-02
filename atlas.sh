#!/bin/bash
#
# Atlas 服务管理脚本
# 用法: ./atlas.sh {start|stop|restart|status|logs|db:push|db:studio|db:seed}
#

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_PORT=3000
CLIENT_PORT=5173
PID_DIR="$PROJECT_DIR/.pids"
LOG_DIR="$PROJECT_DIR/.logs"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

mkdir -p "$PID_DIR" "$LOG_DIR"

# ─── 辅助函数 ───────────────────────────────────────────────

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 获取版本号
get_version() {
  node -e "console.log(require('$PROJECT_DIR/package.json').version)" 2>/dev/null || echo "unknown"
}

# 检查端口是否被占用，返回 PID
get_pid_on_port() {
  lsof -ti:"$1" 2>/dev/null | head -1
}

# 等待端口就绪
wait_for_port() {
  local port=$1 name=$2 timeout=${3:-30}
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    if lsof -ti:"$port" &>/dev/null; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  log_error "$name 启动超时（${timeout}s），请检查日志: $LOG_DIR/"
  return 1
}

# ─── 启动 ────────────────────────────────────────────────────

start_server() {
  local pid
  pid=$(get_pid_on_port $SERVER_PORT)
  if [ -n "$pid" ]; then
    log_warn "后端服务已在运行 (PID: $pid, 端口: $SERVER_PORT)"
    return 0
  fi

  log_info "启动后端服务..."
  cd "$PROJECT_DIR"
  nohup npm run dev:server > "$LOG_DIR/server.log" 2>&1 &
  local bg_pid=$!
  echo "$bg_pid" > "$PID_DIR/server.pid"

  if wait_for_port $SERVER_PORT "后端服务" 15; then
    local real_pid
    real_pid=$(get_pid_on_port $SERVER_PORT)
    log_info "后端服务已启动 (PID: $real_pid, 端口: $SERVER_PORT)"
  fi
}

start_client() {
  local pid
  pid=$(get_pid_on_port $CLIENT_PORT)
  if [ -n "$pid" ]; then
    log_warn "前端服务已在运行 (PID: $pid, 端口: $CLIENT_PORT)"
    return 0
  fi

  log_info "启动前端服务..."
  cd "$PROJECT_DIR"
  nohup npm run dev:client > "$LOG_DIR/client.log" 2>&1 &
  local bg_pid=$!
  echo "$bg_pid" > "$PID_DIR/client.pid"

  if wait_for_port $CLIENT_PORT "前端服务" 15; then
    local real_pid
    real_pid=$(get_pid_on_port $CLIENT_PORT)
    log_info "前端服务已启动 (PID: $real_pid, 端口: $CLIENT_PORT)"
  fi
}

start_all() {
  echo -e "${CYAN}━━━ Atlas v$(get_version) 启动服务 ━━━${NC}"
  start_server
  start_client
  echo ""
  show_status
}

# ─── 停止 ────────────────────────────────────────────────────

stop_port() {
  local port=$1 name=$2
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -z "$pids" ]; then
    log_info "$name 未在运行"
    return 0
  fi

  log_info "停止 $name (端口: $port)..."
  echo "$pids" | xargs kill 2>/dev/null || true

  # 等待进程退出
  local elapsed=0
  while [ $elapsed -lt 5 ]; do
    if ! lsof -ti:"$port" &>/dev/null; then
      log_info "$name 已停止"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  # 强制终止
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    log_warn "正在强制终止 $name..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
    log_info "$name 已强制停止"
  fi
}

stop_all() {
  echo -e "${CYAN}━━━ Atlas 停止服务 ━━━${NC}"
  stop_port $SERVER_PORT "后端服务"
  stop_port $CLIENT_PORT "前端服务"
  rm -f "$PID_DIR"/*.pid
  log_info "所有服务已停止"
}

# ─── 重启 ────────────────────────────────────────────────────

restart_all() {
  echo -e "${CYAN}━━━ Atlas v$(get_version) 重启服务 ━━━${NC}"
  stop_all
  echo ""
  sleep 1
  start_all
}

restart_server() {
  echo -e "${CYAN}━━━ Atlas 重启后端 ━━━${NC}"
  stop_port $SERVER_PORT "后端服务"
  rm -f "$PID_DIR/server.pid"
  sleep 1
  start_server
  echo ""
  show_status
}

restart_client() {
  echo -e "${CYAN}━━━ Atlas 重启前端 ━━━${NC}"
  stop_port $CLIENT_PORT "前端服务"
  rm -f "$PID_DIR/client.pid"
  sleep 1
  start_client
  echo ""
  show_status
}

# ─── 状态 ────────────────────────────────────────────────────

show_status() {
  echo -e "${CYAN}━━━ Atlas v$(get_version) 服务状态 ━━━${NC}"
  echo ""

  local server_pid client_pid

  server_pid=$(get_pid_on_port $SERVER_PORT)
  if [ -n "$server_pid" ]; then
    echo -e "  后端服务:  ${GREEN}● 运行中${NC}  PID: $server_pid  端口: $SERVER_PORT"
    # 健康检查
    local health
    health=$(curl -s --max-time 2 "http://localhost:$SERVER_PORT/api/health" 2>/dev/null || echo "")
    if [ -n "$health" ]; then
      echo -e "  健康检查:  ${GREEN}✓ 正常${NC}  $health"
    fi
  else
    echo -e "  后端服务:  ${RED}● 已停止${NC}"
  fi

  client_pid=$(get_pid_on_port $CLIENT_PORT)
  if [ -n "$client_pid" ]; then
    echo -e "  前端服务:  ${GREEN}● 运行中${NC}  PID: $client_pid  端口: $CLIENT_PORT"
  else
    echo -e "  前端服务:  ${RED}● 已停止${NC}"
  fi

  echo ""
}

# ─── 日志 ────────────────────────────────────────────────────

show_logs() {
  local target=${1:-all}
  case "$target" in
    server)
      tail -f "$LOG_DIR/server.log"
      ;;
    client)
      tail -f "$LOG_DIR/client.log"
      ;;
    all)
      tail -f "$LOG_DIR/server.log" "$LOG_DIR/client.log"
      ;;
    *)
      log_error "未知日志目标: $target (可选: server, client, all)"
      exit 1
      ;;
  esac
}

# ─── 数据库快捷命令 ──────────────────────────────────────────

db_push() {
  log_info "同步数据库 Schema..."
  cd "$PROJECT_DIR/server"
  npx prisma db push
  npx prisma generate
  log_info "Schema 同步完成，建议重启后端: ./atlas.sh restart:server"
}

db_studio() {
  log_info "启动 Prisma Studio..."
  cd "$PROJECT_DIR/server"
  npx prisma studio
}

db_seed() {
  log_info "执行种子数据..."
  cd "$PROJECT_DIR/server"
  npx tsx src/prisma/seed.ts
  log_info "种子数据已导入"
}

# ─── 帮助 ────────────────────────────────────────────────────

show_help() {
  echo -e "${CYAN}Atlas 服务管理脚本${NC}"
  echo ""
  echo "用法: ./atlas.sh <命令>"
  echo ""
  echo "服务管理:"
  echo "  start            启动前后端服务"
  echo "  stop             停止所有服务"
  echo "  restart          重启所有服务"
  echo "  restart:server   仅重启后端"
  echo "  restart:client   仅重启前端"
  echo "  status           查看服务状态"
  echo "  logs [target]    查看实时日志 (server|client|all)"
  echo ""
  echo "数据库:"
  echo "  db:push          同步 Schema 到数据库 + 重新生成 Prisma Client"
  echo "  db:studio        打开 Prisma Studio 数据库 GUI"
  echo "  db:seed          导入种子数据"
  echo ""
  echo "示例:"
  echo "  ./atlas.sh start           # 启动所有服务"
  echo "  ./atlas.sh restart:server  # 改完后端代码后仅重启后端"
  echo "  ./atlas.sh logs server     # 查看后端日志"
  echo "  ./atlas.sh db:push         # 改完 schema 后同步数据库"
  echo ""
}

# ─── 入口 ────────────────────────────────────────────────────

case "${1:-}" in
  start)          start_all ;;
  stop)           stop_all ;;
  restart)        restart_all ;;
  restart:server) restart_server ;;
  restart:client) restart_client ;;
  status)         show_status ;;
  logs)           show_logs "${2:-all}" ;;
  db:push)        db_push ;;
  db:studio)      db_studio ;;
  db:seed)        db_seed ;;
  help|--help|-h) show_help ;;
  *)
    show_help
    exit 1
    ;;
esac
