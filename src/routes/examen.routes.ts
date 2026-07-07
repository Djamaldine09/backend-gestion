import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { validateRequest, addEpreuvesSchema } from '../config/validation';
import {
    listExamens,
    getExamenById,
    createExamen,
    updateExamen,
    deleteExamen,
    addEpreuves,
    getEpreuves,
    affectCandidats,
    publishConvocations
} from '../controllers/examen.controller';

const router = Router();

// Route publique : Tout le monde peut voir la liste des examens
router.get('/', listExamens);

// Route protégée : Il faut être connecté ET avoir le rôle ADMIN
router.post('/creer', protect, restrictTo('ADMIN'), createExamen);

// Routes CRUD complètes
router.get('/:id', protect, getExamenById);
router.put('/:id', protect, restrictTo('ADMIN'), updateExamen);
router.delete('/:id', protect, restrictTo('ADMIN'), deleteExamen);

// Gestion des épreuves
router.post('/:id/epreuves', protect, restrictTo('ADMIN'), validateRequest(addEpreuvesSchema), addEpreuves);
router.get('/:id/epreuves', protect, getEpreuves);

// Affectation des candidats
router.post('/:id/affecter', protect, restrictTo('ADMIN'), affectCandidats);

// Publier les convocations (ADMIN)
router.post('/:id/publish-convocations', protect, restrictTo('ADMIN'), publishConvocations);

export default router;