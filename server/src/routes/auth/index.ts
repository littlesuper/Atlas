import express from 'express';
import sessionRoutes from './session';
import accountRoutes from './account';
import wecomRoutes from './wecom';

const router = express.Router();

router.use(sessionRoutes);
router.use(accountRoutes);
router.use(wecomRoutes);

export default router;
