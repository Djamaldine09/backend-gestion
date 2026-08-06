import mongoose, { Document, Schema } from 'mongoose';

export interface ICentreExamen extends Document {
    nom: string;
    code: string;          // Ex: "CE-001"
    ville: string;
    region: string;
    adresse?: string;
    capaciteMaximale: number;
    examensAcceptes: string[]; // Ex: ["Baccalauréat", "BEPC"]
    candidatsAffectes: mongoose.Types.ObjectId[]; // Liste des IDs des candidats affectés
    coords?: { lat?: number; lng?: number };
    latitude?: number;
    longitude?: number;
    telephone?: string;
    email?: string;
    salle?: string;
    numeroPlace?: number;
    photo?: string;
}

const CentreExamenSchema: Schema = new Schema({
    nom: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    ville: { type: String, required: true },
    region: { type: String, required: true },
    adresse: { type: String },
    capaciteMaximale: { type: Number, required: true },
    examensAcceptes: [{ type: String, required: true }], // Pour filtrer par type d'examen
    candidatsAffectes: [{ type: Schema.Types.ObjectId, ref: 'Candidat', default: [] }],
    // Coordonnées GPS du centre : c'est ce champ que le panneau admin, la carte
    // et l'algorithme d'affectation automatique lisent et écrivent (coords.lat / coords.lng).
    // Il manquait dans le schéma, donc Mongoose l'ignorait silencieusement à la sauvegarde.
    coords: {
        lat: { type: Number },
        lng: { type: Number }
    },
    // Champs legacy conservés pour compatibilité avec d'anciennes données/scripts.
    latitude: { type: Number },
    longitude: { type: Number },
    telephone: { type: String },
    email: { type: String },
    salle: { type: String },
    numeroPlace: { type: Number },
    photo: { type: String } // Chemin relatif de la photo du centre (ex: /uploads/centres/xxx.jpg)
}, { timestamps: true });

export default mongoose.model<ICentreExamen>('CentreExamen', CentreExamenSchema);