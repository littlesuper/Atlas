import express from 'express';
import actionsRoutes from './actions';
import crudRoutes from './crud';

const router = express.Router();

router.use(actionsRoutes);
router.use(crudRoutes);

export default router;
