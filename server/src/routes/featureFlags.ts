import { Router } from 'express';
import {
  getFeatureFlagDefinitions,
  parseFeatureFlags,
  snapshotFeatureFlags,
  validateFeatureFlagConfiguration,
} from '../utils/featureFlags';

const router = Router();

router.get('/', (_req, res) => {
  const flags = parseFeatureFlags(process.env.FEATURE_FLAGS);
  const snapshot = snapshotFeatureFlags(flags);
  const validation = validateFeatureFlagConfiguration(flags);

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    status: 'ok',
    source: 'env',
    definitions: getFeatureFlagDefinitions(),
    unknownFlags: validation.unknownFlags,
    ...snapshot,
  });
});

export default router;
