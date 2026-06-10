import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Resultat from '../models/Resultat';
import Candidat from '../models/Candidat';
import Examen from '../models/Examen';

export const saisirNote = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { candidatId } = req.params;
        const { matiere, valeur, coefficient } = req.body;
        const correcteurId = req.user?.id;

        // 1. Vérifier que le candidat existe et est validé
        const candidat = await Candidat.findById(candidatId);
        if (!candidat || candidat.statutInscription !== 'VALIDE') {
            res.status(404).json({ message: "Candidat invalide ou introuvable." });
            return;
        }

        // 2. Chercher le bulletin de résultat du candidat, ou le créer s'il n'existe pas
        let resultat = await Resultat.findOne({ candidat: candidatId });
        if (!resultat) {
            resultat = new Resultat({
                candidat: candidatId,
                examen: candidat.examen,
                notes: []
            });
        }

        // 3. Vérifier si la note pour cette matière a déjà été saisie
        const indexNoteExistante = resultat.notes.findIndex(n => n.matiere === matiere);

        if (indexNoteExistante >= 0) {
            // Mise à jour de la note existante
            resultat.notes[indexNoteExistante].valeur = valeur;
            resultat.notes[indexNoteExistante].correcteur = correcteurId as any; // Trace qui a modifié
        } else {
            // Ajout d'une nouvelle note
            resultat.notes.push({
                matiere,
                valeur,
                coefficient,
                correcteur: correcteurId as any
            });
        }

        // 4. Sauvegarde (C'est ici que le calcul automatique de la moyenne se déclenche)
        await resultat.save();

        res.status(200).json({
            message: `Note de ${matiere} enregistrée avec succès.`,
            moyenneActuelle: resultat.moyenneGenerale,
            statutProvisoire: resultat.statutFinal
        });

    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const consulterMonResultat = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;

        // 1. Trouver le dossier du candidat lié à cet utilisateur
        const candidat = await Candidat.findOne({ user: userId });
        if (!candidat) {
            res.status(404).json({ message: "Dossier candidat introuvable." });
            return;
        }

        // 2. Chercher le résultat
        const resultat = await Resultat.findOne({ candidat: candidat._id });

        if (!resultat) {
            res.status(404).json({ message: "Vos résultats ne sont pas encore disponibles." });
            return;
        }

        // 3. LA SÉCURITÉ : Le blocage de publication
        if (!resultat.estPublie) {
            // Même si les notes sont saisies et calculées en base, on bloque l'accès
            res.status(403).json({ 
                message: "Les résultats de cet examen sont en cours de délibération et ne sont pas encore officiellement publiés." 
            });
            return;
        }

        // 4. Si c'est publié, on renvoie le bulletin complet
        res.status(200).json(resultat);

    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getResultatByCandidat = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { candidatId } = req.params;
        const resultat = await Resultat.findOne({ candidat: candidatId }).populate('candidat');
        
        if (!resultat) {
            res.status(404).json({ message: 'Résultat introuvable pour ce candidat' });
            return;
        }

        res.status(200).json(resultat);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getResultatByExamen = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { examenId } = req.params;
        const resultats = await Resultat.find({ examen: examenId }).populate('candidat');
        
        res.status(200).json(resultats);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const publishResultats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { examenId } = req.params;
        
        const resultats = await Resultat.updateMany(
            { examen: examenId },
            { estPublie: true, datePublication: new Date() }
        );

        res.status(200).json({
            message: 'Résultats publiés avec succès',
            count: resultats.modifiedCount
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getResultatStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
                    moyenneMoyenne: { $avg: '$moyenneGenerale' }
                }
            }
        ]);

        const total = await Resultat.countDocuments(filter);
        const publies = await Resultat.countDocuments({ ...filter, estPublie: true });

        res.status(200).json({
            total,
            publies,
            parStatut: stats
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const exportResultatsCSV = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { examenId } = req.params;
        
        const resultats = await Resultat.find({ examen: examenId })
            .populate('candidat')
            .sort({ moyenneGenerale: -1 });

        const headers = 'Candidat,Matricule,Moyenne,Statut,Notes\n';
        const rows = resultats.map(r => {
            const candidat = r.candidat as any;
            const notesStr = r.notes.map(n => `${n.matiere}:${n.valeur}`).join(';');
            return `${candidat?.numeroMatricule || 'N/A'},${candidat?.numeroMatricule || 'N/A'},${r.moyenneGenerale},${r.statutFinal},"${notesStr}"`;
        }).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=resultats_${examenId}.csv`);
        res.status(200).send(headers + rows);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};