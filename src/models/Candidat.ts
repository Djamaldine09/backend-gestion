import mongoose, { Document, Schema } from 'mongoose';

export interface ICandidat extends Document {
    user: mongoose.Types.ObjectId;
    numeroMatricule?: string;
    dateNaissance: Date;
    lieuNaissance: string;
    genre: 'M' | 'F';
    examen: string;       // Ex: "Baccalauréat", "BEPC"
    serieFiliere: string;  // Ex: "Série S", "Série L", "Génie Logiciel"
    centreExamenSouhaite?: string;
    cin?: string;
    etablissementPrecedent?: string;
    mentionPrecedente?: string;
    adresse?: string;
    telephone?: string;
    emailParent?: string;
    statutInscription: 'BROUILLON' | 'EN_ATTENTE_VALIDATION' | 'VALIDE' | 'REJETE';
    
    paiement: {
        statut: 'NON_PAYE' | 'EN_COURS' | 'PAYE' | 'ECHEC' | 'REMBOURSEMENT';
        referenceTransaction?: string;
        modePaiement?: 'MVOLA' | 'ORANGE_MONEY' | 'AIRTEL_MONEY' | 'CARTE_BANCAIRE' | 'STRIPE';
        datePaiement?: Date;
        montant?: number;
    };
    
    piecesJustificatives: {
        photoIdentite?: string;
        acteNaissance?: string;
        diplomePrecedent?: string;
        photoSupp?: string;
    };
    
    centreAffecte?: {
        nom?: string;
        ville?: string;
        region?: string;
        adresse?: string;
        salle?: string;
        numeroPlace?: string;
        coords?: { lat: number; lng: number };
    };
    
    convocation?: {
        examenId: string;
        dateEpreuve: Date;
        heureDebut: string;
        heureFin: string;
        centre: { nom: string; adresse: string; ville: string };
        salle: string;
        numeroPlace: string;
        hash?: string;
    };
    
    planning?: Array<{
        matiere: string;
        date: Date;
        heureDebut: string;
        heureFin: string;
        duree: number;
        coefficient: number;
        type: 'EPREUVE' | 'REVISION';
    }>;
}

const CandidatSchema: Schema = new Schema({
    // On lie ce dossier au compte utilisateur créé lors de l'inscription
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    
    numeroMatricule: { type: String, unique: true, sparse: true },
    dateNaissance: { type: Date, required: true },
    lieuNaissance: { type: String, required: true },
    genre: { type: String, enum: ['M', 'F'], required: true },
    examen: { type: String, required: true },
    serieFiliere: { type: String, required: true },
    centreExamenSouhaite: { type: String },
    cin: { type: String },
    etablissementPrecedent: { type: String },
    mentionPrecedente: { type: String },
    adresse: { type: String },
    telephone: { type: String },
    emailParent: { type: String },
    
    statutInscription: { 
        type: String, 
        enum: ['BROUILLON', 'EN_ATTENTE_VALIDATION', 'VALIDE', 'REJETE'], 
        default: 'BROUILLON' 
    },
    
    paiement: {
        statut: { type: String, enum: ['NON_PAYE', 'EN_COURS', 'PAYE', 'ECHEC', 'REMBOURSEMENT'], default: 'NON_PAYE' },
        referenceTransaction: { type: String },
        modePaiement: { type: String, enum: ['MVOLA', 'ORANGE_MONEY', 'AIRTEL_MONEY', 'CARTE_BANCAIRE', 'STRIPE'] },
        datePaiement: { type: Date },
        montant: { type: Number }
    },
    
    piecesJustificatives: {
        photoIdentite: { type: String },
        acteNaissance: { type: String },
        diplomePrecedent: { type: String },
        photoSupp: { type: String }
    },
    
    centreAffecte: {
        nom: { type: String },
        ville: { type: String },
        region: { type: String },
        adresse: { type: String },
        salle: { type: String },
        numeroPlace: { type: String },
        coords: {
            lat: { type: Number },
            lng: { type: Number }
        }
    },
    
    convocation: {
        examenId: { type: String },
        dateEpreuve: { type: Date },
        heureDebut: { type: String },
        heureFin: { type: String },
        centre: {
            nom: { type: String },
            adresse: { type: String },
            ville: { type: String }
        },
        salle: { type: String },
        numeroPlace: { type: String },
        hash: { type: String }
    },
    
    planning: [
        {
            matiere: { type: String, required: true },
            date: { type: Date, required: true },
            heureDebut: { type: String, required: true },
            heureFin: { type: String, required: true },
            duree: { type: Number, required: true },
            coefficient: { type: Number, required: true },
            type: { type: String, enum: ['EPREUVE', 'REVISION'], required: true }
        }
    ]
}, { timestamps: true });

export default mongoose.model<ICandidat>('Candidat', CandidatSchema);