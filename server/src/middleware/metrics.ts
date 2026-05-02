import { Request, Response, NextFunction } from 'express';
import { recordHttpRequest } from '../utils/metrics';

const getRouteLabel = (req: Request): string => {
  const routePath = req.route?.path;
  if (!routePath) return 'unmatched';

  return `${req.baseUrl || ''}${routePath}`;
};

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on('finish', () => {
    if (req.path === '/api/metrics') return;

    recordHttpRequest({
      method: req.method,
      route: getRouteLabel(req),
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    });
  });

  next();
};
