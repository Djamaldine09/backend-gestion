import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Resultat from '../models/Resultat';
import Candidat from '../models/Candidat';
import User from '../models/User';
import PDFDocument from 'pdfkit';

export const telechargerRelevePDF = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;

        // 1. Récupérer le candidat et ses informations d'état civil (via l'utilisateur)
        const candidat = await Candidat.findOne({ user: userId }).populate({
            path: 'user',
            select: 'nom prenom'
        });

        if (!candidat) {
            res.status(404).json({ message: "Dossier candidat introuvable." });
            return;
        }

        // 2. Récupérer les résultats
        const resultat = await Resultat.findOne({ candidat: candidat._id });

        if (!resultat) {
            res.status(404).json({ message: "Résultats non trouvés." });
            return;
        }

        // SÉCURITÉ : Ne pas permettre le téléchargement si non publié
        if (!resultat.estPublie) {
            res.status(403).json({ message: "Les résultats ne sont pas encore officiellement publiés." });
            return;
        }

        // 3. Configuration des en-têtes HTTP pour forcer le téléchargement du PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Releve_Notes_${candidat.numeroMatricule}.pdf"`);

        // 4. Création du document PDF (Génération à la volée)
        const doc = new PDFDocument({ margin: 50 });

        // On "branche" le document directement sur la réponse HTTP (Stream)
        doc.pipe(res);

        // --- EN-TÊTE OFFICIEL ---
        doc.fontSize(10).text('RÉPUBLIQUE DE MADAGASCAR', { align: 'center' });
        doc.text('Ministère de l\'Éducation Nationale', { align: 'center' });
        doc.moveDown(2);

        // --- TITRE DU DOCUMENT ---
        doc.fontSize(16).font('Helvetica-Bold').text('RELEVÉ DE NOTES OFFICIEL', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica').text(`Examen : ${candidat.examen} - Série : ${candidat.serieFiliere}`, { align: 'center' });
        doc.moveDown(2);

        // --- IDENTIFICATION DU CANDIDAT ---
        // @ts-ignore (Permet d'ignorer l'erreur TS sur la propriété peuplée)
        const nomComplet = `${candidat.user.nom} ${candidat.user.prenom}`;
        
        doc.fontSize(12).font('Helvetica');
        doc.text(`Nom et Prénoms : ${nomComplet.toUpperCase()}`);
        doc.text(`Numéro Matricule : ${candidat.numeroMatricule}`);
        doc.text(`Centre d'examen : ${candidat.centreExamenSouhaite}`);
        doc.moveDown(2);

        // --- TABLEAU DES NOTES ---
        doc.font('Helvetica-Bold');
        doc.text('Matière', 50, doc.y, { continued: true });
        doc.text('Coef', 250, doc.y, { continued: true });
        doc.text('Note /20', 350, doc.y);
        doc.moveDown(0.5);
        
        // Ligne de séparation
        doc.moveTo(50, doc.y).lineTo(450, doc.y).stroke();
        doc.moveDown(0.5);

        // Boucle sur chaque note
        doc.font('Helvetica');
        resultat.notes.forEach(note => {
            doc.text(note.matiere, 50, doc.y, { continued: true });
            doc.text(note.coefficient.toString(), 250, doc.y, { continued: true });
            doc.text(note.valeur.toString(), 350, doc.y);
            doc.moveDown(0.5);
        });

        doc.moveDown(1);
        doc.moveTo(50, doc.y).lineTo(450, doc.y).stroke();
        doc.moveDown(1);

        // --- RÉSULTAT FINAL ---
        doc.font('Helvetica-Bold').fontSize(14);
        doc.text(`Moyenne Générale : ${resultat.moyenneGenerale} / 20`);
        
        let decisionText = '';
        if (resultat.statutFinal === 'ADMIS') decisionText = 'ADMIS(E)';
        else if (resultat.statutFinal === 'REPECHAGE') decisionText = 'ADMISSIBLE (REPÊCHAGE)';
        else decisionText = 'REFUSÉ(E)';

        doc.text(`Décision du Jury : ${decisionText}`);

        // Signature électronique / QR Code (Pourrait être ajouté ici)
        doc.moveDown(3);
        doc.fontSize(10).font('Helvetica-Oblique').text('Document généré électroniquement. Fait à Antananarivo.', { align: 'right' });

        // 5. Finaliser et envoyer le document
        doc.end();

    } catch (error: any) {
        // En cas d'erreur, on renvoie du JSON classique
        if (!res.headersSent) {
            res.status(500).json({ message: error.message });
        }
    }
};