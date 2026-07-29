import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { register, login, loginWithPhone, forgotPassword, resetPassword, verifyTwoFactorLogin, updateTwoFactorPreference } from '../controllers/auth.controller';
import { 
    validateRequest, 
    registerSchema, 
    loginSchema, 
    twoFactorLoginSchema,
    twoFactorPreferenceSchema,
    loginPhoneSchema,
    googleAuthSchema 
} from '../config/validation';
import { createLog } from '../config/logger';
import { AuthenticatedRequest, protect } from '../middlewares/auth.middleware';

const router = express.Router();
const authLog = createLog('Auth');

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Inscription d'un nouvel utilisateur
 *     tags:
 *       - Authentification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom:
 *                 type: string
 *               prenom:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               motDePasse:
 *                 type: string
 *                 description: Minimum 8 caractères avec majuscule, minuscule, chiffre et caractère spécial
 *               telephone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Utilisateur créé avec succès
 *       400:
 *         description: Erreur de validation
 *       409:
 *         description: Email déjà enregistré
 */
router.post('/register', validateRequest(registerSchema), register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Connexion utilisateur
 *     tags:
 *       - Authentification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - motDePasse
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               motDePasse:
 *                 type: string
 *     responses:
 *       200:
 *         description: Connexion réussie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Identifiants invalides
 */
router.post('/login', validateRequest(loginSchema), login);

router.post('/login/2fa', validateRequest(twoFactorLoginSchema), verifyTwoFactorLogin);

router.put('/me/2fa', protect, validateRequest(twoFactorPreferenceSchema), updateTwoFactorPreference);

/**
 * @swagger
 * /api/auth/phone:
 *   post:
 *     summary: Connexion par numéro de téléphone (SMS)
 *     tags:
 *       - Authentification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               telephone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Code SMS envoyé
 *       400:
 *         description: Numéro invalide
 */
router.post('/phone', validateRequest(loginPhoneSchema), loginWithPhone);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Demande de réinitialisation de mot de passe
 *     tags:
 *       - Authentification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Email de réinitialisation envoyé
 *       404:
 *         description: Email non trouvé
 */
router.post('/forgot-password', forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Réinitialisation du mot de passe avec token
 *     tags:
 *       - Authentification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Mot de passe réinitialisé avec succès
 *       400:
 *         description: Token invalide ou expiré
 */
router.post('/reset-password', resetPassword);

router.put('/me', protect, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { nom, prenom, email, telephone } = req.body;

        if (!req.user?.id) {
            return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
        }

        if (!nom || !prenom || !email) {
            return res.status(400).json({ success: false, message: 'Nom, prénom et email sont requis' });
        }

        const emailOwner = await User.findOne({ email, _id: { $ne: req.user.id } });
        if (emailOwner) {
            return res.status(409).json({ success: false, message: 'Cet email est déjà utilisé' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
        }

        user.nom = String(nom).trim();
        user.prenom = String(prenom).trim();
        user.email = String(email).trim().toLowerCase();
        if (telephone) user.telephone = String(telephone).trim();

        await user.save();

        res.status(200).json({
            success: true,
            user: {
                _id: user._id,
                nom: user.nom,
                prenom: user.prenom,
                email: user.email,
                telephone: user.telephone,
                role: user.role,
                createdAt: (user as any).createdAt,
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message || 'Erreur lors de la mise à jour du profil' });
    }
});

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     summary: Authentification Google OAuth2
 *     tags:
 *       - Authentification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: Access token Google
 *     responses:
 *       200:
 *         description: Authentification réussie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 jwt:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Token manquant
 *       401:
 *         description: Token invalide ou expiré
 */
router.post('/google', validateRequest(googleAuthSchema), async (req, res) => {
    try {
        const { token } = req.body;

        authLog.info('Tentative d\'authentification Google');

        if (!token) {
            return res.status(400).json({ success: false, message: 'Token manquant' });
        }

        // 1. Récupérer les infos de l'utilisateur auprès de Google
        const googleResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!googleResponse.ok) {
            authLog.warn('Token Google invalide ou expiré');
            return res.status(401).json({ success: false, message: 'Token Google invalide ou expiré' });
        }

        const payload = await googleResponse.json();

        if (!payload || !payload.email) {
            authLog.warn('Profil Google incomplet');
            return res.status(401).json({ success: false, message: 'Profil Google incomplet ou invalide' });
        }

        // 2. Recherche ou création de l'utilisateur
        let user = await User.findOne({ email: payload.email });

        if (!user) {
            authLog.info('Création d\'un nouvel utilisateur Google', { email: payload.email });
            const randomPassword = Math.random().toString(36).slice(-10) + 'Gg1!';
            user = new User({
                email: payload.email,
                nom: payload.family_name || payload.name,
                prenom: payload.given_name || '',
                role: 'CANDIDAT',
                motDePasse: randomPassword,
            });
            await user.save();
        }

        // 3. Générer le JWT
        if (!process.env.JWT_SECRET) {
            authLog.error('JWT_SECRET non configuré');
            return res.status(500).json({ success: false, message: 'Erreur de configuration serveur' });
        }

        const jwtToken = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        authLog.info('Authentification Google réussie', { userId: user._id });

        res.status(200).json({ success: true, jwt: jwtToken, token: jwtToken, user });

    } catch (error: any) {
        authLog.error('Erreur lors de l\'authentification Google', error);
        res.status(500).json({ success: false, message: 'Erreur interne du serveur' });
    }
});

export default router;
