import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { telechargerRelevePDF } from '../controllers/document.controller';

const router = Router();

// Route accessible par le candidat pour télécharger son propre relevé
router.get('/releve-notes', protect, restrictTo('CANDIDAT'), telechargerRelevePDF);

export default router;