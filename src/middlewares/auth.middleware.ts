import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';

// On crée une interface qui hérite de Request pour y ajouter notre utilisateur connecté
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        role: 'ADMIN' | 'RESPONSABLE' | 'SURVEILLANT' | 'CANDIDAT';
    };
}

interface JwtPayload {
    id: string;
    role: 'ADMIN' | 'RESPONSABLE' | 'SURVEILLANT' | 'CANDIDAT';
}

// 1. Middleware de vérification du Token (Authentification)
export const protect = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    let token;

    // Le token est généralement envoyé dans l'en-tête "Authorization" sous la forme : Bearer <token>
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // On extrait le token
            token = req.headers.authorization.split(' ')[1];

            // On décode et vérifie le token avec notre clé secrète
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;

            // On injecte les infos de l'utilisateur dans la requête pour les middlewares suivants
            req.user = {
                id: decoded.id,
                role: decoded.role
            };

            return next();
        } catch (error) {
            res.status(401).json({ message: 'Session expirée ou token invalide. Authentification refusée.' });
            return;
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Accès refusé. Aucun token fourni.' });
        return;
    }
};

// 2. Middleware de restriction par rôles (Autorisation)
// C'est une fonction qui prend les rôles autorisés en paramètre et renvoie un middleware Express standard
export const restrictTo = (...allowedRoles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        // Sécurité : on vérifie que req.user existe (que le middleware 'protect' est bien passé avant)
        if (!req.user) {
            res.status(500).json({ message: 'Erreur interne du contrôle de sécurité.' });
            return;
        }

        // On vérifie si le rôle de l'utilisateur fait partie des rôles autorisés
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({ 
                message: `Accès interdit : Votre rôle (${req.user.role}) ne vous donne pas accès à cette ressource.` 
            });
            return;
        }

        next();
    };
};