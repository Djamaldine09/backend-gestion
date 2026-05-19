import { Request, Response } from 'express';
import User from '../models/User';
import jwt from 'jsonwebtoken';

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