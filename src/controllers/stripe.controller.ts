import { Request, Response } from 'express';
import Candidat from '../models/Candidat';
import Paiement from '../models/Paiement';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import StripeService from '../services/stripe.service';
import { createLog } from '../config/logger';

const paiementLog = createLog('StripeController');

/**
 * Crée un Payment Intent Stripe
 * Le frontend utilisera le client secret pour confirmer le paiement
 */
export const createPaymentIntent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { montant, currency = 'mga' } = req.body;

    if (!montant || montant < 1) {
      res.status(400).json({ message: 'Montant invalide' });
      return;
    }

    const candidat = await Candidat.findOne({ user: req.user!.id });
    if (!candidat) {
      res.status(404).json({ message: 'Candidat introuvable' });
      return;
    }

    // Montant en centimes pour Stripe
    const amountInCents = Math.round(montant * 100);

    // Créer le Payment Intent
    const paymentResult = await StripeService.createPaymentIntent({
      amount: amountInCents,
      currency,
      candidatId: candidat._id.toString(),
      description: 'Frais d\'examen ExamGest',
      metadata: {
        candidatName: candidat.numeroMatricule || 'Unknown',
        type: 'exam_fees'
      }
    });

    // Créer un enregistrement de paiement
    const paiement = await Paiement.create({
      candidat: candidat._id,
      montant,
      modePaiement: 'STRIPE',
      statut: 'EN_ATTENTE',
      referenceTransaction: paymentResult.paymentIntentId,
      stripePaymentIntentId: paymentResult.paymentIntentId
    });

    // Mettre à jour le candidat
    candidat.paiement.statut = 'EN_COURS';
    candidat.paiement.modePaiement = 'STRIPE';
    candidat.paiement.montant = montant;
    await candidat.save();

    paiementLog.info('Payment Intent créé', {
      intentId: paymentResult.paymentIntentId,
      montant,
      candidatId: candidat._id
    });

    res.status(201).json({
      message: 'Payment Intent créé avec succès',
      clientSecret: paymentResult.clientSecret,
      paymentIntentId: paymentResult.paymentIntentId,
      paiementId: paiement._id,
      montant,
      currency
    });
  } catch (error: any) {
    paiementLog.error('Erreur création Payment Intent', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
};

/**
 * Crée une Checkout Session (pour redirection vers Stripe)
 * Alternative plus simple au Payment Intent
 */
export const createCheckoutSession = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { montant, currency = 'mga' } = req.body;

    if (!montant || montant < 1) {
      res.status(400).json({ message: 'Montant invalide' });
      return;
    }

    const candidat = await Candidat.findOne({ user: req.user!.id });
    if (!candidat) {
      res.status(404).json({ message: 'Candidat introuvable' });
      return;
    }

    const amountInCents = Math.round(montant * 100);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const sessionResult = await StripeService.createCheckoutSession({
      amount: amountInCents,
      currency,
      candidatId: candidat._id.toString(),
      description: 'Frais d\'examen',
      successUrl: `${frontendUrl}/dashboard/paiements?success=true`,
      cancelUrl: `${frontendUrl}/dashboard/paiements?cancelled=true`,
      customerEmail: (req.user as any)?.email
    });

    // Créer un enregistrement de paiement
    const paiement = await Paiement.create({
      candidat: candidat._id,
      montant,
      modePaiement: 'STRIPE',
      statut: 'EN_ATTENTE',
      referenceTransaction: sessionResult.sessionId,
      stripeCheckoutSessionId: sessionResult.sessionId
    });

    candidat.paiement.statut = 'EN_COURS';
    candidat.paiement.modePaiement = 'STRIPE';
    candidat.paiement.montant = montant;
    await candidat.save();

    paiementLog.info('Checkout Session créée', {
      sessionId: sessionResult.sessionId,
      montant,
      candidatId: candidat._id
    });

    res.status(201).json({
      message: 'Session de paiement créée',
      sessionId: sessionResult.sessionId,
      url: sessionResult.url,
      paiementId: paiement._id,
      montant
    });
  } catch (error: any) {
    paiementLog.error('Erreur création Checkout Session', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Webhook Stripe - Reçoit les confirmations de paiement
 * À configurer dans Stripe Dashboard
 */
export const webhookStripe = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'] as string;

  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      paiementLog.error('STRIPE_WEBHOOK_SECRET non configuré');
      res.status(400).json({ message: 'Webhook non configuré' });
      return;
    }

    // Valider la signature
    const event = StripeService.validateWebhookSignature(
      (req as any).rawBody || req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    paiementLog.info('Webhook Stripe reçu', { type: event.type });

    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;

      case 'charge.dispute.created':
        await handleChargeDispute(event.data.object);
        break;

      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      default:
        paiementLog.info(`Webhook non traité: ${event.type}`);
    }

    // Acknowledger le webhook
    res.status(200).json({ received: true });
  } catch (error: any) {
    paiementLog.error('Erreur webhook Stripe', error);
    res.status(400).json({ message: 'Erreur webhook' });
  }
};

/**
 * Gère le succès du paiement
 */
async function handlePaymentIntentSucceeded(paymentIntent: any): Promise<void> {
  try {
    const { id: intentId, metadata, amount, currency } = paymentIntent;
    const { candidatId } = metadata || {};

    if (!candidatId) {
      paiementLog.warn('PaymentIntent sans candidatId', { intentId });
      return;
    }

    // Trouver le candidat
    const candidat = await Candidat.findById(candidatId);
    if (!candidat) {
      paiementLog.warn('Candidat introuvable', { candidatId });
      return;
    }

    // Mettre à jour le paiement
    const paiement = await Paiement.findOne({
      referenceTransaction: intentId
    });

    if (paiement) {
      paiement.statut = 'PAYE';
      paiement.datePaiement = new Date();
      await paiement.save();
    }

    // Mettre à jour le candidat
    candidat.paiement.statut = 'PAYE';
    candidat.paiement.referenceTransaction = intentId;
    candidat.paiement.datePaiement = new Date();
    candidat.paiement.montant = amount / 100; // Convertir centimes en montant

    // Passer au statut suivant si nécessaire
    if (candidat.statutInscription === 'BROUILLON') {
      candidat.statutInscription = 'EN_ATTENTE_VALIDATION';
    }

    await candidat.save();

    paiementLog.info('Paiement confirmé', {
      intentId,
      candidatId,
      amount: amount / 100
    });
  } catch (error: any) {
    paiementLog.error('Erreur traitement paiement réussi', error);
  }
}

/**
 * Gère l'échec du paiement
 */
async function handlePaymentIntentFailed(paymentIntent: any): Promise<void> {
  try {
    const { id: intentId, metadata, last_payment_error } = paymentIntent;
    const { candidatId } = metadata || {};

    if (!candidatId) return;

    const candidat = await Candidat.findById(candidatId);
    if (!candidat) return;

    const paiement = await Paiement.findOne({
      referenceTransaction: intentId
    });

    if (paiement) {
      paiement.statut = 'ECHEC';
      paiement.erreur = last_payment_error?.message || 'Paiement échoué';
      await paiement.save();
    }

    candidat.paiement.statut = 'ECHEC';
    await candidat.save();

    paiementLog.info('Paiement échoué', {
      intentId,
      candidatId,
      error: last_payment_error?.message
    });
  } catch (error: any) {
    paiementLog.error('Erreur traitement paiement échoué', error);
  }
}

/**
 * Gère les litiges de paiement
 */
async function handleChargeDispute(dispute: any): Promise<void> {
  try {
    paiementLog.warn('Litige de paiement détecté', {
      chargeId: dispute.charge,
      reason: dispute.reason
    });
    // Ajouter logique de gestion des litiges ici
  } catch (error: any) {
    paiementLog.error('Erreur traitement litige', error);
  }
}

/**
 * Gère la completion de Checkout Session
 */
async function handleCheckoutSessionCompleted(session: any): Promise<void> {
  try {
    const { id: sessionId, metadata, payment_intent: paymentIntentId } = session;
    const { candidatId } = metadata || {};

    if (!candidatId) return;

    const candidat = await Candidat.findById(candidatId);
    if (!candidat) return;

    const paiement = await Paiement.findOne({
      stripeCheckoutSessionId: sessionId
    });

    if (paiement) {
      paiement.statut = 'PAYE';
      paiement.referenceTransaction = paymentIntentId;
      paiement.datePaiement = new Date();
      await paiement.save();
    }

    candidat.paiement.statut = 'PAYE';
    candidat.paiement.datePaiement = new Date();

    if (candidat.statutInscription === 'BROUILLON') {
      candidat.statutInscription = 'EN_ATTENTE_VALIDATION';
    }

    await candidat.save();

    paiementLog.info('Checkout session complétée', { sessionId, candidatId });
  } catch (error: any) {
    paiementLog.error('Erreur traitement checkout session', error);
  }
}

/**
 * Récupère le statut d'un paiement
 */
export const getPaiementStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { paiementId } = req.params;

    const paiement = await Paiement.findById(paiementId);
    if (!paiement) {
      res.status(404).json({ message: 'Paiement introuvable' });
      return;
    }

    // Vérifier auprès de Stripe si nécessaire
    let stripeStatus: any = null;
    if (paiement.stripePaymentIntentId) {
      try {
        stripeStatus = await StripeService.getPaymentIntentStatus(
          paiement.stripePaymentIntentId
        );
      } catch (error) {
        paiementLog.warn('Impossible de vérifier le statut auprès de Stripe');
      }
    }

    res.status(200).json({
      id: paiement._id,
      statut: paiement.statut,
      montant: paiement.montant,
      modePaiement: paiement.modePaiement,
      dateInitiation: paiement.dateInitiation,
      datePaiement: paiement.datePaiement,
      referenceTransaction: paiement.referenceTransaction,
      stripeStatus: stripeStatus ? {
        status: stripeStatus.status,
        charges: stripeStatus.charges
      } : null
    });
  } catch (error: any) {
    paiementLog.error('Erreur récupération statut paiement', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Simule un webhook pour les tests (uniquement en développement)
 */
export const simulateWebhookSuccess = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      res.status(400).json({ message: 'sessionId requis' });
      return;
    }

    const paiement = await Paiement.findOne({
      stripeCheckoutSessionId: sessionId
    });

    if (!paiement) {
      res.status(404).json({ message: 'Paiement introuvable' });
      return;
    }

    // Mettre à jour le paiement
    paiement.statut = 'PAYE';
    paiement.datePaiement = new Date();
    await paiement.save();

    // Mettre à jour le candidat
    const candidat = await Candidat.findById(paiement.candidat);
    if (candidat) {
      candidat.paiement.statut = 'PAYE';
      candidat.paiement.datePaiement = new Date();
      candidat.paiement.montant = paiement.montant;

      if (candidat.statutInscription === 'BROUILLON') {
        candidat.statutInscription = 'EN_ATTENTE_VALIDATION';
      }

      await candidat.save();
    }

    paiementLog.info('Paiement marqué comme réussi (simulation)', { sessionId });

    res.status(200).json({ message: 'Paiement marqué comme réussi' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Créer un remboursement
 */
export const createRefund = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { paiementId, raison = 'requested_by_customer' } = req.body;

    const paiement = await Paiement.findById(paiementId);
    if (!paiement) {
      res.status(404).json({ message: 'Paiement introuvable' });
      return;
    }

    if (paiement.statut !== 'PAYE') {
      res.status(400).json({ message: 'Seuls les paiements confirmés peuvent être remboursés' });
      return;
    }

    // Récupérer les charges de Stripe
    if (!paiement.stripePaymentIntentId) {
      res.status(400).json({ message: 'Paiement Stripe non trouvé' });
      return;
    }

    const stripeStatus = await StripeService.getPaymentIntentStatus(
      paiement.stripePaymentIntentId
    );

    if (!stripeStatus.charges || stripeStatus.charges.length === 0) {
      res.status(400).json({ message: 'Aucune charge trouvée' });
      return;
    }

    // Créer un refund pour la première charge
    const chargeId = stripeStatus.charges[0].id;
    const refundResult = await StripeService.createRefund({
      chargeId,
      amount: paiement.montant * 100,
      reason: raison as 'duplicate' | 'fraudulent' | 'requested_by_customer'
    });

    // Mettre à jour le paiement
    paiement.statut = 'REMBOURSEMENT';
    paiement.datePaiement = new Date();
    await paiement.save();

    const candidat = await Candidat.findById(paiement.candidat);
    if (candidat) {
      candidat.paiement.statut = 'REMBOURSEMENT';
      await candidat.save();
    }

    paiementLog.info('Remboursement créé', {
      paiementId,
      refundId: refundResult.refundId
    });

    res.status(201).json({
      message: 'Remboursement créé avec succès',
      refundId: refundResult.refundId,
      status: refundResult.status,
      amount: refundResult.amount / 100
    });
  } catch (error: any) {
    paiementLog.error('Erreur création remboursement', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Récupère l'historique des paiements
 */
export const getPaiementHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const candidat = await Candidat.findOne({ user: req.user!.id });
    if (!candidat) {
      res.status(404).json({ message: 'Candidat introuvable' });
      return;
    }

    const paiements = await Paiement.find({ candidat: candidat._id })
      .sort({ dateInitiation: -1 })
      .limit(20);

    res.status(200).json({
      total: paiements.length,
      paiements: paiements.map(p => ({
        id: p._id,
        montant: p.montant,
        statut: p.statut,
        modePaiement: p.modePaiement,
        dateInitiation: p.dateInitiation,
        datePaiement: p.datePaiement,
        referenceTransaction: p.referenceTransaction
      }))
    });
  } catch (error: any) {
    paiementLog.error('Erreur récupération historique paiement', error);
    res.status(500).json({ message: error.message });
  }
};