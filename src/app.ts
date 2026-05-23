import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import { connectDB } from './config/db'; // <-- Import de la base de données
import authRoutes from './routes/auth.routes'; // <-- Import des routes
import documentRoutes from './routes/document.routes';

// Chargement des variables d'environnement (.env)
dotenv.config();

const app: Application = express();

connectDB();

// ==========================================
// MIDDLEWARES DE SÉCURITÉ & CONFIGURATION
// ==========================================
app.use(helmet()); // Protège l'application en configurant divers en-têtes HTTP
app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json()); // Permet à Express de lire le corps (body) des requêtes en JSON

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
// ==========================================
// ROUTES DE TEST
// ==========================================
app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'success',
        message: 'Le système intelligent de gestion des examens est opérationnel',
        timestamp: new Date()
    });
});

// ==========================================
// GESTION GLOBALE DES ERREURS
// ==========================================
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        status: 'error',
        statusCode: statusCode,
        message: err.message || 'Erreur interne du serveur'
    });
});

// ==========================================
// DEMARRAGE DU SERVEUR
// ==========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`[Server] Connecté avec succès sur le port ${PORT}`);
});

export default app;