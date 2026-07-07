import mongoose, { Document, Schema } from 'mongoose';

export interface IAffectation extends Document {
    candidat: mongoose.Types.ObjectId;
    centre: mongoose.Types.ObjectId;
    examen?: mongoose.Types.ObjectId;
    examenType?: string; // Store the exam type as string (e.g., "Baccalauréat")
    salle: string;
    numeroPlace: string;
    dateAffectation: Date;
    statut: 'CONFIRMEE' | 'MODIFIEE' | 'ANNULEE';
}

const AffectationSchema: Schema = new Schema({
    candidat: { type: Schema.Types.ObjectId, ref: 'Candidat', required: true },
    centre: { type: Schema.Types.ObjectId, ref: 'CentreExamen', required: true },
    examen: { type: Schema.Types.ObjectId, ref: 'Examen', required: false },
    examenType: { type: String, required: false }, // Store exam type as string
    salle: { type: String, required: true },
    numeroPlace: { type: String, required: true },
    dateAffectation: { type: Date, default: Date.now },
    statut: { 
        type: String, 
        enum: ['CONFIRMEE', 'MODIFIEE', 'ANNULEE'], 
        default: 'CONFIRMEE' 
    }
}, { timestamps: true });

export default mongoose.model<IAffectation>('Affectation', AffectationSchema);
