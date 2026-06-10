import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Affectation from '../models/Affectation';
import Candidat from '../models/Candidat';
import CentreExamen from '../models/CentreExamen';

export const createAffectation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { candidatId, centreId, salle, numeroPlace } = req.body;
        
        const candidat = await Candidat.findById(candidatId);
        const centre = await CentreExamen.findById(centreId);
        
        if (!candidat || !centre) {
            res.status(404).json({ message: 'Candidat ou centre introuvable' });
            return;
        }

        // Créer l'affectation
        const affectation = await Affectation.create({
            candidat: candidatId,
            centre: centreId,
            examen: candidat.examen,
            salle,
            numeroPlace
        });

        // Mettre à jour le candidat
        candidat.centreAffecte = {
            nom: centre.nom,
            ville: centre.ville,
            region: centre.region,
            adresse: centre.code,
            salle,
            numeroPlace
        };
        await candidat.save();

        // Mettre à jour le centre
        centre.candidatsAffectes.push(candidatId);
        await centre.save();

        res.status(201).json(affectation);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getAffectationByCandidat = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { candidatId } = req.params;
        const affectation = await Affectation.findOne({ candidat: candidatId })
            .populate('centre')
            .populate('examen');
        
        if (!affectation) {
            res.status(404).json({ message: 'Affectation introuvable' });
            return;
        }

        res.status(200).json(affectation);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getAffectationByCentre = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { centreId } = req.params;
        const affectations = await Affectation.find({ centre: centreId })
            .populate('candidat')
            .populate('examen')
            .sort({ dateAffectation: -1 });
        
        res.status(200).json(affectations);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getAffectationByExamen = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { examenId } = req.params;
        const affectations = await Affectation.find({ examen: examenId })
            .populate('candidat')
            .populate('centre')
            .sort({ dateAffectation: -1 });
        
        res.status(200).json(affectations);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateAffectation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { affectationId } = req.params;
        const { salle, numeroPlace, statut } = req.body;
        
        const affectation = await Affectation.findByIdAndUpdate(
            affectationId,
            { salle, numeroPlace, statut },
            { new: true, runValidators: true }
        );
        
        if (!affectation) {
            res.status(404).json({ message: 'Affectation introuvable' });
            return;
        }

        res.status(200).json(affectation);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const cancelAffectation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { affectationId } = req.params;
        
        const affectation = await Affectation.findByIdAndDelete(affectationId);
        if (!affectation) {
            res.status(404).json({ message: 'Affectation introuvable' });
            return;
        }

        // Mettre à jour le candidat
        await Candidat.findByIdAndUpdate(affectation.candidat, {
            $unset: { centreAffecte: 1 }
        });

        // Mettre à jour le centre
        await CentreExamen.findByIdAndUpdate(affectation.centre, {
            $pull: { candidatsAffectes: affectation.candidat }
        });

        res.status(200).json({ message: 'Affectation annulée avec succès' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
