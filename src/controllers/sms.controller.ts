import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import User from '../models/User';
import crypto from 'crypto';

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

        const code = generateSMSCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        
        smsCodes.set(email, { code, expiresAt });

        // Simulation de l'envoi SMS (en production, utiliser un service SMS réel)
        console.log(`[SMS] Code pour ${email}: ${code}`);

        res.status(200).json({
            message: 'Code SMS envoyé avec succès',
            expiresAt
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

        const code = generateSMSCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        
        smsCodes.set(email, { code, expiresAt });

        console.log(`[SMS] Nouveau code pour ${email}: ${code}`);

        res.status(200).json({
            message: 'Code SMS renvoyé avec succès',
            expiresAt
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
