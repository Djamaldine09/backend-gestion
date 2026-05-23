import { Request, Response } from 'express';
import User from '../models/User';
import jwt from 'jsonwebtoken';
import admin from 'firebase-admin';
import serviceAccount from '../../examgest-a96f9-firebase-adminsdk-fbsvc-7f7dcbab2e.json';

// Fonction utilitaire pour générer le Token
const generateToken = (id: string, role: string) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET as string, {
        expiresIn: '30d',
    });
};

// Inscription d'un nouvel utilisateur
export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nom, prenom, email, motDePasse, role, telephone } = req.body;

        // Vérifier si l'utilisateur existe déjà
        const userExists = await User.findOne({ email });
        if (userExists) {
            res.status(400).json({ message: 'Un utilisateur avec cet email existe déjà' });
            return;
        }

        // Création de l'utilisateur
        const user = await User.create({ nom, prenom, email, motDePasse, role, telephone });

        res.status(201).json({
            _id: user._id,
            nom: user.nom,
            prenom: user.prenom,
            email: user.email,
            role: user.role,
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
            res.json({
                _id: user._id,
                nom: user.nom,
                email: user.email,
                role: user.role,
                token: generateToken(user._id.toString(), user.role)
            });
        } else {
            res.status(401).json({ message: 'Email ou mot de passe incorrect' });
        }
    } catch (error: any) {
        res.status(500).json({ message: error.message });
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
            token: generateToken(user._id.toString(), user.role)
        });

    } catch (error: any) {
        res.status(401).json({ message: "Erreur d'authentification Firebase", error: error.message });
    }
};