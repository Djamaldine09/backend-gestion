import { Request, Response } from 'express';
import Candidat from '../models/Candidat';

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