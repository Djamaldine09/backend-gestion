import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import User from '../models/User';
import crypto from 'crypto';
import SMSService from '../services/sms.service';

// Stockage temporaire des codes SMS (en production, utiliser Redis)
const smsCodes = new Map<string, { code: string; expiresAt: Date }>();

function generateSMSCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export const sendSMSCode = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { email } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) {
            res.status(404).json({ message: 'Utilisateur introuvable' });
            return;
        }

        if (!user.phoneNumber) {
            res.status(400).json({ message: 'Numéro de téléphone manquant' });
            return;
        }

        const code = generateSMSCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        
        smsCodes.set(email, { code, expiresAt });

        // Envoi réel du SMS via Orange Developer
        const smsResult = await SMSService.sendSMS({
            phoneNumber: user.phoneNumber,
            message: `Votre code de vérification est: ${code}. Valide 10 minutes.`
        });

        if (!smsResult.success) {
            res.status(500).json({ message: 'Erreur envoi SMS', error: smsResult.error });
            return;
        }

        res.status(200).json({
            message: 'Code SMS envoyé avec succès',
            expiresAt,
            messageId: smsResult.messageId
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const verifySMSCode = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { email, code } = req.body;
        
        const stored = smsCodes.get(email);
        if (!stored) {
            res.status(400).json({ message: 'Aucun code envoyé pour cet email' });
            return;
        }

        if (stored.expiresAt < new Date()) {
            smsCodes.delete(email);
            res.status(400).json({ message: 'Code expiré' });
            return;
        }

        if (stored.code !== code) {
            res.status(401).json({ message: 'Code incorrect' });
            return;
        }

        smsCodes.delete(email);

        res.status(200).json({
            message: 'Code vérifié avec succès'
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const resendSMSCode = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { email } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) {
            res.status(404).json({ message: 'Utilisateur introuvable' });
            return;
        }

        if (!user.phoneNumber) {
            res.status(400).json({ message: 'Numéro de téléphone manquant' });
            return;
        }

        const code = generateSMSCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        
        smsCodes.set(email, { code, expiresAt });

        // Envoi réel du SMS via Orange Developer
        const smsResult = await SMSService.sendSMS({
            phoneNumber: user.phoneNumber,
            message: `Votre code de vérification est: ${code}. Valide 10 minutes.`
        });

        if (!smsResult.success) {
            res.status(500).json({ message: 'Erreur envoi SMS', error: smsResult.error });
            return;
        }

        res.status(200).json({
            message: 'Code SMS renvoyé avec succès',
            expiresAt,
            messageId: smsResult.messageId
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Nouveaux endpoints pour les SMS de notification
export const sendPaymentNotification = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { phoneNumber, candidatName, amount, reference } = req.body;

        const result = await SMSService.sendPaymentNotification({
            phoneNumber,
            candidatName,
            amount,
            reference
        });

        if (result.success) {
            res.status(200).json({
                message: 'Notification de paiement envoyée avec succès',
                messageId: result.messageId
            });
        } else {
            res.status(500).json({
                message: 'Erreur envoi notification',
                error: result.error
            });
        }
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const sendRegistrationConfirmation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { phoneNumber, candidatName, examCode } = req.body;

        const result = await SMSService.sendRegistrationConfirmation({
            phoneNumber,
            candidatName,
            examCode
        });

        if (result.success) {
            res.status(200).json({
                message: 'Confirmation d\'inscription envoyée avec succès',
                messageId: result.messageId
            });
        } else {
            res.status(500).json({
                message: 'Erreur envoi confirmation',
                error: result.error
            });
        }
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const sendReminder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { phoneNumber, candidatName, examDate, examLocation } = req.body;

        const result = await SMSService.sendReminder({
            phoneNumber,
            candidatName,
            examDate,
            examLocation
        });

        if (result.success) {
            res.status(200).json({
                message: 'Rappel envoyé avec succès',
                messageId: result.messageId
            });
        } else {
            res.status(500).json({
                message: 'Erreur envoi rappel',
                error: result.error
            });
        }
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
