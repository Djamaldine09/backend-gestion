import swaggerJsdoc from 'swagger-jsdoc';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'ExamGest MG - API Backend',
            version: '1.0.0',
            description: 'Système intelligent de gestion des examens nationaux à Madagascar',
            contact: {
                name: 'Support',
                email: 'support@examgest.mg',
            },
            license: {
                name: 'ISC',
            },
        },
        servers: [
            {
                url: `http://localhost:${process.env.PORT || 5000}`,
                description: 'Serveur de développement',
            },
            {
                url: 'https://api.examgest.mg',
                description: 'Serveur de production',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT Authorization header using the Bearer scheme',
                },
            },
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        nom: { type: 'string' },
                        prenom: { type: 'string' },
                        email: { type: 'string' },
                        role: {
                            type: 'string',
                            enum: ['ADMIN', 'RESPONSABLE', 'SURVEILLANT', 'CORRECTEUR', 'CANDIDAT'],
                        },
                        telephone: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
                Candidat: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        user: { type: 'string' },
                        numeroMatricule: { type: 'string' },
                        dateNaissance: { type: 'string', format: 'date' },
                        lieuNaissance: { type: 'string' },
                        genre: { type: 'string', enum: ['M', 'F'] },
                        examen: { type: 'string' },
                        serieFiliere: { type: 'string' },
                        statutInscription: {
                            type: 'string',
                            enum: ['BROUILLON', 'EN_ATTENTE_VALIDATION', 'VALIDE', 'REJETE'],
                        },
                        paiement: {
                            type: 'object',
                            properties: {
                                statut: {
                                    type: 'string',
                                    enum: ['NON_PAYE', 'EN_COURS', 'PAYE', 'ECHEC'],
                                },
                                modePaiement: {
                                    type: 'string',
                                    enum: ['MVOLA', 'ORANGE_MONEY', 'AIRTEL_MONEY', 'CARTE_BANCAIRE'],
                                },
                            },
                        },
                    },
                },
                Error: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                        errors: { type: 'array' },
                    },
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    apis: [
        './src/routes/auth.routes.ts',
        './src/routes/candidat.routes.ts',
        './src/routes/document.routes.ts',
        './src/routes/presence.routes.ts',
        './src/routes/admin.routes.ts',
        './src/routes/paiement.routes.ts',
        './src/routes/resultat.routes.ts',
        './src/routes/examen.routes.ts',
    ],
};

export const swaggerSpec = swaggerJsdoc(options);