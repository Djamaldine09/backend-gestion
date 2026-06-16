import axios from 'axios';
import { createLog } from '../config/logger';

const paiementLog = createLog('PaiementService');

interface MVolaPaymentResponse {
  transaction_id: string;
  status: string;
  payment_url: string;
}

interface OrangeMoneyPaymentResponse {
  transaction_id: string;
  status: string;
  payment_url: string;
}

interface PaymentStatusResponse {
  status: string;
  amount: number;
  timestamp: string;
  external_reference: string;
}

/**
 * Service Paiement - Gère l'intégration avec les opérateurs
 * Support: MVola, Orange Money, Airtel Money
 */
export class PaiementService {
  /**
   * Initiates a payment with MVola
   * Requires: MVOLA_API_KEY, MVOLA_API_SECRET, MVOLA_MERCHANT_ID
   */
  static async initiateMVolaPayment(params: {
    phoneNumber: string;
    amount: number;
    reference: string;
    description: string;
  }): Promise<any> {
    try {
      if (!process.env.MVOLA_API_KEY || !process.env.MVOLA_MERCHANT_ID) {
        paiementLog.error('Configuration MVola manquante', null);
        throw new Error('MVola non configuré');
      }

      const payload = {
        merchant_id: process.env.MVOLA_MERCHANT_ID,
        msisdn: params.phoneNumber.replace(/\D/g, ''), // Remove non-digits
        amount: params.amount,
        external_reference: params.reference,
        description: params.description,
        return_url: `${process.env.BACKEND_URL}/api/paiement/mvola/callback`,
        timestamp: new Date().toISOString()
      };

      // Sign request with secret
      const signature = this.generateSignature(payload, process.env.MVOLA_API_SECRET || '');

      const response = await axios.post<MVolaPaymentResponse>(
        'https://api.mvola.mg/v1/payment/initiate',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${process.env.MVOLA_API_KEY}`,
            'X-Signature': signature,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      paiementLog.info('Paiement MVola initié', { reference: params.reference });
      return {
        success: true,
        transactionId: response.data.transaction_id,
        status: response.data.status,
        redirectUrl: response.data.payment_url
      };
    } catch (error: any) {
      paiementLog.error('Erreur initiation paiement MVola', error, { reference: params.reference });
      throw error;
    }
  }

  /**
   * Initiates a payment with Orange Money
   * Requires: ORANGE_API_KEY, ORANGE_API_SECRET, ORANGE_MERCHANT_ID
   */
  static async initiateOrangeMoneyPayment(params: {
    phoneNumber: string;
    amount: number;
    reference: string;
    description: string;
  }): Promise<any> {
    try {
      if (!process.env.ORANGE_API_KEY || !process.env.ORANGE_MERCHANT_ID) {
        paiementLog.error('Configuration Orange Money manquante', null);
        throw new Error('Orange Money non configuré');
      }

      const payload = {
        merchant_id: process.env.ORANGE_MERCHANT_ID,
        msisdn: params.phoneNumber.replace(/\D/g, ''),
        amount: params.amount,
        external_reference: params.reference,
        description: params.description,
        return_url: `${process.env.BACKEND_URL}/api/paiement/orange/callback`,
        timestamp: new Date().toISOString()
      };

      const signature = this.generateSignature(payload, process.env.ORANGE_API_SECRET || '');

      const response = await axios.post<OrangeMoneyPaymentResponse>(
        'https://api.orange.mg/v1/payment/initiate',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${process.env.ORANGE_API_KEY}`,
            'X-Signature': signature,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      paiementLog.info('Paiement Orange Money initié', { reference: params.reference });
      return {
        success: true,
        transactionId: response.data.transaction_id,
        status: response.data.status,
        redirectUrl: response.data.payment_url
      };
    } catch (error: any) {
      paiementLog.error('Erreur initiation paiement Orange Money', error, { reference: params.reference });
      throw error;
    }
  }

  /**
   * Vérifie le statut d'un paiement auprès de l'opérateur
   */
  static async checkPaymentStatus(operateur: 'mvola' | 'orange', transactionId: string): Promise<any> {
    try {
      const url = operateur === 'mvola'
        ? `https://api.mvola.mg/v1/payment/${transactionId}/status` 
        : `https://api.orange.mg/v1/payment/${transactionId}/status`;

      const apiKey = operateur === 'mvola'
        ? process.env.MVOLA_API_KEY
        : process.env.ORANGE_API_KEY;

      const response = await axios.get<PaymentStatusResponse>(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      return {
        status: response.data.status,
        amount: response.data.amount,
        timestamp: response.data.timestamp,
        reference: response.data.external_reference
      };
    } catch (error: any) {
      paiementLog.error('Erreur vérification statut paiement', error, { operateur, transactionId });
      throw error;
    }
  }

  /**
   * Valide une signature webhook
   */
  static validateWebhookSignature(
    body: any,
    signature: string,
    secret: string
  ): boolean {
    try {
      const expectedSignature = this.generateSignature(body, secret);
      return signature === expectedSignature;
    } catch (error: any) {
      paiementLog.error('Erreur validation signature webhook', error);
      return false;
    }
  }

  /**
   * Génère une signature HMAC SHA256
   */
  private static generateSignature(payload: any, secret: string): string {
    const crypto = require('crypto');
    const message = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');
  }
}

export default PaiementService;