import express, { Request, Response } from 'express';
import { getMetrics, getMetricsContentType } from '../utils/metrics';

const router = express.Router();

const isMetricsEnabled = (): boolean => {
  if (process.env.METRICS_ENABLED === 'true') return true;
  if (process.env.METRICS_ENABLED === 'false') return false;
  return process.env.NODE_ENV !== 'production';
};

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  if (!isMetricsEnabled()) {
    res.status(404).json({ error: '接口不存在' });
    return;
  }

  res.setHeader('Content-Type', getMetricsContentType());
  res.send(await getMetrics());
});

export default router;
