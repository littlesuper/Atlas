#!/usr/bin/env bash
# ============================================================================
# Atlas Production Deployment Validation Script
# ============================================================================
# Usage: scripts/prod-check.sh [SERVER_URL]
#   SERVER_URL  Base URL (default: http://localhost:3000)
#
# Exit codes: 0=all PASS  1=some FAIL  2=P0 (critical) FAIL
set -uo pipefail

SERVER_URL="${1:-http://localhost:3000}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TMPDIR_WORK=$(mktemp -d)
trap 'rm -rf "$TMPDIR_WORK"' EXIT

# ============================================================================
# Environment detection
# ============================================================================
IS_PRODUCTION=false
ENV_FILE="$PROJECT_ROOT/server/.env"

_detect_env() {
    [ "${NODE_ENV:-}" = "production" ] && IS_PRODUCTION=true && return
    if [ -f "$ENV_FILE" ]; then
        local val
        val=$(grep -E '^NODE_ENV=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
        [ "$val" = "production" ] && IS_PRODUCTION=true
    fi
}
_detect_env

_resolve_db() {
    local db_url=""
    if [ -f "$ENV_FILE" ]; then
        db_url=$(grep -E '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    fi
    DB_PATH=""
    if [[ "$db_url" == file:* ]]; then
        local rel="${db_url#file:}"
        local candidate=""
        if [[ "$rel" = /* ]]; then
            candidate="$rel"
        else
            candidate="$PROJECT_ROOT/server/$rel"
        fi
        if [ -f "$candidate" ]; then
            DB_PATH="$candidate"
        fi
    fi
    if [ -z "$DB_PATH" ] && [ -f "$PROJECT_ROOT/server/prisma/dev.db" ]; then
        DB_PATH="$PROJECT_ROOT/server/prisma/dev.db"
    fi
    if [ -z "$DB_PATH" ] && [ -f "$PROJECT_ROOT/data/atlas.db" ]; then
        DB_PATH="$PROJECT_ROOT/data/atlas.db"
    fi
}
_resolve_db

# ============================================================================
# Colors
# ============================================================================
_tty_colors() {
    if [ -t 1 ]; then
        R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' B='\033[1m' D='\033[2m' N='\033[0m'
    else
        R='' G='' Y='' C='' B='' D='' N=''
    fi
}
_tty_colors

# ============================================================================
# Counters & P0 definitions
# ============================================================================
PASS=0; FAIL=0; SKIP=0; P0_FAIL=0
P0_IDS=" B-001 B-004 D-201 "
is_p0() { echo "$P0_IDS" | grep -q " $1 "; }

# ============================================================================
# Expected DB tables (from schema.prisma @@map directives + _prisma_migrations)
# ============================================================================
MODEL_TABLES="users roles permissions user_roles role_permissions
projects project_members holidays activities check_items
project_archives project_templates template_activities
risk_assessments risk_items risk_item_logs weekly_reports
products product_change_logs ai_configs ai_usage_logs
wecom_configs activity_comments notifications audit_logs"
EXPECTED_TABLE_COUNT=27

# ============================================================================
# Helper functions
# ============================================================================
result() {
    local id="$1" status="$2" desc="$3"
    local color=""
    case "$status" in
        PASS) color="$G"; ((PASS++)) ;;
        FAIL) color="$R"; ((FAIL++)); is_p0 "$id" && ((P0_FAIL++)) ;;
        N-A)  color="$Y"; ((SKIP++)) ;;
    esac
    printf "  [${C}%s${N}] ${B}${color}%-4s${N} — %s\n" "$id" "$status" "$desc"
}

env_val() {
    grep -E "^${1}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed "s/^[\"']//;s/[\"']$//" || true
}

json_field() {
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))" 2>/dev/null
}

db_query() {
    if [ -z "$DB_PATH" ] || [ ! -f "$DB_PATH" ]; then return 1; fi
    if command -v sqlite3 &>/dev/null; then
        sqlite3 "$DB_PATH" "$1" 2>/dev/null
    elif command -v python3 &>/dev/null; then
        python3 -c "
import sqlite3
c=sqlite3.connect('$DB_PATH')
[print(r[0]) for r in c.execute('''$1''').fetchall()]
c.close()
" 2>/dev/null
    else
        return 1
    fi
}

_REQ_IDX=0
curl_body() {
    _REQ_IDX=$((_REQ_IDX + 1))
    local out="$TMPDIR_WORK/resp_${_REQ_IDX}"
    curl -sS -w '\n%{http_code} %{time_total}' -o "$out.body" "$@" 2>/dev/null > "$out.meta"
    _LAST_HTTP=$(tail -1 < "$out.meta" | awk '{print $1}')
    _LAST_TIME=$(tail -1 < "$out.meta" | awk '{print $2}')
    _LAST_BODY=$(cat "$out.body" 2>/dev/null)
}

# ============================================================================
# Header
# ============================================================================
echo ""
printf "${B}================================================================${N}\n"
printf "${B}  Atlas Deployment Validation${N}\n"
printf "${B}================================================================${N}\n"
printf "  Server:    %s\n" "$SERVER_URL"
printf "  Project:   %s\n" "$PROJECT_ROOT"
printf "  Mode:      %s\n" "$($IS_PRODUCTION && echo PRODUCTION || echo DEVELOPMENT)"
printf "  DB:        %s\n" "${DB_PATH:-<not found>}"
printf "  Node:      %s\n" "$(node -v 2>/dev/null || echo '<not found>')"
echo ""

# ============================================================================
# Section A — Static Analysis
# ============================================================================
printf "${B}── A: Static Analysis ${D}──────────────────────────────────────────${N}\n"

# A-001  DEPLOYMENT.md vs deploy.sh inconsistency
_a001=false
if [ -f "$PROJECT_ROOT/DEPLOYMENT.md" ] && [ -f "$PROJECT_ROOT/deploy.sh" ]; then
    _dm_pg=$(grep -ci 'postgresql\|PostgreSQL' "$PROJECT_ROOT/DEPLOYMENT.md" 2>/dev/null || echo 0)
    _dm_pm2=$(grep -ci 'PM2\b\|pm2 ' "$PROJECT_ROOT/DEPLOYMENT.md" 2>/dev/null || echo 0)
    _ds_sqlite=$(grep -c 'sqlite\|\.db' "$PROJECT_ROOT/deploy.sh" 2>/dev/null || echo 0)
    _ds_tsx=$(grep -c 'tsx' "$PROJECT_ROOT/deploy.sh" 2>/dev/null || echo 0)
    if [ "$_dm_pg" -gt 0 ] && [ "$_ds_sqlite" -gt 0 ]; then _a001=true; fi
fi
if $_a001; then
    result "A-001" "FAIL" "DEPLOYMENT.md (PostgreSQL/PM2) vs deploy.sh (SQLite/tsx) — inconsistent"
else
    result "A-001" "PASS" "DEPLOYMENT.md and deploy.sh deployment strategy consistent"
fi

# A-002  server build script is echo (placeholder)
if [ -f "$PROJECT_ROOT/server/package.json" ]; then
    _build=$(python3 -c "
import json
with open('$PROJECT_ROOT/server/package.json') as f:
    print(json.load(f).get('scripts',{}).get('build',''))
" 2>/dev/null)
    if echo "$_build" | grep -q '^echo'; then
        result "A-002" "FAIL" "server build script is placeholder: $_build"
    else
        result "A-002" "PASS" "server build script is functional"
    fi
else
    result "A-002" "N-A" "server/package.json not found"
fi

# A-003  schema.prisma provider
SCHEMA_FILE="$PROJECT_ROOT/server/prisma/schema.prisma"
if [ -f "$SCHEMA_FILE" ]; then
    _prov=$(grep 'provider = ' "$SCHEMA_FILE" | grep -v 'prisma-client' | head -1 | sed 's/.*provider = "//;s/".*//')
    if $IS_PRODUCTION && [ "$_prov" != "postgresql" ]; then
        result "A-003" "FAIL" "schema provider=$_prov (expected postgresql in production)"
    else
        result "A-003" "PASS" "schema provider=$_prov ($($IS_PRODUCTION && echo production || echo development))"
    fi
else
    result "A-003" "N-A" "schema.prisma not found"
fi

# A-201 ~ A-205  Environment variables
if [ -f "$ENV_FILE" ]; then
    _jwt=$(env_val JWT_SECRET)
    if [ -n "$_jwt" ] && [ "$_jwt" != "your-jwt-secret-here" ] && [ "$_jwt" != "hw-system-jwt-secret" ]; then
        result "A-201" "PASS" "JWT_SECRET is set and non-default"
    elif $IS_PRODUCTION; then
        result "A-201" "FAIL" "JWT_SECRET is default/empty (critical in production)"
    else
        result "A-201" "N-A" "JWT_SECRET uses default value (acceptable in dev)"
    fi

    _jwtr=$(env_val JWT_REFRESH_SECRET)
    if [ -n "$_jwtr" ] && [ "$_jwtr" != "your-refresh-secret-here" ] && [ "$_jwtr" != "hw-system-refresh-secret" ]; then
        result "A-202" "PASS" "JWT_REFRESH_SECRET is set and non-default"
    elif $IS_PRODUCTION; then
        result "A-202" "FAIL" "JWT_REFRESH_SECRET is default/empty (critical in production)"
    else
        result "A-202" "N-A" "JWT_REFRESH_SECRET uses default value (acceptable in dev)"
    fi

    _cors=$(env_val CORS_ORIGINS)
    if [ -n "$_cors" ]; then
        result "A-203" "PASS" "CORS_ORIGINS is set ($_cors)"
    else
        result "A-203" "FAIL" "CORS_ORIGINS is empty"
    fi

    _dburl=$(env_val DATABASE_URL)
    if [ -n "$_dburl" ]; then
        result "A-204" "PASS" "DATABASE_URL is set"
    else
        result "A-204" "FAIL" "DATABASE_URL is empty"
    fi

    _port=$(env_val PORT)
    if [ -n "$_port" ]; then
        result "A-205" "PASS" "PORT=$_port"
    else
        result "A-205" "N-A" "PORT not set (defaults to 3000)"
    fi

    # A-206 / A-207 (NODE_ENV and other vars)
    _nenv=$(env_val NODE_ENV)
    if [ -n "$_nenv" ]; then
        result "A-206" "PASS" "NODE_ENV=$_nenv"
    else
        result "A-206" "N-A" "NODE_ENV not set"
    fi
else
    for _id in A-201 A-202 A-203 A-204 A-205 A-206; do
        result "$_id" "N-A" ".env not found"
    done
fi

# A-301  Node >= 20
_node_major=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -n "$_node_major" ] && [ "$_node_major" -ge 20 ]; then
    result "A-301" "PASS" "Node.js $(node -v) (>= 20)"
elif [ -n "$_node_major" ]; then
    result "A-301" "FAIL" "Node.js $(node -v) (< 20)"
else
    result "A-301" "FAIL" "Node.js not found"
fi

# A-302  tsx module
if [ -f "$PROJECT_ROOT/node_modules/tsx/dist/cli.mjs" ] || \
   [ -f "$PROJECT_ROOT/server/node_modules/tsx/dist/cli.mjs" ] || \
   npx tsx --version &>/dev/null; then
    result "A-302" "PASS" "tsx runtime available"
else
    result "A-302" "FAIL" "tsx not found"
fi

# A-303  Prisma client generated
_pc="$PROJECT_ROOT/server/node_modules/.prisma/client"
if [ -d "$_pc" ] && [ -f "$_pc/index.js" ]; then
    result "A-303" "PASS" ".prisma/client generated"
else
    result "A-303" "FAIL" ".prisma/client not found (run: npx prisma generate)"
fi

# A-304  Frontend built
if [ -f "$PROJECT_ROOT/client/dist/index.html" ]; then
    result "A-304" "PASS" "client/dist/index.html exists"
elif $IS_PRODUCTION; then
    result "A-304" "FAIL" "client/dist/index.html missing (required in production)"
else
    result "A-304" "N-A" "client/dist/index.html missing (dev uses Vite proxy)"
fi

echo ""

# ============================================================================
# Section B — HTTP Endpoints
# ============================================================================
printf "${B}── B: HTTP Endpoints ${D}─────────────────────────────────────────────${N}\n"

ADMIN_TOKEN=""
PKG_VER=""

# B-001  Health check
curl_body "$SERVER_URL/api/health"
HEALTH_TIME="${_LAST_TIME:-0}"
if [ "$_LAST_HTTP" = "200" ]; then
    HEALTH_VER=$(echo "$_LAST_BODY" | json_field version)
    result "B-001" "PASS" "/api/health 200 — version=$HEALTH_VER uptime=$(echo "$_LAST_BODY" | json_field uptime | cut -c1-6)"
else
    HEALTH_VER=""
    result "B-001" "FAIL" "/api/health returned $_LAST_HTTP (expected 200)"
fi

# B-002  Root returns HTML or 404-in-dev
curl_body "$SERVER_URL/"
if [ "$_LAST_HTTP" = "200" ]; then
    result "B-002" "PASS" "Root returns 200"
elif ! $IS_PRODUCTION && [ "$_LAST_HTTP" = "404" ]; then
    result "B-002" "PASS" "Root returns 404 (dev mode, no SPA fallback)"
else
    result "B-002" "FAIL" "Root returned $_LAST_HTTP"
fi

# B-003  Swagger docs
curl_body "$SERVER_URL/api/docs"
if $IS_PRODUCTION; then
    if [ "$_LAST_HTTP" != "200" ]; then
        result "B-003" "PASS" "/api/docs returns $_LAST_HTTP (Swagger disabled in production)"
    else
        result "B-003" "FAIL" "/api/docs returns 200 (Swagger should be disabled in production)"
    fi
else
    if [ "$_LAST_HTTP" = "200" ] || [ "$_LAST_HTTP" = "301" ]; then
        result "B-003" "PASS" "/api/docs returns $_LAST_HTTP (Swagger available in dev)"
    else
        result "B-003" "N-A" "/api/docs returns $_LAST_HTTP"
    fi
fi

# B-004  Admin login
curl_body "$SERVER_URL/api/auth/login" \
    -X POST -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"admin123"}'
LOGIN_HTTP="$_LAST_HTTP"
LOGIN_BODY="$_LAST_BODY"
if [ "$LOGIN_HTTP" = "200" ]; then
    ADMIN_TOKEN=$(echo "$LOGIN_BODY" | json_field accessToken)
    result "B-004" "PASS" "admin/admin123 login 200"
else
    ADMIN_TOKEN=""
    result "B-004" "FAIL" "admin/admin123 login returned $LOGIN_HTTP"
fi

# B-005  Security headers
HEADER_RESP=$(curl -sS -D - -o /dev/null "$SERVER_URL/api/health" 2>/dev/null)
_xcto=$(echo "$HEADER_RESP" | grep -ci 'x-content-type-options' || echo 0)
_xfo=$(echo "$HEADER_RESP" | grep -ci 'x-frame-options' || echo 0)
if [ "$_xcto" -gt 0 ] && [ "$_xfo" -gt 0 ]; then
    result "B-005" "PASS" "Security headers present (X-Content-Type-Options, X-Frame-Options)"
else
    result "B-005" "FAIL" "Missing security headers (X-Content-Type-Options=$_xcto, X-Frame-Options=$_xfo)"
fi

# B-008  Health response time
_time_ms=$(python3 -c "print(int(float('${HEALTH_TIME:-0}')*1000))" 2>/dev/null || echo 99999)
if [ "$_time_ms" -lt 200 ]; then
    result "B-008" "PASS" "Health response ${_time_ms}ms (< 200ms)"
else
    result "B-008" "FAIL" "Health response ${_time_ms}ms (>= 200ms)"
fi

# A-305  Version match (package.json vs health endpoint)
if [ -f "$PROJECT_ROOT/package.json" ]; then
    PKG_VER=$(python3 -c "
import json
with open('$PROJECT_ROOT/package.json') as f: print(json.load(f).get('version',''))
" 2>/dev/null)
fi
if [ -n "$PKG_VER" ] && [ -n "$HEALTH_VER" ]; then
    if [ "$PKG_VER" = "$HEALTH_VER" ]; then
        result "A-305" "PASS" "package.json ($PKG_VER) == health endpoint ($HEALTH_VER)"
    else
        result "A-305" "FAIL" "package.json ($PKG_VER) != health endpoint ($HEALTH_VER)"
    fi
elif [ -z "$HEALTH_VER" ]; then
    result "A-305" "N-A" "Cannot verify — health endpoint unreachable"
else
    result "A-305" "FAIL" "package.json version missing"
fi

echo ""

# ============================================================================
# Section C — Database Content
# ============================================================================
printf "${B}── C: Database Content ${D}───────────────────────────────────────────${N}\n"

# A-402  DB file readable
if [ -n "$DB_PATH" ] && [ -f "$DB_PATH" ] && [ -r "$DB_PATH" ]; then
    _dbsize=$(du -h "$DB_PATH" 2>/dev/null | awk '{print $1}')
    result "A-402" "PASS" "DB file readable ($_dbsize)"
elif [ -n "$DB_PATH" ] && [ ! -f "$DB_PATH" ]; then
    result "A-402" "FAIL" "DB file not found at $DB_PATH"
elif [ -n "$DB_PATH" ]; then
    result "A-402" "FAIL" "DB file not readable at $DB_PATH"
else
    result "A-402" "N-A" "DB path not resolved"
fi

# A-401  Table count
_table_list=$(db_query "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;") || true
if [ -n "$_table_list" ]; then
    _table_count=$(echo "$_table_list" | wc -l | tr -d ' ')
else
    _table_count=0
fi
_missing=""
for _t in $MODEL_TABLES _prisma_migrations; do
    echo "$_table_list" | grep -qx "$_t" || _missing="$_missing $_t"
done
if [ "$_table_count" -ge "$EXPECTED_TABLE_COUNT" ] && [ -z "$_missing" ]; then
    result "A-401" "PASS" "DB has $_table_count tables (>= $EXPECTED_TABLE_COUNT expected)"
elif [ -z "$_missing" ]; then
    result "A-401" "PASS" "DB has $_table_count/$EXPECTED_TABLE_COUNT expected tables"
else
    result "A-401" "FAIL" "DB has $_table_count tables, missing:$_missing"
fi

# C-001  Holiday data
_hcount=$(db_query "SELECT COUNT(*) FROM holidays;" 2>/dev/null || echo 0)
if [ "${_hcount:-0}" -gt 0 ]; then
    result "C-001" "PASS" "Holidays table has $_hcount rows"
else
    result "C-001" "FAIL" "Holidays table is empty"
fi

# C-002  /api/holidays?year=2026
if [ -n "$ADMIN_TOKEN" ]; then
    curl_body "$SERVER_URL/api/holidays?year=2026" -H "Authorization: Bearer $ADMIN_TOKEN"
    if [ "$_LAST_HTTP" = "200" ]; then
        _h_len=$(echo "$_LAST_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo 0)
        if [ "$_h_len" -gt 0 ]; then
            result "C-002" "PASS" "/api/holidays?year=2026 returns $_h_len records"
        else
            result "C-002" "FAIL" "/api/holidays?year=2026 returns empty array"
        fi
    else
        result "C-002" "FAIL" "/api/holidays?year=2026 returned $_LAST_HTTP"
    fi
else
    result "C-002" "N-A" "No auth token (skipping authenticated endpoint)"
fi

# C-101  Roles >= 4
_rcount=$(db_query "SELECT COUNT(*) FROM roles;" 2>/dev/null || echo 0)
if [ "${_rcount:-0}" -ge 4 ]; then
    result "C-101" "PASS" "Roles table has $_rcount entries (>= 4)"
else
    result "C-101" "FAIL" "Roles table has $_rcount entries (< 4)"
fi

# C-102  Permissions >= 20
_pcount=$(db_query "SELECT COUNT(*) FROM permissions;" 2>/dev/null || echo 0)
if [ "${_pcount:-0}" -ge 20 ]; then
    result "C-102" "PASS" "Permissions table has $_pcount entries (>= 20)"
else
    result "C-102" "FAIL" "Permissions table has $_pcount entries (< 20)"
fi

# C-103  admin user has *:* permission
_admin_wildcard=$(db_query "
SELECT COUNT(*) FROM role_permissions rp
JOIN permissions p ON rp.permissionId = p.id
JOIN user_roles ur ON ur.roleId = rp.roleId
JOIN users u ON ur.userId = u.id
WHERE u.username = 'admin' AND p.resource = '*' AND p.action = '*'
;" 2>/dev/null || echo 0)
if [ "${_admin_wildcard:-0}" -gt 0 ]; then
    result "C-103" "PASS" "admin user has *:* permission"
else
    _admin_perms=$(db_query "
SELECT COUNT(DISTINCT p.resource||':'||p.action) FROM role_permissions rp
JOIN permissions p ON rp.permissionId = p.id
JOIN user_roles ur ON ur.roleId = rp.roleId
JOIN users u ON ur.userId = u.id
WHERE u.username = 'admin'
;" 2>/dev/null || echo 0)
    if [ "${_admin_perms:-0}" -ge 20 ]; then
        result "C-103" "PASS" "admin has $_admin_perms permissions (effectively wildcard)"
    else
        result "C-103" "FAIL" "admin has no *:* permission and only $_admin_perms individual permissions"
    fi
fi

# C-301 ~ C-307  Core tables exist
_core_idx=301
for _ct in users roles permissions projects activities products holidays; do
    if echo "$_table_list" | grep -qx "$_ct"; then
        result "C-${_core_idx}" "PASS" "Table '$_ct' exists"
    else
        result "C-${_core_idx}" "FAIL" "Table '$_ct' missing"
    fi
    _core_idx=$((_core_idx + 1))
done

# C-401  AiConfig table
if echo "$_table_list" | grep -qx "ai_configs"; then
    result "C-401" "PASS" "AiConfig table (ai_configs) exists"
else
    result "C-401" "FAIL" "AiConfig table (ai_configs) missing"
fi

# C-402  WecomConfig table
if echo "$_table_list" | grep -qx "wecom_configs"; then
    result "C-402" "PASS" "WecomConfig table (wecom_configs) exists"
else
    result "C-402" "FAIL" "WecomConfig table (wecom_configs) missing"
fi

# C-501  server/uploads directory
if [ -d "$PROJECT_ROOT/server/uploads" ]; then
    result "C-501" "PASS" "server/uploads directory exists"
else
    result "C-501" "FAIL" "server/uploads directory missing"
fi

echo ""

# ============================================================================
# Section D — Security & Edge Cases
# ============================================================================
printf "${B}── D: Security & Edge Cases ${D}────────────────────────────────────────${N}\n"

# C-201  admin login returns 200 (reuse B-004 result)
if [ "$LOGIN_HTTP" = "200" ]; then
    result "C-201" "PASS" "admin/admin123 login returns 200"
else
    result "C-201" "FAIL" "admin/admin123 login returned $LOGIN_HTTP"
fi

# D-201  Unauthenticated /api/projects returns 401
curl_body "$SERVER_URL/api/projects"
if [ "$_LAST_HTTP" = "401" ]; then
    result "D-201" "PASS" "Unauthenticated /api/projects returns 401"
else
    result "D-201" "FAIL" "Unauthenticated /api/projects returned $_LAST_HTTP (expected 401)"
fi

# D-204  Logout invalidates token
if [ -n "$ADMIN_TOKEN" ]; then
    curl_body "$SERVER_URL/api/auth/logout" \
        -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H 'Content-Type: application/json'
    _logout_http="$_LAST_HTTP"

    curl_body "$SERVER_URL/api/auth/me" \
        -H "Authorization: Bearer $ADMIN_TOKEN"
    _me_after="$_LAST_HTTP"

    if [ "$_me_after" = "401" ]; then
        result "D-204" "PASS" "Token rejected after logout (got $_me_after)"
    else
        result "D-204" "FAIL" "Token still valid after logout (me returned $_me_after)"
    fi
else
    result "D-204" "N-A" "No auth token available"
fi

# D-301  SPA root serves HTML in production mode
if $IS_PRODUCTION; then
    _ct=$(curl -sI "$SERVER_URL/" 2>/dev/null | grep -i 'content-type' | head -1 || true)
    if echo "$_ct" | grep -qi 'text/html'; then
        result "D-301" "PASS" "Root serves text/html in production"
    else
        result "D-301" "FAIL" "Root content-type: $_ct (expected text/html)"
    fi
else
    result "D-301" "N-A" "SPA root check skipped in development mode"
fi

# D-304  /api/nonexistent returns 404 JSON
curl_body "$SERVER_URL/api/nonexistent_endpoint_test"
if [ "$_LAST_HTTP" = "404" ]; then
    _is_json=$(echo "$_LAST_BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('yes' if 'error' in d or 'message' in d else 'no')
" 2>/dev/null || echo "no")
    if [ "$_is_json" = "yes" ]; then
        result "D-304" "PASS" "/api/nonexistent returns 404 JSON"
    else
        result "D-304" "FAIL" "/api/nonexistent returns 404 but not expected JSON"
    fi
else
    result "D-304" "FAIL" "/api/nonexistent returned $_LAST_HTTP (expected 404)"
fi

echo ""

# ============================================================================
# Summary
# ============================================================================
TOTAL=$((PASS + FAIL + SKIP))
printf "${B}================================================================${N}\n"
printf "${B}  Summary${N}\n"
printf "${B}================================================================${N}\n"
printf "  Total:  %d   ${G}PASS: %d${N}   ${R}FAIL: %d${N}   ${Y}N-A: %d${N}\n" "$TOTAL" "$PASS" "$FAIL" "$SKIP"
if [ "$P0_FAIL" -gt 0 ]; then
    printf "  ${R}P0 CRITICAL FAILURES: %d${N}\n" "$P0_FAIL"
fi
printf "  Mode:   %s\n" "$($IS_PRODUCTION && echo 'PRODUCTION' || echo 'DEVELOPMENT')"
echo ""

# Exit code
if [ "$P0_FAIL" -gt 0 ]; then
    printf "${R}Result: P0 CRITICAL FAILURE (exit 2)${N}\n\n"
    exit 2
elif [ "$FAIL" -gt 0 ]; then
    printf "${Y}Result: SOME CHECKS FAILED (exit 1)${N}\n\n"
    exit 1
else
    printf "${G}Result: ALL CHECKS PASSED (exit 0)${N}\n\n"
    exit 0
fi
