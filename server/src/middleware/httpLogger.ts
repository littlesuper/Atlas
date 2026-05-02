import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * HTTP 请求日志中间件（替代 morgan）
 */
export const httpLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level](
      {
        trace_id: req.id,
        requestId: req.id,
        user_id: req.user?.id,
        context: {
          method: req.method,
          url: req.originalUrl,
          status_code: res.statusCode,
          duration_ms: duration,
          ip: req.ip,
          user_agent: req.get('user-agent'),
        },
      },
      `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );
  });

  next();
};
