import mongoose, { Document, Schema } from 'mongoose';

interface INoteAnonyme {
    matiere: string;
    valeur: number;
    coefficient: number;
    correcteur: mongoose.Types.ObjectId;
    saisieAt: Date;
}

export interface IAnonymat extends Document {
    examen: mongoose.Types.ObjectId;
    candidat: mongoose.Types.ObjectId;
    numeroAnonymat: string;
    notes: INoteAnonyme[];
    statutCorrection: 'A_CORRIGER' | 'EN_COURS' | 'TERMINE';
    anonymatLeve: boolean;
    leveePar?: mongoose.Types.ObjectId;
    leveeAt?: Date;
}

const NoteAnonymeSchema = new Schema<INoteAnonyme>({
    matiere: { type: String, required: true },
    valeur: { type: Number, required: true, min: 0, max: 20 },
    coefficient: { type: Number, required: true, min: 1 },
    correcteur: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    saisieAt: { type: Date, default: Date.now },
}, { _id: false });

const AnonymatSchema = new Schema<IAnonymat>({
    examen: { type: Schema.Types.ObjectId, ref: 'Examen', required: true },
    candidat: { type: Schema.Types.ObjectId, ref: 'Candidat', required: true },
    numeroAnonymat: { type: String, required: true },
    notes: [NoteAnonymeSchema],
    statutCorrection: {
        type: String,
        enum: ['A_CORRIGER', 'EN_COURS', 'TERMINE'],
        default: 'A_CORRIGER',
    },
    anonymatLeve: { type: Boolean, default: false },
    leveePar: { type: Schema.Types.ObjectId, ref: 'User' },
    leveeAt: { type: Date },
}, { timestamps: true });

AnonymatSchema.index({ examen: 1, candidat: 1 }, { unique: true });
AnonymatSchema.index({ examen: 1, numeroAnonymat: 1 }, { unique: true });

export default mongoose.model<IAnonymat>('Anonymat', AnonymatSchema);
