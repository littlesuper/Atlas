#!/usr/bin/env bash
# ============================================================================
# Atlas 生产服务器初始化脚本（一次性，幂等）
# ----------------------------------------------------------------------------
# 在一台全新的 Ubuntu 22.04+ 服务器上以 root 执行：
#
#   # 方式 A：先把脚本传上去
#   scp scripts/provision-prod.sh root@<server>:/root/
#   ssh root@<server>
#   GIT_USERNAME=xxx GIT_PASSWORD=xxx sudo bash /root/provision-prod.sh
#
#   # 方式 B：从 gitea 直接拉
#   curl -fsSL http://10.168.232.219/gitadmin/atlas/raw/branch/main/scripts/provision-prod.sh -o /tmp/p.sh
#   GIT_USERNAME=xxx GIT_PASSWORD=xxx sudo bash /tmp/p.sh
#
# 本脚本职责（与 deploy.sh 的分工）：
#   - 系统层：OS/资源检查、swap、apt deps、Node 20、UFW、cron
#   - 账号层：创建专用 atlas 用户、配置 NOPASSWD sudo、目录权限
#   - 代码层：克隆 gitea 仓库（凭据用完即抹）
#   - 应用层：直接调 ./deploy.sh setup，由它负责 .env / Prisma / systemd / 启动
#   - 反代层：可选装 Nginx + Let's Encrypt（仅当设置了 DOMAIN）
#   - 验证：调 /api/health 并跑 scripts/prod-check.sh
# ============================================================================

set -euo pipefail

# ─── 可调参数（环境变量覆盖）────────────────────────────────────
GIT_REPO="${GIT_REPO:-http://10.168.232.219/gitadmin/atlas.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
GIT_USERNAME="${GIT_USERNAME:-}"          # gitea 用户名（仓库私有时必填）
GIT_PASSWORD="${GIT_PASSWORD:-}"          # gitea 密码/token（同上）

INSTALL_DIR="${INSTALL_DIR:-/opt/atlas}"  # 代码与数据所在目录
RUN_USER="${RUN_USER:-atlas}"             # 应用运行账号（不存在则创建）
NODE_MAJOR="${NODE_MAJOR:-20}"

DOMAIN="${DOMAIN:-}"                       # 留空 → 跳过 Nginx，只对外 :3000
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"         # 设了 DOMAIN 就必填

ENABLE_UFW="${ENABLE_UFW:-1}"
SSH_PORT="${SSH_PORT:-22}"
ALLOW_PORT_3000="${ALLOW_PORT_3000:-1}"    # 没有 Nginx 时建议保持 1

ENABLE_BACKUP_CRON="${ENABLE_BACKUP_CRON:-1}"
BACKUP_CRON_TIME="${BACKUP_CRON_TIME:-0 2 * * *}"

# 自动部署轮询：每分钟检查 gitea 是否有新的 v* tag，有则自动 update
# 仅看 tag，不跟 main commit；推 commit 不上线，打 tag 才上线
ENABLE_POLL_CRON="${ENABLE_POLL_CRON:-1}"
POLL_CRON_TIME="${POLL_CRON_TIME:-* * * * *}"
TAG_PATTERN="${TAG_PATTERN:-v*}"

ENABLE_SWAP="${ENABLE_SWAP:-1}"
SWAPSIZE="${SWAPSIZE:-2G}"
# ─────────────────────────────────────────────────────────────

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[provision]${NC} $*"; }
warn() { echo -e "${YELLOW}[provision]${NC} $*"; }
err()  { echo -e "${RED}[provision]${NC} $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

[ "$(id -u)" -eq 0 ] || err "必须以 root 身份运行（sudo bash $0）"

# ─── Preflight ────────────────────────────────────────────────
preflight() {
    log "── 系统预检 ──"

    if [ -f /etc/os-release ]; then
        log "  OS: $(awk -F= '/^PRETTY_NAME/{gsub(/"/,"",$2);print $2}' /etc/os-release)"
        grep -qE 'Ubuntu|Debian' /etc/os-release \
            || warn "  非 Ubuntu/Debian，apt 步骤可能需要手工调整"
    fi

    local mem_mb
    mem_mb=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
    log "  内存: ${mem_mb} MB"
    [ "$mem_mb" -lt 1800 ] && warn "  内存 < 2GB，建议保持 ENABLE_SWAP=1"

    local disk_gb
    disk_gb=$(df -BG --output=avail "$(dirname "$INSTALL_DIR")" 2>/dev/null \
              | tail -1 | tr -dc 0-9)
    disk_gb=${disk_gb:-0}
    log "  磁盘可用: ${disk_gb} GB（${INSTALL_DIR%/*}）"
    [ "$disk_gb" -lt 10 ] && err "  磁盘可用 < 10 GB，拒绝继续"

    # 端口占用检查
    local ports_to_check="3000"
    [ -n "$DOMAIN" ] && ports_to_check="3000 80 443"
    for p in $ports_to_check; do
        if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${p}\$"; then
            err "  端口 ${p} 已被占用，请先释放（lsof -i:${p}）"
        fi
    done

    # 外网检查（内网部署没外网时只提示）
    if ! curl -sf --max-time 5 https://deb.nodesource.com >/dev/null; then
        warn "  无法访问 deb.nodesource.com，纯内网部署需自备 Node 镜像源"
    fi

    if [ -n "$DOMAIN" ] && [ -z "$CERTBOT_EMAIL" ]; then
        err "DOMAIN=${DOMAIN} 必须同时设置 CERTBOT_EMAIL"
    fi
}

# ─── Swap（小内存机器友好）────────────────────────────────────
setup_swap() {
    [ "$ENABLE_SWAP" = "1" ] || { log "── 跳过 swap ──"; return; }
    log "── 配置 swap (${SWAPSIZE}) ──"
    if swapon --show=NAME --noheadings | grep -q .; then
        log "  已有 swap，跳过"
        return
    fi
    fallocate -l "$SWAPSIZE" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
}

# ─── 系统依赖 + Node ──────────────────────────────────────────
install_system_deps() {
    log "── 系统依赖 ──"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq curl git ca-certificates gnupg sqlite3 ufw cron python3

    if ! have node || [ "$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')" -lt "$NODE_MAJOR" ]; then
        log "  安装 Node.js ${NODE_MAJOR}"
        curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
        apt-get install -y -qq nodejs
    fi
    log "  Node $(node -v) / npm $(npm -v)"
}

# ─── 用户、目录、sudo ─────────────────────────────────────────
setup_user_and_dir() {
    log "── 应用账号 ${RUN_USER} ──"
    if ! id -u "$RUN_USER" >/dev/null 2>&1; then
        useradd --system --create-home --shell /bin/bash "$RUN_USER"
        log "  已创建用户 ${RUN_USER}"
    else
        log "  用户已存在，复用"
    fi

    # atlas 用户需要 sudo 来：apt(deploy.sh 里仍然有兜底) + systemd 写文件 + systemctl
    # 这里给完整 NOPASSWD sudo；如需收紧可改成显式白名单。
    local sudoers="/etc/sudoers.d/atlas-deploy"
    cat > "$sudoers" <<EOF
${RUN_USER} ALL=(ALL) NOPASSWD: ALL
EOF
    chmod 440 "$sudoers"
    visudo -cf "$sudoers" >/dev/null || { rm -f "$sudoers"; err "sudoers 校验失败"; }

    install -d -m 755 -o "$RUN_USER" -g "$RUN_USER" "$INSTALL_DIR"
}

# ─── 拉取代码 ─────────────────────────────────────────────────
clone_repo() {
    log "── 拉取代码 ${GIT_REPO}@${GIT_BRANCH} ──"
    if [ -d "${INSTALL_DIR}/.git" ]; then
        log "  目录已是 git 仓库，强制对齐到 origin/${GIT_BRANCH}"
        sudo -u "$RUN_USER" git -C "$INSTALL_DIR" fetch --quiet origin
        sudo -u "$RUN_USER" git -C "$INSTALL_DIR" checkout -q "$GIT_BRANCH"
        sudo -u "$RUN_USER" git -C "$INSTALL_DIR" reset --hard "origin/${GIT_BRANCH}"
    else
        # 目录非空（且不是 git）→ 报错而非默默 clone 失败
        if [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
            err "${INSTALL_DIR} 非空但不是 git 仓库，请清理后重试"
        fi
        local repo="$GIT_REPO"
        if [ -n "$GIT_USERNAME" ] && [ -n "$GIT_PASSWORD" ]; then
            local enc_user enc_pass
            enc_user=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$GIT_USERNAME")
            enc_pass=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$GIT_PASSWORD")
            repo="${GIT_REPO/:\/\//://${enc_user}:${enc_pass}@}"
        fi
        sudo -u "$RUN_USER" git clone --branch "$GIT_BRANCH" "$repo" "$INSTALL_DIR"
        # 抹掉 URL 里的凭据，避免后续 git pull 时密码留在 .git/config
        sudo -u "$RUN_USER" git -C "$INSTALL_DIR" remote set-url origin "$GIT_REPO"
    fi

    # 首次部署：如果仓库已有 v* tag，切换到最新的（按 semver 排序）
    # 这样生产服务器从一开始就跑在"打过 tag 的发布快照"上
    local latest_tag
    latest_tag=$(sudo -u "$RUN_USER" git -C "$INSTALL_DIR" tag -l "$TAG_PATTERN" --sort=-v:refname | head -1)
    if [ -n "$latest_tag" ]; then
        log "  发现已有发布 tag，切换到最新: ${latest_tag}"
        sudo -u "$RUN_USER" git -C "$INSTALL_DIR" -c advice.detachedHead=false checkout -f "$latest_tag"
    else
        log "  仓库还没有 ${TAG_PATTERN} tag，本次按 ${GIT_BRANCH} 部署；之后打 tag 才会触发自动上线"
    fi
}

# ─── 调用 deploy.sh setup ─────────────────────────────────────
run_app_setup() {
    log "── 跑 deploy.sh setup（应用层部署）──"
    [ -x "${INSTALL_DIR}/deploy.sh" ] || err "${INSTALL_DIR}/deploy.sh 不存在或不可执行"
    sudo -u "$RUN_USER" -H bash -lc "cd '${INSTALL_DIR}' && ./deploy.sh setup"
}

# ─── 防火墙 ───────────────────────────────────────────────────
setup_firewall() {
    [ "$ENABLE_UFW" = "1" ] || { log "── 跳过 UFW ──"; return; }
    log "── 配置 UFW ──"
    ufw --force reset >/dev/null
    ufw default deny incoming  >/dev/null
    ufw default allow outgoing >/dev/null
    ufw allow "${SSH_PORT}/tcp" >/dev/null
    if [ -n "$DOMAIN" ]; then
        ufw allow 80/tcp  >/dev/null
        ufw allow 443/tcp >/dev/null
        if [ "$ALLOW_PORT_3000" = "1" ]; then
            warn "  DOMAIN 已设置，建议 ALLOW_PORT_3000=0 关掉直连 3000（只走 Nginx）"
        fi
    fi
    [ "$ALLOW_PORT_3000" = "1" ] && ufw allow 3000/tcp >/dev/null
    ufw --force enable >/dev/null
    log "  $(ufw status | head -3 | tail -1)"
}

# ─── 备份 cron ────────────────────────────────────────────────
setup_backup_cron() {
    [ "$ENABLE_BACKUP_CRON" = "1" ] || { log "── 跳过备份 cron ──"; return; }
    log "── 备份 cron (${BACKUP_CRON_TIME}) ──"
    local cronfile="/etc/cron.d/atlas-backup"
    cat > "$cronfile" <<EOF
# Atlas SQLite 每日备份（由 provision-prod.sh 创建）
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
${BACKUP_CRON_TIME} ${RUN_USER} cd ${INSTALL_DIR} && ./deploy.sh backup >> ${INSTALL_DIR}/.logs/backup.log 2>&1
EOF
    chmod 644 "$cronfile"
    log "  已写入 ${cronfile}"
}

# ─── 自动部署 poll cron ──────────────────────────────────────
# 每分钟检查 gitea 是否有新的 v* tag。新 tag → 自动 checkout + update + 重启。
# 推 commit 不上线，打 tag 才上线（生产 = 发布快照）。
setup_poll_cron() {
    [ "$ENABLE_POLL_CRON" = "1" ] || { log "── 跳过自动部署 poll cron ──"; return; }
    log "── 自动部署 poll cron (${POLL_CRON_TIME}) ──"
    local cronfile="/etc/cron.d/atlas-poll-deploy"
    cat > "$cronfile" <<EOF
# Atlas 自动部署：每分钟检查 gitea 是否有新的 ${TAG_PATTERN} tag
# 由 provision-prod.sh 创建；逻辑见 deploy.sh poll_update()
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
TAG_PATTERN=${TAG_PATTERN}
${POLL_CRON_TIME} ${RUN_USER} cd ${INSTALL_DIR} && ./deploy.sh poll-update >> ${INSTALL_DIR}/.logs/poll.log 2>&1
EOF
    chmod 644 "$cronfile"
    log "  已写入 ${cronfile}"
    log "  日志: ${INSTALL_DIR}/.logs/poll.log（仅新发布触发部署时才有内容）"
}

# ─── 可选：Nginx + HTTPS ──────────────────────────────────────
setup_nginx_https() {
    [ -n "$DOMAIN" ] || { log "── DOMAIN 未设置，跳过 Nginx/HTTPS ──"; return; }
    log "── Nginx + Certbot for ${DOMAIN} ──"
    apt-get install -y -qq nginx certbot python3-certbot-nginx

    cat > "/etc/nginx/sites-available/atlas" <<NGX
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout                 60s;
    }
}
NGX
    ln -sf /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/atlas
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
    systemctl reload nginx

    log "  申请 Let's Encrypt 证书"
    certbot --nginx --non-interactive --agree-tos -m "$CERTBOT_EMAIL" -d "$DOMAIN" --redirect

    # 把 CORS_ORIGINS 改成 https 域名并重启
    if [ -f "${INSTALL_DIR}/.env" ]; then
        sudo -u "$RUN_USER" sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${DOMAIN}|" "${INSTALL_DIR}/.env"
        sudo -u "$RUN_USER" -H bash -lc "cd '${INSTALL_DIR}' && ./deploy.sh restart"
    fi
}

# ─── 验证 ─────────────────────────────────────────────────────
verify() {
    log "── 验证 ──"
    sleep 2
    local base="http://127.0.0.1:3000"
    if curl -sf --max-time 5 "${base}/api/health" >/dev/null; then
        log "  ✅ ${base}/api/health → $(curl -sf "${base}/api/health")"
    else
        warn "  ❌ ${base}/api/health 无响应，看 ${INSTALL_DIR}/.logs/error.log"
    fi
    if [ -x "${INSTALL_DIR}/scripts/prod-check.sh" ]; then
        log "  执行 prod-check.sh（详细健康巡检）"
        sudo -u "$RUN_USER" -H bash -lc "cd '${INSTALL_DIR}' && bash scripts/prod-check.sh '${base}'" \
            || warn "  prod-check 有失败项，请审查输出"
    fi
}

# ─── 入口 ─────────────────────────────────────────────────────
preflight
setup_swap
install_system_deps
setup_user_and_dir
clone_repo
run_app_setup
setup_firewall
setup_backup_cron
setup_poll_cron
setup_nginx_https
verify

IP=$(hostname -I | awk '{print $1}')
echo
log "════════════════════════════════════════"
log "🎉 部署完成"
if [ -n "$DOMAIN" ]; then
    log "访问: https://${DOMAIN}"
else
    log "访问: http://${IP}:3000"
fi
log "默认账号: admin / admin123  ←  立刻登录后修改！"
log "代码目录: ${INSTALL_DIR}（属主 ${RUN_USER}）"
log "运维命令: sudo -u ${RUN_USER} bash -lc 'cd ${INSTALL_DIR} && ./deploy.sh {status|logs|update|backup|restore}'"
log "数据备份: 每天 ${BACKUP_CRON_TIME}，保留 30 天，存于 ${INSTALL_DIR}/backups/"
if [ "$ENABLE_POLL_CRON" = "1" ]; then
    log ""
    log "🔁 自动部署已启用（每分钟检查 ${TAG_PATTERN} tag）"
    log "   发布流程: 本地 git tag v1.2.0 && git push origin v1.2.0"
    log "   生产服务器 1 分钟内自动 checkout v1.2.0 → 重建 → 重启"
    log "   推 commit 不上线，打 tag 才上线"
    log "   poll 日志: ${INSTALL_DIR}/.logs/poll.log"
    log "   手动部署/回滚: sudo -u ${RUN_USER} bash -lc 'cd ${INSTALL_DIR} && ./deploy.sh update v1.1.0'"
fi
log "════════════════════════════════════════"
