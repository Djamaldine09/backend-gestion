import { Router, Response } from 'express';
import { protect, restrictTo, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

// Route publique : Tout le monde peut voir la liste des examens
router.get('/', (req, res) => {
    res.json({ message: "Liste de tous les examens nationaux" });
});

// Route protégée : Il faut être connecté ET avoir le rôle ADMIN ou RESPONSABLE
router.post(
    '/creer', 
    protect, // Étape 1 : Es-tu connecté ?
    restrictTo('ADMIN', 'RESPONSABLE'), // Étape 2 : As-tu le bon rôle ?
    (req: AuthenticatedRequest, res: Response) => {
        // Si le code arrive ici, l'utilisateur est authentifié et autorisé.
        // Tu as accès à son ID via req.user.id si besoin.
        res.status(201).json({ 
            message: "Examen créé avec succès !",
            creePar: req.user?.id 
        });
    }
);

export default router;