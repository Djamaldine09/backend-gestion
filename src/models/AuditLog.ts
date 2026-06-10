import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
    utilisateur: mongoose.Types.ObjectId;
    action: string;
    ressource: string;
    ressourceId?: string;
    details?: any;
    ipAdresse?: string;
    userAgent?: string;
}

const AuditLogSchema: Schema = new Schema({
    utilisateur: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true }, // Ex: 'CREATE', 'UPDATE', 'DELETE', 'LOGIN'
    ressource: { type: String, required: true }, // Ex: 'User', 'Candidat', 'Examen'
    ressourceId: { type: String },
    details: { type: Schema.Types.Mixed },
    ipAdresse: { type: String },
    userAgent: { type: String }
}, { timestamps: true });

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
