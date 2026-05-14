import express from 'express';
import { crudRouter } from './crud';
import { scheduleRouter } from './schedule';
import { analysisRouter } from './analysis';
import { importRouter } from './import';

const router = express.Router();

router.use(crudRouter);
router.use(scheduleRouter);
router.use(analysisRouter);
router.use(importRouter);

export default router;
