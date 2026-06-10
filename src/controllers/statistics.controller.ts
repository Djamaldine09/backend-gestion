import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Candidat from '../models/Candidat';
import CentreExamen from '../models/CentreExamen';
import Resultat from '../models/Resultat';
import Presence from '../models/Presence';

export const getGlobalStats = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const [totalCandidats, totalCentres, totalResultats, totalPresences] = await Promise.all([
            Candidat.countDocuments(),
            CentreExamen.countDocuments(),
            Resultat.countDocuments(),
            Presence.countDocuments(),
        ]);

        res.status(200).json({
            candidats: totalCandidats,
            centres: totalCentres,
            resultats: totalResultats,
            presences: totalPresences,
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getStatsByCentre = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { centreId } = req.query;
        const filter: any = {};
        if (centreId) filter._id = centreId;

        const centres = await CentreExamen.find(filter);
        
        const stats = await Promise.all(
            centres.map(async (centre) => {
                const candidatsCount = await Candidat.countDocuments({ 'centreAffecte.region': centre.region });
                const presencesCount = await Presence.countDocuments({ centre: centre._id });
                
                return {
                    centreId: centre._id,
                    centreNom: centre.nom,
                    capaciteMaximale: centre.capaciteMaximale,
                    candidatsAffectes: centre.candidatsAffectes.length,
                    presences: presencesCount,
                    tauxOccupation: Math.round((centre.candidatsAffectes.length / centre.capaciteMaximale) * 100),
                };
            })
        );

        res.status(200).json(stats);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getStatsByRegion = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { region } = req.query;
        const filter: any = {};
        if (region) filter.region = region;

        const centresByRegion = await CentreExamen.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$region',
                    centres: { $sum: 1 },
                    capaciteTotale: { $sum: '$capaciteMaximale' },
                    candidatsAffectes: { $sum: { $size: '$candidatsAffectes' } },
                }
            },
            { $sort: { _id: 1 } },
        ]);

        const candidatsByRegion = await Candidat.aggregate([
            { $match: { 'centreAffecte.region': region || { $exists: true } } },
            {
                $group: {
                    _id: '$centreAffecte.region',
                    total: { $sum: 1 },
                    payes: {
                        $sum: { $cond: [{ $eq: ['$paiement.statut', 'PAYE'] }, 1, 0] },
                    },
                    valides: {
                        $sum: { $cond: [{ $eq: ['$statutInscription', 'VALIDE'] }, 1, 0] },
                    },
                }
            },
        ]);

        res.status(200).json({
            centres: centresByRegion,
            candidats: candidatsByRegion,
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getResultatsStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { examenId } = req.query;
        const filter: any = {};
        if (examenId) filter.examen = examenId;

        const stats = await Resultat.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$statutFinal',
                    count: { $sum: 1 },
                    moyenneMoyenne: { $avg: '$moyenneGenerale' },
                    noteMax: { $max: '$moyenneGenerale' },
                    noteMin: { $min: '$moyenneGenerale' },
                }
            },
        ]);

        const total = await Resultat.countDocuments(filter);
        const publies = await Resultat.countDocuments({ ...filter, estPublie: true });

        res.status(200).json({
            total,
            publies,
            parStatut: stats,
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getAttendanceRate = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { examenId } = req.query;
        const filter: any = {};
        if (examenId) filter.examen = examenId;

        const totalPresences = await Presence.countDocuments(filter);
        const presents = await Presence.countDocuments({ ...filter, statut: 'PRESENT' });
        const retards = await Presence.countDocuments({ ...filter, statut: 'RETARD' });
        const absents = await Presence.countDocuments({ ...filter, statut: 'ABSENT' });

        const tauxPresence = totalPresences > 0 ? Math.round((presents / totalPresences) * 100) : 0;

        res.status(200).json({
            total: totalPresences,
            presents,
            retards,
            absents,
            tauxPresence,
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
