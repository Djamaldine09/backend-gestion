import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Examen from '../models/Examen';
import Candidat from '../models/Candidat';

export const listExamens = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const examens = await Examen.find().sort({ dateDebut: -1 });
        res.status(200).json(examens);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getExamenById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const examen = await Examen.findById(req.params.id);
        if (!examen) {
            res.status(404).json({ message: 'Examen introuvable' });
            return;
        }
        res.status(200).json(examen);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const createExamen = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { titre, type, dateDebut, dateFin, description, lieu } = req.body;
        
        const examen = await Examen.create({
            titre,
            type,
            dateDebut: new Date(dateDebut),
            dateFin: new Date(dateFin),
            description,
            lieu,
            statut: 'PLANIFIE',
            nombreCandidats: 0,
            nombreCentres: 0
        });
        
        res.status(201).json(examen);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateExamen = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { titre, type, dateDebut, dateFin, description, lieu, statut } = req.body;
        
        const examen = await Examen.findByIdAndUpdate(
            req.params.id,
            { titre, type, dateDebut, dateFin, description, lieu, statut },
            { new: true, runValidators: true }
        );
        
        if (!examen) {
            res.status(404).json({ message: 'Examen introuvable' });
            return;
        }
        
        res.status(200).json(examen);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteExamen = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const examen = await Examen.findByIdAndDelete(req.params.id);
        
        if (!examen) {
            res.status(404).json({ message: 'Examen introuvable' });
            return;
        }
        
        res.status(200).json({ message: 'Examen supprimé avec succès' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const addEpreuves = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { epreuves } = req.body;
        
        const examen = await Examen.findById(req.params.id);
        if (!examen) {
            res.status(404).json({ message: 'Examen introuvable' });
            return;
        }
        
        examen.epreuves = [...(examen.epreuves || []), ...epreuves];
        await examen.save();
        
        res.status(200).json(examen);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getEpreuves = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const examen = await Examen.findById(req.params.id);
        if (!examen) {
            res.status(404).json({ message: 'Examen introuvable' });
            return;
        }
        
        res.status(200).json(examen.epreuves || []);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const affectCandidats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { candidatIds } = req.body;
        
        const examen = await Examen.findById(req.params.id);
        if (!examen) {
            res.status(404).json({ message: 'Examen introuvable' });
            return;
        }
        
        // Ajouter les candidats à l'examen
        examen.candidatsInscrits = [...(examen.candidatsInscrits || []), ...candidatIds];
        examen.nombreCandidats = examen.candidatsInscrits.length;
        await examen.save();
        
        // Mettre à jour les candidats pour leur associer l'examen
        await Candidat.updateMany(
            { _id: { $in: candidatIds } },
            { examen: examen.titre }
        );
        
        res.status(200).json(examen);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
