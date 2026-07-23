import axios from 'axios';
import { createLog } from '../config/logger';

const smsLog = createLog('SMSService');

interface BefianaSMSResponse {
  message?: string;
  address?: string;
  clientCorrelator?: string;
  callbackData?: string;
  error?: string;
  details?: string;
}

/**
 * Service SMS - integration SMS by BEFIANA Madagascar.
 */
export class SMSService {
  private static readonly defaultBefianaEndpoint =
    'https://api.befiana.cloud/api/smsko/v1/send/';

  /**
   * Befiana attend le numero national sans 0 initial.
   * Ex: +261 34 12 345 67 -> 341234567.
   */
  private static formatBefianaPhoneNumber(phoneNumber: string): string {
    let digits = phoneNumber.replace(/\D/g, '');

    if (digits.startsWith('261')) {
      digits = digits.substring(3);
    }
    if (digits.startsWith('0')) {
      digits = digits.substring(1);
    }

    return digits;
  }

  /**
   * Envoie un SMS via SMS by BEFIANA.
   */
  static async sendSMS(params: {
    phoneNumber: string;
    message: string;
    senderName?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!process.env.BEFIANA_SMS_API_KEY) {
        smsLog.error('Configuration Befiana SMS manquante', null);
        throw new Error('Befiana SMS non configure');
      }

      const formattedPhone = this.formatBefianaPhoneNumber(params.phoneNumber);
      const endpoint = process.env.BEFIANA_SMS_API_URL || this.defaultBefianaEndpoint;

      const response = await axios.post<BefianaSMSResponse>(
        endpoint,
        {
          phone_number: formattedPhone,
          message: params.message,
        },
        {
          headers: {
            Authorization: process.env.BEFIANA_SMS_API_KEY,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      smsLog.info('SMS Befiana envoye avec succes', {
        phoneNumber: formattedPhone,
        messageId: response.data.clientCorrelator || response.data.callbackData,
      });

      return {
        success: true,
        messageId: response.data.clientCorrelator || response.data.callbackData,
      };
    } catch (error: any) {
      smsLog.error('Erreur envoi SMS Befiana', error, { phoneNumber: params.phoneNumber });

      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.details ||
        error.response?.data?.message ||
        error.message ||
        'Erreur inconnue';

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Envoie un SMS de notification de paiement.
   */
  static async sendPaymentNotification(params: {
    phoneNumber: string;
    candidatName: string;
    amount: number;
    reference: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const message = `Bonjour ${params.candidatName}, votre paiement de ${params.amount} Ar a bien ete recu. Reference: ${params.reference}. Merci pour votre inscription.`;

    return this.sendSMS({
      phoneNumber: params.phoneNumber,
      message,
      senderName: 'ExamGest',
    });
  }

  /**
   * Envoie un SMS de confirmation d'inscription.
   */
  static async sendRegistrationConfirmation(params: {
    phoneNumber: string;
    candidatName: string;
    examCode: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const message = `Bonjour ${params.candidatName}, votre inscription pour l'examen ${params.examCode} a ete confirmee. Bonne preparation!`;

    return this.sendSMS({
      phoneNumber: params.phoneNumber,
      message,
      senderName: 'ExamGest',
    });
  }

  /**
   * Envoie un SMS de rappel.
   */
  static async sendReminder(params: {
    phoneNumber: string;
    candidatName: string;
    examDate: string;
    examLocation: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const message = `Rappel ${params.candidatName}: votre examen a lieu le ${params.examDate} a ${params.examLocation}. N'oubliez pas votre piece d'identite.`;

    return this.sendSMS({
      phoneNumber: params.phoneNumber,
      message,
      senderName: 'ExamGest',
    });
  }
}

export default SMSService;
