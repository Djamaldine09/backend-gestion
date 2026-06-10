import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
    destinataire: mongoose.Types.ObjectId;
    titre: string;
    message: string;
    type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
    lue: boolean;
    dateLecture?: Date;
    lien?: string;
}

const NotificationSchema: Schema = new Schema({
    destinataire: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    titre: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR'], 
        default: 'INFO' 
    },
    lue: { type: Boolean, default: false },
    dateLecture: { type: Date },
    lien: { type: String }
}, { timestamps: true });

export default mongoose.model<INotification>('Notification', NotificationSchema);
