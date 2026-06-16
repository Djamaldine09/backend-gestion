import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import {
  createPaymentIntent,
  createCheckoutSession,
  webhookStripe,
  getPaiementStatus,
  createRefund,
  getPaiementHistory,
  simulateWebhookSuccess
} from '../controllers/stripe.controller';

const router = Router();

/**
 * Routes Stripe Payment
 */

// POST /api/stripe/payment-intent - Créer un Payment Intent
// Utilisé pour les intégrations frontend custom (Stripe Elements)
router.post('/payment-intent', protect, createPaymentIntent);

// POST /api/stripe/checkout-session - Créer une Checkout Session
// Utilisé pour redirection vers Stripe Checkout
router.post('/checkout-session', protect, createCheckoutSession);

// POST /api/stripe/webhook - Webhook Stripe
// À configurer dans Stripe Dashboard sous Settings > Webhooks
// Events: payment_intent.succeeded, payment_intent.payment_failed, checkout.session.completed
router.post('/webhook', webhookStripe);

// GET /api/stripe/paiement/:paiementId - Récupérer le statut d'un paiement
router.get('/paiement/:paiementId', protect, getPaiementStatus);

// POST /api/stripe/refund - Créer un remboursement
router.post('/refund', protect, restrictTo('ADMIN', 'RESPONSABLE'), createRefund);

// GET /api/stripe/history - Récupérer l'historique des paiements
router.get('/history', protect, getPaiementHistory);

// POST /api/stripe/simulate-webhook-success - Simuler un webhook réussi (uniquement pour tests)
router.post('/simulate-webhook-success', protect, simulateWebhookSuccess);

export default router;