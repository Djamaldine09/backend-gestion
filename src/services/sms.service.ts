import axios from 'axios';
import { createLog } from '../config/logger';

const smsLog = createLog('SMSService');

interface OrangeSMSResponse {
  messageId: string;
  status: string;
}

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Service SMS - Gère l'intégration avec Orange Developer SMS Madagascar
 */
export class SMSService {
  private static accessToken: string | null = null;
  private static tokenExpiry: number = 0;

  /**
   * Obtient un token d'accès OAuth2
   */
  private static async getAccessToken(): Promise<string> {
    try {
      // Check if token is still valid
      if (this.accessToken && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }

      if (!process.env.ORANGE_SMS_CLIENT_ID || !process.env.ORANGE_SMS_CLIENT_SECRET) {
        smsLog.error('Configuration Orange SMS manquante', null);
        throw new Error('Orange SMS non configuré');
      }

      const credentials = Buffer.from(
        `${process.env.ORANGE_SMS_CLIENT_ID}:${process.env.ORANGE_SMS_CLIENT_SECRET}`
      ).toString('base64');

      const response = await axios.post<OAuthTokenResponse>(
        'https://api.orange.com/oauth/v3/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000; // 60s buffer

      smsLog.info('Token Orange SMS obtenu avec succès');
      return this.accessToken;
    } catch (error: any) {
      smsLog.error('Erreur obtention token Orange SMS', error);
      throw new Error('Impossible d\'obtenir le token d\'accès Orange SMS');
    }
  }

  /**
   * Envoie un SMS via Orange Developer
   */
  static async sendSMS(params: {
    phoneNumber: string;
    message: string;
    senderName?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();

      // Format phone number for Madagascar (remove non-digits, ensure +261 prefix)
      let formattedPhone = params.phoneNumber.replace(/\D/g, '');
      if (!formattedPhone.startsWith('261')) {
        if (formattedPhone.startsWith('0')) {
          formattedPhone = '261' + formattedPhone.substring(1);
        } else {
          formattedPhone = '261' + formattedPhone;
        }
      }

      const payload = {
        outboundSMSMessageRequest: {
          address: `tel:+${formattedPhone}`,
          senderAddress: `tel:+${process.env.ORANGE_SMS_SENDER_ADDRESS || '261340000000'}`,
          senderName: params.senderName || 'ExamGest',
          message: params.message,
          clientCorrelator: Date.now().toString(),
          callbackURL: `${process.env.BACKEND_URL}/api/sms/callback`
        }
      };

      const response = await axios.post<OrangeSMSResponse>(
        'https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B261340000000/requests',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      smsLog.info('SMS envoyé avec succès', { 
        phoneNumber: formattedPhone, 
        messageId: response.data.messageId 
      });

      return {
        success: true,
        messageId: response.data.messageId
      };
    } catch (error: any) {
      smsLog.error('Erreur envoi SMS', error, { phoneNumber: params.phoneNumber });
      
      const errorMessage = error.response?.data?.error || error.message || 'Erreur inconnue';
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Envoie un SMS de notification de paiement
   */
  static async sendPaymentNotification(params: {
    phoneNumber: string;
    candidatName: string;
    amount: number;
    reference: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const message = `Bonjour ${params.candidatName}, votre paiement de ${params.amount} Ar a bien été reçu. Référence: ${params.reference}. Merci pour votre inscription.`;
    
    return this.sendSMS({
      phoneNumber: params.phoneNumber,
      message,
      senderName: 'ExamGest'
    });
  }

  /**
   * Envoie un SMS de confirmation d'inscription
   */
  static async sendRegistrationConfirmation(params: {
    phoneNumber: string;
    candidatName: string;
    examCode: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const message = `Bonjour ${params.candidatName}, votre inscription pour l'examen ${params.examCode} a été confirmée. Bonne préparation!`;
    
    return this.sendSMS({
      phoneNumber: params.phoneNumber,
      message,
      senderName: 'ExamGest'
    });
  }

  /**
   * Envoie un SMS de rappel
   */
  static async sendReminder(params: {
    phoneNumber: string;
    candidatName: string;
    examDate: string;
    examLocation: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const message = `Rappel ${params.candidatName}: votre examen a lieu le ${params.examDate} à ${params.examLocation}. N'oubliez pas votre pièce d'identité.`;
    
    return this.sendSMS({
      phoneNumber: params.phoneNumber,
      message,
      senderName: 'ExamGest'
    });
  }
}

export default SMSService;
