import * as dotenv from 'dotenv';

// Chargement des variables d'environnement AVANT les imports
dotenv.config();

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

// Import des configurations
import { connectDB } from './config/db';
import { logger, createLog } from './config/logger';
import { swaggerSpec } from './config/swagger';

// Import des routes
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import candidatRoutes from './routes/candidat.routes';
import presenceRoutes from './routes/presence.routes';
import adminRoutes from './routes/admin.routes';
import paiementRoutes from './routes/paiement.routes';
import resultatRoutes from './routes/resultat.routes';
import examenRoutes from './routes/examen.routes';
import convocationRoutes from './routes/convocation.routes';
import smsRoutes from './routes/sms.routes';
import affectationRoutes from './routes/affectation.routes';
import affectationAutoRoutes from './routes/affectation-auto.routes';
import notificationRoutes from './routes/notification.routes';
import inscriptionRoutes from './routes/inscription.routes';
import statisticsRoutes from './routes/statistics.routes';
import stripeRoutes from './routes/stripe.routes';

const app: Application = express();
const appLog = createLog('App');

// Connexion à la base de données



// ==========================================
// MIDDLEWARES DE SÉCURITÉ & CONFIGURATION
// ==========================================
app.use(helmet()); // Sécurité des en-têtes HTTP

// Configuration CORS dynamique pour localhost en développement
const configuredOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsOrigin = process.env.NODE_ENV === 'development'
    ? [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/]
    : configuredOrigins;

app.use(cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'cache-control', 'pragma'],
    credentials: true
}));

// Logging HTTP avec Morgan
const morganFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms';
app.use(morgan(morganFormat, {
    stream: {
        write: (message) => logger.info(message.trim(), { component: 'HTTP' })
    }
}));

// Parsing JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

appLog.info('Application démarrée avec les middlewares de sécurité');

// ==========================================
// ROUTES DE DOCUMENTATION API
// ==========================================
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
        persistAuthorization: true,
        displayOperationId: false,
    },
    customCss: '.swagger-ui { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }',
}));

appLog.info('Documentation Swagger disponible sur /api-docs');

// ==========================================
// ROUTES DE L'APPLICATION
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/candidats', candidatRoutes);
app.use('/api/presence', presenceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/paiement', paiementRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/resultats', resultatRoutes);
app.use('/api/examens', examenRoutes);
app.use('/api/convocation', convocationRoutes);
app.use('/api/auth/sms', smsRoutes);
app.use('/api/affectation', affectationRoutes);
app.use('/api/affectation-auto', affectationAutoRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/inscription', inscriptionRoutes);

// ==========================================
// ROUTE DE SANTÉ (HEALTH CHECK)
// ==========================================
/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Vérifier l'état du serveur
 *     tags:
 *       - Santé
 *     responses:
 *       200:
 *         description: Serveur opérationnel
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
app.get('/api/health', (req: Request, res: Response) => {
    appLog.info('Health check effectué');
    res.status(200).json({
        status: 'success',
        message: 'Le système intelligent de gestion des examens est opérationnel',
        timestamp: new Date(),
        version: '1.0.0'
    });
});

// ==========================================
// ROUTE 404 (Non trouvée)
// ==========================================
app.use((req: Request, res: Response) => {
    appLog.warn(`Route non trouvée: ${req.method} ${req.path}`);
    res.status(404).json({
        success: false,
        message: `La route "${req.method} ${req.path}" n'existe pas`,
        documentation: 'Consultez la documentation API à /api-docs'
    });
});

// ==========================================
// GESTION GLOBALE DES ERREURS
// ==========================================
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Erreur interne du serveur';
    
    // Logger l'erreur
    appLog.error('Erreur non gérée', err, {
        path: req.path,
        method: req.method,
        statusCode
    });

    // Répondre avec les détails de l'erreur
    res.status(statusCode).json({
        success: false,
        status: 'error',
        statusCode,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ==========================================
// DEMARRAGE DU SERVEUR
// ==========================================
const PORT = Number(process.env.PORT) || 5000;
const startServer = async () => {
    await connectDB();

    app.listen(PORT, '0.0.0.0', () => {
    appLog.info(`Serveur démarré sur le port ${PORT}`, { environment: process.env.NODE_ENV || 'development' });
    console.log(`\n✅ Serveur ExamGest MG en écoute sur http://localhost:${PORT}`);
    console.log(`📚 Documentation API disponible sur http://localhost:${PORT}/api-docs\n`);
    });

};

startServer().catch((error) => {
    appLog.error('Demarrage serveur impossible', error);
    process.exit(1);
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason: Error) => {
    appLog.error('Rejet non géré (unhandledRejection)', reason);
    process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
    appLog.error('Exception non capturée (uncaughtException)', error);
    process.exit(1);
});

export default app;
