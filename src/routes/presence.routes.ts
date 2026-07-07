import express from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { scanPresence, getPresenceHistory, exportPresenceCSV } from '../controllers/presence.controller';

const router = express.Router();

router.post('/scan', protect, restrictTo('SURVEILLANT'), scanPresence);
router.get('/history', protect, restrictTo('ADMIN', 'RESPONSABLE', 'SURVEILLANT'), getPresenceHistory);
router.get('/export/:examenId', protect, restrictTo('ADMIN', 'RESPONSABLE', 'SURVEILLANT'), exportPresenceCSV);

export default router;
