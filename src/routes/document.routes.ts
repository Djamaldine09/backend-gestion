import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { telechargerRelevePDF, telechargerConvocationPDF } from '../controllers/document.controller';

const router = Router();

// Route accessible par le candidat pour télécharger son propre relevé
router.get('/releve-notes', protect, restrictTo('CANDIDAT'), telechargerRelevePDF);
router.get('/convocation', protect, restrictTo('CANDIDAT'), telechargerConvocationPDF);

export default router;