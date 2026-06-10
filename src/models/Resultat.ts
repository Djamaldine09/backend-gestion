import mongoose, { Document, Schema } from 'mongoose';

// Sous-schéma pour une note spécifique
interface INote {
    matiere: string;
    valeur: number; // Sur 20
    coefficient: number;
    correcteur: mongoose.Types.ObjectId; // Pour la traçabilité
}

export interface IResultat extends Document {
    candidat: mongoose.Types.ObjectId;
    examen: string;
    notes: INote[];
    moyenneGenerale: number;
    statutFinal: 'EN_ATTENTE' | 'ADMIS' | 'REFUSE' | 'REPECHAGE';
    estPublie: boolean
}

const NoteSchema = new Schema<INote>({
    matiere: { type: String, required: true },
    valeur: { type: Number, required: true, min: 0, max: 20 },
    coefficient: { type: Number, required: true, min: 1 },
    correcteur: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { _id: false });

const ResultatSchema: Schema = new Schema({
    candidat: { type: Schema.Types.ObjectId, ref: 'Candidat', required: true, unique: true },
    examen: { type: String, required: true },
    notes: [NoteSchema],
    moyenneGenerale: { type: Number, default: 0 },
    statutFinal: { type: String, enum: ['EN_ATTENTE', 'ADMIS', 'REFUSE', 'REPECHAGE'], default: 'EN_ATTENTE' },
    estPublie: { type: Boolean, default: false }
}, { timestamps: true });

// ==========================================
// HOOK INTELLIGENT : Calcul automatique
// ==========================================
ResultatSchema.pre<IResultat>('save', function() {
    if (this.notes && this.notes.length > 0) {
        let totalPoints = 0;
        let totalCoefficients = 0;

        // Calcul de la somme pondérée
        this.notes.forEach(note => {
            totalPoints += (note.valeur * note.coefficient);
            totalCoefficients += note.coefficient;
        });

        // Calcul de la moyenne
        if (totalCoefficients > 0) {
            this.moyenneGenerale = parseFloat((totalPoints / totalCoefficients).toFixed(2));
        }

        // Définition automatique du statut
        if (this.moyenneGenerale >= 10) {
            this.statutFinal = 'ADMIS';
        } else if (this.moyenneGenerale >= 8 && this.moyenneGenerale < 10) {
            this.statutFinal = 'REPECHAGE'; // Cas spécifique (ex: oral de rattrapage)
        } else {
            this.statutFinal = 'REFUSE';
        }
    }
});

export default mongoose.model<IResultat>('Resultat', ResultatSchema);