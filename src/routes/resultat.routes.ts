import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import {
    saisirNote,
    consulterMonResultat,
    getResultatByCandidat,
    getResultatByExamen,
    publishResultats,
    getResultatStats,
    exportResultatsCSV
} from '../controllers/resultat.controller';

const router = Router();

// Route protégée : Saisie des notes par le personnel autorisé uniquement
router.post(
    '/candidat/:candidatId/notes',
    protect,
    restrictTo('SURVEILLANT', 'RESPONSABLE', 'ADMIN'),
    saisirNote
);

// Nouvelles routes pour les résultats
router.get('/mon-resultat', protect, restrictTo('CANDIDAT'), consulterMonResultat);
router.get('/candidat/:candidatId', protect, restrictTo('ADMIN', 'RESPONSABLE', 'CORRECTEUR'), getResultatByCandidat);
router.get('/examen/:examenId', protect, restrictTo('ADMIN', 'RESPONSABLE'), getResultatByExamen);
router.post('/examen/:examenId/publish', protect, restrictTo('ADMIN', 'RESPONSABLE'), publishResultats);
router.get('/stats', protect, restrictTo('ADMIN', 'RESPONSABLE'), getResultatStats);
router.get('/export/:examenId', protect, restrictTo('ADMIN', 'RESPONSABLE'), exportResultatsCSV);

export default router;