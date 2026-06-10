import crypto from 'crypto';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Resultat from '../models/Resultat';
import Candidat from '../models/Candidat';
import User from '../models/User';
import PDFDocument from 'pdfkit';

const QRCode = require('qrcode');

const QR_SECRET = process.env.QR_SECRET || 'examgest-secret';

function createQrHash(payload: string): string {
    return crypto.createHmac('sha256', QR_SECRET).update(payload).digest('hex');
}

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

export const telechargerConvocationPDF = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const candidat = await Candidat.findOne({ user: userId }).populate({ path: 'user', select: 'nom prenom email' });

        if (!candidat) {
            res.status(404).json({ message: 'Candidat introuvable.' });
            return;
        }

        const convocation = candidat.convocation;
        if (!convocation) {
            res.status(404).json({ message: 'Convocation non générée pour ce candidat.' });
            return;
        }

        const centre = convocation.centre;
        const payloadSource = `${candidat._id}|${candidat.numeroMatricule || 'N/A'}|${convocation.examenId}|${convocation.salle}|${convocation.numeroPlace}`;
        const hash = createQrHash(payloadSource);
        const qrPayload = JSON.stringify({
            v: 1,
            candidatId: String(candidat._id),
            matricule: candidat.numeroMatricule || 'N/A',
            examenId: convocation.examenId,
            salle: convocation.salle,
            place: convocation.numeroPlace,
            hash,
        });
        const qrImageBuffer = await QRCode.toBuffer(qrPayload, {
            errorCorrectionLevel: 'M',
            margin: 1,
            type: 'png',
            width: 180,
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Convocation_${candidat.numeroMatricule || candidat._id}.pdf"`);

        const doc = new PDFDocument({ margin: 50 });
        doc.pipe(res);

        doc.fontSize(10).text('RÉPUBLIQUE DE MADAGASCAR', { align: 'center' });
        doc.text('Ministère de l\'Éducation Nationale', { align: 'center' });
        doc.moveDown(2);

        doc.fontSize(18).font('Helvetica-Bold').text('CONVOCATION À L\'EXAMEN', { align: 'center' });
        doc.moveDown(1);

        const fullName = `${(candidat.user as any)?.prenom || ''} ${(candidat.user as any)?.nom || ''}`.trim();
        doc.fontSize(12).font('Helvetica');
        doc.text(`Nom : ${fullName}`);
        doc.text(`Matricule : ${candidat.numeroMatricule || 'N/A'}`);
        doc.text(`Examen : ${candidat.examen}`);
        doc.text(`Série : ${candidat.serieFiliere}`);
        doc.moveDown(1);

        doc.text(`Date : ${convocation.dateEpreuve.toISOString().slice(0, 10)}`);
        doc.text(`Heure : ${convocation.heureDebut} - ${convocation.heureFin}`);
        doc.text(`Centre : ${centre?.nom || 'N/A'} - ${centre?.ville || 'N/A'}`);
        doc.text(`Adresse : ${centre?.adresse || 'N/A'}`);
        doc.text(`Salle / Place : ${convocation.salle} / ${convocation.numeroPlace}`);
        doc.moveDown(1);

        doc.font('Helvetica-Bold').text('Instructions importantes :', { underline: true });
        doc.font('Helvetica').list([
            'Se présenter 30 minutes avant le début de l\'épreuve.',
            'Avoir sur soi la convocation imprimée et une pièce d\'identité officielle.',
            'Interdit de communiquer ou d\'utiliser un appareil électronique pendant l\'épreuve.',
            'Respecter les consignes du surveillant et le placement indiqué sur la convocation.',
        ]);
        doc.moveDown(2);

        doc.font('Helvetica-Bold').text('QR code de validation :', { underline: true });
        const qrX = doc.x;
        const qrY = doc.y + 8;
        doc.image(qrImageBuffer, qrX, qrY, { width: 140, height: 140 });
        doc.font('Helvetica').fontSize(9).text('Scanner ce code pour valider la convocation et enregistrer la présence.', qrX + 160, qrY + 20, {
            width: 280,
        });
        doc.fontSize(7).text(`Payload : ${qrPayload}`, qrX + 160, qrY + 65, {
            width: 280,
        });
        doc.y = qrY + 155;
        doc.moveDown(1);
        doc.font('Helvetica-Oblique').fontSize(10).text('Ce QR contient un hash de vérification qui garantit l\'authenticité de cette convocation.', { align: 'left' });

        doc.end();
    } catch (error: any) {
        if (!res.headersSent) {
            res.status(500).json({ message: error.message });
        }
    }
};

export const downloadJustificatif = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { type } = req.params;
        const userId = req.user?.id;

        const candidat = await Candidat.findOne({ user: userId });
        if (!candidat) {
            res.status(404).json({ message: 'Candidat introuvable' });
            return;
        }

        const filePath = candidat.piecesJustificatives[type as keyof typeof candidat.piecesJustificatives];
        if (!filePath) {
            res.status(404).json({ message: 'Document non trouvé' });
            return;
        }

        res.download(filePath);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const checkPiecesStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;

        const candidat = await Candidat.findOne({ user: userId });
        if (!candidat) {
            res.status(404).json({ message: 'Candidat introuvable' });
            return;
        }

        const status = {
            photoIdentite: candidat.piecesJustificatives.photoIdentite ? 'valide' : 'manquant',
            acteNaissance: candidat.piecesJustificatives.acteNaissance ? 'valide' : 'manquant',
            diplomePrecedent: candidat.piecesJustificatives.diplomePrecedent ? 'valide' : 'manquant',
        };

        res.status(200).json(status);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const generateBulletinVersement = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;

        const candidat = await Candidat.findOne({ user: userId }).populate({
            path: 'user',
            select: 'nom prenom'
        });

        if (!candidat) {
            res.status(404).json({ message: 'Candidat introuvable' });
            return;
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Bulletin_Versement_${candidat.numeroMatricule}.pdf"`);

        const doc = new PDFDocument({ margin: 50 });
        doc.pipe(res);

        doc.fontSize(10).text('RÉPUBLIQUE DE MADAGASCAR', { align: 'center' });
        doc.text('Ministère de l\'Éducation Nationale', { align: 'center' });
        doc.moveDown(2);

        doc.fontSize(16).font('Helvetica-Bold').text('BULLETIN DE VERSEMENT', { align: 'center' });
        doc.moveDown(2);

        const nomComplet = `${(candidat.user as any)?.nom} ${(candidat.user as any)?.prenom}`;
        doc.fontSize(12).font('Helvetica');
        doc.text(`Nom et Prénoms : ${nomComplet.toUpperCase()}`);
        doc.text(`Numéro Matricule : ${candidat.numeroMatricule}`);
        doc.text(`Examen : ${candidat.examen}`);
        doc.moveDown(2);

        doc.font('Helvetica-Bold').text('Détails du versement :');
        doc.font('Helvetica').text(`Montant : ${candidat.paiement.montant || 0} Ar`);
        doc.text(`Mode de paiement : ${candidat.paiement.modePaiement || 'Non spécifié'}`);
        doc.text(`Statut : ${candidat.paiement.statut}`);
        if (candidat.paiement.datePaiement) {
            doc.text(`Date de paiement : ${candidat.paiement.datePaiement.toISOString().slice(0, 10)}`);
        }
        if (candidat.paiement.referenceTransaction) {
            doc.text(`Référence : ${candidat.paiement.referenceTransaction}`);
        }

        doc.moveDown(3);
        doc.fontSize(10).font('Helvetica-Oblique').text('Document généré électroniquement.', { align: 'right' });

        doc.end();
    } catch (error: any) {
        if (!res.headersSent) {
            res.status(500).json({ message: error.message });
        }
    }
};
