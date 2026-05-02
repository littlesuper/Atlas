import express, { Request, Response } from 'express';
import {
  getFeatureFlagSnapshot,
  isFeatureFlagConfigured,
  isLocalFeatureFlagOverrideAllowed,
  setLocalFeatureFlagOverride,
} from '../utils/featureFlags';

const router = express.Router();

router.get('/', (req: Request, res: Response): void => {
  res.json({
    provider: isFeatureFlagConfigured() ? 'unleash' : 'local',
    flags: getFeatureFlagSnapshot({
      userId: req.user?.id,
      sessionId: req.headers['x-request-id'] as string | undefined,
      remoteAddress: req.ip,
    }),
  });
});

router.patch('/:name', (req: Request, res: Response): void => {
  if (!isLocalFeatureFlagOverrideAllowed()) {
    res.status(404).json({ error: '接口不存在' });
    return;
  }

  const { enabled } = req.body as { enabled?: unknown };
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'enabled 必须是布尔值' });
    return;
  }

  try {
    res.json(setLocalFeatureFlagOverride(req.params.name, enabled));
  } catch {
    res.status(404).json({ error: '未知 Feature Flag' });
  }
});

export default router;
