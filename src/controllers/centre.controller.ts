import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { lancerAffectationAutomatique } from '../services/affectation.service';

export const executerAffectation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const resultat = await lancerAffectationAutomatique();
        
        res.status(200).json({
            message: "L'algorithme d'affectation automatique a terminé son traitement.",
            statistiques: {
                candidatsAffectes: resultat.succes,
                candidatsEnAttente: resultat.echecs
            }
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};