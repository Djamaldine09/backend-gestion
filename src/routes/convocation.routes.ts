import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { generateConvocationQR, verifyConvocation } from '../controllers/convocation.controller';

const router = Router();

router.get('/:candidatId/qr', protect, restrictTo('CANDIDAT', 'ADMIN', 'RESPONSABLE'), generateConvocationQR);
router.post('/verify', protect, restrictTo('SURVEILLANT', 'ADMIN', 'RESPONSABLE'), verifyConvocation);

export default router;
