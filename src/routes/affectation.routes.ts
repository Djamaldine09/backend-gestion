import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import {
    createAffectation,
    getAffectationByCandidat,
    getAffectationByCentre,
    getAffectationByExamen,
    updateAffectation,
    cancelAffectation
} from '../controllers/affectation.controller';

const router = Router();

router.post('/', protect, restrictTo('ADMIN', 'RESPONSABLE'), createAffectation);
router.get('/candidat/:candidatId', protect, restrictTo('ADMIN', 'RESPONSABLE', 'CANDIDAT'), getAffectationByCandidat);
router.get('/centre/:centreId', protect, restrictTo('ADMIN', 'RESPONSABLE'), getAffectationByCentre);
router.get('/examen/:examenId', protect, restrictTo('ADMIN', 'RESPONSABLE'), getAffectationByExamen);
router.put('/:affectationId', protect, restrictTo('ADMIN', 'RESPONSABLE'), updateAffectation);
router.delete('/:affectationId', protect, restrictTo('ADMIN', 'RESPONSABLE'), cancelAffectation);

export default router;
