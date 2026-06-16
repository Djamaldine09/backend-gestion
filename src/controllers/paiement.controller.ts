import { Request, Response } from 'express';
import Candidat from '../models/Candidat';
import Paiement from '../models/Paiement';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import StripeService from '../services/stripe.service';

export const webhookMobileMoney = async (req: Request, res: Response): Promise<void> => {
    try {
        // 1. Récupération des données envoyées par l'opérateur (MVola, Orange, etc.)
        // La structure exacte dépend de l'API de l'opérateur, ceci est un exemple standard.
        const { transactionId, externalReference, status, amount, currency } = req.body;

        // "externalReference" est généralement l'ID du candidat ou l'ID de la facture
        // que vous avez fourni lors de l'initiation du paiement (étape 2 de la cinématique).
        
        console.log(`[Webhook Paiement] Notification reçue pour la référence: ${externalReference} avec le statut: ${status}`);

        // 2. Recherche du dossier candidat correspondant
        const candidat = await Candidat.findById(externalReference);

        if (!candidat) {
            console.error(`[Webhook Erreur] Candidat introuvable pour la référence ${externalReference}`);
            // On renvoie quand même 200 à l'opérateur pour qu'il ne re-tente pas la requête
            res.status(200).send('Candidat non trouvé, mais notification ignorée.');
            return;
        }

        // 3. Mise à jour du statut selon la réponse de l'opérateur
        // Exemple : "SUCCESS" ou "COMPLETED" selon l'opérateur
        if (status === 'SUCCESS') {
            
            // Sécurité : Vérifier que le montant payé correspond bien aux frais d'examen
            // (Imaginons que les frais sont de 15000)
            if (amount < 15000) {
                candidat.paiement.statut = 'ECHEC'; // Frais insuffisants
            } else {
                candidat.paiement.statut = 'PAYE';
                candidat.paiement.referenceTransaction = transactionId;
                candidat.paiement.datePaiement = new Date();
                candidat.paiement.montant = amount;
                
                // On peut aussi passer automatiquement le statut d'inscription à l'étape suivante
                if(candidat.statutInscription === 'BROUILLON') {
                    candidat.statutInscription = 'EN_ATTENTE_VALIDATION';
                }
            }
        } else {
            candidat.paiement.statut = 'ECHEC';
        }

        // 4. Sauvegarde en base de données
        await candidat.save();

        // 5. Répondre OBLIGATOIREMENT 200 OK à l'opérateur pour acquitter la réception
        res.status(200).json({ message: 'Notification traitée avec succès' });

    } catch (error: any) {
        console.error(`[Webhook Erreur Critique] : ${error.message}`);
        // En cas de crash serveur, on renvoie 500. L'opérateur réessaiera plus tard.
        res.status(500).json({ message: 'Erreur interne du serveur' });
    }
};

export const initiatePaiement = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { montant, modePaiement, numeroTelephone, carteToken } = req.body;

        const candidat = await Candidat.findOne({ user: req.user!.id }).populate('user');
        if (!candidat) {
            res.status(404).json({ message: 'Candidat introuvable' });
            return;
        }

        // Gestion des paiements Stripe (Carte bancaire)
        if (modePaiement === 'CARTE_BANCAIRE' || modePaiement === 'STRIPE') {
            const amountInCents = montant; // MGA n'a pas de centimes, on utilise le montant direct
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

            const candidatNom = (candidat as any).user ? `${(candidat as any).user.prenom || ''} ${(candidat as any).user.nom || ''}`.trim() : '';

            const sessionResult = await StripeService.createCheckoutSession({
                amount: amountInCents,
                currency: 'mga',
                candidatId: candidat._id.toString(),
                candidatNom: candidatNom || 'Candidat',
                description: 'Frais d\'examen',
                successUrl: `${frontendUrl}/paiements?success=true&session_id={CHECKOUT_SESSION_ID}`,
                cancelUrl: `${frontendUrl}/paiements?cancelled=true`,
                customerEmail: (req.user as any)?.email
            });

            // Créer un enregistrement de paiement
            const paiement = await Paiement.create({
                candidat: candidat._id,
                montant,
                modePaiement: 'CARTE_BANCAIRE',
                statut: 'EN_ATTENTE',
                referenceTransaction: sessionResult.sessionId,
                stripeCheckoutSessionId: sessionResult.sessionId
            });

            candidat.paiement.statut = 'EN_COURS';
            candidat.paiement.modePaiement = 'CARTE_BANCAIRE';
            candidat.paiement.montant = montant;
            await candidat.save();

            res.status(201).json({
                message: 'Session de paiement créée',
                sessionId: sessionResult.sessionId,
                url: sessionResult.url, // URL pour redirection vers Stripe
                paiementId: paiement._id,
                montant
            });
            return;
        }

        // Gestion des paiements Mobile Money (MVola, Orange, Airtel)
        const paiement = await Paiement.create({
            candidat: candidat._id,
            montant,
            modePaiement,
            numeroTelephone,
            carteToken,
            statut: 'EN_ATTENTE',
            referenceTransaction: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        });

        candidat.paiement.statut = 'EN_COURS';
        candidat.paiement.modePaiement = modePaiement;
        candidat.paiement.montant = montant;
        await candidat.save();

        res.status(201).json({
            message: 'Paiement initié avec succès',
            paiementId: paiement._id,
            referenceTransaction: paiement.referenceTransaction,
            montant,
            modePaiement
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const checkPaiementStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const paiement = await Paiement.findById(req.params.transactionId);
        if (!paiement) {
            res.status(404).json({ message: 'Paiement introuvable' });
            return;
        }

        res.status(200).json({
            statut: paiement.statut,
            referenceTransaction: paiement.referenceTransaction,
            dateInitiation: paiement.dateInitiation,
            datePaiement: paiement.datePaiement
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getPaiementHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const candidat = await Candidat.findOne({ user: req.user!.id });
        if (!candidat) {
            res.status(404).json({ message: 'Candidat introuvable' });
            return;
        }

        const paiements = await Paiement.find({ candidat: candidat._id }).sort({ dateInitiation: -1 });
        res.status(200).json(paiements);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const retryPaiement = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const candidat = await Candidat.findById(req.params.candidatId);
        if (!candidat) {
            res.status(404).json({ message: 'Candidat introuvable' });
            return;
        }

        // Créer un nouveau paiement
        const dernierPaiement = await Paiement.findOne({ candidat: candidat._id }).sort({ dateInitiation: -1 });
        if (!dernierPaiement) {
            res.status(404).json({ message: 'Aucun paiement précédent trouvé' });
            return;
        }

        const nouveauPaiement = await Paiement.create({
            candidat: candidat._id,
            montant: dernierPaiement.montant,
            modePaiement: dernierPaiement.modePaiement,
            numeroTelephone: dernierPaiement.numeroTelephone,
            carteToken: dernierPaiement.carteToken,
            statut: 'EN_ATTENTE',
            referenceTransaction: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        });

        candidat.paiement.statut = 'EN_COURS';
        await candidat.save();

        res.status(201).json({
            message: 'Paiement relancé avec succès',
            paiementId: nouveauPaiement._id,
            referenceTransaction: nouveauPaiement.referenceTransaction
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};