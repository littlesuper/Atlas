import { NextFunction, Request, Response } from 'express';
import { FeatureFlagName, isFeatureEnabled } from '../utils/featureFlags';

export const requireFeatureFlag =
  (name: FeatureFlagName) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (
      !isFeatureEnabled(name, {
        userId: req.user?.id,
        sessionId: req.headers['x-request-id'] as string | undefined,
        remoteAddress: req.ip,
      })
    ) {
      res.status(404).json({ error: '接口不存在' });
      return;
    }

    next();
  };
