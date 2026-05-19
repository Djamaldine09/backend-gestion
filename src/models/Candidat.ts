import mongoose, { Document, Schema } from 'mongoose';

export interface ICandidat extends Document {
    user: mongoose.Types.ObjectId;
    numeroMatricule: string;
    dateNaissance: Date;
    lieuNaissance: string;
    genre: 'M' | 'F';
    examen: string;       // Ex: "Baccalauréat", "BEPC"
    serieFiliere: string;  // Ex: "Série S", "Série L", "Génie Logiciel"
    centreExamenSouhaite?: string;
    statutInscription: 'BROUILLON' | 'EN_ATTENTE_VALIDATION' | 'VALIDE' | 'REJETE';
    
    // Suivi du paiement des frais d'inscription
    paiement: {
        statut: 'NON_PAYE' | 'EN_COURS' | 'PAYE' | 'ECHEC';
        referenceTransaction?: string; // ID généré par MVola/Orange Money/CinetPay
        modePaiement?: 'MVOLA' | 'ORANGE_MONEY' | 'AIRTEL_MONEY' | 'CARTE_BANCAIRE';
        datePaiement?: Date;
        montant?: number;
    };
    
    piecesJustificatives: {
        photoIdentite?: string; // URL ou chemin du fichier stocké
        acteNaissance?: string;
    };
}

const CandidatSchema: Schema = new Schema({
    // On lie ce dossier au compte utilisateur créé lors de l'inscription
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    
    numeroMatricule: { type: String, unique: true, sparse: true }, // Généré automatiquement après validation
    dateNaissance: { type: Date, required: true },
    lieuNaissance: { type: String, required: true },
    genre: { type: String, enum: ['M', 'F'], required: true },
    examen: { type: String, required: true },
    serieFiliere: { type: String, required: true },
    centreExamenSouhaite: { type: String },
    
    statutInscription: { 
        type: String, 
        enum: ['BROUILLON', 'EN_ATTENTE_VALIDATION', 'VALIDE', 'REJETE'], 
        default: 'BROUILLON' 
    },
    
    paiement: {
        statut: { type: String, enum: ['NON_PAYE', 'EN_COURS', 'PAYE', 'ECHEC'], default: 'NON_PAYE' },
        referenceTransaction: { type: String },
        modePaiement: { type: String, enum: ['MVOLA', 'ORANGE_MONEY', 'AIRTEL_MONEY', 'CARTE_BANCAIRE'] },
        datePaiement: { type: Date },
        montant: { type: Number }
    },
    
    piecesJustificatives: {
        photoIdentite: { type: String }, // Ex: "uploads/photos/candidat_123.jpg"
        acteNaissance: { type: String }
    }
}, { timestamps: true });

export default mongoose.model<ICandidat>('Candidat', CandidatSchema);