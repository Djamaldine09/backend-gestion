import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Notification from '../models/Notification';
import User from '../models/User';

export const getAllNotifications = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const notifications = await Notification.find({ destinataire: req.user!.id })
            .sort({ createdAt: -1 })
            .limit(50);
        
        res.status(200).json(notifications);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const markAsRead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { notificationId } = req.params;
        
        const notification = await Notification.findByIdAndUpdate(
            notificationId,
            { lue: true, dateLecture: new Date() },
            { new: true }
        );
        
        if (!notification) {
            res.status(404).json({ message: 'Notification introuvable' });
            return;
        }

        res.status(200).json(notification);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const sendBroadcast = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { message, type } = req.body;
        
        // Récupérer tous les utilisateurs candidats
        const candidats = await User.find({ role: 'CANDIDAT' });
        
        const notifications = await Promise.all(
            candidats.map(user =>
                Notification.create({
                    destinataire: user._id,
                    titre: 'Notification système',
                    message,
                    type: type || 'INFO'
                })
            )
        );

        res.status(201).json({
            message: 'Broadcast envoyé avec succès',
            count: notifications.length
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
