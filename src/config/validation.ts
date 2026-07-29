import Joi from 'joi';

// ========================================
// SCHÉMAS D'AUTHENTIFICATION
// ========================================

export const registerSchema = Joi.object({
    nom: Joi.string().min(2).max(50).required(),
    prenom: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    motDePasse: Joi.string()
        .min(8)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .required()
        .messages({
            'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial'
        }),
    role: Joi.string().valid('CANDIDAT', 'ADMIN', 'RESPONSABLE', 'SURVEILLANT', 'CORRECTEUR').optional(),
    telephone: Joi.string().optional(),
});

export const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    motDePasse: Joi.string().required(),
});

export const twoFactorLoginSchema = Joi.object({
    twoFactorToken: Joi.string().required(),
    code: Joi.string().length(6).pattern(/^[0-9]+$/).required().messages({
        'string.pattern.base': 'Le code doit etre numerique',
        'string.length': 'Le code doit contenir 6 chiffres'
    }),
});

export const twoFactorPreferenceSchema = Joi.object({
    enabled: Joi.boolean().required(),
});

export const loginPhoneSchema = Joi.object({
    telephone: Joi.string().pattern(/^\+?[0-9]{10,}$/).required().messages({
        'string.pattern.base': 'Numéro de téléphone invalide'
    }),
});

export const googleAuthSchema = Joi.object({
    token: Joi.string().required(),
});

export const otpLoginSendSchema = Joi.object({
    telephone: Joi.string().pattern(/^\+?[0-9]{9,}$/).required().messages({
        'string.pattern.base': 'Numéro de téléphone invalide'
    }),
});

export const otpLoginVerifySchema = Joi.object({
    telephone: Joi.string().pattern(/^\+?[0-9]{9,}$/).required().messages({
        'string.pattern.base': 'Numéro de téléphone invalide'
    }),
    code: Joi.string().length(6).pattern(/^[0-9]+$/).required().messages({
        'string.pattern.base': 'Le code doit être numérique',
        'string.length': 'Le code doit contenir 6 chiffres'
    }),
});

// ========================================
// SCHÉMAS CANDIDAT
// ========================================

export const candidatRegistrationSchema = Joi.object({
    numeroMatricule: Joi.string().optional(),
    dateNaissance: Joi.date().max('now').required(),
    lieuNaissance: Joi.string().min(2).required(),
    genre: Joi.string().valid('M', 'F').required(),
    examen: Joi.string().required(),
    serieFiliere: Joi.string().required(),
    centreExamenSouhaite: Joi.string().optional(),
    cin: Joi.string().optional(),
    etablissementPrecedent: Joi.string().optional(),
    mentionPrecedente: Joi.string().optional(),
    adresse: Joi.string().optional(),
    telephone: Joi.string().optional(),
    emailParent: Joi.string().email().optional(),
    region: Joi.string().optional(),
});

export const candidatUpdateSchema = Joi.object({
    numeroMatricule: Joi.string().optional(),
    dateNaissance: Joi.date().max('now').optional(),
    lieuNaissance: Joi.string().min(2).optional(),
    genre: Joi.string().valid('M', 'F').optional(),
    examen: Joi.string().optional(),
    serieFiliere: Joi.string().optional(),
    centreExamenSouhaite: Joi.string().optional(),
    cin: Joi.string().optional(),
    etablissementPrecedent: Joi.string().optional(),
    mentionPrecedente: Joi.string().optional(),
    adresse: Joi.string().optional(),
    region: Joi.string().optional(),
    telephone: Joi.string().optional(),
    emailParent: Joi.string().email().optional(),
}).min(1);

// ========================================
// SCHÉMAS PAIEMENT
// ========================================

export const paiementInitSchema = Joi.object({
    candidatId: Joi.string().required(),
    montant: Joi.number().positive().required(),
    modePaiement: Joi.string().valid('MVOLA', 'ORANGE_MONEY', 'AIRTEL_MONEY', 'CARTE_BANCAIRE').required(),
    numeroTelephone: Joi.string().optional(),
});

// ========================================
// SCHÉMAS RÉSULTATS
// ========================================

export const noteSchema = Joi.object({
    candidatId: Joi.string().required(),
    matiere: Joi.string().required(),
    note: Joi.number().min(0).max(20).required(),
    coefficient: Joi.number().positive().required(),
});

export const resultatSchema = Joi.object({
    candidatId: Joi.string().required(),
    notes: Joi.array()
        .items(
            Joi.object({
                matiere: Joi.string().required(),
                note: Joi.number().min(0).max(20).required(),
                coefficient: Joi.number().positive().required(),
            })
        )
        .required(),
});

// ========================================
// SCHÉMAS PRÉSENCE
// ========================================

export const presenceSchema = Joi.object({
    candidatId: Joi.string().required(),
    examenId: Joi.string().required(),
    present: Joi.boolean().required(),
    heureArrivee: Joi.string().pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    heureDepart: Joi.string().pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
});

// ========================================
// SCHÉMAS EXAMEN
// ========================================

export const examenCreateSchema = Joi.object({
    nom: Joi.string().min(3).required(),
    dateDebut: Joi.date().greater('now').required(),
    dateFin: Joi.date().greater(Joi.ref('dateDebut')).required(),
    description: Joi.string().optional(),
    nombreCandidatsMax: Joi.number().positive().optional(),
});

export const examenUpdateSchema = Joi.object({
    nom: Joi.string().min(3).optional(),
    dateDebut: Joi.date().greater('now').optional(),
    dateFin: Joi.date().greater(Joi.ref('dateDebut')).optional(),
    description: Joi.string().optional(),
    nombreCandidatsMax: Joi.number().positive().optional(),
}).min(1);

// ========================================
// SCHÉMAS CENTRE D'EXAMEN
// ========================================

export const centreExamenSchema = Joi.object({
    nom: Joi.string().min(3).required(),
    ville: Joi.string().required(),
    region: Joi.string().required(),
    adresse: Joi.string().required(),
    coordonnees: Joi.object({
        lat: Joi.number().required(),
        lng: Joi.number().required(),
    }).optional(),
    capacite: Joi.number().positive().optional(),
});

export const epreuveSchema = Joi.object({
    matiere: Joi.string().min(2).required(),
    date: Joi.date().required(),
    heureDebut: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required().messages({
        'string.pattern.base': 'Heure de début doit être au format HH:mm',
    }),
    heureFin: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required().messages({
        'string.pattern.base': 'Heure de fin doit être au format HH:mm',
    }),
    duree: Joi.number().positive().required(),
    coefficient: Joi.number().positive().required(),
    type: Joi.string().valid('EPREUVE', 'REVISION').required(),
});

export const addEpreuvesSchema = Joi.object({
    epreuves: Joi.array().items(epreuveSchema).min(1).required(),
});

// ========================================
// MIDDLEWARE DE VALIDATION
// ========================================

export const validateRequest = (schema: Joi.Schema) => {
    return (req: any, res: any, next: any) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const messages = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
            }));
            return res.status(400).json({
                success: false,
                message: 'Erreur de validation',
                errors: messages,
            });
        }

        // Remplacer req.body par les données validées et nettoyées
        req.body = value;
        next();
    };
};

export const validateParams = (schema: Joi.Schema) => {
    return (req: any, res: any, next: any) => {
        const { error, value } = schema.validate(req.params, {
            abortEarly: false,
        });

        if (error) {
            const messages = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
            }));
            return res.status(400).json({
                success: false,
                message: 'Erreur de validation des paramètres',
                errors: messages,
            });
        }

        req.params = value;
        next();
    };
};

export const validateQuery = (schema: Joi.Schema) => {
    return (req: any, res: any, next: any) => {
        const { error, value } = schema.validate(req.query, {
            abortEarly: false,
        });

        if (error) {
            const messages = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
            }));
            return res.status(400).json({
                success: false,
                message: 'Erreur de validation de la requête',
                errors: messages,
            });
        }

        req.query = value;
        next();
    };
};
