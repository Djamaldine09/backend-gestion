import winston from 'winston';
import path from 'path';

// Créer les répertoires logs s'ils n'existent pas
const logsDir = path.join(process.cwd(), 'logs');

// Format personnalisé pour les logs
const customFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        const errorStack = stack ? `\n${stack}` : '';
        return `[${timestamp}] [${level.toUpperCase()}] ${message} ${metaStr}${errorStack}`;
    })
);

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat,
    defaultMeta: { service: 'backend-gestion' },
    transports: [
        // Log tous les niveaux dans combined.log
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Log seulement les erreurs dans error.log
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Log en console en développement
        ...(process.env.NODE_ENV !== 'production'
            ? [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    ),
                }),
            ]
            : []),
    ],
});

// Export une fonction pour créer des logs avec contexte
export const createLog = (context: string) => ({
    info: (message: string, data?: any) =>
        logger.info(message, { context, ...data }),
    error: (message: string, error?: any, data?: any) =>
        logger.error(message, { context, error: error?.message, ...data }),
    warn: (message: string, data?: any) =>
        logger.warn(message, { context, ...data }),
    debug: (message: string, data?: any) =>
        logger.debug(message, { context, ...data }),
});