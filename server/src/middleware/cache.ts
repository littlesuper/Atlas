import { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  data: any;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * 简单内存缓存中间件
 * 适用于不经常变化的 GET 请求（如统计数据、配置信息）
 * @param ttlSeconds 缓存过期时间（秒）
 */
export const apiCache = (ttlSeconds: number) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 只缓存 GET 请求
    if (req.method !== 'GET') {
      next();
      return;
    }

    const key = `${req.originalUrl}:${req.user?.id || 'anon'}`;
    const cached = cache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, {
          data: body,
          expiresAt: Date.now() + ttlSeconds * 1000,
        });
      }
      return originalJson(body);
    };

    next();
  };
};

/**
 * 清除指定模式的缓存
 */
export const invalidateCache = (pattern?: string): void => {
  if (!pattern) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
};

/**
 * 定期清理过期缓存（每 5 分钟）
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}, 5 * 60 * 1000);
