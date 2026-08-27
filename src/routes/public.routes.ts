import { Router } from 'express';
import { getPublicResultatByMatricule } from '../controllers/resultat.controller';
import User from '../models/User';

const router = Router();

router.get('/resultats/:matricule', getPublicResultatByMatricule);

router.get('/active-team', async (_req, res) => {
    try {
        const users = await User.find({
            photo: { $exists: true, $nin: ['', null] },
            role: { $in: ['ADMIN', 'RESPONSABLE', 'SURVEILLANT', 'CORRECTEUR'] }
        })
            .select('nom prenom role photo updatedAt')
            .sort({ updatedAt: -1 })
            .limit(4);

        res.status(200).json(users.map((user) => ({
            id: String(user._id),
            nom: user.nom,
            prenom: user.prenom,
            role: user.role,
            photo: user.photo
        })));
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
