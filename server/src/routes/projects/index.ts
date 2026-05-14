import express from 'express';
import crudRoutes from './crud';
import membersRoutes from './members';
import archiveRoutes from './archive';

export { rejectIfArchived } from './shared';

const router = express.Router();

router.use(crudRoutes);
router.use(membersRoutes);
router.use(archiveRoutes);

export default router;
