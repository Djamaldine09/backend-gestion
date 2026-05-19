import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

// Interface TypeScript pour l'autocomplétion
export interface IUser extends Document {
    nom: string;
    prenom: string;
    email: string;
    motDePasse: string;
    role: 'ADMIN' | 'RESPONSABLE' | 'SURVEILLANT' | 'CANDIDAT';
    telephone?: string;
    comparePassword(enteredPassword: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema({
    nom: { type: String, required: true },
    prenom: { type: String, required: true },
    email: { type: String, required: true, unique: true, match: [/.+\@.+\..+/, 'Veuillez renseigner un email valide'] },
    motDePasse: { type: String, required: true, minlength: 6 },
    role: { 
        type: String, 
        enum: ['ADMIN', 'RESPONSABLE', 'SURVEILLANT', 'CANDIDAT'], 
        default: 'CANDIDAT' 
    },
    telephone: { type: String } // Utile pour les notifications SMS et le paiement mobile
}, { timestamps: true });

// Hachage du mot de passe avant sauvegarde
UserSchema.pre<IUser>('save', async function() {
    if (!this.isModified('motDePasse')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.motDePasse = await bcrypt.hash(this.motDePasse, salt);
});

// Méthode pour comparer les mots de passe lors de la connexion
UserSchema.methods.comparePassword = async function(enteredPassword: string): Promise<boolean> {
    return await bcrypt.compare(enteredPassword, this.motDePasse);
};

export default mongoose.model<IUser>('User', UserSchema);