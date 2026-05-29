import express from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { scanPresence } from '../controllers/presence.controller';

const router = express.Router();

router.post('/scan', protect, restrictTo('SURVEILLANT'), scanPresence);

export default router;
