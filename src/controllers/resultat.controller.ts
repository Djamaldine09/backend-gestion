import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Resultat from '../models/Resultat';
import Candidat from '../models/Candidat';
import Examen from '../models/Examen';
import Anonymat from '../models/Anonymat';

function buildNumeroAnonymat(examenId: string, index: number): string {
    const suffix = examenId.slice(-4).toUpperCase();
    return `AN-${suffix}-${String(index + 1).padStart(5, '0')}`;
}

function getCoefficient(examen: any, matiere: string, fallback?: number): number {
    const epreuve = (examen.epreuves || []).find((item: any) =>
        item.type === 'EPREUVE' && item.matiere.toLowerCase() === matiere.toLowerCase()
    );

    return Number(epreuve?.coefficient || fallback || 1);
}

function getStatutCorrection(notesCount: number, expectedCount: number): 'A_CORRIGER' | 'EN_COURS' | 'TERMINE' {
    if (notesCount <= 0) return 'A_CORRIGER';
    if (expectedCount > 0 && notesCount >= expectedCount) return 'TERMINE';
    return 'EN_COURS';
}

export const genererTableAnonymat = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const examenId = String(req.params.examenId);
        const examen = await Examen.findById(examenId);

        if (!examen) {
            res.status(404).json({ message: 'Examen introuvable' });
            return;
        }

        const candidats = examen.candidatsInscrits?.length
            ? await Candidat.find({ _id: { $in: examen.candidatsInscrits }, statutInscription: 'VALIDE' }).sort({ _id: 1 })
            : await Candidat.find({ examen: examen.titre, statutInscription: 'VALIDE' }).sort({ _id: 1 });

        const rows = [];
        for (let i = 0; i < candidats.length; i += 1) {
            const candidat = candidats[i];
            const numeroAnonymat = buildNumeroAnonymat(examenId, i);
            const record = await Anonymat.findOneAndUpdate(
                { examen: examen._id, candidat: candidat._id },
                { $setOnInsert: { numeroAnonymat, notes: [] } },
                { upsert: true, new: true }
            );

            rows.push({
                numeroAnonymat: record.numeroAnonymat,
                candidatId: candidat._id,
                matricule: candidat.numeroMatricule,
            });
        }

        res.status(200).json({
            message: 'Table d’anonymat générée',
            examen: { _id: examen._id, titre: examen.titre },
            total: rows.length,
            rows,
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const listerCopiesAnonymes = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const examenId = String(req.params.examenId);
        const copies = await Anonymat.find({ examen: examenId })
            .select('numeroAnonymat notes statutCorrection anonymatLeve updatedAt')
            .sort({ numeroAnonymat: 1 });

        res.status(200).json(copies);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const saisirNoteAnonyme = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const numeroAnonymat = String(req.params.numeroAnonymat);
        const { examenId, matiere, valeur, coefficient } = req.body;
        const correcteurId = req.user?.id;

        if (!examenId || !matiere || valeur === undefined) {
            res.status(400).json({ message: 'Examen, matière et note sont requis' });
            return;
        }

        const examen = await Examen.findById(examenId);
        if (!examen) {
            res.status(404).json({ message: 'Examen introuvable' });
            return;
        }

        const copie = await Anonymat.findOne({ examen: examenId, numeroAnonymat, anonymatLeve: false });
        if (!copie) {
            res.status(404).json({ message: 'Copie anonyme introuvable ou déjà levée' });
            return;
        }

        const noteValue = Number(valeur);
        if (Number.isNaN(noteValue) || noteValue < 0 || noteValue > 20) {
            res.status(400).json({ message: 'La note doit être comprise entre 0 et 20' });
            return;
        }

        const resolvedCoefficient = getCoefficient(examen, matiere, coefficient);
        const existingIndex = copie.notes.findIndex((note: any) => note.matiere === matiere);
        const notePayload = {
            matiere,
            valeur: noteValue,
            coefficient: resolvedCoefficient,
            correcteur: correcteurId as any,
            saisieAt: new Date(),
        };

        if (existingIndex >= 0) {
            copie.notes[existingIndex] = notePayload as any;
        } else {
            copie.notes.push(notePayload as any);
        }

        const expectedCount = (examen.epreuves || []).filter((epreuve: any) => epreuve.type === 'EPREUVE').length;
        copie.statutCorrection = getStatutCorrection(copie.notes.length, expectedCount);
        await copie.save();

        res.status(200).json({
            message: 'Note anonyme enregistrée',
            numeroAnonymat: copie.numeroAnonymat,
            statutCorrection: copie.statutCorrection,
            notes: copie.notes.map((note: any) => ({
                matiere: note.matiere,
                valeur: note.valeur,
                coefficient: note.coefficient,
            })),
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const leverAnonymat = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const examenId = String(req.params.examenId);
        const adminId = req.user?.id;
        const examen = await Examen.findById(examenId);

        if (!examen) {
            res.status(404).json({ message: 'Examen introuvable' });
            return;
        }

        const copies = await Anonymat.find({ examen: examenId });
        const expectedCount = (examen.epreuves || []).filter((epreuve: any) => epreuve.type === 'EPREUVE').length;
        const incompletes = copies.filter((copie: any) => expectedCount > 0 && copie.notes.length < expectedCount);

        if (incompletes.length > 0 && req.body?.force !== true) {
            res.status(409).json({
                message: 'Certaines copies ne sont pas entièrement corrigées',
                count: incompletes.length,
                numeros: incompletes.map((copie: any) => copie.numeroAnonymat),
            });
            return;
        }

        let resultatsCrees = 0;
        let resultatsMisAJour = 0;

        for (const copie of copies as any[]) {
            let resultat = await Resultat.findOne({ candidat: copie.candidat });
            if (!resultat) {
                resultat = new Resultat({
                    candidat: copie.candidat,
                    examen: examenId,
                    notes: [],
                });
                resultatsCrees += 1;
            } else {
                resultat.examen = examenId;
                resultatsMisAJour += 1;
            }

            resultat.notes = copie.notes.map((note: any) => ({
                matiere: note.matiere,
                valeur: note.valeur,
                coefficient: note.coefficient,
                correcteur: note.correcteur,
            }));
            await resultat.save();

            copie.anonymatLeve = true;
            copie.leveePar = adminId as any;
            copie.leveeAt = new Date();
            await copie.save();
        }

        res.status(200).json({
            message: 'Anonymat levé et résultats calculés',
            totalCopies: copies.length,
            resultatsCrees,
            resultatsMisAJour,
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

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

const deriveMention = (moyenne: number): string => {
    if (moyenne >= 16) return 'Très bien';
    if (moyenne >= 14) return 'Bien';
    if (moyenne >= 12) return 'Assez bien';
    if (moyenne >= 10) return 'Passable';
    return '—';
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

export const getPublicResultatByMatricule = async (req: Request, res: Response): Promise<void> => {
    try {
        const matricule = String(req.params.matricule || '').trim();

        if (!matricule) {
            res.status(400).json({ message: 'Matricule requis.' });
            return;
        }

        const candidat = await Candidat.findOne({ numeroMatricule: matricule }).populate('user');
        if (!candidat) {
            res.status(404).json({ message: 'Aucun résultat trouvé pour ce matricule.' });
            return;
        }

        const resultat = await Resultat.findOne({ candidat: candidat._id });
        if (!resultat) {
            res.status(404).json({ message: 'Aucun résultat trouvé pour ce matricule.' });
            return;
        }

        if (!resultat.estPublie) {
            res.status(403).json({ message: 'Les résultats ne sont pas encore publiés officiellement.' });
            return;
        }

        const nomComplet = `${(candidat.user as any)?.nom || ''} ${(candidat.user as any)?.prenom || ''}`.trim() || 'Candidat';

        res.status(200).json({
            matricule: candidat.numeroMatricule || matricule,
            nomComplet,
            examen: resultat.examen || candidat.examen || 'Examen',
            centre: candidat.centreAffecte?.nom,
            region: candidat.region,
            moyenne: resultat.moyenneGenerale,
            mention: deriveMention(resultat.moyenneGenerale),
            statut: resultat.statutFinal,
            datePublication: resultat.datePublication ? resultat.datePublication.toISOString() : undefined,
            notes: resultat.notes.map((note) => ({
                matiere: note.matiere,
                valeur: note.valeur,
                coefficient: note.coefficient,
            })),
        });
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
