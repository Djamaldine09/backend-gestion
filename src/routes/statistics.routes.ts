import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import {
    getGlobalStats,
    getStatsByCentre,
    getStatsByRegion,
    getResultatsStats,
    getAttendanceRate
} from '../controllers/statistics.controller';

const router = Router();

router.use(protect, restrictTo('ADMIN', 'RESPONSABLE'));

router.get('/global', getGlobalStats);
router.get('/centre', getStatsByCentre);
router.get('/region', getStatsByRegion);
router.get('/resultats', getResultatsStats);
router.get('/attendance', getAttendanceRate);

export default router;
