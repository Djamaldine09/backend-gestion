import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
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

// Stockage des photos de profil
const avatarDir = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(avatarDir)) {
    fs.mkdirSync(avatarDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
    destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => cb(null, avatarDir),
    filename: (req: AuthenticatedRequest, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        const userId = req.user?.id || 'anonyme';
        cb(null, `${userId}_${Date.now()}${ext}`);
    },
});

const uploadAvatar = multer({
    storage: avatarStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
    fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowed.includes(file.mimetype)) {
            cb(new Error('Format d\'image non supporté. Utilisez JPG, PNG, WEBP ou GIF.'));
            return;
        }
        cb(null, true);
    },
});

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
                photo: user.photo,
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
 * /api/auth/me/photo:
 *   post:
 *     summary: Uploader / remplacer la photo de profil de l'utilisateur connecté
 *     tags:
 *       - Authentification
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Photo de profil mise à jour
 *       400:
 *         description: Fichier manquant ou invalide
 *       401:
 *         description: Non authentifié
 */
router.post('/me/photo', protect, uploadAvatar.single('photo'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Aucune image fournie' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
        }

        // Supprimer l'ancienne photo si elle existe
        if (user.photo) {
            const oldPath = path.join(__dirname, '../..', user.photo);
            fs.unlink(oldPath, () => {});
        }

        user.photo = `/uploads/avatars/${req.file.filename}`;
        await user.save();

        res.status(200).json({
            success: true,
            user: {
                _id: user._id,
                nom: user.nom,
                prenom: user.prenom,
                email: user.email,
                telephone: user.telephone,
                photo: user.photo,
                role: user.role,
                createdAt: (user as any).createdAt,
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message || 'Erreur lors de l\'upload de la photo' });
    }
});

/**
 * @swagger
 * /api/auth/me/photo:
 *   delete:
 *     summary: Supprimer la photo de profil de l'utilisateur connecté
 *     tags:
 *       - Authentification
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Photo supprimée
 *       401:
 *         description: Non authentifié
 */
router.delete('/me/photo', protect, async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
        }

        if (user.photo) {
            const oldPath = path.join(__dirname, '../..', user.photo);
            fs.unlink(oldPath, () => {});
        }
        user.photo = undefined;
        await user.save();

        res.status(200).json({
            success: true,
            user: {
                _id: user._id,
                nom: user.nom,
                prenom: user.prenom,
                email: user.email,
                telephone: user.telephone,
                photo: user.photo,
                role: user.role,
                createdAt: (user as any).createdAt,
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message || 'Erreur lors de la suppression de la photo' });
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

router.post('/facebook', validateRequest(googleAuthSchema), async (req, res) => {
    try {
        const { token } = req.body;

        authLog.info('Tentative d authentification Facebook');

        if (!token) {
            return res.status(400).json({ success: false, message: 'Token manquant' });
        }

        const facebookResponse = await fetch(
            `https://graph.facebook.com/me?fields=id,first_name,last_name,name,email&access_token=${encodeURIComponent(token)}`
        );

        if (!facebookResponse.ok) {
            authLog.warn('Token Facebook invalide ou expire');
            return res.status(401).json({ success: false, message: 'Token Facebook invalide ou expire' });
        }

        const payload = await facebookResponse.json();

        if (!payload || !payload.id) {
            authLog.warn('Profil Facebook incomplet');
            return res.status(401).json({ success: false, message: 'Profil Facebook incomplet ou invalide' });
        }

        const email = payload.email || `${payload.id}@facebook.examgest.local`;
        let user = await User.findOne({ email });

        if (!user) {
            authLog.info('Creation d un nouvel utilisateur Facebook', { email });
            const randomPassword = Math.random().toString(36).slice(-10) + 'Fb1!';
            user = new User({
                email,
                nom: payload.last_name || payload.name || 'Candidat',
                prenom: payload.first_name || '',
                role: 'CANDIDAT',
                motDePasse: randomPassword,
            });
            await user.save();
        }

        if (!process.env.JWT_SECRET) {
            authLog.error('JWT_SECRET non configure');
            return res.status(500).json({ success: false, message: 'Erreur de configuration serveur' });
        }

        const jwtToken = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        authLog.info('Authentification Facebook reussie', { userId: user._id });

        res.status(200).json({ success: true, jwt: jwtToken, token: jwtToken, user });
    } catch (error: any) {
        authLog.error('Erreur lors de l authentification Facebook', error);
        res.status(500).json({ success: false, message: 'Erreur interne du serveur' });
    }
});

export default router;