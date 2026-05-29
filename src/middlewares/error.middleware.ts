import { Request, Response, NextFunction } from 'express';
import { createLog } from '../config/logger';

const errorLog = createLog('ErrorHandler');

// Classe personnalisée pour les erreurs de l'application
export class AppError extends Error {
    statusCode: number;
    isOperational: boolean;

    constructor(message: string, statusCode: number = 500) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

// Wrapper pour capturer les erreurs asynchrones
export const catchAsync = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
        fn(req, res, next).catch(next);
    };
};

// Middleware centralisé de gestion des erreurs
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    err.statusCode = err.statusCode || 500;

    // Format de réponse uniforme
    const response: any = {
        success: false,
        message: err.message,
        statusCode: err.statusCode,
    };

    // En développement, inclure la stack trace
    if (process.env.NODE_ENV === 'development') {
        response.stack = err.stack;
    }

    // Logger l'erreur
    if (err.statusCode >= 500) {
        errorLog.error(err.message, err, {
            path: req.path,
            method: req.method,
            statusCode: err.statusCode,
        });
    } else {
        errorLog.warn(err.message, {
            path: req.path,
            method: req.method,
            statusCode: err.statusCode,
        });
    }

    res.status(err.statusCode).json(response);
};

// Classe d'erreur pour les validations
export class ValidationError extends AppError {
    errors: any[];

    constructor(message: string, errors: any[] = []) {
        super(message, 400);
        this.errors = errors;
    }
}

// Classe d'erreur pour les ressources non trouvées
export class NotFoundError extends AppError {
    constructor(resource: string) {
        super(`${resource} non trouvé(e)`, 404);
    }
}

// Classe d'erreur pour les accès non autorisés
export class UnauthorizedError extends AppError {
    constructor(message: string = 'Non autorisé') {
        super(message, 401);
    }
}

// Classe d'erreur pour les accès interdits
export class ForbiddenError extends AppError {
    constructor(message: string = 'Accès interdit') {
        super(message, 403);
    }
}

// Classe d'erreur pour les conflits
export class ConflictError extends AppError {
    constructor(message: string = 'Conflit') {
        super(message, 409);
    }
}