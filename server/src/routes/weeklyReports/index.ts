import express from 'express';
import crudRoutes from './crud';
import projectRoutes from './project';
import actionRoutes from './actions';

const router = express.Router();

router.use(projectRoutes);
router.use(actionRoutes);
router.use(crudRoutes);

export default router;
