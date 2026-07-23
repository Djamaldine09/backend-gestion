import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import User from '../models/User';
import crypto from 'crypto';
import SMSService from '../services/sms.service';
import { generateToken } from './auth.controller';

// Stockage temporaire des codes SMS (en production, utiliser Redis)
const smsCodes = new Map<string, { code: string; expiresAt: Date }>();
// Stockage temporaire des codes OTP de connexion par téléphone (en production, utiliser Redis)
const loginOtpCodes = new Map<string, { code: string; expiresAt: Date }>();

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

        if (!user.telephone) {
            res.status(400).json({ message: 'Numéro de téléphone manquant' });
            return;
        }

        const code = generateSMSCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        smsCodes.set(email, { code, expiresAt });

        // Envoi réel du SMS via Orange Developer
        const smsResult = await SMSService.sendSMS({
            phoneNumber: user.telephone,
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

        if (!user.telephone) {
            res.status(400).json({ message: 'Numéro de téléphone manquant' });
            return;
        }

        const code = generateSMSCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        smsCodes.set(email, { code, expiresAt });

        // Envoi réel du SMS via Orange Developer
        const smsResult = await SMSService.sendSMS({
            phoneNumber: user.telephone,
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

// Normalise un numéro malgache pour comparaison fiable (indépendant du format saisi)
function normalizePhone(phone: string): string {
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('261')) return digits;
    if (digits.startsWith('0')) return '261' + digits.substring(1);
    return '261' + digits;
}

/**
 * Connexion par téléphone - étape 1 : envoie un code OTP par SMS au numéro fourni.
 * Le compte doit déjà exister (créé via l'inscription) et avoir ce numéro enregistré ;
 * sinon un compte candidat minimal est créé (à compléter ensuite via l'inscription).
 */
export const sendLoginOTP = async (req: Request, res: Response): Promise<void> => {
    try {
        const { telephone } = req.body;
        if (!telephone) {
            res.status(400).json({ message: 'Numéro de téléphone requis' });
            return;
        }

        const normalized = normalizePhone(telephone);
        const code = generateSMSCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        loginOtpCodes.set(normalized, { code, expiresAt });

        const smsResult = await SMSService.sendSMS({
            phoneNumber: telephone,
            message: `Votre code de connexion ExamGest est: ${code}. Valide 10 minutes.`
        });

        if (!smsResult.success) {
            res.status(500).json({ message: 'Erreur envoi SMS', error: smsResult.error });
            return;
        }

        res.status(200).json({
            message: 'Code de connexion envoyé par SMS',
            expiresAt,
            messageId: smsResult.messageId
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Connexion par téléphone - étape 2 : vérifie le code OTP et renvoie un JWT,
 * au même format que les autres routes de connexion (login/loginWithPhone).
 */
export const verifyLoginOTP = async (req: Request, res: Response): Promise<void> => {
    try {
        const { telephone, code } = req.body;
        if (!telephone || !code) {
            res.status(400).json({ message: 'Numéro de téléphone et code requis' });
            return;
        }

        const normalized = normalizePhone(telephone);
        const stored = loginOtpCodes.get(normalized);

        if (!stored) {
            res.status(400).json({ message: 'Aucun code envoyé pour ce numéro' });
            return;
        }
        if (stored.expiresAt < new Date()) {
            loginOtpCodes.delete(normalized);
            res.status(400).json({ message: 'Code expiré' });
            return;
        }
        if (stored.code !== code) {
            res.status(401).json({ message: 'Code incorrect' });
            return;
        }

        loginOtpCodes.delete(normalized);

        let user = await User.findOne({
            $or: [
                { telephone },
                { telephone: normalized },
                { telephone: `+${normalized}` },
                { telephone: `0${normalized.substring(3)}` },
            ],
        });
        let profileIncomplete = false;
        if (!user) {
            const randomPassword = crypto.randomBytes(12).toString('hex') + 'Ph1!';
            user = new User({
                telephone: normalized,
                nom: 'Candidat',
                prenom: 'À compléter',
                email: `${normalized}@examgest.local`,
                role: 'CANDIDAT',
                motDePasse: randomPassword,
            });
            await user.save();
            profileIncomplete = true;
        } else {
            profileIncomplete =
                user.nom === 'Candidat' ||
                user.prenom === 'À compléter' ||
                user.email.endsWith('@examgest.local');
        }

        res.status(200).json({
            _id: user._id,
            nom: user.nom,
            prenom: user.prenom,
            email: user.email,
            telephone: user.telephone,
            role: user.role,
            profileIncomplete,
            token: generateToken(user._id.toString(), user.role)
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
