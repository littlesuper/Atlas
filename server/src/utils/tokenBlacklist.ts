/**
 * JWT Token 黑名单（内存实现）
 * 退出登录、修改密码后将 token 加入黑名单
 * 黑名单条目在 token 过期时间后自动清理
 */

interface BlacklistEntry {
  expiresAt: number; // Unix timestamp (ms)
}

const blacklist = new Map<string, BlacklistEntry>();

// 每 10 分钟清理过期条目
const CLEANUP_INTERVAL = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of blacklist) {
    if (entry.expiresAt <= now) {
      blacklist.delete(token);
    }
  }
}, CLEANUP_INTERVAL).unref(); // unref 防止阻止进程退出

/**
 * 将 token 加入黑名单
 * @param token JWT token 字符串
 * @param expiresInMs token 剩余有效时间（毫秒），默认 8 小时
 */
export function blacklistToken(token: string, expiresInMs: number = 8 * 60 * 60 * 1000): void {
  blacklist.set(token, {
    expiresAt: Date.now() + expiresInMs,
  });
}

/**
 * 检查 token 是否在黑名单中
 */
export function isTokenBlacklisted(token: string): boolean {
  const entry = blacklist.get(token);
  if (!entry) return false;

  // 已过期的自动移除
  if (entry.expiresAt <= Date.now()) {
    blacklist.delete(token);
    return false;
  }

  return true;
}
