import { Request, Response } from 'express';
import User from '../models/User';
import jwt from 'jsonwebtoken';
import admin from 'firebase-admin';
import serviceAccount from '../../examgest-a96f9-firebase-adminsdk-fbsvc-7f7dcbab2e.json';
import crypto from 'crypto';
import { sendPasswordResetEmail } from '../services/email.service';
import SMSService from '../services/sms.service';

const twoFactorChallenges = new Map<string, {
    userId: string;
    code: string;
    expiresAt: Date;
}>();

const generateTwoFactorCode = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const maskPhone = (phone?: string): string => {
    if (!phone) return '';
    const visible = phone.replace(/\D/g, '').slice(-2);
    return `******${visible}`;
};

const buildAuthPayload = (user: any) => ({
    _id: user._id,
    nom: user.nom,
    prenom: user.prenom,
    email: user.email,
    telephone: user.telephone,
    photo: user.photo,
    twoFactorEnabled: user.twoFactorEnabled || false,
    role: user.role,
    createdAt: user.createdAt,
    token: generateToken(user._id.toString(), user.role),
});

// Fonction utilitaire pour générer le Token
export const generateToken = (id: string, role: string) => {
    console.log('generateToken - id:', id, 'role:', role);
    return jwt.sign({ userId: id, role }, process.env.JWT_SECRET as string, {
        expiresIn: '30d',
    });
};

// Inscription d'un nouvel utilisateur
export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nom, prenom, email, motDePasse, role, telephone } = req.body;

        // Valider le rôle
        const rolesValides = ['ADMIN', 'RESPONSABLE', 'SURVEILLANT', 'CORRECTEUR', 'CANDIDAT'];
        if (role && !rolesValides.includes(role)) {
            res.status(400).json({ message: 'Rôle invalide. Rôles autorisés: ' + rolesValides.join(', ') });
            return;
        }

        // Vérifier si l'utilisateur existe déjà
        const userExists = await User.findOne({ email });
        if (userExists) {
            res.status(400).json({ message: 'Un utilisateur avec cet email existe déjà' });
            return;
        }

        // Création de l'utilisateur
        const user = await User.create({ nom, prenom, email, motDePasse, role: role || 'CANDIDAT', telephone });

        res.status(201).json({
            _id: user._id,
            nom: user.nom,
            prenom: user.prenom,
            email: user.email,
            role: user.role,
            twoFactorEnabled: user.twoFactorEnabled || false,
            token: generateToken(user._id.toString(), user.role)
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Connexion
export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, motDePasse } = req.body;

        const user = await User.findOne({ email });

        if (user && (await user.comparePassword(motDePasse))) {
            if (user.twoFactorEnabled && user.telephone) {
                const code = generateTwoFactorCode();
                const rawChallengeToken = crypto.randomBytes(32).toString('hex');
                const challengeToken = crypto
                    .createHash('sha256')
                    .update(rawChallengeToken)
                    .digest('hex');
                const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

                twoFactorChallenges.set(challengeToken, {
                    userId: user._id.toString(),
                    code,
                    expiresAt,
                });

                const smsResult = await SMSService.sendSMS({
                    phoneNumber: user.telephone,
                    message: `Votre code 2FA Exam Mada est: ${code}. Valide 10 minutes.`,
                });

                if (!smsResult.success) {
                    res.status(500).json({
                        message: 'Erreur envoi du code 2FA',
                        error: smsResult.error,
                    });
                    return;
                }

                res.status(200).json({
                    requiresTwoFactor: true,
                    twoFactorToken: rawChallengeToken,
                    maskedTelephone: maskPhone(user.telephone),
                    expiresAt,
                    message: 'Code 2FA envoye par SMS',
                });
                return;
            }

            res.json(buildAuthPayload(user));
        } else {
            res.status(401).json({ message: 'Email ou mot de passe incorrect' });
        }
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const verifyTwoFactorLogin = async (req: Request, res: Response): Promise<void> => {
    try {
        const { twoFactorToken, code } = req.body;

        const challengeToken = crypto
            .createHash('sha256')
            .update(twoFactorToken)
            .digest('hex');
        const stored = twoFactorChallenges.get(challengeToken);

        if (!stored) {
            res.status(400).json({ message: 'Session 2FA introuvable ou expiree' });
            return;
        }

        if (stored.expiresAt < new Date()) {
            twoFactorChallenges.delete(challengeToken);
            res.status(400).json({ message: 'Code 2FA expire' });
            return;
        }

        if (stored.code !== code) {
            res.status(401).json({ message: 'Code 2FA incorrect' });
            return;
        }

        const user = await User.findById(stored.userId);
        if (!user) {
            twoFactorChallenges.delete(challengeToken);
            res.status(404).json({ message: 'Utilisateur introuvable' });
            return;
        }

        twoFactorChallenges.delete(challengeToken);
        res.status(200).json(buildAuthPayload(user));
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateTwoFactorPreference = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as Request & { user?: { id?: string } };
        const { enabled } = req.body;

        if (!authReq.user?.id) {
            res.status(401).json({ success: false, message: 'Utilisateur non authentifie' });
            return;
        }

        const user = await User.findById(authReq.user.id);
        if (!user) {
            res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
            return;
        }

        if (enabled && !user.telephone) {
            res.status(400).json({
                success: false,
                message: 'Ajoutez un numero de telephone avant d activer la 2FA',
            });
            return;
        }

        user.twoFactorEnabled = Boolean(enabled);
        await user.save();

        res.status(200).json({
            success: true,
            message: user.twoFactorEnabled ? '2FA activee' : '2FA desactivee',
            user: {
                _id: user._id,
                nom: user.nom,
                prenom: user.prenom,
                email: user.email,
                telephone: user.telephone,
                photo: user.photo,
                role: user.role,
                twoFactorEnabled: user.twoFactorEnabled,
                createdAt: (user as any).createdAt,
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Initialiser Firebase Admin une seule fois dans ton app
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount)
  });
}

export const loginWithPhone = async (req: Request, res: Response) => {
    try {
        const { token } = req.body;

        // 1. Vérifier le token auprès des serveurs de Google/Firebase
        const decodedToken = await admin.auth().verifyIdToken(token);
        const numeroTelephone = decodedToken.phone_number;

        if (!numeroTelephone) {
            return res.status(400).json({ message: "Numéro de téléphone introuvable dans le token" });
        }

        // 2. Chercher si l'utilisateur existe dans MongoDB
        let user = await User.findOne({ telephone: numeroTelephone });

        // 3. S'il n'existe pas, on le crée (exactement comme pour Google)
        if (!user) {
            const randomPassword = Math.random().toString(36).slice(-10) + 'Ph1!';
            user = new User({
                telephone: numeroTelephone,
                // On met des valeurs par défaut pour les champs requis,
                // l'utilisateur pourra compléter son profil plus tard
                nom: 'Candidat',
                prenom: 'À compléter', 
                email: `${numeroTelephone}@examgest.local`, // Email fictif pour satisfaire mongoose
                role: 'CANDIDAT',
                motDePasse: randomPassword,
            });
            await user.save();
        }

        // 4. On renvoie tes données avec ton propre JWT (comme pour un login classique)
        res.json({
            _id: user._id,
            nom: user.nom,
            prenom: user.prenom,
            telephone: user.telephone,
            role: user.role,
            twoFactorEnabled: user.twoFactorEnabled || false,
            token: generateToken(user._id.toString(), user.role)
        });

    } catch (error: any) {
        res.status(401).json({ message: "Erreur d'authentification Firebase", error: error.message });
    }
};

// Forgot Password - Generate reset token
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            res.status(404).json({ message: 'Aucun utilisateur trouvé avec cet email' });
            return;
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000; // 1 hour

        user.resetPasswordToken = resetToken;
        user.resetPasswordExpiry = new Date(resetTokenExpiry);
        await user.save();

        // Send email with reset link
        const emailSent = await sendPasswordResetEmail(email, resetToken);
        
        if (!emailSent) {
            console.error('Erreur lors de l\'envoi de l\'email de réinitialisation');
        }

        res.status(200).json({ 
            message: 'Email de réinitialisation envoyé avec succès'
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Reset Password - Verify token and update password
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { token, newPassword } = req.body;

        const user = await User.findOne({ 
            resetPasswordToken: token,
            resetPasswordExpiry: { $gt: Date.now() }
        });

        if (!user) {
            res.status(400).json({ message: 'Token invalide ou expiré' });
            return;
        }

        user.motDePasse = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpiry = undefined;
        await user.save();

        res.status(200).json({ message: 'Mot de passe réinitialisé avec succès' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};