import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import {
    saisirNote,
    consulterMonResultat,
    getResultatByCandidat,
    getResultatByExamen,
    publishResultats,
    getResultatStats,
    exportResultatsCSV,
    genererTableAnonymat,
    listerCopiesAnonymes,
    saisirNoteAnonyme,
    leverAnonymat
} from '../controllers/resultat.controller';

const router = Router();

router.post('/examens/:examenId/anonymat/generer', protect, restrictTo('ADMIN', 'RESPONSABLE'), genererTableAnonymat);
router.get('/examens/:examenId/anonymat/copies', protect, restrictTo('ADMIN', 'RESPONSABLE', 'CORRECTEUR'), listerCopiesAnonymes);
router.post('/anonymat/:numeroAnonymat/notes', protect, restrictTo('CORRECTEUR'), saisirNoteAnonyme);
router.post('/examens/:examenId/anonymat/lever', protect, restrictTo('ADMIN', 'RESPONSABLE'), leverAnonymat);

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
