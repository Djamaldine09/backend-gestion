import mongoose, { Document, Schema } from 'mongoose';

export interface IPresence extends Document {
    candidat: mongoose.Types.ObjectId;
    examen: mongoose.Types.ObjectId;
    centre: mongoose.Types.ObjectId;
    date: Date;
    heureArrivee: string;
    qrCodeScanne: string;
    surveillant: mongoose.Types.ObjectId;
    statut: 'PRESENT' | 'ABSENT' | 'RETARD';
}

const PresenceSchema: Schema = new Schema({
    candidat: { type: Schema.Types.ObjectId, ref: 'Candidat', required: true },
    examen: { type: Schema.Types.ObjectId, ref: 'Examen', required: true },
    centre: { type: Schema.Types.ObjectId, ref: 'CentreExamen', required: true },
    date: { type: Date, required: true },
    heureArrivee: { type: String, required: true },
    qrCodeScanne: { type: String, required: true },
    surveillant: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    statut: { 
        type: String, 
        enum: ['PRESENT', 'ABSENT', 'RETARD'], 
        default: 'PRESENT' 
    }
}, { timestamps: true });

export default mongoose.model<IPresence>('Presence', PresenceSchema);
