import mongoose, { Document, Schema } from 'mongoose';

export interface ICentreExamen extends Document {
    nom: string;
    code: string;          // Ex: "CE-001"
    ville: string;
    region: string;
    capaciteMaximale: number;
    examensAcceptes: string[]; // Ex: ["Baccalauréat", "BEPC"]
    candidatsAffectes: mongoose.Types.ObjectId[]; // Liste des IDs des candidats affectés
}

const CentreExamenSchema: Schema = new Schema({
    nom: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    ville: { type: String, required: true },
    region: { type: String, required: true },
    capaciteMaximale: { type: Number, required: true },
    examensAcceptes: [{ type: String, required: true }], // Pour filtrer par type d'examen
    candidatsAffectes: [{ type: Schema.Types.ObjectId, ref: 'Candidat', default: [] }]
}, { timestamps: true });

export default mongoose.model<ICentreExamen>('CentreExamen', CentreExamenSchema);