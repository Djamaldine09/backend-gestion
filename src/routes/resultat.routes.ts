import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { saisirNote } from '../controllers/resultat.controller';

const router = Router();

// Route protégée : Saisie des notes par le personnel autorisé uniquement
router.post(
    '/candidat/:candidatId/notes', 
    protect, 
    restrictTo('SURVEILLANT', 'RESPONSABLE', 'ADMIN'), // Le rôle "SURVEILLANT" agit ici comme correcteur
    saisirNote
);

export default router;