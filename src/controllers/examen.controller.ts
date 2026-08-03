import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Examen from '../models/Examen';
import Candidat from '../models/Candidat';
import { notifyUsers } from '../services/notification.service';

export const listExamens = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const examens = await Examen.find().sort({ dateDebut: -1 });

        // Pour chaque examen, calculer le nombre de candidats inscrits (statut VALIDE)
        const examensWithCounts = await Promise.all(
            examens.map(async (ex) => {
                const count = await Candidat.countDocuments({ examen: ex.titre, statutInscription: 'VALIDE' });
                const obj = (ex as any).toObject ? (ex as any).toObject() : { ...ex };
                obj.nombreCandidats = count;
                return obj;
            })
        );

        res.status(200).json(examensWithCounts);
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

// Publier les convocations pour tous les candidats d'un examen (ADMIN only)
export const publishConvocations = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const examen = await Examen.findById(req.params.id);
        if (!examen) {
            res.status(404).json({ message: 'Examen introuvable' });
            return;
        }

        // Récupérer les candidats liés à cet examen et validés
        const candidats = await Candidat.find({ examen: examen.titre, statutInscription: 'VALIDE' }).populate('user');

        // Si aucun candidat, répondre sans erreur
        if (!candidats || candidats.length === 0) {
            res.status(200).json({ message: 'Aucun candidat validé pour cet examen', published: 0 });
            return;
        }

        // Générer une convocation minimale par candidat
        const promises = candidats.map(async (cand) => {
            const centre = (cand as any).centreAffecte || {} as any;

            (cand as any).convocation = {
                examenId: String(examen._id),
                dateEpreuve: examen.dateDebut,
                heureDebut: '08:00',
                heureFin: '12:00',
                centre: {
                    nom: centre.nom || 'Centre non défini',
                    adresse: centre.adresse || '',
                    ville: centre.ville || ''
                },
                salle: centre.salle || 'Générale',
                numeroPlace: (centre && centre.numeroPlace) || 'N/A',
            } as any;

            (cand as any).planning = (examen.epreuves || []).map((ep) => ({
                matiere: ep.matiere,
                date: ep.date,
                heureDebut: ep.heureDebut,
                heureFin: ep.heureFin,
                duree: ep.duree,
                coefficient: ep.coefficient,
                type: ep.type,
            }));

            return cand.save();
        });

        await Promise.all(promises);

        // Mettre à jour le compteur sur l'examen
        examen.nombreCandidats = candidats.length;
        await examen.save();

        // Notifier chaque candidat concerné que sa convocation est disponible
        const userIds = candidats.map((cand) => (cand as any).user?._id || (cand as any).user);
        const { count: notified } = await notifyUsers(
            userIds,
            'Convocation disponible',
            `Votre convocation pour l'examen "${examen.titre}" est maintenant disponible. Consultez-la et téléchargez votre document.`,
            'SUCCESS',
            '/convocation'
        );

        res.status(200).json({ message: 'Convocations publiées', published: candidats.length, notified });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};