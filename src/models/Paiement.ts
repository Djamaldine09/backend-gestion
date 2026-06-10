import mongoose, { Document, Schema } from 'mongoose';

export interface IPaiement extends Document {
    candidat: mongoose.Types.ObjectId;
    montant: number;
    modePaiement: 'MVOLA' | 'ORANGE_MONEY' | 'AIRTEL_MONEY' | 'CARTE_BANCAIRE';
    statut: 'EN_ATTENTE' | 'SUCCES' | 'ECHEC' | 'ANNULE';
    referenceTransaction?: string;
    numeroTelephone?: string;
    carteToken?: string;
    dateInitiation: Date;
    datePaiement?: Date;
    providerResponse?: any;
}

const PaiementSchema: Schema = new Schema({
    candidat: { type: Schema.Types.ObjectId, ref: 'Candidat', required: true },
    montant: { type: Number, required: true },
    modePaiement: { 
        type: String, 
        enum: ['MVOLA', 'ORANGE_MONEY', 'AIRTEL_MONEY', 'CARTE_BANCAIRE'], 
        required: true 
    },
    statut: { 
        type: String, 
        enum: ['EN_ATTENTE', 'SUCCES', 'ECHEC', 'ANNULE'], 
        default: 'EN_ATTENTE' 
    },
    referenceTransaction: { type: String, unique: true, sparse: true },
    numeroTelephone: { type: String },
    carteToken: { type: String },
    dateInitiation: { type: Date, default: Date.now },
    datePaiement: { type: Date },
    providerResponse: { type: Schema.Types.Mixed }
}, { timestamps: true });

export default mongoose.model<IPaiement>('Paiement', PaiementSchema);
