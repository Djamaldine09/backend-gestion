import Stripe from 'stripe';
import { createLog } from '../config/logger';

const stripeLog = createLog('StripeService');

// Initialiser Stripe de manière lazy
let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY non configuré');
    }
    stripeInstance = new Stripe(secretKey, {
      apiVersion: '2026-05-27.dahlia',
      timeout: 10000
    });
  }
  return stripeInstance;
}

/**
 * Service Stripe - Gère les paiements par carte bancaire
 * Support: Cartes Visa, Mastercard, American Express, etc.
 */
export class StripeService {
  /**
   * Crée une session de paiement Stripe (Payment Intent)
   * Retourne le client secret pour le frontend
   */
  static async createPaymentIntent(params: {
    amount: number; // Montant en centimes (ex: 1500 MGA = 150000 centimes)
    currency: string; // Devise (ex: 'mga', 'usd')
    candidatId: string; // ID du candidat
    description: string; // Description du paiement
    metadata?: Record<string, string>; // Données additionnelles
  }): Promise<any> {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY non configuré');
      }

      // Validations
      if (params.amount < 100) {
        throw new Error('Montant minimum: 1.00 MGA');
      }

      const paymentIntent = await getStripe().paymentIntents.create({
        amount: params.amount, // Montant en centimes
        currency: params.currency.toLowerCase(),
        description: params.description,
        metadata: {
          candidatId: params.candidatId,
          ...params.metadata
        },
        // Options supplémentaires
        automatic_payment_methods: {
          enabled: true, // Accepte tous les types de paiement
        },
        capture_method: 'automatic', // Capture automatiquement après confirmation
      });

      stripeLog.info('Payment Intent créé', {
        intentId: paymentIntent.id,
        amount: params.amount,
        currency: params.currency
      });

      return {
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: params.amount,
        currency: params.currency,
        status: paymentIntent.status
      };
    } catch (error: any) {
      stripeLog.error('Erreur création Payment Intent', error);
      throw error;
    }
  }

  /**
   * Crée une Checkout Session pour redirection
   * Plus simple que Payment Intent pour le frontend
   */
  static async createCheckoutSession(params: {
    amount: number;
    currency: string;
    candidatId: string;
    candidatNom?: string;
    description: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
  }): Promise<any> {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY non configuré');
      }

      const session = await getStripe().checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: params.currency.toLowerCase(),
              product_data: {
                name: params.description,
                description: params.candidatNom ? `Paiement pour ${params.candidatNom}` : `Paiement pour candidat ${params.candidatId}`,
                images: [process.env.STRIPE_PRODUCT_IMAGE || '']
              },
              unit_amount: params.amount
            },
            quantity: 1
          }
        ],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        customer_email: params.customerEmail,
        metadata: {
          candidatId: params.candidatId,
          type: 'exam_fees'
        }
      });

      stripeLog.info('Checkout Session créée', {
        sessionId: session.id,
        amount: params.amount
      });

      return {
        success: true,
        sessionId: session.id,
        url: session.url,
        amount: params.amount
      };
    } catch (error: any) {
      stripeLog.error('Erreur création Checkout Session', error);
      throw error;
    }
  }

  /**
   * Récupère le statut d'un Payment Intent
   */
  static async getPaymentIntentStatus(paymentIntentId: string): Promise<any> {
    try {
      const [paymentIntent, charges] = await Promise.all([
        getStripe().paymentIntents.retrieve(paymentIntentId),
        getStripe().charges.list({ payment_intent: paymentIntentId })
      ]);

      return {
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        charges: charges.data.map(charge => ({
          id: charge.id,
          status: charge.status,
          amount: charge.amount,
          receiptUrl: charge.receipt_url
        })),
        metadata: paymentIntent.metadata
      };
    } catch (error: any) {
      stripeLog.error('Erreur récupération Payment Intent', error);
      throw error;
    }
  }

  /**
   * Récupère une Checkout Session
   */
  static async getCheckoutSession(sessionId: string): Promise<any> {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);

      return {
        id: session.id,
        status: session.payment_status,
        paymentIntentId: session.payment_intent,
        amount: session.amount_total,
        currency: session.currency,
        customerEmail: session.customer_email,
        metadata: session.metadata
      };
    } catch (error: any) {
      stripeLog.error('Erreur récupération Checkout Session', error);
      throw error;
    }
  }

  /**
   * Confirme un Payment Intent avec une carte
   * Utilisé après que le client a confirmé le paiement
   */
  static async confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethod: string
  ): Promise<any> {
    try {
      const paymentIntent = await getStripe().paymentIntents.confirm(
        paymentIntentId,
        {
          payment_method: paymentMethod
        }
      );

      return {
        status: paymentIntent.status,
        clientSecret: paymentIntent.client_secret,
        nextAction: paymentIntent.next_action
      };
    } catch (error: any) {
      stripeLog.error('Erreur confirmation Payment Intent', error);
      throw error;
    }
  }

  /**
   * Crée un refund (remboursement) pour une charge
   */
  static async createRefund(params: {
    chargeId: string;
    amount?: number;
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    metadata?: Record<string, string>;
  }): Promise<any> {
    try {
      const refund = await getStripe().refunds.create({
        charge: params.chargeId,
        amount: params.amount,
        reason: params.reason || 'requested_by_customer',
        metadata: params.metadata
      });

      stripeLog.info('Refund créé', {
        refundId: refund.id,
        chargeId: params.chargeId,
        amount: params.amount
      });

      return {
        success: true,
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount
      };
    } catch (error: any) {
      stripeLog.error('Erreur création refund', error);
      throw error;
    }
  }

  /**
   * Valide la signature d'un webhook Stripe
   */
  static validateWebhookSignature(
    body: Buffer | string,
    signature: string,
    endpointSecret: string
  ): any {
    try {
      const event = getStripe().webhooks.constructEvent(
        body,
        signature,
        endpointSecret
      );

      return event;
    } catch (error: any) {
      stripeLog.error('Erreur validation signature webhook', error);
      throw new Error('Signature webhook invalide');
    }
  }

  /**
   * Récupère les détails d'une charge
   */
  static async getCharge(chargeId: string): Promise<any> {
    try {
      const charge = await getStripe().charges.retrieve(chargeId);

      return {
        id: charge.id,
        status: charge.status,
        amount: charge.amount,
        currency: charge.currency,
        description: charge.description,
        receiptUrl: charge.receipt_url,
        metadata: charge.metadata,
        paymentMethodDetails: charge.payment_method_details
      };
    } catch (error: any) {
      stripeLog.error('Erreur récupération charge', error);
      throw error;
    }
  }

  /**
   * Récupère toutes les charges d'un client
   */
  static async getCharges(limit: number = 10): Promise<any> {
    try {
      const charges = await getStripe().charges.list({
        limit
      });

      return charges.data.map(charge => ({
        id: charge.id,
        amount: charge.amount,
        currency: charge.currency,
        status: charge.status,
        created: charge.created,
        metadata: charge.metadata
      }));
    } catch (error: any) {
      stripeLog.error('Erreur récupération charges', error);
      throw error;
    }
  }

  /**
   * Crée un token de paiement (deprecated, utiliser Payment Method API)
   * Garder pour compatibilité avec anciennes intégrations
   */
  static async createPaymentMethod(params: {
    type: 'card';
    card: {
      number: string;
      exp_month: number;
      exp_year: number;
      cvc: string;
    };
  }): Promise<any> {
    try {
      const paymentMethod = await getStripe().paymentMethods.create({
        type: 'card',
        card: params.card
      });

      return {
        id: paymentMethod.id,
        type: paymentMethod.type,
        card: {
          brand: paymentMethod.card?.brand,
          last4: paymentMethod.card?.last4,
          expMonth: paymentMethod.card?.exp_month,
          expYear: paymentMethod.card?.exp_year
        }
      };
    } catch (error: any) {
      stripeLog.error('Erreur création Payment Method', error);
      throw error;
    }
  }

  /**
   * Récupère les statistiques de paiement
   */
  static async getPaymentStats(params: {
    startDate: Date;
    endDate: Date;
  }): Promise<any> {
    try {
      const charges = await getStripe().charges.list({
        limit: 100,
        created: {
          gte: Math.floor(params.startDate.getTime() / 1000),
          lte: Math.floor(params.endDate.getTime() / 1000)
        }
      });

      const totalAmount = charges.data.reduce((sum, charge) => sum + charge.amount, 0);
      const successCount = charges.data.filter(c => c.status === 'succeeded').length;
      const failureCount = charges.data.filter(c => c.status === 'failed').length;

      return {
        totalCharges: charges.data.length,
        successCount,
        failureCount,
        totalAmount,
        averageAmount: totalAmount / charges.data.length,
        successRate: `${((successCount / charges.data.length) * 100).toFixed(2)}%`
      };
    } catch (error: any) {
      stripeLog.error('Erreur récupération statistiques', error);
      throw error;
    }
  }
}

export default StripeService;
