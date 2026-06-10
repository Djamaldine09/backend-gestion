import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import {
    telechargerRelevePDF,
    telechargerConvocationPDF,
    downloadJustificatif,
    checkPiecesStatus,
    generateBulletinVersement
} from '../controllers/document.controller';

const router = Router();

// Route accessible par le candidat pour télécharger son propre relevé
router.get('/releve-notes', protect, restrictTo('CANDIDAT'), telechargerRelevePDF);
router.get('/convocation', protect, restrictTo('CANDIDAT'), telechargerConvocationPDF);

// Nouvelles routes pour les documents étendus
router.get('/justificatif/:type', protect, restrictTo('CANDIDAT'), downloadJustificatif);
router.get('/pieces/status', protect, restrictTo('CANDIDAT'), checkPiecesStatus);
router.get('/bulletin-versement', protect, restrictTo('CANDIDAT'), generateBulletinVersement);

export default router;