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
        
        // --- GÉNÉRATION DU QR CODE ---
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
            width: 100, 
        });

        // --- PRÉPARATION DU FICHIER PDF ---
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Convocation_${candidat.numeroMatricule || candidat._id}.pdf"`);

        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        doc.pipe(res);

        // ==========================================
        // 1. EN-TÊTE (Gauche et Droite)
        // ==========================================
        
        // Droite : Logo (Remplace le texte République et Devise)
        // Remplacez ce chemin par le chemin réel de l'image sur votre serveur
        const logoPath = './assets/Gemini_Generated_Image_ckf03uckf03uckf0.png'; 
        
        try {
            // Insertion de l'image : X=230, Y=30, largeur=150 (ajustez "width" pour redimensionner)
            doc.image(logoPath, 230, 10, { width: 150 });
        } catch (err) {
            console.error("Impossible de charger le logo de l'en-tête:", err);
            // En cas d'erreur (chemin introuvable), l'espace restera vide pour ne pas faire planter la génération
        }
        
        // Gauche : Ministère
        const ministereTexte = "MINISTERE DE L'EDUCATION NATIONALE";
        doc.font('Helvetica-Bold').fontSize(10);
        
        // On positionne le texte du ministère pour qu'il soit bien aligné avec le logo
        doc.text(ministereTexte, 40, 90, { width: 250, align: 'left' });
        
        // Ligne pointillée exactement sous le Ministère
        const ministereWidth = doc.widthOfString(ministereTexte);
        doc.moveTo(40, 104).lineTo(40 + ministereWidth, 104).dash(3, { space: 2 }).stroke();
        
        // Réinitialisation des lignes pour la suite du document
        doc.undash();

        // ==========================================
        // 2. CENTRE ET TITRE
        // ==========================================
        
        doc.moveDown(3);
        doc.font('Helvetica-Bold').fontSize(11);
        doc.text(`Centre d'écrit:  ${centre?.nom?.toUpperCase()}`, 40, 120);

        doc.font('Helvetica-Bold').fontSize(15);
        doc.text("CONVOCATION A L'EPREUVE ECRITE", 0, 160, { align: 'center', underline: true });

        // Numéro d'inscription (à droite)
        doc.fontSize(11);
        doc.text("N° d'Inscription:", 360, 195, { underline: true, continued: true });
        doc.text(`   ${candidat.numeroMatricule || 'N/A'}`, { underline: false });

        // ==========================================
        // 3. INFORMATIONS DU CANDIDAT
        // ==========================================
        
        const startY = 230;
        const fullName = `${(candidat.user as any)?.nom || ''} ${(candidat.user as any)?.prenom || ''}`.trim().toUpperCase();
        
        doc.font('Helvetica').fontSize(11);
        doc.text("Nom et Prénoms:   ", 40, startY, { continued: true }).font('Helvetica-Bold').text(fullName);
        
        doc.font('Helvetica');
        doc.text("Série:   ", 40, startY + 20, { continued: true })
           .font('Helvetica-Bold')
           .text(`${candidat.serieFiliere}`);
           
        doc.font('Helvetica');
        const etablissementPrecedent = candidat.etablissementPrecedent || '..........................................................';
        doc.text("Établissement d'origine:   ", 40, startY + 40, { continued: true })
           .font('Helvetica-Bold')
           .text(etablissementPrecedent);

        doc.font('Helvetica');
        doc.text("Ecole mère d'accueil:   ", 40, startY + 60, { continued: true })
           .font('Helvetica-Bold')
           .text(centre?.nom?.toUpperCase() || '..........................................................');

        // ==========================================
        // 4. CORPS DU TEXTE (Paragraphes)
        // ==========================================
        
        const paraY = startY + 110;
        const dateEpreuveStr = convocation.dateEpreuve ? convocation.dateEpreuve.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : '16 JUIN 2026';
        const heureDebut = convocation.heureDebut || '08 heures';
        const salle = convocation.salle || '33';
        const centreNom = centre?.nom?.toUpperCase() || '..........................................................';

        doc.font('Helvetica').fontSize(11);
        doc.text("J'ai l'honneur de vous informer que vous êtes inscrit(e) sur la liste des candidats autorisés à subir les épreuves.", 40, paraY);

        doc.text('Ces épreuves, pour l\'examen ', 40, paraY + 25, { continued: true });
        doc.font('Helvetica-Bold').text(candidat.examen || 'N/A', { continued: true });
        doc.font('Helvetica').text(', se dérouleront le ', { continued: true });
        doc.font('Helvetica-Bold').text(dateEpreuveStr, { continued: true });
        doc.font('Helvetica').text(' au ', { continued: true });
        doc.font('Helvetica-Bold').text(`${centreNom} Salle N° ${salle}`, { continued: true });
        doc.font('Helvetica').text(` à partir de ${heureDebut}.`);
        doc.font('Helvetica').text("L'appel des candidats aura lieu à 07h30.", 40, paraY + 50);
        doc.text("Vous devez vous munir de la présente convocation ainsi que d'une pièce d'identité nationale ou scolaire.", 40, paraY + 75);

        // ==========================================
        // 5. SIGNATURE ET TAMPON ROUGE
        // ==========================================
        
        const footerY = paraY + 160;
        
        const today = new Date();
        const dateStr = `${String(today.getDate()).padStart(2, '0')} ${today.toLocaleDateString('fr-FR', { month: 'long' }).toUpperCase()} ${today.getFullYear()}`;
        
        doc.font('Helvetica').fontSize(11).fillColor('black');
        doc.text(`${centre?.ville?.toUpperCase() || 'ANTANANARIVO RENIVOHITRA'}, le `, 280, footerY, { continued: true });
        
        // Date en rouge
        doc.fillColor('#B8251E').font('Helvetica-Bold').fontSize(14).text(`   ${dateStr}`);
        
        // Chef de centre
        doc.fillColor('black').font('Helvetica').fontSize(11);
        doc.text("Le Chef de Centre,", 410, footerY + 25);

        const stampX = 350;
        const stampY = footerY + 100;
        
        

        

        const tamponPath = './assets/Tampon-minister.png';
        try {
            doc.image(tamponPath, 340, footerY + 10, { width: 130, height: 130 });
        } catch (err) {
            console.error("Impossible de charger le tampon officiel :", err);
            doc.fontSize(7).fillColor('#B8251E').font('Helvetica-Bold');
            doc.text('TAMPON OFFICIEL', 340, footerY + 45, { width: 130, align: 'center' });
        }

        doc.fontSize(11).fillColor('#B8251E').font('Helvetica-Bold');
        doc.text("RATSIMADITRA HajahariIala Olivia", 380, stampY + 40, { width: 200, align: 'left' });

        // ==========================================
        // 6. QR CODE DE SÉCURITÉ
        // ==========================================
        
        doc.fillColor('black');
        const qrY = footerY + 10;
        doc.image(qrImageBuffer, 40, qrY, { width: 80, height: 80 });
        doc.font('Helvetica-Oblique').fontSize(7).text('Scan de vérification', 40, qrY + 85, { width: 80, align: 'center' });

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
