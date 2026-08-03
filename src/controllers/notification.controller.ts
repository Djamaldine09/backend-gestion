import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Notification from '../models/Notification';
import User from '../models/User';

const allowedTypes = ['INFO', 'SUCCESS', 'WARNING', 'ERROR'] as const;
type NotificationType = typeof allowedTypes[number];

const normalizeType = (type?: string): NotificationType => {
    const value = String(type || 'INFO').toUpperCase();
    return allowedTypes.includes(value as NotificationType) ? value as NotificationType : 'INFO';
};

export const getAllNotifications = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const filter = { destinataire: req.user!.id };

        const [notifications, unreadCount] = await Promise.all([
            Notification.find(filter).sort({ createdAt: -1 }).limit(50),
            Notification.countDocuments({ ...filter, lue: false })
        ]);

        res.status(200).json({ notifications, unreadCount });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const markAsRead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { notificationId } = req.params;

        const notification = await Notification.findOneAndUpdate(
            { _id: notificationId, destinataire: req.user!.id },
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

export const markAllAsRead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const result = await Notification.updateMany(
            { destinataire: req.user!.id, lue: false },
            { lue: true, dateLecture: new Date() }
        );

        res.status(200).json({
            message: 'Toutes les notifications ont ete marquees comme lues',
            count: result.modifiedCount
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const sendBroadcast = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { titre, message, type, roles, lien } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length < 3) {
            res.status(400).json({ message: 'Le message de notification est obligatoire.' });
            return;
        }

        const targetRoles = Array.isArray(roles) && roles.length > 0 ? roles : ['CANDIDAT'];
        const users = await User.find({ role: { $in: targetRoles } }).select('_id');

        if (users.length === 0) {
            res.status(200).json({ message: 'Aucun utilisateur cible trouve.', count: 0 });
            return;
        }

        const notifications = await Notification.insertMany(
            users.map((user) => ({
                destinataire: user._id,
                titre: titre || 'Notification systeme',
                message: message.trim(),
                type: normalizeType(type),
                lien
            }))
        );

        res.status(201).json({
            message: 'Broadcast envoye avec succes',
            count: notifications.length
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const registerFcmToken = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { token, platform = 'web' } = req.body;

        if (!token || typeof token !== 'string') {
            res.status(400).json({ message: 'Token FCM obligatoire.' });
            return;
        }

        const safePlatform = ['web', 'android', 'ios'].includes(platform) ? platform : 'web';

        await User.updateOne(
            { _id: req.user!.id },
            { $pull: { fcmTokens: { token } } }
        );

        await User.updateOne(
            { _id: req.user!.id },
            {
                $push: {
                    fcmTokens: {
                        token,
                        platform: safePlatform,
                        lastUsedAt: new Date()
                    }
                }
            }
        );

        res.status(200).json({ message: 'Token notification enregistre.' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const removeFcmToken = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { token } = req.body;

        if (!token || typeof token !== 'string') {
            res.status(400).json({ message: 'Token FCM obligatoire.' });
            return;
        }

        await User.updateOne(
            { _id: req.user!.id },
            { $pull: { fcmTokens: { token } } }
        );

        res.status(200).json({ message: 'Token notification supprime.' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
