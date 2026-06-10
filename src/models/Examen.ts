import mongoose, { Document, Schema } from 'mongoose';

export interface IExamen extends Document {
    titre: string;
    type: string;
    dateDebut: Date;
    dateFin: Date;
    description?: string;
    lieu?: string;
    statut: 'PLANIFIE' | 'EN_COURS' | 'TERMINE';
    nombreCandidats: number;
    nombreCentres: number;
    epreuves?: Array<{
        matiere: string;
        date: Date;
        heureDebut: string;
        heureFin: string;
        duree: number;
        coefficient: number;
        type: 'EPREUVE' | 'REVISION';
    }>;
    candidatsInscrits: mongoose.Types.ObjectId[];
}

const ExamenSchema: Schema = new Schema({
    titre: { type: String, required: true },
    type: { type: String, required: true }, // Ex: "Baccalauréat", "BEPC"
    dateDebut: { type: Date, required: true },
    dateFin: { type: Date, required: true },
    description: { type: String },
    lieu: { type: String },
    statut: { 
        type: String, 
        enum: ['PLANIFIE', 'EN_COURS', 'TERMINE'], 
        default: 'PLANIFIE' 
    },
    nombreCandidats: { type: Number, default: 0 },
    nombreCentres: { type: Number, default: 0 },
    epreuves: [{
        matiere: { type: String, required: true },
        date: { type: Date, required: true },
        heureDebut: { type: String, required: true },
        heureFin: { type: String, required: true },
        duree: { type: Number, required: true },
        coefficient: { type: Number, required: true },
        type: { type: String, enum: ['EPREUVE', 'REVISION'], required: true }
    }],
    candidatsInscrits: [{ type: Schema.Types.ObjectId, ref: 'Candidat', default: [] }]
}, { timestamps: true });

export default mongoose.model<IExamen>('Examen', ExamenSchema);
